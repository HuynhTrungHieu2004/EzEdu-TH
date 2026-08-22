import json
import unittest
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.curriculum_kb.services.context_service import GroundedChunk, UngroundedOutputError
from app.schemas.question import QuestionGenerateRequest
from app.services.language_policy_service import LanguageMismatchError
from app.services import question_generation_service


def _evidence_chunk() -> GroundedChunk:
    return GroundedChunk(
        chunk_id="curriculum-source:0",
        source_id="curriculum-source",
        title="English curriculum",
        text="The past simple describes completed actions in the past.",
        subject_id="tieng_anh",
        grade=12,
        topic_id="curriculum_outcomes",
        source_language="en",
        license_id="CC-BY-SA-4.0",
        citations=[],
        relevance_score=0.92,
    )


def _question(**updates) -> dict:
    question = {
        "question": "Which tense describes a completed action in the past?",
        "options": {
            "A": "The past simple tense",
            "B": "The future continuous tense",
            "C": "The present perfect continuous tense",
            "D": "The future perfect tense",
        },
        "correct_answer": "A",
        "explanation": "The past simple describes completed actions in the past.",
        "difficulty": "medium",
        "question_type": "multiple_choice",
        "bloom_level": "understand",
        "language": "en",
        "source_chunk_ids": ["curriculum-source:0"],
        "grounding_excerpt": "The past simple describes completed actions in the past.",
    }
    question.update(updates)
    return question


class QuestionGenerationGroundingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_question_generation_grounding"]
        self.user_id = str(ObjectId())
        self.document_id = ObjectId()
        await self.db["documents"].insert_one({
            "_id": self.document_id,
            "user_id": self.user_id,
            "media_kind": "document",
            "original_filename": "english-12.txt",
        })
        await self.db["document_chunks"].insert_one({
            "document_id": str(self.document_id),
            "user_id": self.user_id,
            "chunk_index": 0,
            "content": "Learners use the past simple for completed actions.",
        })

    def test_request_requires_subject_and_grade_together(self):
        with self.assertRaises(ValueError):
            QuestionGenerateRequest(document_id=str(self.document_id), subject_id="tieng_anh")

        request = QuestionGenerateRequest(
            document_id=str(self.document_id),
            subject_id="tieng_anh",
            grade=12,
        )
        self.assertEqual("en", request.resolved_output_language)

    async def _generate(self, question: dict):
        with patch.object(question_generation_service, "get_database", return_value=self.db), patch.object(
            question_generation_service.settings, "AI_TEXT_PROVIDER", "claude"
        ), patch.object(
            question_generation_service, "is_claude_available", return_value=True
        ), patch.object(
            question_generation_service, "claude_generate_json", return_value=json.dumps([question])
        ), patch.object(
            question_generation_service, "resolve_context", new=AsyncMock(return_value=[_evidence_chunk()])
        ), patch.object(
            question_generation_service, "extract_keywords", return_value=[]
        ), patch.object(
            question_generation_service,
            "select_diverse_questions",
            side_effect=lambda questions, count: (questions[:count], {"applied": False}),
        ):
            return await question_generation_service.generate_questions(
                document_id=str(self.document_id),
                user_id=self.user_id,
                question_count=1,
                difficulty="medium",
                question_type="multiple_choice",
                subject_id="tieng_anh",
                grade=12,
            )

    async def test_grounded_english_question_is_persisted_with_evidence(self):
        result = await self._generate(_question())

        self.assertEqual("en", result["questions"][0]["language"])
        self.assertEqual(["curriculum-source:0"], result["questions"][0]["source_chunk_ids"])
        stored = await self.db["question_sets"].find_one({})
        self.assertEqual("tieng_anh", stored["subject_id"])
        self.assertEqual(12, stored["grade"])

    async def test_fabricated_chunk_id_is_rejected_before_persistence(self):
        with self.assertRaises(UngroundedOutputError):
            await self._generate(_question(source_chunk_ids=["fabricated:99"]))

        self.assertEqual(0, await self.db["question_sets"].count_documents({}))

    async def test_vietnamese_question_for_english_subject_is_rejected_before_persistence(self):
        vietnamese = _question(
            question="Thì nào diễn tả một hành động đã hoàn thành trong quá khứ?",
            options={"A": "Thì quá khứ đơn", "B": "Thì tương lai", "C": "Hiện tại", "D": "Tương lai hoàn thành"},
            correct_answer="A",
            explanation="Thì quá khứ đơn diễn tả hành động đã hoàn thành trong quá khứ.",
            language="vi",
        )
        with self.assertRaises(LanguageMismatchError):
            await self._generate(vietnamese)

        self.assertEqual(0, await self.db["question_sets"].count_documents({}))


if __name__ == "__main__":
    unittest.main()
