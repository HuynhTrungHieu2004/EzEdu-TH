"""Logic xác minh và phân nhánh tài khoản Google.

Không gọi mạng: `verify_oauth2_token` luôn bị thay bằng bản giả. Ở đây kiểm
logic của ta, không kiểm thư viện Google.
"""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.services import google_auth_service as svc
from app.services.google_auth_service import (
    GoogleAuthError,
    GoogleIdentity,
    create_google_user,
    find_or_link_google_user,
    verify_google_id_token,
)

CLIENT_ID = "test-client.apps.googleusercontent.com"


def payload(**overrides) -> dict:
    base = {
        "sub": "google-sub-1",
        "email": "an@example.com",
        "email_verified": True,
        "name": "Trần Minh An",
        "picture": "https://lh3.googleusercontent.com/anh.jpg",
    }
    base.update(overrides)
    return base


def identity(**overrides) -> GoogleIdentity:
    base = {
        "sub": "google-sub-1",
        "email": "an@example.com",
        "email_verified": True,
        "full_name": "Trần Minh An",
        "avatar_url": None,
    }
    base.update(overrides)
    return GoogleIdentity(**base)


class VerifyTokenTests(unittest.TestCase):
    def test_valid_token_becomes_an_identity(self):
        with patch.object(svc.settings, "GOOGLE_CLIENT_ID", CLIENT_ID), \
             patch.object(svc.id_token, "verify_oauth2_token", return_value=payload()):

            kq = verify_google_id_token("token-hop-le")

        self.assertEqual(kq.sub, "google-sub-1")
        self.assertEqual(kq.email, "an@example.com")
        self.assertTrue(kq.email_verified)
        self.assertEqual(kq.full_name, "Trần Minh An")

    def test_client_id_is_passed_as_audience(self):
        """Không truyền audience thì token Google cấp cho ứng dụng KHÁC cũng
        đăng nhập được vào đây — đây là kiểm tra bảo mật quan trọng nhất."""
        with patch.object(svc.settings, "GOOGLE_CLIENT_ID", CLIENT_ID), \
             patch.object(svc.id_token, "verify_oauth2_token", return_value=payload()) as gia:

            verify_google_id_token("token-hop-le")

        self.assertEqual(gia.call_args.args[2], CLIENT_ID)

    def test_library_rejection_becomes_401(self):
        with patch.object(svc.settings, "GOOGLE_CLIENT_ID", CLIENT_ID), \
             patch.object(svc.id_token, "verify_oauth2_token",
                          side_effect=ValueError("Token expired")):

            with self.assertRaises(GoogleAuthError) as ctx:
                verify_google_id_token("token-het-han")

        self.assertEqual(ctx.exception.status_code, 401)

    def test_unverified_email_is_rejected_with_403(self):
        """Chốt chặn quan trọng: cơ chế gắn-vào-tài-khoản-cũ dựa hoàn toàn vào
        việc Google đã xác minh email. Bỏ chốt này là mở đường chiếm tài khoản."""
        with patch.object(svc.settings, "GOOGLE_CLIENT_ID", CLIENT_ID), \
             patch.object(svc.id_token, "verify_oauth2_token",
                          return_value=payload(email_verified=False)):

            with self.assertRaises(GoogleAuthError) as ctx:
                verify_google_id_token("token-email-chua-xac-minh")

        self.assertEqual(ctx.exception.status_code, 403)

    def test_missing_client_id_config_is_503(self):
        with patch.object(svc.settings, "GOOGLE_CLIENT_ID", ""):
            with self.assertRaises(GoogleAuthError) as ctx:
                verify_google_id_token("bat-ky")

        self.assertEqual(ctx.exception.status_code, 503)


class FindOrLinkTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_google"]

    async def test_existing_google_user_is_found(self):
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "lecturer", "google_sub": "google-sub-1", "deleted_at": None,
            "created_at": datetime.now(timezone.utc),
        })

        user, da_gan = await find_or_link_google_user(self.db, identity())

        self.assertIsNotNone(user)
        self.assertEqual(user["role"], "lecturer")
        self.assertFalse(da_gan)

    async def test_password_account_with_same_email_is_linked(self):
        """Gắn chứ không tạo mới — người dùng giữ nguyên vai và toàn bộ dữ liệu cũ."""
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "lecturer", "hashed_password": "bam", "deleted_at": None,
            "created_at": datetime.now(timezone.utc),
        })

        user, da_gan = await find_or_link_google_user(self.db, identity())

        self.assertTrue(da_gan)
        self.assertEqual(user["role"], "lecturer", "không được đổi vai khi gắn")
        trong_db = await self.db["users"].find_one({"email": "an@example.com"})
        self.assertEqual(trong_db["google_sub"], "google-sub-1")
        self.assertEqual(trong_db["hashed_password"], "bam", "không được xoá mật khẩu cũ")

    async def test_unknown_user_returns_none_and_creates_nothing(self):
        user, da_gan = await find_or_link_google_user(self.db, identity())

        self.assertIsNone(user)
        self.assertFalse(da_gan)
        self.assertEqual(await self.db["users"].count_documents({}), 0)

    async def test_deleted_account_is_not_reused(self):
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "student", "hashed_password": "bam",
            "deleted_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })

        user, _ = await find_or_link_google_user(self.db, identity())

        self.assertIsNone(user)


class CreateGoogleUserTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_google"]

    async def test_new_account_has_the_chosen_role_and_no_password(self):
        user = await create_google_user(self.db, identity(), role="lecturer")

        self.assertEqual(user["role"], "lecturer")
        self.assertEqual(user["google_sub"], "google-sub-1")
        self.assertNotIn("hashed_password", user)
        self.assertTrue(user["email_verified"])
        self.assertTrue(user["is_active"])
        self.assertEqual(user["status"], "active")

    async def test_account_is_persisted(self):
        await create_google_user(self.db, identity(), role="student")

        trong_db = await self.db["users"].find_one({"email": "an@example.com"})
        self.assertIsNotNone(trong_db)
        self.assertEqual(trong_db["role"], "student")


if __name__ == "__main__":
    unittest.main()
