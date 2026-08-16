"""Logic xác minh và phân nhánh tài khoản Facebook.

Không gọi mạng: `_lay_json` luôn bị thay bằng bản giả. Ở đây kiểm logic của ta,
không kiểm Graph API.
"""

import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.services import facebook_auth_service as svc
from app.services.facebook_auth_service import (
    FacebookAuthError,
    FacebookIdentity,
    create_facebook_user,
    find_or_link_facebook_user,
    verify_facebook_access_token,
)

APP_ID = "1234567890"
APP_SECRET = "secret-cua-app"


def debug_token_data(**overrides) -> dict:
    base = {"is_valid": True, "app_id": APP_ID, "user_id": "fb-1"}
    base.update(overrides)
    return {"data": base}


def ho_so(**overrides) -> dict:
    base = {
        "id": "fb-1",
        "name": "Trần Minh An",
        "email": "an@example.com",
        "picture": {"data": {"url": "https://scontent.xx.fbcdn.net/anh.jpg"}},
    }
    base.update(overrides)
    return base


def gia_lap_graph(debug=None, me=None, loi=None):
    """Trả về hàm thay cho `_lay_json`, phân nhánh theo đường dẫn được gọi."""

    async def _gia(duong_dan, params):
        if loi is not None:
            raise loi
        if duong_dan == "debug_token":
            return debug if debug is not None else debug_token_data()
        return me if me is not None else ho_so()

    return _gia


def identity(**overrides) -> FacebookIdentity:
    base = {
        "user_id": "fb-1",
        "email": "an@example.com",
        "full_name": "Trần Minh An",
        "avatar_url": None,
    }
    base.update(overrides)
    return FacebookIdentity(**base)


def cau_hinh_du():
    return (
        patch.object(svc.settings, "FACEBOOK_APP_ID", APP_ID),
        patch.object(svc.settings, "FACEBOOK_APP_SECRET", APP_SECRET),
    )


class VerifyTokenTests(unittest.IsolatedAsyncioTestCase):
    async def _chay(self, **kwargs) -> FacebookIdentity:
        app_id, app_secret = cau_hinh_du()
        with app_id, app_secret, patch.object(svc, "_lay_json", gia_lap_graph(**kwargs)):
            return await verify_facebook_access_token("token-bat-ky")

    async def _mong_loi(self, **kwargs) -> FacebookAuthError:
        with self.assertRaises(FacebookAuthError) as ctx:
            await self._chay(**kwargs)
        return ctx.exception

    async def test_valid_token_becomes_an_identity(self):
        kq = await self._chay()

        self.assertEqual(kq.user_id, "fb-1")
        self.assertEqual(kq.email, "an@example.com")
        self.assertEqual(kq.full_name, "Trần Minh An")
        self.assertEqual(kq.avatar_url, "https://scontent.xx.fbcdn.net/anh.jpg")

    async def test_token_of_another_app_is_rejected(self):
        """Kiểm tra bảo mật quan trọng nhất của module này.

        Access token do Facebook cấp cho ứng dụng KHÁC cũng có `is_valid: true`.
        Chỉ kiểm `is_valid` mà không kiểm `app_id` thì bất kỳ ai có một app
        Facebook riêng cũng đăng nhập được vào EzEdu bằng token của app họ.
        Đối xứng với `test_client_id_is_passed_as_audience` bên Google.
        """
        loi = await self._mong_loi(debug=debug_token_data(app_id="9999999999"))

        self.assertEqual(loi.status_code, 401)

    async def test_app_id_compared_as_string_not_number(self):
        """Graph API trả `app_id` khi thì số khi thì chuỗi tuỳ phiên bản. So sánh
        thẳng bằng `==` sẽ từ chối nhầm token hợp lệ khi Facebook trả kiểu số."""
        kq = await self._chay(debug=debug_token_data(app_id=int(APP_ID)))

        self.assertEqual(kq.user_id, "fb-1")

    async def test_invalid_token_is_401(self):
        loi = await self._mong_loi(debug=debug_token_data(is_valid=False))

        self.assertEqual(loi.status_code, 401)

    async def test_missing_email_is_403_with_a_way_out(self):
        """Người đăng ký Facebook bằng số điện thoại không có email. Cả hệ thống
        khoá theo email nên phải từ chối — nhưng phải chỉ được đường khác."""
        khong_email = ho_so()
        del khong_email["email"]

        loi = await self._mong_loi(me=khong_email)

        self.assertEqual(loi.status_code, 403)
        self.assertIn("Google", loi.detail, "phải chỉ cho người dùng cách đăng nhập khác")

    async def test_missing_id_is_401_not_500(self):
        khong_id = ho_so()
        del khong_id["id"]

        loi = await self._mong_loi(me=khong_id)

        self.assertEqual(loi.status_code, 401)

    async def test_email_is_lowercased(self):
        kq = await self._chay(me=ho_so(email="An@Example.COM"))

        self.assertEqual(kq.email, "an@example.com")

    async def test_missing_avatar_does_not_crash(self):
        khong_anh = ho_so()
        del khong_anh["picture"]

        kq = await self._chay(me=khong_anh)

        self.assertIsNone(kq.avatar_url)

    async def test_missing_config_is_503(self):
        with patch.object(svc.settings, "FACEBOOK_APP_ID", ""), \
             patch.object(svc.settings, "FACEBOOK_APP_SECRET", ""):
            with self.assertRaises(FacebookAuthError) as ctx:
                await verify_facebook_access_token("bat-ky")

        self.assertEqual(ctx.exception.status_code, 503)

    async def test_app_secret_alone_missing_is_also_503(self):
        """Có App ID mà thiếu Secret thì không gọi `/debug_token` được. Bỏ sót
        nhánh này sẽ gửi chuỗi "1234|" lên Facebook và nhận về 401 khó hiểu."""
        with patch.object(svc.settings, "FACEBOOK_APP_ID", APP_ID), \
             patch.object(svc.settings, "FACEBOOK_APP_SECRET", ""):
            with self.assertRaises(FacebookAuthError) as ctx:
                await verify_facebook_access_token("bat-ky")

        self.assertEqual(ctx.exception.status_code, 503)


class GraphNetworkTests(unittest.IsolatedAsyncioTestCase):
    async def test_network_failure_is_503_not_401(self):
        """Facebook không với tới được là lỗi của máy chủ ta, không phải lỗi
        đăng nhập của người dùng. Báo 401 sẽ khiến họ đi thử lại mật khẩu và đổi
        tài khoản, trong khi chẳng ai sửa được gì."""
        import httpx

        app_id, app_secret = cau_hinh_du()
        with app_id, app_secret, \
             patch.object(svc.httpx, "AsyncClient", side_effect=httpx.ConnectError("mat mang")):
            with self.assertRaises(FacebookAuthError) as ctx:
                await verify_facebook_access_token("token-bat-ky")

        self.assertEqual(ctx.exception.status_code, 503)


class FindOrLinkTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_facebook"]

    async def test_existing_facebook_user_is_found(self):
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "lecturer", "facebook_id": "fb-1", "deleted_at": None,
            "created_at": datetime.now(timezone.utc),
        })

        user, da_gan = await find_or_link_facebook_user(self.db, identity())

        self.assertIsNotNone(user)
        self.assertEqual(user["role"], "lecturer")
        self.assertFalse(da_gan)

    async def test_password_account_with_same_email_is_linked(self):
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "lecturer", "hashed_password": "bam", "deleted_at": None,
            "created_at": datetime.now(timezone.utc),
        })

        user, da_gan = await find_or_link_facebook_user(self.db, identity())

        self.assertTrue(da_gan)
        self.assertEqual(user["role"], "lecturer", "không được đổi vai khi gắn")
        trong_db = await self.db["users"].find_one({"email": "an@example.com"})
        self.assertEqual(trong_db["facebook_id"], "fb-1")
        self.assertEqual(trong_db["hashed_password"], "bam", "không được xoá mật khẩu cũ")

    async def test_google_account_gains_facebook_without_losing_google(self):
        """Một người gắn được cả hai. Ghi đè `google_sub` sẽ khiến họ mất luôn
        đường đăng nhập cũ."""
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "student", "google_sub": "google-sub-1", "deleted_at": None,
            "created_at": datetime.now(timezone.utc),
        })

        await find_or_link_facebook_user(self.db, identity())

        trong_db = await self.db["users"].find_one({"email": "an@example.com"})
        self.assertEqual(trong_db["google_sub"], "google-sub-1")
        self.assertEqual(trong_db["facebook_id"], "fb-1")

    async def test_unknown_user_returns_none_and_creates_nothing(self):
        user, da_gan = await find_or_link_facebook_user(self.db, identity())

        self.assertIsNone(user)
        self.assertFalse(da_gan)
        self.assertEqual(await self.db["users"].count_documents({}), 0)

    async def test_deleted_account_is_found_not_recreated(self):
        """Tài khoản bị quản trị xoá mềm phải được TÌM THẤY và trả về nguyên
        trạng, KHÔNG được coi là người mới — coi là mới sẽ tạo doc thứ hai cùng
        email, lách thẳng qua lệnh xoá của quản trị."""
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": "an@example.com", "full_name": "An",
            "role": "student", "hashed_password": "bam",
            "deleted_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })

        user, da_gan = await find_or_link_facebook_user(self.db, identity())

        self.assertIsNotNone(user)
        self.assertIsNotNone(user.get("deleted_at"))
        self.assertFalse(da_gan, "không được gắn facebook_id vào tài khoản đã xoá")
        self.assertEqual(
            await self.db["users"].count_documents({}), 1,
            "không được tạo thêm doc thứ hai cùng email",
        )


class CreateFacebookUserTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_facebook"]

    async def test_new_account_has_the_chosen_role_and_no_password(self):
        user = await create_facebook_user(self.db, identity(), role="lecturer")

        self.assertEqual(user["role"], "lecturer")
        self.assertEqual(user["facebook_id"], "fb-1")
        self.assertNotIn("hashed_password", user)
        self.assertTrue(user["email_verified"])
        self.assertTrue(user["is_active"])
        self.assertEqual(user["status"], "active")

    async def test_account_is_persisted(self):
        await create_facebook_user(self.db, identity(), role="student")

        trong_db = await self.db["users"].find_one({"email": "an@example.com"})
        self.assertIsNotNone(trong_db)
        self.assertEqual(trong_db["role"], "student")


if __name__ == "__main__":
    unittest.main()
