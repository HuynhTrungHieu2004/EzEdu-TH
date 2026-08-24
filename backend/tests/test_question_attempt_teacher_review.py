import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers.questions import submit_question_attempt
from app.schemas.auth import UserResponse
from app.schemas.question import QuestionAttemptAnswer, QuestionAttemptSubmitRequest


def actor(role: str, *, name: str | None = None, email: str | None = None) -> UserResponse:
    actor_id = str(ObjectId())
    return UserResponse(
        id=actor_id,
        email=email or f"{role}-{actor_id}@example.com",
        full_name=name or role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class QuestionAttemptTeacherReviewTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["question_attempt_teacher_review"]
        self.db_patch = patch("app.routers.questions.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

        self.owner = actor("lecturer", name="Giảng viên Toán")
        self.student = actor(
            "student", name="Nguyễn Minh Anh", email="minh.anh@example.com"
        )
        self.question_set_id = ObjectId()
        now = datetime.now(timezone.utc)
        await self.db["users"].insert_one(
            {
                "_id": ObjectId(self.student.id),
                "full_name": self.student.full_name,
                "email": self.student.email,
            }
        )
        await self.db["question_sets"].insert_one(
            {
                "_id": self.question_set_id,
                "document_id": str(ObjectId()),
                "user_id": self.owner.id,
                "document_name": "Kiểm tra Toán 10",
                "question_count": 1,
                "difficulty": "easy",
                "question_type": "multiple_choice",
                "questions": [
                    {
                        "question": "1 + 1 bằng mấy?",
                        "options": {"A": "2", "B": "3"},
                        "correct_answer": "A",
                        "explanation": "1 + 1 = 2",
                        "difficulty": "easy",
                        "question_type": "multiple_choice",
                        "status": "published",
                        "published_at": now,
                    }
                ],
                "published_question_count": 1,
                "audience_type": "all",
                "target_class_ids": [],
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
            }
        )

    async def _submit(self):
        return await submit_question_attempt(
            str(self.question_set_id),
            QuestionAttemptSubmitRequest(
                answers=[QuestionAttemptAnswer(question_index=0, answer="A")]
            ),
            current_user=self.student,
        )

    async def test_submit_scores_attempt_and_notifies_question_set_owner(self):
        result = await self._submit()

        self.assertEqual(result.score, 1)
        notice = await self.db["admin_notifications"].find_one(
            {"dedupe_key": f"submission:{result.id}"}
        )
        self.assertIsNotNone(notice)
        self.assertEqual(notice["target_user_ids"], [self.owner.id])
        self.assertEqual(
            notice["action_url"], f"/gv/de-thi/{self.question_set_id}/bai-lam"
        )

    async def test_owner_lists_attempts_with_student_identity(self):
        from app.routers.questions import list_question_attempts_for_teacher

        await self._submit()

        items = await list_question_attempts_for_teacher(
            str(self.question_set_id), current_user=self.owner
        )

        self.assertEqual(items[0].student_name, "Nguyễn Minh Anh")
        self.assertEqual(items[0].student_email, "minh.anh@example.com")
        self.assertTrue(items[0].answers[0].is_correct)
        self.assertEqual(items[0].score, 1)

    async def test_other_teacher_cannot_list_attempts(self):
        from app.routers.questions import list_question_attempts_for_teacher

        with self.assertRaises(HTTPException) as context:
            await list_question_attempts_for_teacher(
                str(self.question_set_id), current_user=actor("lecturer")
            )

        self.assertEqual(context.exception.status_code, 404)

    async def test_admin_can_list_attempts_for_any_teacher(self):
        from app.routers.questions import list_question_attempts_for_teacher

        await self._submit()

        items = await list_question_attempts_for_teacher(
            str(self.question_set_id), current_user=actor("admin")
        )

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].student_name, "Nguyễn Minh Anh")


if __name__ == "__main__":
    unittest.main()
