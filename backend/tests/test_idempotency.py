import unittest

from mongomock_motor import AsyncMongoMockClient

from app.core.idempotency import IdempotencyConflict, ensure_idempotency_index, run_idempotent


class IdempotencyTests(unittest.IsolatedAsyncioTestCase):
    """Kiểm thử cơ chế idempotency-key dùng chung (backend/app/core/idempotency.py).

    Đây là hạ tầng nền tảng cho mọi API tạo/nộp/xử lý (bắt đầu bài thi, nộp
    bài, autosave, generate đề, webhook Cloudinary) ở các giai đoạn sau.
    """

    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_idempotency"]
        await ensure_idempotency_index(self.db)
        self.call_count = 0

    async def _fn(self):
        self.call_count += 1
        return {"value": self.call_count}

    async def test_first_call_executes_and_second_call_returns_cached_result(self):
        result1 = await run_idempotent(self.db, scope="exam-attempt.submit", key="key-1", fn=self._fn)
        result2 = await run_idempotent(self.db, scope="exam-attempt.submit", key="key-1", fn=self._fn)

        self.assertEqual(result1, {"value": 1})
        self.assertEqual(result2, {"value": 1})  # KHÔNG chạy lại fn — vẫn là kết quả lần đầu
        self.assertEqual(self.call_count, 1)

    async def test_different_keys_run_independently(self):
        await run_idempotent(self.db, scope="exam-attempt.submit", key="key-a", fn=self._fn)
        await run_idempotent(self.db, scope="exam-attempt.submit", key="key-b", fn=self._fn)
        self.assertEqual(self.call_count, 2)

    async def test_different_scope_same_key_run_independently(self):
        await run_idempotent(self.db, scope="exam-attempt.start", key="shared-key", fn=self._fn)
        await run_idempotent(self.db, scope="exam-attempt.submit", key="shared-key", fn=self._fn)
        self.assertEqual(self.call_count, 2)

    async def test_concurrent_in_progress_raises_conflict(self):
        # Giả lập request thứ hai đến trong lúc request thứ nhất còn đang xử lý:
        # tự chèn bản ghi "in_progress" trực tiếp, không qua run_idempotent.
        await self.db["idempotency_records"].insert_one(
            {"scope": "exam-attempt.submit", "key": "key-racing", "status": "in_progress", "result": None}
        )
        with self.assertRaises(IdempotencyConflict):
            await run_idempotent(self.db, scope="exam-attempt.submit", key="key-racing", fn=self._fn)
        self.assertEqual(self.call_count, 0)  # fn không được chạy khi có conflict

    async def test_failed_fn_clears_claim_so_retry_is_allowed(self):
        async def failing_fn():
            raise ValueError("lỗi giả lập")

        with self.assertRaises(ValueError):
            await run_idempotent(self.db, scope="exam-attempt.submit", key="key-retry", fn=failing_fn)

        # Sau khi thất bại, key không còn bị khoá — lần gọi lại phải chạy được.
        result = await run_idempotent(self.db, scope="exam-attempt.submit", key="key-retry", fn=self._fn)
        self.assertEqual(result, {"value": 1})


if __name__ == "__main__":
    unittest.main()
