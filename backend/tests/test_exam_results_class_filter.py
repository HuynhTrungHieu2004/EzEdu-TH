import unittest
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.services.attempt_service import get_exam_result_statistics, list_exam_results


class ExamResultsClassFilterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["exam_class_report"]
        self.teacher_id = str(ObjectId())
        self.other_teacher_id = str(ObjectId())
        self.student_a = str(ObjectId())
        self.student_b = str(ObjectId())
        self.exam_id = ObjectId()
        self.class_a = ObjectId()
        self.class_b = ObjectId()
        now = datetime.now(timezone.utc)
        await self.db["exams"].insert_one({"_id": self.exam_id, "owner_id": self.teacher_id, "code": "T-01", "deleted_at": None})
        await self.db["classes"].insert_many([
            {"_id": self.class_a, "name": "10A1", "owner_id": self.teacher_id, "student_ids": [self.student_a], "deleted_at": None},
            {"_id": self.class_b, "name": "10A2", "owner_id": self.other_teacher_id, "student_ids": [self.student_b], "deleted_at": None},
        ])
        await self.db["users"].insert_many([
            {"_id": ObjectId(self.student_a), "full_name": "Học sinh A", "email": "a@example.com"},
            {"_id": ObjectId(self.student_b), "full_name": "Học sinh B", "email": "b@example.com"},
        ])
        await self.db["exam_attempts"].insert_many([
            {"_id": ObjectId(), "exam_id": str(self.exam_id), "student_id": self.student_a, "status": "graded", "total_score": 8, "max_score": 10, "submitted_at": now},
            {"_id": ObjectId(), "exam_id": str(self.exam_id), "student_id": self.student_b, "status": "graded", "total_score": 4, "max_score": 10, "submitted_at": now},
        ])

    async def test_teacher_filters_results_to_owned_class_members(self):
        results = await list_exam_results(
            self.db, actor_id=self.teacher_id, is_admin=False, class_id=str(self.class_a)
        )
        self.assertEqual([item.student_id for item in results], [self.student_a])

        stats = await get_exam_result_statistics(
            self.db, actor_id=self.teacher_id, is_admin=False, class_id=str(self.class_a)
        )
        self.assertEqual(stats.total_attempts, 1)
        self.assertEqual(stats.average_score, 8)

    async def test_teacher_cannot_filter_another_teachers_class(self):
        with self.assertRaises(HTTPException) as ctx:
            await list_exam_results(
                self.db, actor_id=self.teacher_id, is_admin=False, class_id=str(self.class_b)
            )
        self.assertIn(ctx.exception.status_code, {403, 404})

    async def test_admin_can_filter_any_class(self):
        results = await list_exam_results(
            self.db, actor_id="admin", is_admin=True, class_id=str(self.class_b)
        )
        self.assertEqual([item.student_id for item in results], [self.student_b])


if __name__ == "__main__":
    unittest.main()
