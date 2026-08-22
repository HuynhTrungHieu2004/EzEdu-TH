import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.config import settings
from app.core.rbac import Permission, require_permission
from app.schemas.auth import UserResponse


def actor(role: str = "admin") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class AdminContentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_admin_content"]
        self.patch_content = patch("app.routers.admin_content.get_database", return_value=self.db)
        self.patch_service = patch("app.services.admin_audit_service.get_database", return_value=self.db)
        self.patch_content.start()
        self.patch_service.start()
        self.addCleanup(self.patch_content.stop)
        self.addCleanup(self.patch_service.stop)
        self.admin = actor("admin")
        self.moderator = actor("moderator")
        self.support = actor("support")
        self.now = datetime.now(timezone.utc)
        await self._seed()

    async def _seed(self):
        self.owner_id = ObjectId()
        self.document_id = ObjectId()
        self.question_set_id = ObjectId()
        await self.db["users"].insert_one({
            "_id": self.owner_id,
            "email": "owner@example.com",
            "full_name": "Owner User",
            "role": "student",
        })
        await self.db["documents"].insert_one({
            "_id": self.document_id,
            "user_id": str(self.owner_id),
            "original_filename": "Algebra Notes.pdf",
            "file_type": "pdf",
            "file_size": 2048,
            "status": "completed",
            "page_count": 12,
            "created_at": self.now - timedelta(days=1),
            "updated_at": self.now,
            "deleted_at": None,
            "error_message": None,
        })
        await self.db["document_chunks"].insert_many([
            {"document_id": str(self.document_id), "user_id": str(self.owner_id), "chunk_index": 0, "text_preview": "Linear equations", "content": "Linear equations are equations of the first degree."},
            {"document_id": str(self.document_id), "user_id": str(self.owner_id), "chunk_index": 1, "text_preview": "Quadratic equations", "content": "Quadratic equations have the form ax^2 + bx + c = 0."},
        ])
        await self.db["verification_sessions"].insert_one({
            "document_id": str(self.document_id),
            "status": "passed",
            "created_at": self.now,
        })
        await self.db["question_sets"].insert_one({
            "_id": self.question_set_id,
            "user_id": str(self.owner_id),
            "document_id": str(self.document_id),
            "document_name": "Algebra Notes.pdf",
            "question_type": "multiple_choice",
            "difficulty": "medium",
            "created_at": self.now,
            "updated_at": self.now,
            "deleted_at": None,
            "questions": [
                {
                    "question": "What is x if x + 2 = 5?",
                    "options": {"A": "1", "B": "3"},
                    "correct_answer": "B",
                    "explanation": "Subtract 2 from both sides.",
                    "status": "draft",
                    "tags": ["math", "algebra"],
                },
                {
                    "question": "What is a quadratic equation?",
                    "correct_answer": "An equation with degree 2.",
                    "explanation": "The highest power is two.",
                    "status": "draft",
                    "tags": ["math", "algebra"],
                },
            ],
        })

    async def test_list_documents_with_counts_and_owner(self):
        from app.routers.admin_content import list_admin_documents

        result = await list_admin_documents(
            page=1,
            page_size=10,
            search="algebra",
            user_id=None,
            file_type="pdf",
            processing_status=None,
            status_filter="active",
            created_from=None,
            created_to=None,
            has_error=None,
            knowledge_verification_status=None,
            sort_by="created_at",
            sort_order="desc",
            current_user=self.moderator,
        )
        self.assertEqual(result.total, 1)
        self.assertEqual(result.items[0].owner.email, "owner@example.com")
        self.assertEqual(result.items[0].chunk_count, 2)
        self.assertEqual(result.items[0].question_count, 2)
        self.assertEqual(result.items[0].knowledge_verification_status, "passed")

    async def test_delete_document_requires_reason_and_writes_audit(self):
        from app.routers.admin_content import AdminReasonRequest, delete_admin_document

        with self.assertRaises(HTTPException) as ctx:
            await delete_admin_document(str(self.document_id), AdminReasonRequest(reason=" "), current_user=self.admin)
        self.assertEqual(ctx.exception.status_code, 400)

        deleted = await delete_admin_document(
            str(self.document_id),
            AdminReasonRequest(reason="policy violation"),
            current_user=self.admin,
        )
        self.assertEqual(deleted.processing_status, "deleted")
        stored = await self.db["documents"].find_one({"_id": self.document_id})
        self.assertIsNotNone(stored["deleted_at"])
        audit = await self.db["admin_audit_logs"].find_one({"target_id": str(self.document_id), "action": "document_deleted"})
        self.assertIsNotNone(audit)
        self.assertEqual(audit["reason"], "policy violation")

    async def test_question_delete_soft_deletes_embedded_item_and_writes_audit(self):
        from app.routers.admin_content import AdminReasonRequest, delete_admin_question, list_admin_questions

        question_id = f"{self.question_set_id}:0"
        deleted = await delete_admin_question(
            question_id,
            AdminReasonRequest(reason="bad answer"),
            current_user=self.moderator,
        )
        self.assertEqual(deleted.moderation_status, "deleted")
        stored = await self.db["question_sets"].find_one({"_id": self.question_set_id})
        self.assertIsNotNone(stored["questions"][0]["deleted_at"])
        active = await list_admin_questions(
            page=1,
            page_size=10,
            search=None,
            user_id=None,
            document_id=None,
            question_type=None,
            difficulty=None,
            moderation_status=None,
            status_filter="active",
            created_from=None,
            created_to=None,
            sort_order="desc",
            current_user=self.moderator,
        )
        self.assertEqual(active.total, 1)
        audit = await self.db["admin_audit_logs"].find_one({"target_id": question_id, "action": "question_deleted"})
        self.assertIsNotNone(audit)
        self.assertNotIn("password", str(audit).lower())

    async def test_list_exams_uses_question_sets(self):
        from app.routers.admin_content import list_admin_exams

        result = await list_admin_exams(
            page=1,
            page_size=10,
            search="Algebra",
            user_id=None,
            status_filter="active",
            created_from=None,
            created_to=None,
            sort_by="created_at",
            sort_order="desc",
            current_user=self.moderator,
        )
        self.assertEqual(result.total, 1)
        self.assertEqual(result.items[0].question_count, 2)

    async def test_permissions_for_content_roles(self):
        documents_delete = require_permission(Permission.DOCUMENTS_DELETE)
        questions_update = require_permission(Permission.QUESTIONS_UPDATE)
        self.assertEqual((await documents_delete(self.moderator)).role, "moderator")
        self.assertEqual((await questions_update(self.moderator)).role, "moderator")
        with self.assertRaises(HTTPException):
            await documents_delete(self.support)

    async def test_regenerate_single_question_replaces_it_and_writes_audit(self):
        import json as json_module
        from app.routers.admin_content import AdminReasonRequest, regenerate_admin_question

        new_question_payload = json_module.dumps([{
            "question": "What is the highest power in a quadratic equation?",
            "options": {"A": "1", "B": "2", "C": "3", "D": "4"},
            "correct_answer": "B",
            "explanation": "A quadratic equation has degree two.",
            "difficulty": "medium",
            "question_type": "multiple_choice",
        }])
        with patch.object(settings, "AI_TEXT_PROVIDER", "legacy"), \
             patch("app.services.question_generation_service.is_groq_available", return_value=True), \
             patch("app.services.question_generation_service.is_gemini_available", return_value=False), \
             patch("app.services.question_generation_service.generate_json", return_value=new_question_payload):
            result = await regenerate_admin_question(
                f"{self.question_set_id}:0",
                AdminReasonRequest(reason="quality issue"),
                current_user=self.moderator,
            )
        self.assertIn("highest power in a quadratic equation", result.question)
        self.assertEqual(result.moderation_status, "draft")
        self.assertEqual(result.hallucination_risk, "unknown")
        audit = await self.db["admin_audit_logs"].find_one({"action": "question_updated"})
        self.assertIsNotNone(audit)

    async def test_regenerate_single_question_fails_clearly_without_ai_provider(self):
        from app.routers.admin_content import AdminReasonRequest, regenerate_admin_question

        with patch.object(settings, "AI_TEXT_PROVIDER", "legacy"), \
             patch("app.services.question_generation_service.is_groq_available", return_value=False), \
             patch("app.services.question_generation_service.is_gemini_available", return_value=False):
            with self.assertRaises(HTTPException) as ctx:
                await regenerate_admin_question(
                    f"{self.question_set_id}:0",
                    AdminReasonRequest(reason="quality issue"),
                    current_user=self.moderator,
                )
        self.assertEqual(ctx.exception.status_code, 502)


if __name__ == "__main__":
    unittest.main()
