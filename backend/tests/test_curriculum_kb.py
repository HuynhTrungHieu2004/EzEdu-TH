import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.config import settings
from app.curriculum_kb.api.deps import is_admin_actor, require_curriculum_kb_actor, require_teacher_actor
from app.curriculum_kb.repositories.indexes import ensure_curriculum_kb_indexes
from app.curriculum_kb.schemas.source import CurriculumSourceCreate
from app.curriculum_kb.services import ingestion_service, registry_service
from app.schemas.auth import UserResponse
from app.web_knowledge.constants.collections import WEB_KNOWLEDGE_SOURCES


def _actor(role: str) -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


async def _seed_web_knowledge_source(db, owner_id: str, status: str = "approved"):
    now = datetime.now(timezone.utc)
    doc = {
        "query": "Định lý Pythagoras",
        "answer": "a^2+b^2=c^2 trong tam giác vuông.",
        "citations": [],
        "subject_id": "math",
        "grade": 8,
        "topic_id": "hinh-hoc",
        "status": status,
        "version": 1,
        "owner_id": owner_id,
        "created_by": owner_id,
        "updated_by": owner_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[WEB_KNOWLEDGE_SOURCES].insert_one(doc)
    return str(result.inserted_id)


class RegistryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_curriculum_kb_registry"]
        self.teacher_id = "teacher-1"

    async def test_create_manual_source_starts_as_draft_unreviewed(self):
        created = await registry_service.create_source(
            self.db,
            CurriculumSourceCreate(
                title="Định lý Pythagoras", content_text="Trong tam giác vuông, a^2+b^2=c^2." * 3, subject_id="math", grade=8
            ),
            owner_id=self.teacher_id,
        )
        self.assertEqual(created.review_status, "draft")
        self.assertEqual(created.quality_status, "unreviewed")
        self.assertEqual(created.ingest_status, "not_ingested")
        self.assertEqual(created.origin_type, "manual")

    async def test_from_web_knowledge_requires_approved_or_published(self):
        draft_id = await _seed_web_knowledge_source(self.db, self.teacher_id, status="draft")
        with self.assertRaises(HTTPException) as ctx:
            await registry_service.create_source_from_web_knowledge(
                self.db, draft_id, actor_id=self.teacher_id, is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_from_web_knowledge_skips_review_goes_straight_to_approved(self):
        web_id = await _seed_web_knowledge_source(self.db, self.teacher_id, status="approved")
        created = await registry_service.create_source_from_web_knowledge(
            self.db, web_id, actor_id=self.teacher_id, is_admin=False
        )
        self.assertEqual(created.review_status, "approved")
        self.assertEqual(created.quality_status, "verified")
        self.assertEqual(created.origin_type, "web_knowledge")
        self.assertEqual(created.origin_id, web_id)
        self.assertEqual(created.title, "Định lý Pythagoras")
        self.assertEqual(created.subject_id, "math")

    async def test_full_review_lifecycle_sets_quality_verified_on_approve(self):
        created = await registry_service.create_source(
            self.db,
            CurriculumSourceCreate(title="Q dai", content_text="noi dung dai du" * 3, subject_id="math"),
            owner_id=self.teacher_id,
        )
        reviewing = await registry_service.review_source(
            self.db, created.id, version=created.version, target_status="reviewing", actor_id=self.teacher_id, is_admin=False
        )
        self.assertEqual(reviewing.quality_status, "unreviewed")
        approved = await registry_service.review_source(
            self.db, created.id, version=reviewing.version, target_status="approved", actor_id=self.teacher_id, is_admin=False
        )
        self.assertEqual(approved.quality_status, "verified")
        published = await registry_service.review_source(
            self.db, created.id, version=approved.version, target_status="published", actor_id=self.teacher_id, is_admin=False
        )
        self.assertEqual(published.review_status, "published")

    async def test_invalid_transition_rejected(self):
        created = await registry_service.create_source(
            self.db, CurriculumSourceCreate(title="Q dai", content_text="noi dung dai du" * 3, subject_id="math"), owner_id=self.teacher_id
        )
        with self.assertRaises(HTTPException) as ctx:
            await registry_service.review_source(
                self.db, created.id, version=created.version, target_status="published", actor_id=self.teacher_id, is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_review_rejects_non_owner(self):
        created = await registry_service.create_source(
            self.db, CurriculumSourceCreate(title="Q dai", content_text="noi dung dai du" * 3, subject_id="math"), owner_id=self.teacher_id
        )
        with self.assertRaises(HTTPException) as ctx:
            await registry_service.review_source(
                self.db, created.id, version=created.version, target_status="reviewing", actor_id="someone-else", is_admin=False
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_list_published_only_shows_published_and_ingested(self):
        created = await registry_service.create_source(
            self.db, CurriculumSourceCreate(title="Q dai", content_text="noi dung dai du" * 3, subject_id="math"), owner_id=self.teacher_id
        )
        items, total = await registry_service.list_published_sources(self.db, subject_id="math")
        self.assertEqual(total, 0)

        await self.db["curriculum_kb_sources"].update_one(
            {"_id": ObjectId(created.id)}, {"$set": {"review_status": "published", "ingest_status": "ingested"}}
        )
        items, total = await registry_service.list_published_sources(self.db, subject_id="math")
        self.assertEqual(total, 1)
        self.assertEqual(items[0].id, created.id)


class IngestionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_curriculum_kb_ingest"]
        await ensure_curriculum_kb_indexes(self.db)
        from app.services.background_job_service import ensure_background_job_indexes

        await ensure_background_job_indexes(self.db)
        self.teacher_id = "teacher-1"

    async def _make_approved_source(self):
        created = await registry_service.create_source(
            self.db,
            CurriculumSourceCreate(
                title="Định lý Pythagoras", content_text="Trong tam giác vuông, a^2+b^2=c^2. " * 20, subject_id="math", grade=8
            ),
            owner_id=self.teacher_id,
        )
        await self.db["curriculum_kb_sources"].update_one(
            {"_id": ObjectId(created.id)}, {"$set": {"review_status": "approved", "version": created.version + 1}}
        )
        return created.id

    async def test_enqueue_rejects_unapproved_source(self):
        created = await registry_service.create_source(
            self.db, CurriculumSourceCreate(title="Q dai", content_text="noi dung dai du" * 3, subject_id="math"), owner_id=self.teacher_id
        )
        with self.assertRaises(HTTPException) as ctx:
            await ingestion_service.enqueue_ingestion(self.db, created.id, actor_id=self.teacher_id, is_admin=False)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_enqueue_sets_pending_and_queues_job(self):
        source_id = await self._make_approved_source()
        await ingestion_service.enqueue_ingestion(self.db, source_id, actor_id=self.teacher_id, is_admin=False)
        doc = await self.db["curriculum_kb_sources"].find_one({"_id": ObjectId(source_id)})
        self.assertEqual(doc["ingest_status"], "pending")
        jobs = [j async for j in self.db["background_jobs"].find({"job_type": ingestion_service.INGEST_JOB_TYPE})]
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["payload"]["source_id"], source_id)

    async def test_ingest_job_chunks_embeds_and_marks_ingested(self):
        source_id = await self._make_approved_source()
        fake_collection = MagicMock()
        with patch("app.curriculum_kb.services.ingestion_service.init_chroma_client") as mock_client:
            mock_client.return_value.list_collections.return_value = []
            mock_client.return_value.get_or_create_collection.return_value = fake_collection
            result = await ingestion_service.ingest_curriculum_source_job(self.db, {"source_id": source_id})

        self.assertGreater(result["chunk_count"], 0)
        fake_collection.upsert.assert_called_once()
        doc = await self.db["curriculum_kb_sources"].find_one({"_id": ObjectId(source_id)})
        self.assertEqual(doc["ingest_status"], "ingested")
        self.assertEqual(doc["chunk_count"], result["chunk_count"])

    async def test_ingest_job_marks_failed_and_reraises_on_error(self):
        source_id = await self._make_approved_source()
        with patch("app.curriculum_kb.services.ingestion_service.split_text_into_chunks", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                await ingestion_service.ingest_curriculum_source_job(self.db, {"source_id": source_id})
        doc = await self.db["curriculum_kb_sources"].find_one({"_id": ObjectId(source_id)})
        self.assertEqual(doc["ingest_status"], "failed")
        self.assertIn("boom", doc["ingest_error"])

    async def test_search_joins_chunk_with_parent_source(self):
        source_id = await self._make_approved_source()
        await self.db["curriculum_kb_sources"].update_one(
            {"_id": ObjectId(source_id)}, {"$set": {"review_status": "published", "ingest_status": "ingested"}}
        )
        fake_collection = MagicMock()
        fake_collection.query.return_value = {
            "documents": [["Trong tam giác vuông..."]],
            "metadatas": [[{"source_id": source_id, "subject_id": "math", "grade": 8, "topic_id": ""}]],
            "distances": [[0.1]],
        }
        with patch("app.curriculum_kb.services.ingestion_service.init_chroma_client") as mock_client:
            mock_client.return_value.get_or_create_collection.return_value = fake_collection
            results = await ingestion_service.search(self.db, query="Pythagoras", subject_id="math")

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Định lý Pythagoras")
        self.assertAlmostEqual(results[0]["relevance_score"], 0.9)

    async def test_search_returns_empty_for_blank_query(self):
        results = await ingestion_service.search(self.db, query="   ")
        self.assertEqual(results, [])


class CurriculumKbRoleGuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_feature_flag_off_blocks_everyone(self):
        with patch.object(settings, "ENABLE_CURRICULUM_KB", False):
            with self.assertRaises(HTTPException) as ctx:
                await require_curriculum_kb_actor(_actor("student"))
            self.assertEqual(ctx.exception.status_code, 403)

    async def test_student_can_search_when_enabled(self):
        with patch.object(settings, "ENABLE_CURRICULUM_KB", True):
            result = await require_curriculum_kb_actor(_actor("student"))
        self.assertEqual(result.role, "student")

    async def test_student_cannot_manage_registry(self):
        with patch.object(settings, "ENABLE_CURRICULUM_KB", True):
            with self.assertRaises(HTTPException) as ctx:
                await require_teacher_actor(_actor("student"))
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_lecturer_can_manage_registry(self):
        with patch.object(settings, "ENABLE_CURRICULUM_KB", True):
            result = await require_teacher_actor(_actor("lecturer"))
        self.assertEqual(result.role, "lecturer")

    def test_is_admin_actor(self):
        self.assertTrue(is_admin_actor(_actor("admin")))
        self.assertFalse(is_admin_actor(_actor("lecturer")))


if __name__ == "__main__":
    unittest.main()
