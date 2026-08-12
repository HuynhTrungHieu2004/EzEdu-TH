import unittest
from unittest.mock import AsyncMock, patch

from mongomock_motor import AsyncMongoMockClient

from app.personalization.services.knowledge_extraction_job import (
    KNOWLEDGE_EXTRACTION_JOB_TYPE,
    enqueue_knowledge_extraction,
    extract_document_knowledge_job,
)
from app.services.background_job_service import ensure_background_job_indexes


class EnqueueKnowledgeExtractionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test"]
        # Idempotency của hàng đợi dựa vào unique index trên `idempotency_key`
        # (xem background_job_service). Không tạo index thì test không kiểm
        # được đúng hành vi chạy thật.
        await ensure_background_job_indexes(self.db)

    async def test_does_nothing_when_personalization_is_disabled(self):
        with patch("app.personalization.services.knowledge_extraction_job.settings") as cfg:
            cfg.PERSONALIZATION_ENABLED = False
            cfg.KNOWLEDGE_GRAPH_ENABLED = True
            await enqueue_knowledge_extraction(self.db, document_id="doc1", user_id="u1")

        self.assertEqual(await self.db["background_jobs"].count_documents({}), 0)

    async def test_does_nothing_when_knowledge_graph_is_disabled(self):
        with patch("app.personalization.services.knowledge_extraction_job.settings") as cfg:
            cfg.PERSONALIZATION_ENABLED = True
            cfg.KNOWLEDGE_GRAPH_ENABLED = False
            await enqueue_knowledge_extraction(self.db, document_id="doc1", user_id="u1")

        self.assertEqual(await self.db["background_jobs"].count_documents({}), 0)

    async def test_enqueues_one_job_when_both_flags_are_on(self):
        with patch("app.personalization.services.knowledge_extraction_job.settings") as cfg:
            cfg.PERSONALIZATION_ENABLED = True
            cfg.KNOWLEDGE_GRAPH_ENABLED = True
            await enqueue_knowledge_extraction(self.db, document_id="doc1", user_id="u1")

        job = await self.db["background_jobs"].find_one({})
        self.assertIsNotNone(job)
        self.assertEqual(job["job_type"], KNOWLEDGE_EXTRACTION_JOB_TYPE)
        self.assertEqual(job["payload"], {"document_id": "doc1", "user_id": "u1"})

    async def test_repeated_calls_do_not_pile_up_duplicate_jobs(self):
        """Sinh câu hỏi nhiều lần trên cùng tài liệu không được tạo nhiều job."""
        with patch("app.personalization.services.knowledge_extraction_job.settings") as cfg:
            cfg.PERSONALIZATION_ENABLED = True
            cfg.KNOWLEDGE_GRAPH_ENABLED = True
            await enqueue_knowledge_extraction(self.db, document_id="doc1", user_id="u1")
            await enqueue_knowledge_extraction(self.db, document_id="doc1", user_id="u1")

        self.assertEqual(await self.db["background_jobs"].count_documents({}), 1)


class ExtractDocumentKnowledgeJobTests(unittest.IsolatedAsyncioTestCase):
    async def test_delegates_to_the_extraction_service(self):
        with patch(
            "app.personalization.services.knowledge_extraction_job.process_document_knowledge_graph",
            new=AsyncMock(return_value={"persisted_items": 3}),
        ) as service:
            result = await extract_document_knowledge_job({"document_id": "doc1", "user_id": "u1"})

        service.assert_awaited_once()
        self.assertEqual(service.await_args.kwargs["document_id"], "doc1")
        self.assertEqual(service.await_args.kwargs["user_id"], "u1")
        self.assertEqual(result, {"persisted_items": 3})


if __name__ == "__main__":
    unittest.main()
