"""Chặn việc âm thầm chạy trên dữ liệu giả khi MongoDB không kết nối được.

Trước đây `connect_to_mongo` bắt mọi lỗi kết nối rồi tự chuyển sang mock trong
bộ nhớ, và ứng dụng **vẫn khởi động bình thường**. Trên máy demo, chỉ cần quên
bật MongoDB là toàn bộ trang web chạy trên dữ liệu bịa mà không ai nhận ra —
giao diện không khác gì, chỉ có một dòng log cảnh báo trôi qua.

Nay việc rơi về mock phải được bật tường minh bằng `ALLOW_MOCK_DB_FALLBACK`.
"""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import app.database.mongodb as mongodb


def make_failing_client() -> MagicMock:
    """Client giả có `admin.command('ping')` luôn ném lỗi kết nối."""
    client = MagicMock()
    client.admin.command = AsyncMock(side_effect=ConnectionError("khong ket noi duoc"))
    return client


class MockFallbackGuardTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        mongodb.db_manager.client = None
        mongodb.db_manager.using_mock = False

    def tearDown(self):
        mongodb.db_manager.client = None
        mongodb.db_manager.using_mock = False

    async def test_connection_failure_raises_instead_of_faking_data(self):
        with patch.object(mongodb.settings, "MONGODB_URI", "mongodb://127.0.0.1:27017"), \
             patch.object(mongodb.settings, "ALLOW_MOCK_DB_FALLBACK", False), \
             patch.object(mongodb, "create_mongo_client", return_value=make_failing_client()), \
             patch.object(mongodb, "create_database_indexes", new=AsyncMock()):

            with self.assertRaises(RuntimeError) as ctx:
                await mongodb.connect_to_mongo()

        self.assertIn("MongoDB", str(ctx.exception))
        self.assertFalse(mongodb.db_manager.using_mock)

    async def test_missing_uri_raises_instead_of_faking_data(self):
        with patch.object(mongodb.settings, "MONGODB_URI", ""), \
             patch.object(mongodb.settings, "ALLOW_MOCK_DB_FALLBACK", False), \
             patch.object(mongodb, "create_database_indexes", new=AsyncMock()):

            with self.assertRaises(RuntimeError):
                await mongodb.connect_to_mongo()

        self.assertFalse(mongodb.db_manager.using_mock)

    async def test_fallback_still_available_when_explicitly_allowed(self):
        """Cờ bật tường minh vẫn cho phép — đây là đường dành cho phát triển
        ngoại tuyến, và người bật đã biết mình đang chạy trên dữ liệu giả."""
        with patch.object(mongodb.settings, "MONGODB_URI", "mongodb://127.0.0.1:27017"), \
             patch.object(mongodb.settings, "ALLOW_MOCK_DB_FALLBACK", True), \
             patch.object(mongodb, "create_mongo_client", return_value=make_failing_client()), \
             patch.object(mongodb, "create_database_indexes", new=AsyncMock()):

            await mongodb.connect_to_mongo()

        self.assertTrue(mongodb.db_manager.using_mock)

    async def test_default_configuration_does_not_allow_fallback(self):
        """Mặc định phải là an toàn — không ai phải nhớ tắt thứ gì."""
        self.assertFalse(mongodb.settings.ALLOW_MOCK_DB_FALLBACK)


if __name__ == "__main__":
    unittest.main()
