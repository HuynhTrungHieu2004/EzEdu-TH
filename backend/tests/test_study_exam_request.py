import unittest

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.schemas.study_exam import StudyExamCreateRequest
from app.exam_bank.services.study_exam_service import (
    create_study_exam_request,
    get_study_exam_request,
)
from app.services.background_job_service import ensure_background_job_indexes


class StudyExamRequestTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["study_exam_requests"]
        await ensure_background_job_indexes(self.db)
        await self.db["learner_profiles"].insert_one(
            {
                "user_id": "student-1",
                "grade_level": 10,
                "weak_subjects": ["toan"],
                "onboarding_completed": True,
            }
        )

    def payload(self, client_request_id="client-1"):
        return StudyExamCreateRequest(
            subject_id="toan",
            subject_label="Toán",
            topic_id="ham-so",
            topic_label="Hàm số",
            difficulty="adaptive",
            question_count=10,
            client_request_id=client_request_id,
        )

    async def test_create_uses_grade_profile_and_enqueues_durable_job(self):
        response = await create_study_exam_request(
            self.db, student_id="student-1", payload=self.payload()
        )

        self.assertEqual(response.grade, 10)
        self.assertEqual(response.status, "pending")
        job = await self.db["background_jobs"].find_one({})
        self.assertEqual(job["job_type"], "generate_study_exam")
        self.assertEqual(job["payload"]["request_id"], response.id)

    async def test_repeated_client_request_is_idempotent(self):
        first = await create_study_exam_request(
            self.db, student_id="student-1", payload=self.payload("same-key")
        )
        second = await create_study_exam_request(
            self.db, student_id="student-1", payload=self.payload("same-key")
        )

        self.assertEqual(first.id, second.id)
        self.assertEqual(await self.db["study_exam_requests"].count_documents({}), 1)
        self.assertEqual(await self.db["background_jobs"].count_documents({}), 1)

    async def test_missing_grade_requires_onboarding(self):
        with self.assertRaises(HTTPException) as ctx:
            await create_study_exam_request(
                self.db, student_id="student-without-profile", payload=self.payload()
            )

        self.assertEqual(ctx.exception.status_code, 400)

    async def test_request_is_private_to_student(self):
        created = await create_study_exam_request(
            self.db, student_id="student-1", payload=self.payload()
        )

        with self.assertRaises(HTTPException) as ctx:
            await get_study_exam_request(
                self.db, request_id=created.id, student_id="student-2"
            )

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_request_status_is_saved_on_originating_chat_message(self):
        conversation_id = ObjectId()
        message_id = ObjectId()
        await self.db["conversations"].insert_one(
            {"_id": conversation_id, "user_id": "student-1", "deleted_at": None}
        )
        await self.db["conversation_messages"].insert_one(
            {
                "_id": message_id,
                "conversation_id": conversation_id,
                "user_id": "student-1",
                "role": "assistant",
            }
        )
        payload = self.payload("chat-request")
        payload.conversation_id = str(conversation_id)
        payload.message_id = str(message_id)

        response = await create_study_exam_request(
            self.db, student_id="student-1", payload=payload
        )

        message = await self.db["conversation_messages"].find_one({"_id": message_id})
        self.assertEqual(message["study_exam_request"]["id"], response.id)
        self.assertEqual(message["study_exam_request"]["status"], "pending")


if __name__ == "__main__":
    unittest.main()
