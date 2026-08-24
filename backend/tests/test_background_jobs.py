import asyncio
import unittest
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.services.background_job_service import (
    claim_next,
    enqueue,
    ensure_background_job_indexes,
    mark_failed,
    mark_succeeded,
    process_one,
)


class BackgroundJobServiceTests(unittest.IsolatedAsyncioTestCase):
    """Kiểm thử hàng đợi job nền trên MongoDB (thay thế Celery/Temporal cho
    quy mô hiện tại — xem docs/feature-expansion/01-target-architecture.md).
    """

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_background_jobs"]
        await ensure_background_job_indexes(self.db)

    async def test_enqueue_and_claim(self):
        job_id = await enqueue(self.db, job_type="send_notification", payload={"user_id": "u1"})
        job = await claim_next(self.db, job_types=["send_notification"], worker_id="w1")

        self.assertIsNotNone(job)
        self.assertEqual(str(job["_id"]), job_id)
        self.assertEqual(job["status"], "running")
        self.assertEqual(job["locked_by"], "w1")
        self.assertEqual(job["attempts"], 1)

    async def test_two_workers_do_not_claim_the_same_job(self):
        await enqueue(self.db, job_type="grade_essay", payload={"attempt_id": "a1"})

        job_for_worker_a = await claim_next(self.db, job_types=["grade_essay"], worker_id="worker-a")
        job_for_worker_b = await claim_next(self.db, job_types=["grade_essay"], worker_id="worker-b")

        self.assertIsNotNone(job_for_worker_a)
        self.assertIsNone(job_for_worker_b)  # không còn job nào khác để nhận

    async def test_expired_running_job_is_reclaimed_once_without_consuming_another_attempt(self):
        job_id = await enqueue(self.db, job_type="grade_essay", payload={"attempt_id": "a1"})
        first = await claim_next(self.db, job_types=["grade_essay"], worker_id="dead-worker")
        await self.db.background_jobs.update_one(
            {"_id": first["_id"]},
            {"$set": {"locked_until": datetime.now(timezone.utc) - timedelta(seconds=1)}},
        )

        reclaimed = await claim_next(self.db, job_types=["grade_essay"], worker_id="worker-a")
        loser = await claim_next(self.db, job_types=["grade_essay"], worker_id="worker-b")

        self.assertEqual(str(reclaimed["_id"]), job_id)
        self.assertEqual(reclaimed["locked_by"], "worker-a")
        self.assertEqual(reclaimed["attempts"], 1)
        self.assertIsNone(loser)

    async def test_expired_worker_cannot_complete_reclaimed_job(self):
        job_id = await enqueue(self.db, job_type="grade_essay", payload={})
        stale = await claim_next(self.db, job_types=["grade_essay"], worker_id="worker-a")
        await self.db.background_jobs.update_one(
            {"_id": stale["_id"]},
            {"$set": {"locked_until": datetime.now(timezone.utc) - timedelta(seconds=1)}},
        )
        current = await claim_next(self.db, job_types=["grade_essay"], worker_id="worker-b")

        stale_write = await mark_succeeded(
            self.db, job_id, claim_token=stale["claim_token"], result={"worker": "a"}
        )
        after_stale_write = await self.db.background_jobs.find_one({"_id": stale["_id"]})

        self.assertFalse(stale_write)
        self.assertEqual(after_stale_write["status"], "running")
        self.assertEqual(after_stale_write["locked_by"], "worker-b")
        self.assertTrue(
            await mark_succeeded(
                self.db, job_id, claim_token=current["claim_token"], result={"worker": "b"}
            )
        )

    async def test_running_job_with_live_lease_is_not_reclaimed(self):
        await enqueue(self.db, job_type="grade_essay", payload={"attempt_id": "a1"})
        await claim_next(self.db, job_types=["grade_essay"], worker_id="worker-a")

        self.assertIsNone(
            await claim_next(self.db, job_types=["grade_essay"], worker_id="worker-b")
        )

    async def test_claim_ignores_jobs_not_yet_due(self):
        future_time = datetime.now(timezone.utc) + timedelta(hours=1)
        await enqueue(self.db, job_type="retry_upload", payload={}, run_after=future_time)

        job = await claim_next(self.db, job_types=["retry_upload"], worker_id="w1")
        self.assertIsNone(job)

    async def test_mark_succeeded(self):
        job_id = await enqueue(self.db, job_type="index_document", payload={"document_id": "d1"})
        claim = await claim_next(self.db, job_types=["index_document"], worker_id="w1")
        await mark_succeeded(
            self.db, job_id, claim_token=claim["claim_token"], result={"chunk_count": 12}
        )

        doc = await self.db["background_jobs"].find_one({"job_type": "index_document"})
        self.assertEqual(doc["status"], "succeeded")
        self.assertEqual(doc["result"], {"chunk_count": 12})
        self.assertIsNone(doc["locked_by"])

    async def test_mark_failed_retries_with_backoff_then_dead_letters(self):
        job_id = await enqueue(self.db, job_type="ingest_source", payload={}, max_attempts=2)

        # Lần thử 1: thất bại, còn lượt retry (2 attempts cho phép, đã dùng 1).
        first_claim = await claim_next(self.db, job_types=["ingest_source"], worker_id="w1")
        await mark_failed(
            self.db, job_id, claim_token=first_claim["claim_token"], error="Timeout lần 1"
        )
        doc_after_first_failure = await self.db["background_jobs"].find_one({"_id": ObjectId(job_id)})
        self.assertEqual(doc_after_first_failure["status"], "failed")
        # mongomock trả datetime naive (không tzinfo) dù giá trị gốc là UTC-aware —
        # so sánh với "now" cũng ở dạng naive để tránh lỗi so sánh aware/naive
        # (đây là đặc thù của mongomock trong test, không phải hành vi cần sửa ở service).
        next_run_at = doc_after_first_failure["next_run_at"]
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        self.assertGreater(next_run_at.replace(tzinfo=None) if next_run_at.tzinfo else next_run_at, now_naive)

        # Đẩy next_run_at về quá khứ để có thể claim lại ngay trong test (thay vì chờ backoff thật).
        await self.db["background_jobs"].update_one(
            {"_id": doc_after_first_failure["_id"]},
            {"$set": {"next_run_at": datetime.now(timezone.utc) - timedelta(seconds=1)}},
        )

        # Lần thử 2: thất bại tiếp, hết lượt retry (attempts=2=max_attempts) → dead_letter.
        second_claim = await claim_next(self.db, job_types=["ingest_source"], worker_id="w1")
        await mark_failed(
            self.db, job_id, claim_token=second_claim["claim_token"], error="Timeout lần 2"
        )
        doc_final = await self.db["background_jobs"].find_one({"_id": doc_after_first_failure["_id"]})
        self.assertEqual(doc_final["status"], "dead_letter")
        self.assertEqual(doc_final["error"], "Timeout lần 2")

    async def test_enqueue_with_duplicate_idempotency_key_returns_existing_job(self):
        job_id_1 = await enqueue(
            self.db, job_type="delete_cloudinary_asset", payload={"public_id": "p1"}, idempotency_key="delete-p1"
        )
        job_id_2 = await enqueue(
            self.db, job_type="delete_cloudinary_asset", payload={"public_id": "p1"}, idempotency_key="delete-p1"
        )
        self.assertEqual(job_id_1, job_id_2)

        count = await self.db["background_jobs"].count_documents({"idempotency_key": "delete-p1"})
        self.assertEqual(count, 1)  # không tạo job trùng

    async def test_process_one_dispatches_to_registered_handler(self):
        await enqueue(self.db, job_type="ping", payload={"n": 41})

        async def handler(payload):
            return {"n": payload["n"] + 1}

        processed = await process_one(self.db, job_types=["ping"], worker_id="w1", handlers={"ping": handler})
        self.assertTrue(processed)

        doc = await self.db["background_jobs"].find_one({"job_type": "ping"})
        self.assertEqual(doc["status"], "succeeded")
        self.assertEqual(doc["result"], {"n": 42})

    async def test_process_one_returns_false_when_queue_empty(self):
        processed = await process_one(self.db, job_types=["nonexistent"], worker_id="w1", handlers={})
        self.assertFalse(processed)

    async def test_process_one_handles_handler_exception_without_crashing(self):
        await enqueue(self.db, job_type="flaky", payload={})

        async def handler(_payload):
            raise RuntimeError("lỗi giả lập trong handler")

        processed = await process_one(self.db, job_types=["flaky"], worker_id="w1", handlers={"flaky": handler})
        self.assertTrue(processed)

        doc = await self.db["background_jobs"].find_one({"job_type": "flaky"})
        self.assertIn(doc["status"], {"failed", "dead_letter"})
        self.assertIn("lỗi giả lập", doc["error"])

    async def test_process_one_times_out_a_stuck_handler(self):
        await enqueue(self.db, job_type="stuck", payload={}, max_attempts=1)

        async def handler(_payload):
            await asyncio.Event().wait()

        processed = await process_one(
            self.db,
            job_types=["stuck"],
            worker_id="w1",
            handlers={"stuck": handler},
            timeout_seconds=0.01,
        )

        self.assertTrue(processed)
        doc = await self.db.background_jobs.find_one({"job_type": "stuck"})
        self.assertEqual(doc["status"], "dead_letter")
        self.assertIn("quá thời gian", doc["error"])


if __name__ == "__main__":
    unittest.main()
