import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.routers import questions as questions_router
from app.schemas.auth import UserResponse


def _actor(role: str = "student") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


class AttemptHistoryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_attempt_history"]
        self.patch = patch("app.routers.questions.get_database", return_value=self.db)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.student = _actor("student")

    async def test_merges_practice_and_exam_attempts(self):
        qs_id = ObjectId()
        await self.db["question_sets"].insert_one({"_id": qs_id, "document_name": "Chương 1"})
        await self.db["question_attempts"].insert_one({
            "_id": ObjectId(), "question_set_id": str(qs_id), "document_id": "doc-1", "user_id": self.student.id,
            "score": 8, "max_score": 10, "percent": 80.0, "created_at": datetime.now(timezone.utc),
        })
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id, "code": "101", "allow_retake": False, "deleted_at": None,
        })
        await self.db["exam_attempts"].insert_one({
            "_id": ObjectId(), "exam_id": str(exam_id), "exam_code": "101", "student_id": self.student.id,
            "status": "graded", "total_score": 7.0, "max_score": 10.0, "created_at": datetime.now(timezone.utc),
        })

        rows = await questions_router.list_my_attempt_history(current_user=self.student)
        item_types = sorted(r["item_type"] for r in rows)
        self.assertEqual(item_types, ["exam", "practice"])

    async def test_exam_item_marks_source_deleted_when_exam_removed(self):
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id, "code": "101", "allow_retake": True, "deleted_at": datetime.now(timezone.utc),
        })
        await self.db["exam_attempts"].insert_one({
            "_id": ObjectId(), "exam_id": str(exam_id), "exam_code": "101", "student_id": self.student.id,
            "status": "graded", "total_score": 7.0, "max_score": 10.0, "created_at": datetime.now(timezone.utc),
        })
        rows = await questions_router.list_my_attempt_history(current_user=self.student)
        self.assertTrue(rows[0]["source_deleted"])
        self.assertFalse(rows[0]["can_retake"])

    async def test_exam_item_can_retake_only_when_allowed_and_finished(self):
        exam_id = ObjectId()
        await self.db["exams"].insert_one({
            "_id": exam_id, "code": "101", "allow_retake": True, "deleted_at": None,
        })
        await self.db["exam_attempts"].insert_one({
            "_id": ObjectId(), "exam_id": str(exam_id), "exam_code": "101", "student_id": self.student.id,
            "status": "graded", "total_score": 7.0, "max_score": 10.0, "created_at": datetime.now(timezone.utc),
        })
        rows = await questions_router.list_my_attempt_history(current_user=self.student)
        self.assertTrue(rows[0]["can_retake"])

    async def test_practice_item_can_always_retake(self):
        qs_id = ObjectId()
        await self.db["question_sets"].insert_one({"_id": qs_id, "document_name": "Chương 1"})
        await self.db["question_attempts"].insert_one({
            "_id": ObjectId(), "question_set_id": str(qs_id), "document_id": "doc-1", "user_id": self.student.id,
            "score": 8, "max_score": 10, "percent": 80.0, "created_at": datetime.now(timezone.utc),
        })
        rows = await questions_router.list_my_attempt_history(current_user=self.student)
        self.assertTrue(rows[0]["can_retake"])
        self.assertFalse(rows[0]["source_deleted"])
