import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.curriculum_kb.services.context_service import GroundedChunk
from app.schemas.chat import AdvancedChatAskRequest
from app.services import learning_chat_service


def _chunk() -> GroundedChunk:
    return GroundedChunk(
        chunk_id="english-6:0",
        source_id="english-6",
        title="English grade 6",
        text="The present simple describes habits and routines.",
        subject_id="tieng_anh",
        grade=6,
        topic_id="curriculum_outcomes",
        source_language="en",
        license_id="CC-BY-SA-4.0",
        relevance_score=0.91,
    )


class LearningChatCurriculumContextTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_learning_chat_curriculum"]
        self.user_id = str(ObjectId())

    def test_curriculum_request_requires_subject_and_grade_and_defaults_english(self):
        with self.assertRaises(ValueError):
            AdvancedChatAskRequest(question="Explain habits", subject_id="tieng_anh")
        request = AdvancedChatAskRequest(
            question="Explain habits", subject_id="tieng_anh", grade=6
        )
        self.assertEqual("en", request.resolved_output_language)

    async def test_local_evidence_prevents_web_lookup_and_returns_source_identity(self):
        response = SimpleNamespace(
            text="""
[SHORT_ANSWER] The present simple describes habits. [/SHORT_ANSWER]
[EXPLANATION] The present simple describes habits and routines [DOC_1]. [/EXPLANATION]
[KEY_POINTS]\n- It describes routines.\n[/KEY_POINTS]
[EXAMPLES]\n- I walk to school.\n[/EXAMPLES]
[CONFIDENCE] 0.95 [/CONFIDENCE]
[EVIDENCE_STATUS] well_supported [/EVIDENCE_STATUS]
[FOLLOW_UP]\n- How is it formed?\n[/FOLLOW_UP]
""",
            model="claude-haiku",
            input_tokens=10,
            output_tokens=20,
            total_tokens=30,
            citations=[],
        )
        payload = AdvancedChatAskRequest(
            question="What does the present simple describe?",
            subject_id="tieng_anh",
            grade=6,
            use_web_search=True,
            request_id=str(ObjectId()),
        )
        with patch.object(learning_chat_service, "get_database", return_value=self.db), patch.object(
            learning_chat_service.settings, "AI_TEXT_PROVIDER", "claude"
        ), patch.object(
            learning_chat_service.rate_limiter, "check_rate_limit", new=AsyncMock()
        ), patch.object(
            learning_chat_service, "resolve_context", new=AsyncMock(return_value=[_chunk()])
        ), patch.object(
            learning_chat_service, "claude_generate", return_value=response
        ), patch.object(
            learning_chat_service, "claude_web_search"
        ) as web_search:
            result = await learning_chat_service.ask_advanced_question(self.user_id, payload)

        web_search.assert_not_called()
        self.assertEqual("internal_only", result["retrieval_mode"])
        self.assertEqual("english-6:0", result["internal_citations"][0]["chunk_id"])
        self.assertEqual("english-6", result["internal_citations"][0]["source_id"])

    async def test_no_local_evidence_and_no_web_returns_controlled_english_response(self):
        payload = AdvancedChatAskRequest(
            question="Explain an unsupported rule",
            subject_id="tieng_anh",
            grade=12,
            use_web_search=False,
            request_id=str(ObjectId()),
        )
        with patch.object(learning_chat_service, "get_database", return_value=self.db), patch.object(
            learning_chat_service.rate_limiter, "check_rate_limit", new=AsyncMock()
        ), patch.object(
            learning_chat_service, "resolve_context", new=AsyncMock(return_value=[])
        ), patch.object(learning_chat_service, "claude_generate") as generate:
            result = await learning_chat_service.ask_advanced_question(self.user_id, payload)

        generate.assert_not_called()
        self.assertEqual("clarification_required", result["retrieval_mode"])
        self.assertEqual("insufficient_evidence", result["evidence_status"])
        self.assertIn("not enough", result["answer"].lower())


if __name__ == "__main__":
    unittest.main()
