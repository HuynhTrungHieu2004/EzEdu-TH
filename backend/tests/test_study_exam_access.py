import unittest
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.services import attempt_service, exam_service


class StudyExamAccessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["study_exam_access"]
        now = datetime.now(timezone.utc)
        question_id = ObjectId()
        await self.db["questions"].insert_one(
            {
                "_id": question_id,
                "content": "1 + 1 = ?",
                "options": {"A": "2", "B": "3"},
                "correct_answer": "A",
                "explanation": "1 + 1 = 2",
                "points": 1.0,
                "bloom_level": "remember",
                "difficulty": "easy",
                "question_type": "multiple_choice",
            }
        )
        exam = {
            "blueprint_id": "study:req-1",
            "blueprint_version": 1,
            "code": "ON-1",
            "equivalent_group_id": "group-1",
            "question_ids": [str(question_id)],
            "question_order_seed": 1,
            "total_points": 1.0,
            "duration_minutes": 10,
            "status": "published",
            "published_at": now,
            "audience_type": "all",
            "target_class_ids": [],
            "allow_retake": True,
            "purpose": "student_review",
            "target_student_id": "student-1",
            "version": 1,
            "owner_id": "student-1",
            "created_by": "student-1",
            "updated_by": "student-1",
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        inserted = await self.db["exams"].insert_one(exam)
        self.exam_id = str(inserted.inserted_id)

    async def test_target_student_can_start_and_read_exam(self):
        started = await attempt_service.start_attempt(
            self.db, self.exam_id, student_id="student-1"
        )
        preview = await exam_service.get_exam_questions_for_student(
            self.db, self.exam_id, student_id="student-1"
        )

        self.assertEqual(started.status, "in_progress")
        self.assertEqual(len(preview.questions), 1)

    async def test_other_student_cannot_start_review_exam(self):
        with self.assertRaises(HTTPException) as ctx:
            await attempt_service.start_attempt(
                self.db, self.exam_id, student_id="student-2"
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_other_student_cannot_read_review_exam(self):
        with self.assertRaises(HTTPException) as ctx:
            await exam_service.get_exam_questions_for_student(
                self.db, self.exam_id, student_id="student-2"
            )
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()

