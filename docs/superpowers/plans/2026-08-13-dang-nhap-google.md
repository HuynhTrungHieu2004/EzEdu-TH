# Đăng nhập bằng tài khoản Google — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép đăng nhập/đăng ký EzEdu AI bằng tài khoản Google, phát ra JWT của chính hệ thống như luồng mật khẩu hiện có.

**Architecture:** Google Identity Services ở frontend cấp ID token; backend xác minh chữ ký/hạn/`aud` bằng `google-auth`, rồi tìm–gắn–tạo tài khoản. Một endpoint `POST /auth/google`, gọi lần hai kèm `role` khi là người dùng mới. Backend phi trạng thái, không lưu token Google.

**Tech Stack:** FastAPI, Pydantic v2, Motor/MongoDB, `google-auth` 2.55 (đã có sẵn), React 19 + Vite, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-13-dang-nhap-google-design.md`

## Global Constraints

- Thư viện `google-auth` **đã có sẵn** trong dự án (kéo theo bởi `google-genai`) — KHÔNG thêm phụ thuộc mới vào `requirements.txt`.
- Biến môi trường đã đặt sẵn: `GOOGLE_CLIENT_ID` (backend/.env), `VITE_GOOGLE_CLIENT_ID` (frontend/.env). KHÔNG commit hai file này.
- Mọi thông báo lỗi hướng tới người dùng viết bằng **tiếng Việt có dấu**.
- Mọi nhánh đăng nhập/đăng ký phải ghi nhật ký qua `record_activity` với `metadata={"provider": "google"}`.
- Test dùng `mongomock_motor.AsyncMongoMockClient` và `unittest.mock.patch` theo đúng khuôn mẫu các file trong `backend/tests/`.
- KHÔNG gọi mạng thật trong test: luôn thay `verify_oauth2_token` bằng bản giả.
- Chạy test bằng `cd backend && .venv/bin/python -m pytest`.
- Sau mỗi task: toàn bộ suite phải xanh (615 test tại thời điểm lập kế hoạch).

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `backend/app/services/google_auth_service.py` (mới) | Xác minh ID token; tìm/gắn/tạo tài khoản. Không biết gì về HTTP. |
| `backend/app/schemas/auth.py` (sửa) | `GoogleLoginRequest`, `GoogleLoginResponse` |
| `backend/app/routers/auth.py` (sửa) | Route `/auth/google`: cổng chặn, phát JWT, ghi nhật ký. Sửa `KeyError` ở `login`. |
| `backend/app/core/config.py` (sửa) | `GOOGLE_CLIENT_ID` |
| `backend/app/services/system_settings_service.py` (sửa) | Cờ `enable_google_login` |
| `backend/app/database/mongodb.py` (sửa) | Chỉ mục `google_sub` unique + sparse |
| `frontend/src/contexts/auth-context.ts` (sửa) | `postLoginPath(user)` — luật điều hướng dùng chung |
| `frontend/src/api/authApi.ts` (sửa) | `loginWithGoogle` |
| `frontend/src/components/GoogleSignInButton.tsx` (mới) | Nạp script GIS, hiện nút, gọi callback |
| `frontend/src/pages/LoginPage.tsx`, `RegisterPage.tsx` (sửa) | Gắn nút + hộp chọn vai |

Ranh giới quan trọng: `google_auth_service` **không import FastAPI**. Nó ném ngoại lệ riêng mang sẵn mã HTTP, router dịch sang `HTTPException`. Nhờ vậy test được toàn bộ logic phân nhánh mà không cần dựng HTTP.

---

## Task 1: Sửa lỗi HTTP 500 khi đăng nhập mật khẩu bằng tài khoản không có mật khẩu

Làm trước tiên vì nó độc lập với Google và bảo vệ luồng đang chạy. Sau Task 3 hệ thống mới sinh ra tài khoản không có `hashed_password`, nhưng lỗi thì đã tồn tại sẵn.

**Files:**
- Modify: `backend/app/routers/auth.py:193`
- Test: `backend/tests/test_auth_password_login.py` (mới)

**Interfaces:**
- Consumes: không có
- Produces: không có (chỉ sửa hành vi nội bộ)

- [ ] **Step 1: Viết test đỏ**

Tạo `backend/tests/test_auth_password_login.py`:

```python
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
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_password_login.py -q`
Expected: FAIL với `KeyError: 'hashed_password'`

- [ ] **Step 3: Sửa mã**

Trong `backend/app/routers/auth.py`, thay dòng 193:

```python
    if not user or not verify_password(user_in.password, user["hashed_password"]):
```

bằng:

```python
    mat_khau_bam = user.get("hashed_password") if user else None
    # Tài khoản đăng ký bằng Google không có mật khẩu. Đọc thẳng khoá này làm
    # cả endpoint trả HTTP 500 thay vì báo cho người dùng biết phải bấm nút nào.
    if not user or not mat_khau_bam or not verify_password(user_in.password, mat_khau_bam):
```

Và trong khối `raise HTTPException` ngay sau đó (dòng ~207), đổi `detail`:

```python
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Tài khoản này đăng nhập bằng Google. Hãy dùng nút \"Đăng nhập với Google\"."
                if user and not mat_khau_bam
                else "Email hoặc mật khẩu không đúng."
            ),
        )
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `cd backend && .venv/bin/python -m pytest tests/test_auth_password_login.py -q`
Expected: PASS (2 test)

- [ ] **Step 5: Chạy toàn bộ suite**

Run: `cd backend && .venv/bin/python -m pytest tests -q`
Expected: PASS, không test nào đỏ

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/auth.py backend/tests/test_auth_password_login.py
git commit -m "fix: đăng nhập mật khẩu không sập với tài khoản không có mật khẩu

Hàm login đọc thẳng user[\"hashed_password\"], nên tài khoản đăng ký bằng
Google làm cả endpoint trả HTTP 500. Nay trả 401 kèm thông báo chỉ đúng nút
cần bấm."
```

---

## Task 2: Cấu hình, cờ tính năng và chỉ mục

**Files:**
- Modify: `backend/app/core/config.py:23` (ngay dưới `MONGODB_DB_NAME`)
- Modify: `backend/app/services/system_settings_service.py:78` (cuối `FEATURE_FLAG_DEFINITIONS`)
- Modify: `backend/app/database/mongodb.py:144` (sau các chỉ mục `users`)
- Test: `backend/tests/test_google_login_config.py` (mới)

**Interfaces:**
- Produces:
  - `settings.GOOGLE_CLIENT_ID: str` (rỗng nếu chưa cấu hình)
  - Cờ `"enable_google_login"` trong `FEATURE_FLAG_DEFINITIONS`
  - Chỉ mục `users.google_sub` unique + sparse

- [ ] **Step 1: Viết test đỏ**

Tạo `backend/tests/test_google_login_config.py`:

```python
"""Cấu hình cho đăng nhập Google phải khai báo đầy đủ và an toàn theo mặc định."""

import unittest

from app.core.config import Settings
from app.services.system_settings_service import FEATURE_FLAG_DEFINITIONS


class GoogleLoginConfigTests(unittest.TestCase):
    def test_client_id_setting_exists_and_defaults_to_empty(self):
        """Rỗng theo mặc định để máy chưa cấu hình báo lỗi rõ ràng thay vì
        gửi token đi xác minh với audience sai."""
        self.assertEqual(Settings(GOOGLE_CLIENT_ID="").GOOGLE_CLIENT_ID, "")
        self.assertEqual(Settings(GOOGLE_CLIENT_ID="abc.apps.googleusercontent.com").GOOGLE_CLIENT_ID,
                         "abc.apps.googleusercontent.com")

    def test_feature_flag_is_declared_and_enabled_by_default(self):
        co = FEATURE_FLAG_DEFINITIONS.get("enable_google_login")

        self.assertIsNotNone(co, "thiếu cờ enable_google_login")
        self.assertTrue(co.default_enabled)
        self.assertIn("Google", co.description)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `cd backend && .venv/bin/python -m pytest tests/test_google_login_config.py -q`
Expected: FAIL — `Settings` không nhận `GOOGLE_CLIENT_ID`, và cờ chưa tồn tại

- [ ] **Step 3: Thêm cấu hình**

Trong `backend/app/core/config.py`, ngay dưới dòng `ALLOW_MOCK_DB_FALLBACK`:

```python
    # OAuth Client ID của Google. KHÔNG phải bí mật — nó nằm công khai trong mã
    # frontend. Backend cần nó để kiểm trường `aud` của ID token: thiếu bước đó
    # thì một token Google hợp lệ cấp cho ứng dụng KHÁC cũng đăng nhập được vào đây.
    GOOGLE_CLIENT_ID: str = ""
```

Trong `backend/app/services/system_settings_service.py`, thêm vào cuối `FEATURE_FLAG_DEFINITIONS` (trước dấu `}`):

```python
    "enable_google_login": FeatureFlagDefinition("enable_google_login", True, "Bật/tắt đăng nhập bằng tài khoản Google."),
```

Trong `backend/app/database/mongodb.py`, sau dòng `await db["users"].create_index([("role", 1), ("status", 1), ("created_at", -1)])`:

```python
        # unique: hai tài khoản không được trỏ cùng một Google.
        # sparse: tài khoản không dùng Google (không có trường này) không vướng
        # ràng buộc unique — nếu thiếu sparse thì chỉ tài khoản Google ĐẦU TIÊN
        # tạo được, mọi tài khoản mật khẩu sau đó đều đụng khoá null trùng nhau.
        await db["users"].create_index([("google_sub", 1)], unique=True, sparse=True)
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `cd backend && .venv/bin/python -m pytest tests/test_google_login_config.py -q`
Expected: PASS (2 test)

- [ ] **Step 5: Kiểm chỉ mục trên MongoDB THẬT**

Không viết test mongomock cho bước này: **mongomock không thực thi ràng buộc unique**, nên một test như vậy sẽ xanh kể cả khi chỉ mục hoàn toàn sai. Dự án này đã dính hai lần loại lỗi "mongomock chấp nhận thứ MongoDB thật từ chối" (xem `tests/test_mongo_update_operator_conflict.py`).

Kiểm bằng tay, một lần, trên MongoDB thật:

```bash
cd backend && .venv/bin/python - <<'EOF'
import asyncio
from app.core.config import settings
import app.database.mongodb as m

async def main():
    await m.connect_to_mongo()          # tự tạo chỉ mục lúc khởi động
    db = m.db_manager.client[settings.MONGODB_DB_NAME]

    chi_muc = await db["users"].index_information()
    goc = {k: v for k, v in chi_muc.items() if "google_sub" in str(v.get("key"))}
    print("chỉ mục google_sub:", goc)
    assert goc, "chưa tạo được chỉ mục google_sub"
    ten = next(iter(goc))
    assert goc[ten].get("unique"), "thiếu unique"
    assert goc[ten].get("sparse"), "thiếu sparse"

    # unique thật sự chặn: chèn hai bản ghi cùng google_sub phải hỏng.
    from pymongo.errors import DuplicateKeyError
    await db["users"].insert_one({"email": "kt1@x.vn", "google_sub": "trung-lap", "deleted_at": None})
    try:
        await db["users"].insert_one({"email": "kt2@x.vn", "google_sub": "trung-lap", "deleted_at": None})
        raise SystemExit("LỖI: chèn trùng google_sub mà không bị chặn")
    except DuplicateKeyError:
        print("unique chặn đúng")

    # sparse thật sự cho phép nhiều bản ghi KHÔNG có google_sub.
    await db["users"].insert_many([{"email": "kt3@x.vn", "deleted_at": None},
                                   {"email": "kt4@x.vn", "deleted_at": None}])
    print("sparse cho phép nhiều bản ghi không có trường này")

    await db["users"].delete_many({"email": {"$in": ["kt1@x.vn","kt2@x.vn","kt3@x.vn","kt4@x.vn"]}})
    print("đã dọn dữ liệu kiểm tra")
    await m.close_mongo_connection()

asyncio.run(main())
EOF
```

Expected: in ra `unique chặn đúng`, `sparse cho phép nhiều bản ghi không có trường này`, `đã dọn dữ liệu kiểm tra`.

Nếu thiếu `sparse`, bước cuối sẽ hỏng với `DuplicateKeyError` trên khoá `null` — đó chính là lý do phải có `sparse`: không có nó thì **chỉ tài khoản Google đầu tiên tạo được**, mọi tài khoản mật khẩu sau đó đều đụng nhau ở khoá null.

- [ ] **Step 6: Chạy toàn bộ suite**

Run: `cd backend && .venv/bin/python -m pytest tests -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/config.py backend/app/services/system_settings_service.py backend/app/database/mongodb.py backend/tests/test_google_login_config.py
git commit -m "feat: cấu hình, cờ tính năng và chỉ mục cho đăng nhập Google"
```

---

## Task 3: Service xác minh token và phân nhánh tài khoản

Đây là phần mang toàn bộ logic bảo mật. Không import FastAPI để test được mà không dựng HTTP.

**Files:**
- Create: `backend/app/services/google_auth_service.py`
- Test: `backend/tests/test_google_auth_service.py` (mới)

**Interfaces:**
- Consumes: `settings.GOOGLE_CLIENT_ID` (Task 2)
- Produces:
  - `class GoogleAuthError(Exception)` với thuộc tính `status_code: int`, `detail: str`
  - `@dataclass GoogleIdentity(sub: str, email: str, email_verified: bool, full_name: str, avatar_url: str | None)`
  - `def verify_google_id_token(raw_token: str) -> GoogleIdentity`
  - `async def find_or_link_google_user(db, identity: GoogleIdentity) -> tuple[dict | None, bool]` — trả `(user_doc, da_gan_moi)`
  - `async def create_google_user(db, identity: GoogleIdentity, role: str) -> dict`

- [ ] **Step 1: Viết test đỏ**

Tạo `backend/tests/test_google_auth_service.py`:

```python
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
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `cd backend && .venv/bin/python -m pytest tests/test_google_auth_service.py -q`
Expected: FAIL — `ModuleNotFoundError: app.services.google_auth_service`

- [ ] **Step 3: Viết service**

Tạo `backend/app/services/google_auth_service.py`:

```python
"""Xác minh danh tính Google và ánh xạ sang tài khoản EzEdu.

Module này cố ý KHÔNG import FastAPI: toàn bộ logic bảo mật ở đây phải test
được mà không cần dựng một request HTTP. Lỗi được ném bằng `GoogleAuthError`
mang sẵn mã trạng thái, router chỉ việc dịch sang `HTTPException`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import settings


class GoogleAuthError(Exception):
    """Lỗi đăng nhập Google, mang sẵn mã HTTP và câu thông báo tiếng Việt."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    full_name: str
    avatar_url: Optional[str]


def verify_google_id_token(raw_token: str) -> GoogleIdentity:
    """Xác minh ID token và trả về danh tính đã được Google bảo chứng.

    Một lời gọi `verify_oauth2_token` kiểm bốn thứ: chữ ký (khoá công khai
    Google), hạn dùng, `iss` là Google, và `aud` đúng client ID của ta. Tham số
    thứ ba chính là chốt `aud` — thiếu nó thì một ID token hợp lệ mà Google cấp
    cho ứng dụng khác cũng đăng nhập được vào hệ thống này.
    """
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleAuthError(503, "Chưa cấu hình đăng nhập Google trên máy chủ.")

    try:
        thong_tin: dict[str, Any] = id_token.verify_oauth2_token(
            raw_token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except Exception as exc:  # noqa: BLE001 - thư viện ném nhiều loại, đều là từ chối
        raise GoogleAuthError(401, "Không đăng nhập được bằng Google. Vui lòng thử lại.") from exc

    if not thong_tin.get("email"):
        raise GoogleAuthError(401, "Không đăng nhập được bằng Google. Vui lòng thử lại.")

    # Không có chốt này thì cơ chế gắn-vào-tài-khoản-cũ trở thành lỗ chiếm tài
    # khoản: ai tạo được tài khoản Google mang email người khác sẽ vào được.
    if not bool(thong_tin.get("email_verified")):
        raise GoogleAuthError(403, "Email Google này chưa được xác minh.")

    return GoogleIdentity(
        sub=str(thong_tin["sub"]),
        email=str(thong_tin["email"]).lower(),
        email_verified=True,
        full_name=str(thong_tin.get("name") or thong_tin["email"]),
        avatar_url=thong_tin.get("picture"),
    )


async def find_or_link_google_user(db, identity: GoogleIdentity) -> tuple[Optional[dict], bool]:
    """Tìm tài khoản ứng với danh tính Google này.

    Trả `(tài_khoản, vừa_gắn_mới)`. `(None, False)` nghĩa là người dùng hoàn
    toàn mới — hàm này KHÔNG tạo tài khoản, vì việc tạo còn phải qua cổng chặn
    đăng ký và cần biết vai người dùng chọn.
    """
    theo_sub = await db["users"].find_one({"google_sub": identity.sub, "deleted_at": None})
    if theo_sub:
        return theo_sub, False

    theo_email = await db["users"].find_one({"email": identity.email, "deleted_at": None})
    if theo_email:
        # Gắn thêm, không ghi đè: giữ nguyên vai, mật khẩu cũ và mọi dữ liệu.
        await db["users"].update_one(
            {"_id": theo_email["_id"]},
            {"$set": {"google_sub": identity.sub, "updated_at": datetime.now(timezone.utc)}},
        )
        theo_email["google_sub"] = identity.sub
        return theo_email, True

    return None, False


async def create_google_user(db, identity: GoogleIdentity, role: str) -> dict:
    """Tạo tài khoản mới từ danh tính Google, với vai người dùng vừa chọn.

    Không đặt `hashed_password`: tài khoản này chưa có mật khẩu. Luồng đăng
    nhập mật khẩu đã được sửa để chịu được điều đó (xem `routers/auth.py`).
    """
    now = datetime.now(timezone.utc)
    user_doc = {
        "email": identity.email,
        "full_name": identity.full_name,
        "role": role,
        "status": "active",
        "is_active": True,
        "email_verified": True,      # Google đã xác minh, không cần bước xác minh lại
        "google_sub": identity.sub,
        "avatar_url": identity.avatar_url,
        "permissions_override": [],
        "deleted_at": None,
        "created_at": now,
        "updated_at": None,
    }
    result = await db["users"].insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    return user_doc
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `cd backend && .venv/bin/python -m pytest tests/test_google_auth_service.py -q`
Expected: PASS (11 test)

- [ ] **Step 5: Chạy toàn bộ suite**

Run: `cd backend && .venv/bin/python -m pytest tests -q`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/google_auth_service.py backend/tests/test_google_auth_service.py
git commit -m "feat: service xác minh danh tính Google và phân nhánh tài khoản"
```

---

## Task 4: Endpoint POST /auth/google

**Files:**
- Modify: `backend/app/schemas/auth.py` (thêm ở cuối file)
- Modify: `backend/app/routers/auth.py` (thêm route sau `login_swagger`, khoảng dòng 330)
- Test: `backend/tests/test_google_login_endpoint.py` (mới)

**Interfaces:**
- Consumes: `verify_google_id_token`, `find_or_link_google_user`, `create_google_user`, `GoogleAuthError`, `GoogleIdentity` (Task 3)
- Produces: `POST /api/v1/auth/google` nhận `GoogleLoginRequest`, trả `GoogleLoginResponse`

- [ ] **Step 1: Viết test đỏ**

Tạo `backend/tests/test_google_login_endpoint.py`:

```python
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
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `cd backend && .venv/bin/python -m pytest tests/test_google_login_endpoint.py -q`
Expected: FAIL — `ImportError: cannot import name 'google_login'`

- [ ] **Step 3: Thêm schema**

Thêm vào cuối `backend/app/schemas/auth.py`:

```python
class GoogleLoginRequest(BaseModel):
    id_token: str = Field(..., min_length=1, max_length=4096)
    # Chỉ gửi ở lần gọi thứ hai, sau khi người dùng mới chọn vai. Literal chặn
    # sẵn việc tự phong 'admin' bằng cách sửa request.
    role: Optional[Literal["student", "lecturer"]] = None


class GoogleLoginResponse(BaseModel):
    needs_role: bool = False
    access_token: Optional[str] = None
    token_type: str = "bearer"
    # Hai trường dưới chỉ dùng để hiện lời chào ở màn chọn vai.
    email: Optional[str] = None
    full_name: Optional[str] = None
```

- [ ] **Step 4: Thêm route**

Trong `backend/app/routers/auth.py`, thêm vào phần import:

```python
from app.schemas.auth import (
    UserRegister, UserLogin, UserResponse, Token, TokenPayload,
    GoogleLoginRequest, GoogleLoginResponse,
)
from app.services.google_auth_service import (
    GoogleAuthError,
    create_google_user,
    find_or_link_google_user,
    verify_google_id_token,
)
```

(dòng `from app.schemas.auth import ...` cũ được thay bằng bản mở rộng ở trên)

Thêm route sau hàm `login_swagger`:

```python
@router.post("/google", response_model=GoogleLoginResponse)
async def google_login(payload: GoogleLoginRequest, request: Request):
    """Đăng nhập/đăng ký bằng tài khoản Google.

    Gọi lần đầu chỉ với `id_token`. Nếu là người dùng mới, trả `needs_role` và
    KHÔNG tạo gì; frontend hỏi vai rồi gọi lại cùng endpoint kèm `role`.
    """
    started = time.perf_counter()
    db = get_database()

    if not await is_feature_enabled("enable_google_login", database=db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Đăng nhập bằng Google hiện không khả dụng.",
        )

    try:
        identity = verify_google_id_token(payload.id_token)
    except GoogleAuthError as exc:
        await record_activity(
            action="login_failed", category="auth", status="failure",
            user_id=None, resource_type="user", resource_id=None, request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="GOOGLE_TOKEN_REJECTED",
            metadata={"provider": "google"}, database=db,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    user, _ = await find_or_link_google_user(db, identity)
    la_nguoi_moi = user is None

    if la_nguoi_moi:
        if payload.role is None:
            # Chưa tạo gì cả — chỉ hỏi vai rồi chờ lần gọi thứ hai.
            return GoogleLoginResponse(
                needs_role=True, email=identity.email, full_name=identity.full_name
            )
        dang_ky_bat = bool(await get_setting_value("registration_enabled", True, database=db))
        if not dang_ky_bat or not await is_feature_enabled("enable_user_registration", database=db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Đăng ký tài khoản hiện đang tạm tắt.",
            )
        user = await create_google_user(db, identity, role=payload.role)

    user_status = _normalize_user_status(user)
    if user.get("is_active", True) is False or user_status in {"locked", "deleted"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        )

    if await is_feature_enabled("enable_maintenance_mode", database=db):
        if user.get("role") not in {"admin", "super_admin"}:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Hệ thống đang bảo trì. Vui lòng quay lại sau.",
            )

    now = datetime.now(timezone.utc)
    await db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": now, "updated_at": user.get("updated_at") or now}},
    )
    await record_activity(
        action="user_registered" if la_nguoi_moi else "login_success",
        category="auth", status="success",
        user_id=str(user["_id"]), resource_type="user", resource_id=str(user["_id"]),
        request=request, duration_ms=int((time.perf_counter() - started) * 1000),
        metadata={"provider": "google", "role": user.get("role", "user")},
        database=db,
    )
    return GoogleLoginResponse(
        needs_role=False,
        access_token=create_access_token(subject=str(user["_id"])),
        token_type="bearer",
    )
```

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `cd backend && .venv/bin/python -m pytest tests/test_google_login_endpoint.py -q`
Expected: PASS (7 test)

- [ ] **Step 6: Chạy toàn bộ suite**

Run: `cd backend && .venv/bin/python -m pytest tests -q`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/routers/auth.py backend/tests/test_google_login_endpoint.py
git commit -m "feat: endpoint POST /auth/google"
```

---

## Task 5: Lớp API và luật điều hướng dùng chung ở frontend

**Files:**
- Modify: `frontend/src/contexts/auth-context.ts` (thêm sau `homePathForArea`)
- Modify: `frontend/src/api/authApi.ts`
- Modify: `frontend/src/pages/LoginPage.tsx:47-50` (thay if-chain bằng helper)

**Interfaces:**
- Consumes: `POST /auth/google` (Task 4)
- Produces:
  - `export function postLoginPath(user: UserResponse): string`
  - `authApi.loginWithGoogle(payload: { id_token: string; role?: 'student' | 'lecturer' }): Promise<GoogleLoginResponse>`
  - `export interface GoogleLoginResponse` trong `frontend/src/types/auth.ts`

- [ ] **Step 1: Thêm luật điều hướng dùng chung**

Trong `frontend/src/contexts/auth-context.ts`, thêm sau hàm `homePathForArea`:

```ts
/**
 * Trang đích ngay sau khi đăng nhập.
 *
 * Khác `homePathForArea`: học sinh được đưa thẳng tới danh sách bài thi, và
 * học sinh chưa khai hồ sơ thì đi qua bước thiết lập trước. Đăng nhập bằng mật
 * khẩu và bằng Google đều gọi hàm này để hai luồng không lệch nhau về sau.
 */
export function postLoginPath(user: UserResponse): string {
  if (user.role === 'student') {
    return user.student_profile_completed ? '/published-questions' : '/student-onboarding';
  }
  if (user.role === 'admin') return '/admin/dashboard';
  return '/dashboard';
}
```

Thêm `import type { UserResponse } from '../types/auth';` nếu file chưa có.

- [ ] **Step 2: Dùng helper ở LoginPage**

Trong `frontend/src/pages/LoginPage.tsx`, thay bốn dòng 47-50:

```tsx
      if (user.role === 'student' && !user.student_profile_completed) navigate('/student-onboarding');
      else if (user.role === 'student') navigate('/published-questions');
      else if (user.role === 'admin') navigate('/admin/dashboard');
      else navigate('/dashboard');
```

bằng:

```tsx
      navigate(postLoginPath(user));
```

và thêm `postLoginPath` vào dòng import từ `../contexts/auth-context`.

- [ ] **Step 3: Thêm kiểu và lời gọi API**

Trong `frontend/src/types/auth.ts`, thêm:

```ts
export interface GoogleLoginResponse {
  needs_role: boolean;
  access_token: string | null;
  token_type: string;
  email: string | null;
  full_name: string | null;
}
```

Trong `frontend/src/api/authApi.ts`, thêm vào object `authApi`:

```ts
  loginWithGoogle: async (payload: {
    id_token: string;
    role?: 'student' | 'lecturer';
  }): Promise<GoogleLoginResponse> => {
    const response = await client.post<GoogleLoginResponse>('/auth/google', payload);
    return response.data;
  },
```

và thêm `GoogleLoginResponse` vào import kiểu ở đầu file.

- [ ] **Step 4: Kiểm kiểu**

Run: `cd frontend && npx tsc --noEmit`
Expected: không lỗi

- [ ] **Step 5: Kiểm đăng nhập mật khẩu không bị hỏng**

Mở trình duyệt tại `http://localhost:5173/login`, đăng nhập bằng một tài khoản học sinh có sẵn. Kỳ vọng: vẫn tới đúng trang như trước khi sửa.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/contexts/auth-context.ts frontend/src/api/authApi.ts frontend/src/pages/LoginPage.tsx frontend/src/types/auth.ts
git commit -m "refactor: tách luật điều hướng sau đăng nhập, thêm lời gọi API Google"
```

---

## Task 6: Nút đăng nhập Google và hộp chọn vai

**Files:**
- Create: `frontend/src/components/GoogleSignInButton.tsx`
- Create: `frontend/src/components/GoogleRoleDialog.tsx`

**Interfaces:**
- Consumes: `VITE_GOOGLE_CLIENT_ID`
- Produces:
  - `<GoogleSignInButton onCredential={(idToken: string) => void} disabled?: boolean />`
  - `<GoogleRoleDialog open email fullName onChoose={(role: 'student' | 'lecturer') => void} onCancel />`

- [ ] **Step 1: Viết component nút**

Tạo `frontend/src/components/GoogleSignInButton.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'google-identity-services';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Nạp script Google Identity Services đúng một lần cho cả ứng dụng.
 *
 * Nạp trong component thay vì nhét vào index.html: trang công khai không cần
 * tải thư viện mà chúng không dùng tới.
 */
function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById(SCRIPT_ID)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được thư viện Google.'));
    document.head.appendChild(script);
  });
}

interface Props {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}

export function GoogleSignInButton({ onCredential, disabled }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (!clientId) {
      setError('Chưa cấu hình đăng nhập Google.');
      return;
    }
    let huy = false;

    loadGoogleScript()
      .then(() => {
        if (huy || !holder.current) return;
        const google = (window as unknown as { google?: any }).google;
        if (!google?.accounts?.id) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (res: { credential?: string }) => {
            if (res.credential) onCredential(res.credential);
          },
        });
        google.accounts.id.renderButton(holder.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          locale: 'vi',
        });
      })
      .catch(() => setError('Không tải được thư viện Google. Kiểm tra kết nối mạng.'));

    return () => {
      huy = true;
    };
  }, [clientId, onCredential]);

  if (error) return <p className="text-muted">{error}</p>;

  return <div ref={holder} aria-busy={disabled} style={{ minHeight: 44 }} />;
}
```

- [ ] **Step 2: Viết hộp chọn vai**

Tạo `frontend/src/components/GoogleRoleDialog.tsx`:

```tsx
import { Dialog } from './ui';

interface Props {
  open: boolean;
  email: string;
  fullName: string;
  onChoose: (role: 'student' | 'lecturer') => void;
  onCancel: () => void;
}

/**
 * Hỏi vai cho người lần đầu đăng nhập bằng Google.
 *
 * Google không trả về thông tin vai trò, mà hệ thống phân quyền theo vai ngay
 * từ lúc tạo tài khoản. Hỏi một lần ở đây thay vì đoán rồi bắt quản trị sửa sau.
 */
export function GoogleRoleDialog({ open, email, fullName, onChoose, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} size="sm" title="Bạn là ai trên EzEdu AI?">
      <p>
        Chào <strong>{fullName}</strong> ({email}). Chọn vai để chúng tôi hiển thị đúng
        công cụ cho bạn.
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button type="button" className="ez-btn ez-btn-primary" onClick={() => onChoose('student')}>
          Tôi là học sinh
        </button>
        <button type="button" className="ez-btn" onClick={() => onChoose('lecturer')}>
          Tôi là giảng viên
        </button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 3: Kiểm kiểu**

Run: `cd frontend && npx tsc --noEmit`
Expected: không lỗi. Nếu `Dialog` yêu cầu props khác, mở `frontend/src/components/ui/Dialog.tsx` và chỉnh lời gọi cho khớp.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/GoogleSignInButton.tsx frontend/src/components/GoogleRoleDialog.tsx
git commit -m "feat: nút đăng nhập Google và hộp chọn vai"
```

---

## Task 7: Gắn vào trang đăng nhập/đăng ký và kiểm chứng đầu-cuối

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/RegisterPage.tsx`

**Interfaces:**
- Consumes: `GoogleSignInButton`, `GoogleRoleDialog` (Task 6), `authApi.loginWithGoogle`, `postLoginPath` (Task 5)

- [ ] **Step 1: Thêm luồng Google vào LoginPage**

Trong `frontend/src/pages/LoginPage.tsx`, thêm state và hàm xử lý:

```tsx
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [googleInfo, setGoogleInfo] = useState<{ email: string; fullName: string } | null>(null);

  const dangNhapGoogle = async (idToken: string, role?: 'student' | 'lecturer') => {
    setError(null);
    try {
      const kq = await authApi.loginWithGoogle({ id_token: idToken, role });
      if (kq.needs_role) {
        // Người mới: giữ lại token để gọi lần hai kèm vai vừa chọn.
        setGoogleToken(idToken);
        setGoogleInfo({ email: kq.email ?? '', fullName: kq.full_name ?? '' });
        return;
      }
      localStorage.setItem('access_token', kq.access_token as string);
      const user = await authApi.getMe();
      await refresh();
      navigate(postLoginPath(user));
    } catch (err: unknown) {
      setGoogleToken(null);
      setGoogleInfo(null);
      setError(getApiErrorDetail(err) ?? 'Đăng nhập bằng Google thất bại.');
    }
  };
```

Thêm vào JSX, ngay dưới nút "Đăng nhập":

```tsx
        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', marginTop: 16 }}>
          <span className="text-muted">hoặc</span>
          <GoogleSignInButton onCredential={(t) => void dangNhapGoogle(t)} />
        </div>
        {googleInfo && googleToken && (
          <GoogleRoleDialog
            open
            email={googleInfo.email}
            fullName={googleInfo.fullName}
            onChoose={(role) => void dangNhapGoogle(googleToken, role)}
            onCancel={() => {
              setGoogleToken(null);
              setGoogleInfo(null);
            }}
          />
        )}
```

- [ ] **Step 2: Làm tương tự cho RegisterPage**

Trong `frontend/src/pages/RegisterPage.tsx`, thêm đúng khối state, hàm `dangNhapGoogle` và JSX như Step 1 (chép nguyên, đổi thông báo lỗi mặc định thành `'Đăng ký bằng Google thất bại.'`). Với Google thì đăng nhập và đăng ký là một hành động, nên hai trang dùng chung luồng.

- [ ] **Step 3: Kiểm kiểu**

Run: `cd frontend && npx tsc --noEmit`
Expected: không lỗi

- [ ] **Step 4: Kiểm chứng trên trình duyệt — người dùng mới**

1. Khởi động lại backend để nạp `GOOGLE_CLIENT_ID`: `cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
2. Mở `http://localhost:5173/login`, xoá `localStorage` trước.
3. Bấm nút Google, chọn một email **nằm trong danh sách Test users**.
4. Kỳ vọng: hiện hộp chọn vai. Chọn "Tôi là học sinh".
5. Kỳ vọng: vào `/student-onboarding`, và trong MongoDB có tài khoản mới với `google_sub`, `role: "student"`, **không có** `hashed_password`.

Kiểm bằng:

```bash
cd backend && .venv/bin/python -c "
from pymongo import MongoClient
db = MongoClient('mongodb://127.0.0.1:27017')['chuyende02']
u = db.users.find_one({'google_sub': {'\$exists': True}})
print({k: u.get(k) for k in ('email','role','google_sub','email_verified')})
print('co mat khau:', 'hashed_password' in u)"
```

- [ ] **Step 5: Kiểm chứng — đăng nhập lại không bị hỏi vai**

Đăng xuất, bấm nút Google lại với cùng email. Kỳ vọng: vào thẳng, **không** hiện hộp chọn vai.

- [ ] **Step 6: Kiểm chứng — gắn vào tài khoản mật khẩu có sẵn**

1. Tạo tài khoản mật khẩu với một email Google khác trong danh sách Test users, vai `lecturer`.
2. Đăng xuất, bấm nút Google với chính email đó.
3. Kỳ vọng: vào thẳng, **giữ nguyên vai `lecturer`**, và bản ghi trong DB có cả `hashed_password` lẫn `google_sub`.

- [ ] **Step 7: Chạy toàn bộ suite backend lần cuối**

Run: `cd backend && .venv/bin/python -m pytest tests -q`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx frontend/src/pages/RegisterPage.tsx
git commit -m "feat: gắn đăng nhập Google vào trang đăng nhập và đăng ký"
```

---

## Ghi chú vận hành

App Google đang ở trạng thái **Testing**: chỉ email nằm trong **Audience → Test users** mới đăng nhập được. Bốn email đã thêm sẵn. Trước khi demo, kiểm lại danh sách này — lỗi `access_blocked` khi thiếu test user rất dễ bị hiểu nhầm thành lỗi mã.

Cấu hình origin `http://localhost:5173` có thể mất **vài phút tới vài giờ** để Google áp dụng. Gặp `origin_mismatch` ngay sau khi tạo client thì chờ rồi thử lại, đừng vội sửa cấu hình.
