import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.routers import teacher_history
from app.schemas.auth import UserResponse


def _actor(role: str = "lecturer") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


class TeacherContentHistoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_teacher_history"]
        self.patch = patch("app.routers.teacher_history.get_database", return_value=self.db)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.teacher = _actor("lecturer")

    async def _seed_document(self, *, created_at, deleted_at=None):
        doc_id = ObjectId()
        await self.db["documents"].insert_one({
            "_id": doc_id, "user_id": self.teacher.id, "original_filename": "bai1.pdf",
            "cloudinary_url": "https://res.cloudinary.com/demo/raw/upload/v1/documents/bai1",
            "created_at": created_at, "deleted_at": deleted_at,
        })
        return doc_id

    async def _seed_exam(self, *, created_at, deleted_at=None):
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id, "owner_id": self.teacher.id, "code": "101", "blueprint_id": "bp-1",
            "created_at": created_at, "deleted_at": deleted_at, "allow_retake": True, "version": 3,
        })
        return exam_id

    async def test_merges_documents_and_exams_sorted_by_created_at_desc(self):
        older = datetime.now(timezone.utc) - timedelta(days=2)
        newer = datetime.now(timezone.utc) - timedelta(days=1)
        await self._seed_document(created_at=older)
        await self._seed_exam(created_at=newer)

        result = await teacher_history.get_content_history(
            type="all", search=None, skip=0, limit=50, current_user=self.teacher
        )
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["items"][0]["item_type"], "exam")
        self.assertEqual(result["items"][1]["item_type"], "document")
        self.assertTrue(result["items"][0]["allow_retake"])
        self.assertEqual(result["items"][0]["version"], 3)
        self.assertIsNone(result["items"][1]["allow_retake"])

    async def test_filters_by_type(self):
        await self._seed_document(created_at=datetime.now(timezone.utc))
        await self._seed_exam(created_at=datetime.now(timezone.utc))

        result = await teacher_history.get_content_history(
            type="document", search=None, skip=0, limit=50, current_user=self.teacher
        )
        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["item_type"], "document")

    async def test_excludes_soft_deleted_items(self):
        await self._seed_document(created_at=datetime.now(timezone.utc), deleted_at=datetime.now(timezone.utc))
        result = await teacher_history.get_content_history(
            type="all", search=None, skip=0, limit=50, current_user=self.teacher
        )
        self.assertEqual(result["total"], 0)

    async def test_computes_attempt_stats_for_exam(self):
        exam_id = await self._seed_exam(created_at=datetime.now(timezone.utc))
        await self.db["exam_attempts"].insert_many([
            {"exam_id": str(exam_id), "student_id": "s1", "status": "graded", "total_score": 8.0, "created_at": datetime.now(timezone.utc)},
            {"exam_id": str(exam_id), "student_id": "s2", "status": "graded", "total_score": 6.0, "created_at": datetime.now(timezone.utc)},
        ])
        result = await teacher_history.get_content_history(
            type="exam", search=None, skip=0, limit=50, current_user=self.teacher
        )
        item = result["items"][0]
        self.assertEqual(item["attempt_count"], 2)
        self.assertEqual(item["avg_score"], 7.0)

    async def test_does_not_leak_other_teacher_content(self):
        await self._seed_document(created_at=datetime.now(timezone.utc))
        other = _actor("lecturer")
        await self.db["documents"].insert_one({
            "_id": ObjectId(), "user_id": other.id, "original_filename": "khac.pdf",
            "cloudinary_url": "x", "created_at": datetime.now(timezone.utc), "deleted_at": None,
        })
        result = await teacher_history.get_content_history(
            type="all", search=None, skip=0, limit=50, current_user=self.teacher
        )
        self.assertEqual(result["total"], 1)
