import unittest
from unittest.mock import AsyncMock

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.curriculum_kb.schemas.crawl import CrawlBatchCreate
from app.curriculum_kb.services import crawler_service


class CrawlUrlSafetyTests(unittest.TestCase):
    def test_rejects_private_and_non_http_urls(self):
        for url in (
            "http://127.0.0.1/admin",
            "http://10.0.0.4/private",
            "http://localhost:8000",
            "file:///etc/passwd",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                crawler_service.normalize_public_url(url)

    def test_normalizes_fragment_and_default_port(self):
        self.assertEqual(
            crawler_service.normalize_public_url("HTTPS://Example.edu:443/math#part-1"),
            "https://example.edu/math",
        )


class CrawlBatchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_curriculum_crawler"]

    async def test_enqueue_deduplicates_seed_urls_and_starts_quarantined(self):
        batch = await crawler_service.enqueue_crawl_batch(
            self.db,
            CrawlBatchCreate(
                seed_urls=[
                    "https://example.edu/math#intro",
                    "https://example.edu/math",
                ],
                subject_id="toan",
                grade=10,
                max_pages=5,
            ),
            actor_id="teacher-1",
        )

        self.assertEqual(batch.seed_urls, ["https://example.edu/math"])
        self.assertEqual(batch.status, "pending")
        self.assertEqual(await self.db["curriculum_crawl_items"].count_documents({}), 0)
        job = await self.db["background_jobs"].find_one({"job_type": crawler_service.CRAWL_JOB_TYPE})
        self.assertEqual(job["payload"]["batch_id"], batch.id)

    async def test_job_obeys_robots_and_never_auto_publishes_content(self):
        batch = await crawler_service.enqueue_crawl_batch(
            self.db,
            CrawlBatchCreate(
                seed_urls=["https://example.edu/blocked", "https://example.edu/allowed"],
                subject_id="toan",
                grade=10,
                max_pages=2,
            ),
            actor_id="teacher-1",
        )
        robots_allowed = AsyncMock(side_effect=[False, True])
        fetch_page = AsyncMock(
            return_value={
                "url": "https://example.edu/allowed",
                "title": "Hàm số bậc hai",
                "content_text": "Kiến thức và bài tập hàm số bậc hai. " * 4,
                "links": [],
                "content_type": "text/html",
            }
        )

        result = await crawler_service.crawl_batch_job(
            self.db,
            {"batch_id": batch.id},
            robots_allowed=robots_allowed,
            fetch_page=fetch_page,
        )

        self.assertEqual(result["fetched_count"], 1)
        self.assertEqual(result["blocked_count"], 1)
        item = await self.db["curriculum_crawl_items"].find_one({"crawl_status": "fetched"})
        self.assertEqual(item["review_status"], "draft")
        self.assertEqual(item["quality_status"], "unreviewed")
        self.assertEqual(item["copyright_status"], "unknown")
        self.assertEqual(await self.db["curriculum_kb_sources"].count_documents({}), 0)
        self.assertEqual(await self.db["exam_bank_questions"].count_documents({}), 0)

    async def test_only_approved_item_can_be_promoted_to_knowledge_bank(self):
        batch = await crawler_service.enqueue_crawl_batch(
            self.db,
            CrawlBatchCreate(
                seed_urls=["https://example.edu/math"], subject_id="toan", grade=10, max_pages=1
            ),
            actor_id="teacher-1",
        )
        await crawler_service.crawl_batch_job(
            self.db,
            {"batch_id": batch.id},
            robots_allowed=AsyncMock(return_value=True),
            fetch_page=AsyncMock(
                return_value={
                    "url": "https://example.edu/math",
                    "title": "Hàm số",
                    "content_text": "Nội dung hàm số đã trích xuất. " * 4,
                    "links": [],
                    "content_type": "text/html",
                }
            ),
        )
        item = await self.db["curriculum_crawl_items"].find_one({})
        with self.assertRaises(HTTPException):
            await crawler_service.promote_crawl_item(
                self.db, str(item["_id"]), actor_id="teacher-1", is_admin=False
            )

        await self.db["curriculum_crawl_items"].update_one(
            {"_id": item["_id"]},
            {"$set": {"review_status": "approved", "quality_status": "verified"}},
        )
        source = await crawler_service.promote_crawl_item(
            self.db, str(item["_id"]), actor_id="teacher-1", is_admin=False
        )
        self.assertEqual(source.origin_type, "web_crawl")
        self.assertEqual(source.review_status, "approved")
        self.assertEqual(source.quality_status, "verified")


if __name__ == "__main__":
    unittest.main()
