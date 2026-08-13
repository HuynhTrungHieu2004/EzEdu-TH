"""Tài khoản không có mật khẩu không được làm sập luồng đăng nhập mật khẩu.

Sau khi có đăng nhập Google, hệ thống sinh ra tài khoản chỉ-Google — không có
khoá `hashed_password`. Hàm `login` đọc thẳng `user["hashed_password"]` nên
những tài khoản đó làm cả endpoint trả HTTP 500 thay vì một thông báo tử tế.
"""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers.auth import login
from app.schemas.auth import UserLogin


class PasswordLoginWithoutHashTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_auth"]
        for target in (
            "app.routers.auth.get_database",
            "app.services.activity_log_service.get_database",
            "app.services.system_settings_service.get_database",
        ):
            patcher = patch(target, return_value=self.db)
            patcher.start()
            self.addCleanup(patcher.stop)

        await self.db["users"].insert_one({
            "_id": ObjectId(),
            "email": "chi-google@example.com",
            "full_name": "Chỉ Google",
            "role": "student",
            "status": "active",
            "is_active": True,
            "google_sub": "google-123",
            "deleted_at": None,
            "created_at": datetime.now(timezone.utc),
        })

    async def test_login_without_password_hash_returns_401_not_500(self):
        with self.assertRaises(HTTPException) as ctx:
            await login(
                UserLogin(email="chi-google@example.com", password="bat-ky"),
                request=None,
            )

        self.assertEqual(ctx.exception.status_code, 401)

    async def test_message_tells_the_user_to_use_google(self):
        with self.assertRaises(HTTPException) as ctx:
            await login(
                UserLogin(email="chi-google@example.com", password="bat-ky"),
                request=None,
            )

        self.assertIn("Google", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
