"""Endpoint /auth/google: cổng chặn, phát JWT, và các nhánh tài khoản."""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers.auth import google_login
from app.schemas.auth import GoogleLoginRequest
from app.services.google_auth_service import GoogleIdentity

DANH_TINH = GoogleIdentity(
    sub="google-sub-1",
    email="an@example.com",
    email_verified=True,
    full_name="Trần Minh An",
    avatar_url=None,
)


class GoogleLoginEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from app.services.system_settings_service import invalidate_runtime_config_cache

        # system_settings_service cache alive theo tiến trình, không theo từng
        # test: nếu không xoá, cờ được set ở test này rò sang test kế tiếp
        # (mỗi test có DB mock riêng nhưng dùng chung cache module-level).
        invalidate_runtime_config_cache()
        self.addCleanup(invalidate_runtime_config_cache)

        self.db = AsyncMongoMockClient()["test_google_ep"]
        for target in (
            "app.routers.auth.get_database",
            "app.services.activity_log_service.get_database",
            "app.services.system_settings_service.get_database",
        ):
            patcher = patch(target, return_value=self.db)
            patcher.start()
            self.addCleanup(patcher.stop)

        xac_minh = patch("app.routers.auth.verify_google_id_token", return_value=DANH_TINH)
        xac_minh.start()
        self.addCleanup(xac_minh.stop)

    async def _goi(self, role=None):
        return await google_login(
            GoogleLoginRequest(id_token="token-gia", role=role), request=None
        )

    async def test_brand_new_user_is_asked_for_a_role_and_nothing_is_created(self):
        kq = await self._goi()

        self.assertTrue(kq.needs_role)
        self.assertIsNone(kq.access_token)
        self.assertEqual(kq.email, "an@example.com")
        self.assertEqual(await self.db["users"].count_documents({}), 0)

    async def test_second_call_with_role_creates_the_account_and_returns_a_token(self):
        kq = await self._goi(role="lecturer")

        self.assertFalse(kq.needs_role)
        self.assertTrue(kq.access_token)
        trong_db = await self.db["users"].find_one({"email": "an@example.com"})
        self.assertEqual(trong_db["role"], "lecturer")

    async def test_existing_google_user_logs_in_without_being_asked_again(self):
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "student", "google_sub": "google-sub-1", "status": "active",
            "is_active": True, "deleted_at": None, "created_at": datetime.now(timezone.utc),
        })

        kq = await self._goi()

        self.assertFalse(kq.needs_role)
        self.assertTrue(kq.access_token)

    async def test_locked_account_is_refused(self):
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "student", "google_sub": "google-sub-1", "status": "locked",
            "is_active": False, "deleted_at": None, "created_at": datetime.now(timezone.utc),
        })

        with self.assertRaises(HTTPException) as ctx:
            await self._goi()

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_registration_gate_blocks_new_users_only(self):
        """Tắt đăng ký nghĩa là 'không nhận người mới', không phải 'khoá cửa
        người đang dùng'."""
        await self.db["feature_flags"].insert_one({
            "key": "enable_user_registration", "enabled": False, "rollout_percentage": 100,
            "allowed_roles": [],
        })

        with self.assertRaises(HTTPException) as ctx:
            await self._goi(role="student")
        self.assertEqual(ctx.exception.status_code, 403)

        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "student", "google_sub": "google-sub-1", "status": "active",
            "is_active": True, "deleted_at": None, "created_at": datetime.now(timezone.utc),
        })
        kq = await self._goi()
        self.assertTrue(kq.access_token, "người đã có tài khoản vẫn phải vào được")

    async def test_google_login_flag_off_blocks_everything(self):
        await self.db["feature_flags"].insert_one({
            "key": "enable_google_login", "enabled": False, "rollout_percentage": 100,
            "allowed_roles": [],
        })

        with self.assertRaises(HTTPException) as ctx:
            await self._goi()

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_activity_log_records_the_provider(self):
        await self._goi(role="student")

        nhat_ky = await self.db["user_activity_logs"].find({}).to_list(None)
        self.assertTrue(nhat_ky)
        self.assertTrue(any(b.get("metadata", {}).get("provider") == "google" for b in nhat_ky))


if __name__ == "__main__":
    unittest.main()
