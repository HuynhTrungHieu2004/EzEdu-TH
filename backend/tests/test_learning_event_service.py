import unittest
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError

from app.personalization.constants.collections import LEARNING_EVENTS, LEARNING_SESSIONS
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.learning_events import LearningEventCreateRequest
from app.personalization.services.learning_event_service import record_learning_event


class LearningEventServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["learning_events"]
        self.repo = PersonalizationMongoRepository(self.db)
        self.owner_id = "lecturer-1"
        self.student_id = "student-1"
        self.other_student_id = "student-2"
        self.document_id = "DOC1"
        self.question_set_id = ObjectId()
        now = datetime.now(timezone.utc)

        await self.db["documents"].insert_one({
            "_id": self.document_id,
            "user_id": self.owner_id,
            "original_filename": "lesson.pdf",
            "status": "indexed",
            "created_at": now,
            "updated_at": now,
        })
        await self.db["question_sets"].insert_one({
            "_id": self.question_set_id,
            "document_id": self.document_id,
            "user_id": self.owner_id,
            "deleted_at": None,
            "questions": [
                {
                    "question": "ATP được tạo ở pha nào?",
                    "correct_answer": "A",
                    "status": "published",
                    "question_type": "multiple_choice",
                },
                {
                    "question": "Câu nháp không công khai",
                    "correct_answer": "B",
                    "status": "draft",
                    "question_type": "multiple_choice",
                },
            ],
            "created_at": now,
        })
        self.item_id = f"{self.question_set_id}:0"

    async def test_valid_question_answered_event_uses_authenticated_user_and_server_timestamp(self):
        payload = LearningEventCreateRequest(
            event_type="question_answered",
            item_id=self.item_id,
            session_id="session-question-1",
            idempotency_key="idem-question-1",
            is_correct=True,
            score=1,
            response_time_ms=2500,
            attempt_number=1,
            hint_count=0,
            answer_change_count=2,
            metadata={"attempt_id": "attempt-1", "answer": "sensitive"},
        )

        event = await record_learning_event(
            payload,
            user_id=self.student_id,
            user_role="student",
            repository=self.repo,
        )

        self.assertEqual(event.user_id, self.student_id)
        self.assertEqual(event.item_id, self.item_id)
        self.assertEqual(event.is_correct, True)
        self.assertEqual(event.response_time_ms, 2500)
        self.assertFalse(event.duplicate)

        stored = await self.db[LEARNING_EVENTS].find_one({"_id": ObjectId(event.id)})
        self.assertIsNotNone(stored)
        self.assertNotIn("answer", stored)
        self.assertEqual(stored["metadata"], {"attempt_id": "attempt-1"})
        self.assertIsNotNone(await self.db[LEARNING_SESSIONS].find_one({"session_id": "session-question-1"}))

    async def test_event_missing_item_is_rejected(self):
        payload = LearningEventCreateRequest(
            event_type="question_started",
            item_id="missing:0",
            session_id="session-missing-item",
            idempotency_key="idem-missing-item",
        )
        with self.assertRaises(HTTPException) as ctx:
            await record_learning_event(
                payload,
                user_id=self.student_id,
                user_role="student",
                repository=self.repo,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_frontend_cannot_submit_fake_user_id(self):
        with self.assertRaises(ValidationError):
            LearningEventCreateRequest.model_validate({
                "event_type": "question_started",
                "item_id": self.item_id,
                "session_id": "session-fake-user",
                "idempotency_key": "idem-fake-user",
                "user_id": "attacker",
            })

    async def test_cross_user_unpublished_question_is_rejected(self):
        payload = LearningEventCreateRequest(
            event_type="question_started",
            item_id=f"{self.question_set_id}:1",
            session_id="session-private-question",
            idempotency_key="idem-private-question",
        )
        with self.assertRaises(HTTPException) as ctx:
            await record_learning_event(
                payload,
                user_id=self.other_student_id,
                user_role="student",
                repository=self.repo,
            )
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_duplicate_idempotency_key_returns_existing_event(self):
        payload = LearningEventCreateRequest(
            event_type="question_started",
            item_id=self.item_id,
            session_id="session-duplicate",
            idempotency_key="idem-duplicate",
        )

        first = await record_learning_event(
            payload,
            user_id=self.student_id,
            user_role="student",
            repository=self.repo,
        )
        second = await record_learning_event(
            payload,
            user_id=self.student_id,
            user_role="student",
            repository=self.repo,
        )

        self.assertEqual(first.id, second.id)
        self.assertTrue(second.duplicate)
        self.assertEqual(await self.db[LEARNING_EVENTS].count_documents({}), 1)

    async def test_invalid_response_time_is_rejected(self):
        with self.assertRaises(ValidationError):
            LearningEventCreateRequest(
                event_type="question_answered",
                item_id=self.item_id,
                session_id="session-bad-time",
                idempotency_key="idem-bad-time",
                is_correct=False,
                response_time_ms=-10,
            )


if __name__ == "__main__":
    unittest.main()
