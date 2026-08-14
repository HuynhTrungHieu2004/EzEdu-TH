import unittest

from mongomock_motor import AsyncMongoMockClient

from app.exam_bank.services.study_chat_service import create_study_exam_chat_response
from app.schemas.chat import AdvancedChatAskRequest


class LearningChatStudyIntentTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["learning_chat_study_intent"]
        await self.db["learner_profiles"].insert_one(
            {
                "user_id": "student-1",
                "grade_level": 10,
                "weak_subjects": ["toan"],
                "onboarding_completed": True,
            }
        )

    async def test_review_message_returns_persisted_structured_config(self):
        payload = AdvancedChatAskRequest(
            question="Tôi muốn ôn môn Toán",
            scope="general",
            use_web_search=True,
            request_id="review-request-1",
        )

        response = await create_study_exam_chat_response(
            self.db, user_id="student-1", payload=payload
        )

        self.assertIsNotNone(response)
        self.assertEqual(response["message_kind"], "study_exam_config")
        self.assertEqual(response["study_exam_config"]["grade"], 10)
        self.assertEqual(
            response["study_exam_config"]["requested_subject_id"], "toan"
        )
        self.assertEqual(
            response["study_exam_config"]["question_counts"], [5, 10, 15, 20]
        )
        self.assertEqual(await self.db["conversations"].count_documents({}), 1)
        self.assertEqual(await self.db["conversation_messages"].count_documents({}), 2)

    async def test_ordinary_question_returns_none_without_writes(self):
        payload = AdvancedChatAskRequest(
            question="Định lý Pythagore là gì?",
            scope="general",
            use_web_search=True,
            request_id="normal-request-1",
        )

        response = await create_study_exam_chat_response(
            self.db, user_id="student-1", payload=payload
        )

        self.assertIsNone(response)
        self.assertEqual(await self.db["conversations"].count_documents({}), 0)

    async def test_config_includes_topics_for_every_selectable_subject(self):
        await self.db["questions"].insert_many(
            [
                {
                    "subject_id": "toan",
                    "grade": 10,
                    "topic_id": "ham-so",
                    "status": "approved",
                    "deleted_at": None,
                },
                {
                    "subject_id": "vat_li",
                    "grade": 10,
                    "topic_id": "dong-luc-hoc",
                    "status": "published",
                    "deleted_at": None,
                },
            ]
        )
        payload = AdvancedChatAskRequest(
            question="Tôi muốn ôn môn Toán",
            scope="general",
            request_id="all-subject-topics",
        )

        response = await create_study_exam_chat_response(
            self.db, user_id="student-1", payload=payload
        )

        self.assertEqual(
            {
                (item["subject_id"], item["id"])
                for item in response["study_exam_config"]["topics"]
            },
            {("toan", "ham-so"), ("vat_li", "dong-luc-hoc")},
        )


if __name__ == "__main__":
    unittest.main()
