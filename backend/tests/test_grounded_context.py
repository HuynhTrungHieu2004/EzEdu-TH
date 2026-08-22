import unittest
from unittest.mock import AsyncMock, patch

from app.curriculum_kb.services import ingestion_service


class GroundedContextTests(unittest.IsolatedAsyncioTestCase):
    def _context_api(self):
        try:
            from app.curriculum_kb.services.context_service import (
                GroundedChunk,
                UngroundedOutputError,
                resolve_context,
                validate_evidence,
            )
        except ModuleNotFoundError as exc:
            self.fail(f"Grounded context service is missing: {exc}")
        return GroundedChunk, UngroundedOutputError, resolve_context, validate_evidence

    async def test_resolver_filters_weak_results_and_deduplicates_chunk_ids(self):
        _, _, resolve_context, _ = self._context_api()
        rows = [
            {
                "chunk_id": "source-1:0",
                "source_id": "source-1",
                "title": "English source",
                "chunk_text": "The past simple describes completed actions.",
                "subject_id": "tieng_anh",
                "grade": 12,
                "topic_id": "curriculum_outcomes",
                "source_language": "en",
                "license_id": "CC-BY-SA-4.0",
                "citations": [{"title": "Source", "url": "https://example.edu/source"}],
                "relevance_score": 0.88,
            },
            {
                "chunk_id": "source-1:0",
                "source_id": "source-1",
                "title": "Duplicate",
                "chunk_text": "Duplicate text",
                "subject_id": "tieng_anh",
                "grade": 12,
                "topic_id": "curriculum_outcomes",
                "source_language": "en",
                "license_id": "CC-BY-SA-4.0",
                "citations": [],
                "relevance_score": 0.80,
            },
            {
                "chunk_id": "source-2:0",
                "source_id": "source-2",
                "title": "Weak source",
                "chunk_text": "Weak match",
                "subject_id": "tieng_anh",
                "grade": 12,
                "topic_id": "curriculum_outcomes",
                "source_language": "en",
                "license_id": "CC-BY-SA-4.0",
                "citations": [],
                "relevance_score": 0.20,
            },
        ]

        with patch.object(ingestion_service, "search", new=AsyncMock(return_value=rows)):
            chunks = await resolve_context(
                object(),
                query="past simple",
                subject_id="tieng_anh",
                grade=12,
                language="en",
            )

        self.assertEqual(["source-1:0"], [chunk.chunk_id for chunk in chunks])
        self.assertEqual("The past simple describes completed actions.", chunks[0].text)

    def test_unknown_or_empty_evidence_is_rejected(self):
        GroundedChunk, UngroundedOutputError, _, validate_evidence = self._context_api()
        chunk = GroundedChunk(
            chunk_id="source-1:0",
            source_id="source-1",
            title="Source",
            text="The past simple describes completed actions.",
            subject_id="tieng_anh",
            grade=12,
            topic_id="curriculum_outcomes",
            source_language="en",
            license_id="CC-BY-SA-4.0",
            citations=[],
            relevance_score=0.9,
        )

        for evidence in ([], ["fabricated:99"]):
            with self.subTest(evidence=evidence), self.assertRaises(UngroundedOutputError):
                validate_evidence(evidence, [chunk])

    def test_supporting_excerpt_must_exist_in_referenced_chunk(self):
        GroundedChunk, UngroundedOutputError, _, validate_evidence = self._context_api()
        chunk = GroundedChunk(
            chunk_id="source-1:0",
            source_id="source-1",
            title="Source",
            text="The past simple describes completed actions.",
            subject_id="tieng_anh",
            grade=12,
            topic_id="curriculum_outcomes",
            source_language="en",
            license_id="CC-BY-SA-4.0",
            citations=[],
            relevance_score=0.9,
        )

        validate_evidence(["source-1:0"], [chunk], supporting_excerpt="past simple describes completed actions")
        with self.assertRaises(UngroundedOutputError):
            validate_evidence(["source-1:0"], [chunk], supporting_excerpt="future perfect continuous")


if __name__ == "__main__":
    unittest.main()
