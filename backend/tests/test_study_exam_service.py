import unittest
from datetime import datetime, timezone

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.services.study_exam_service import generate_study_exam_job


def question(*, subject="toan", grade=10, difficulty="easy", content="Câu hỏi"):
    now = datetime.now(timezone.utc)
    return {
        "subject_id": subject,
        "grade": grade,
        "curriculum_version": "2018",
        "chapter_id": None,
        "topic_id": "ham-so",
        "learning_outcome_id": None,
        "bloom_level": "understand",
        "difficulty": difficulty,
        "question_type": "multiple_choice",
        "content": content,
        "options": {"A": "Đúng", "B": "Sai"},
        "correct_answer": "A",
        "explanation": "Giải thích",
        "points": 1.0,
        "expected_time_seconds": 60,
        "status": "approved",
        "deleted_at": None,
        "owner_id": "teacher-1",
        "created_at": now,
        "updated_at": now,
    }


class StudyExamServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["study_exam_service"]
        self.student_id = "student-1"

    async def create_request(self, **overrides):
        doc = {
            "student_id": self.student_id,
            "subject_id": "toan",
            "subject_label": "Toán",
            "grade": 10,
            "topic_id": "ham-so",
            "topic_label": "Hàm số",
            "difficulty": "easy",
            "question_count": 5,
            "status": "pending",
            "exam_id": None,
            "selected_count": 0,
            "shortfall_count": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        doc.update(overrides)
        result = await self.db["study_exam_requests"].insert_one(doc)
        return str(result.inserted_id)

    async def test_generates_published_exam_from_approved_bank(self):
        request_id = await self.create_request()
        await self.db["questions"].insert_many(
            [question(content=f"Câu {index}") for index in range(5)]
        )

        result = await generate_study_exam_job(self.db, {"request_id": request_id})

        self.assertEqual(result["selected_count"], 5)
        self.assertEqual(result["shortfall_count"], 0)
        exam = await self.db["exams"].find_one({"_id": ObjectId(result["exam_id"])})
        self.assertEqual(exam["status"], "published")
        self.assertEqual(exam["purpose"], "student_review")
        self.assertEqual(exam["target_student_id"], self.student_id)
        self.assertEqual(len(exam["question_ids"]), 5)

    async def test_publishes_smaller_exam_and_reports_shortfall(self):
        request_id = await self.create_request()
        await self.db["questions"].insert_many(
            [question(content=f"Câu {index}") for index in range(3)]
        )

        result = await generate_study_exam_job(self.db, {"request_id": request_id})

        self.assertEqual(result["selected_count"], 3)
        self.assertEqual(result["shortfall_count"], 2)

    async def test_job_is_idempotent_after_exam_creation(self):
        request_id = await self.create_request()
        await self.db["questions"].insert_many(
            [question(content=f"Câu {index}") for index in range(5)]
        )

        first = await generate_study_exam_job(self.db, {"request_id": request_id})
        second = await generate_study_exam_job(self.db, {"request_id": request_id})

        self.assertEqual(first["exam_id"], second["exam_id"])
        self.assertEqual(await self.db["exams"].count_documents({}), 1)

    async def test_retry_recovers_exam_inserted_before_request_completion(self):
        request_id = await self.create_request(status="running")
        inserted_questions = await self.db["questions"].insert_many(
            [question(content=f"Câu {index}") for index in range(5)]
        )
        existing_exam = await self.db["exams"].insert_one(
            {
                "source_request_id": request_id,
                "question_ids": [str(item) for item in inserted_questions.inserted_ids],
                "status": "published",
            }
        )

        result = await generate_study_exam_job(self.db, {"request_id": request_id})

        self.assertEqual(result["exam_id"], str(existing_exam.inserted_id))
        self.assertEqual(result["selected_count"], 5)
        self.assertEqual(result["shortfall_count"], 0)
        self.assertEqual(await self.db["exams"].count_documents({}), 1)
        request = await self.db["study_exam_requests"].find_one(
            {"_id": ObjectId(request_id)}
        )
        self.assertEqual(request["status"], "completed")

    async def test_completed_status_is_persisted_back_to_chat_message(self):
        message_id = ObjectId()
        await self.db["conversation_messages"].insert_one(
            {"_id": message_id, "user_id": self.student_id, "role": "assistant"}
        )
        request_id = await self.create_request(message_id=str(message_id))
        await self.db["questions"].insert_many(
            [question(content=f"Câu {index}") for index in range(5)]
        )

        result = await generate_study_exam_job(self.db, {"request_id": request_id})

        message = await self.db["conversation_messages"].find_one({"_id": message_id})
        self.assertEqual(message["study_exam_request"]["status"], "completed")
        self.assertEqual(message["study_exam_request"]["exam_id"], result["exam_id"])

    async def test_fails_request_when_bank_has_no_usable_questions(self):
        request_id = await self.create_request()

        with self.assertRaises(ValueError):
            await generate_study_exam_job(self.db, {"request_id": request_id})

        request = await self.db["study_exam_requests"].find_one(
            {"_id": ObjectId(request_id)}
        )
        self.assertEqual(request["status"], "failed")
        self.assertIn("chưa có câu hỏi", request["error_message"].lower())


if __name__ == "__main__":
    unittest.main()
