import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock

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

    async def test_excludes_unfinished_attempts_from_stats(self):
        """Verify that in_progress attempts don't dilute average score or count"""
        exam_id = await self._seed_exam(created_at=datetime.now(timezone.utc))
        await self.db["exam_attempts"].insert_many([
            {"exam_id": str(exam_id), "student_id": "s1", "status": "graded", "total_score": 8.0, "created_at": datetime.now(timezone.utc)},
            {"exam_id": str(exam_id), "student_id": "s2", "status": "in_progress", "total_score": 0.0, "created_at": datetime.now(timezone.utc)},
        ])
        result = await teacher_history.get_content_history(
            type="exam", search=None, skip=0, limit=50, current_user=self.teacher
        )
        item = result["items"][0]
        self.assertEqual(item["attempt_count"], 1, "Should only count graded attempt, not in_progress")
        self.assertEqual(item["avg_score"], 8.0, "Should not be diluted by in_progress 0.0 score")

    async def test_pagination_stats_computed_only_for_current_page(self):
        """Stats should be computed only for the items returned, not the full merged set before pagination"""
        older = datetime.now(timezone.utc) - timedelta(days=2)
        newer = datetime.now(timezone.utc) - timedelta(days=1)
        exam1_id = await self._seed_exam(created_at=newer)
        exam2_id = await self._seed_exam(created_at=older)

        # Add stats to both exams
        await self.db["exam_attempts"].insert_many([
            {"exam_id": str(exam1_id), "student_id": "s1", "status": "graded", "total_score": 9.0, "created_at": datetime.now(timezone.utc)},
            {"exam_id": str(exam2_id), "student_id": "s2", "status": "graded", "total_score": 7.0, "created_at": datetime.now(timezone.utc)},
        ])

        # Get only first page (limit=1, skip=0)
        result = await teacher_history.get_content_history(
            type="exam", search=None, skip=0, limit=1, current_user=self.teacher
        )
        self.assertEqual(result["total"], 2, "Total should reflect all exams")
        self.assertEqual(len(result["items"]), 1, "But page should only have 1 item")
        self.assertEqual(result["items"][0]["id"], str(exam1_id), "First page should have the newer exam")
        self.assertEqual(result["items"][0]["attempt_count"], 1)
        self.assertEqual(result["items"][0]["avg_score"], 9.0)

        # Get second page (limit=1, skip=1)
        result = await teacher_history.get_content_history(
            type="exam", search=None, skip=1, limit=1, current_user=self.teacher
        )
        self.assertEqual(result["total"], 2)
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["id"], str(exam2_id), "Second page should have the older exam")
        self.assertEqual(result["items"][0]["attempt_count"], 1)
        self.assertEqual(result["items"][0]["avg_score"], 7.0)

    async def test_stats_degradation_on_aggregation_failure(self):
        """When aggregation fails, endpoint should still succeed with None values instead of 500 error"""
        exam_id = await self._seed_exam(created_at=datetime.now(timezone.utc))
        await self.db["exam_attempts"].insert_one({
            "exam_id": str(exam_id), "student_id": "s1", "status": "graded", "total_score": 8.0, "created_at": datetime.now(timezone.utc),
        })

        # Get the underlying mongomock collection and patch its aggregate method
        mongomock_db = self.db._client["test_teacher_history"]
        mongomock_exam_attempts = mongomock_db["exam_attempts"]

        # Create a function that raises an exception
        def broken_aggregate(*args, **kwargs):
            raise RuntimeError("Aggregation pipeline error")

        # Replace the aggregate method
        original_aggregate = mongomock_exam_attempts.aggregate
        mongomock_exam_attempts.aggregate = broken_aggregate

        try:
            # Call _attach_stats directly to test the exception handling
            items = [{
                "id": str(exam_id),
                "item_type": "exam",
                "title": "Test",
                "created_at": datetime.now(timezone.utc),
                "cloudinary_url": None,
                "blueprint_id": None,
            }]
            await teacher_history._attach_stats(self.db, items)
            # Stats should be None due to exception being caught
            self.assertIsNone(items[0]["attempt_count"])
            self.assertIsNone(items[0]["avg_score"])
            self.assertIsNone(items[0]["last_attempt_at"])
        finally:
            # Restore original
            mongomock_exam_attempts.aggregate = original_aggregate
