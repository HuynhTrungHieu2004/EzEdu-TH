import json
import unittest
from unittest.mock import AsyncMock, patch

from mongomock_motor import AsyncMongoMockClient

from app.core.config import settings
from app.curriculum_kb.services.context_service import GroundedChunk
from app.exam_bank.services import grading_service
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.knowledge_extraction_service import (
    KnowledgeExtractionValidationError,
    process_document_knowledge_graph,
)
from app.services import verification_service


def _english_chunk() -> GroundedChunk:
    return GroundedChunk(
        chunk_id="english-12:0",
        source_id="english-12",
        title="English grade 12",
        text="The past simple describes completed actions in the past.",
        subject_id="tieng_anh",
        grade=12,
        topic_id="grammar",
        source_language="en",
        relevance_score=0.9,
    )


class AIGroundingConsumerTests(unittest.IsolatedAsyncioTestCase):
    async def test_short_answer_without_evidence_requires_teacher_review_without_ai(self):
        with patch.object(grading_service, "claude_generate_content") as claude:
            score, confidence, feedback = await grading_service.grade_short_answer(
                question_content="Which tense describes completed actions?",
                reference_answer="Past simple",
                student_answer="Past simple",
                max_points=2,
                evidence_context=[],
                output_language="en",
            )
        claude.assert_not_called()
        self.assertEqual((0.0, 0.0), (score, confidence))
        self.assertIn("teacher", feedback.lower())

    async def test_english_grading_uses_evidence_and_keeps_feedback_english(self):
        with patch.object(
            grading_service,
            "claude_generate_content",
            return_value="[SCORE] 2 [/SCORE][CONFIDENCE] 0.9 [/CONFIDENCE][FEEDBACK] Correct use of the past simple. [/FEEDBACK]",
        ):
            score, confidence, feedback = await grading_service.grade_short_answer(
                question_content="Which tense describes completed actions?",
                reference_answer="Past simple",
                student_answer="Past simple",
                max_points=2,
                evidence_context=[_english_chunk()],
                output_language="en",
            )
        self.assertEqual(2, score)
        self.assertEqual(0.9, confidence)
        self.assertIn("past simple", feedback.lower())

    async def test_verification_uses_local_curriculum_evidence(self):
        response = json.dumps({"issues": [{
            "chunk_index": 0,
            "issue_type": "factual_error",
            "severity": "high",
            "original_text": "completed actions",
            "suggested_fix": "completed actions in the past",
            "reason": "The statement is incomplete.",
            "confidence": 0.9,
        }]})
        db = AsyncMongoMockClient()["verification_grounding"]
        with patch.object(settings, "AI_TEXT_PROVIDER", "claude"), patch.object(
            verification_service, "is_claude_available", return_value=True
        ), patch.object(
            verification_service, "claude_generate_json", return_value=response
        ), patch.object(
            verification_service, "resolve_context", new=AsyncMock(return_value=[_english_chunk()])
        ), patch.object(verification_service, "_verify_issue_fact_with_search") as web:
            issues = await verification_service.verify_batch(
                ["The rule mentions completed actions."],
                0,
                0,
                db=db,
                subject_id="tieng_anh",
                grade=12,
                topic_id="grammar",
            )
        web.assert_not_called()
        self.assertIn("english-12:0", issues[0]["source_reference"])

    async def test_knowledge_extraction_rejects_taxonomy_ids_outside_document_scope(self):
        db = AsyncMongoMockClient()["knowledge_scope"]
        repo = PersonalizationMongoRepository(db)
        await db["documents"].insert_one({
            "_id": "DOC1", "user_id": "user-1", "subject_id": "tieng_anh", "topic_id": "grammar"
        })
        await db["document_chunks"].insert_one({
            "document_id": "DOC1", "user_id": "user-1", "chunk_index": 0,
            "content": "The past simple describes completed actions in the past."
        })
        await db["curriculum_taxonomy"].insert_many([
            {"_id": "tieng_anh", "node_type": "subject"},
            {"_id": "grammar", "node_type": "topic", "parent_id": "tieng_anh"},
        ])
        response = {
            "knowledge_components": [{
                "temporary_id": "KC_001", "name": "Past simple", "description": "Completed actions",
                "subject": "hoa_hoc", "topic": "atoms", "difficulty": 0.3,
                "prerequisite_temporary_ids": [], "related_temporary_ids": [],
                "evidence_chunk_ids": ["DOC1:0"], "confidence": 0.9,
            }],
            "item_mappings": [],
        }
        with self.assertRaises(KnowledgeExtractionValidationError):
            await process_document_knowledge_graph(
                "DOC1", "user-1", ai_response=response, repository=repo
            )


if __name__ == "__main__":
    unittest.main()
