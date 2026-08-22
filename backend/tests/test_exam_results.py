import unittest
from datetime import datetime, timezone

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.services.attempt_service import get_exam_result_statistics, list_exam_results, list_student_exams


class ExamResultTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_exam_results"]
        self.teacher_id = str(ObjectId())
        self.other_teacher_id = str(ObjectId())
        self.student_id = str(ObjectId())
        now = datetime.now(timezone.utc)
        await self.db["users"].insert_one({"_id": ObjectId(self.student_id), "full_name": "Học sinh A", "email": "a@example.com"})
        self.exam_id = str((await self.db["exams"].insert_one({
            "owner_id": self.teacher_id,
            "code": "EXAM-1",
            "deleted_at": None,
        })).inserted_id)
        other_exam_id = str((await self.db["exams"].insert_one({
            "owner_id": self.other_teacher_id,
            "code": "EXAM-2",
            "deleted_at": None,
        })).inserted_id)
        await self.db["exam_attempts"].insert_many([
            {"exam_id": self.exam_id, "student_id": self.student_id, "status": "graded", "total_score": 8, "max_score": 10, "submitted_at": now, "created_at": now},
            {"exam_id": other_exam_id, "student_id": self.student_id, "status": "submitted", "total_score": 3, "max_score": 5, "submitted_at": now, "created_at": now},
            {"exam_id": self.exam_id, "student_id": self.student_id, "status": "in_progress", "total_score": 0, "max_score": 10, "created_at": now},
        ])

    async def test_teacher_sees_owned_exam_results_and_admin_sees_all(self):
        teacher_items = await list_exam_results(self.db, actor_id=self.teacher_id, is_admin=False)
        admin_items = await list_exam_results(self.db, actor_id="admin", is_admin=True)
        self.assertEqual(len(teacher_items), 1)
        self.assertEqual(teacher_items[0].student_name, "Học sinh A")
        self.assertEqual(teacher_items[0].score, 8)
        self.assertEqual(len(admin_items), 2)

    async def test_statistics_use_normalized_ten_point_scores(self):
        stats = await get_exam_result_statistics(self.db, actor_id="admin", is_admin=True)
        self.assertEqual(stats.total_attempts, 2)
        self.assertEqual(stats.average_score, 7)
        self.assertEqual(stats.pass_rate, 100)
        self.assertEqual(stats.excellent_rate, 50)
        self.assertEqual(sum(stats.score_distribution.values()), 2)

    async def test_student_lists_published_exams_for_all_or_own_class(self):
        class_id = str((await self.db["classes"].insert_one({"student_ids": [self.student_id], "deleted_at": None})).inserted_id)
        await self.db["exams"].update_one({"_id": ObjectId(self.exam_id)}, {"$set": {"status": "published", "audience_type": "all", "duration_minutes": 45, "question_ids": ["q1"], "total_points": 10}})
        visible_class_exam = str((await self.db["exams"].insert_one({
            "owner_id": self.teacher_id, "code": "CLASS-1", "status": "published", "audience_type": "classes",
            "target_class_ids": [class_id], "duration_minutes": 30, "question_ids": ["q1", "q2"], "total_points": 10, "deleted_at": None,
        })).inserted_id)
        await self.db["exams"].insert_one({
            "owner_id": self.teacher_id, "code": "HIDDEN", "status": "published", "audience_type": "classes",
            "target_class_ids": [str(ObjectId())], "duration_minutes": 30, "question_ids": [], "total_points": 10, "deleted_at": None,
        })

        items = await list_student_exams(self.db, student_id=self.student_id)
        self.assertEqual({item.id for item in items}, {self.exam_id, visible_class_exam})
        completed = next(item for item in items if item.id == self.exam_id)
        self.assertEqual(completed.attempt_status, "graded")
        self.assertEqual(completed.score, 8)


if __name__ == "__main__":
    unittest.main()
