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
        moc_thoi_gian = datetime.now(timezone.utc)
        await db["users"].update_one(
            {"_id": theo_email["_id"]},
            {"$set": {"google_sub": identity.sub, "updated_at": moc_thoi_gian}},
        )
        # Đồng bộ dict trả về với DB — thiếu dòng dưới thì updated_at trong
        # dict vẫn là giá trị cũ, khiến nơi gọi vô tình ghi đè lùi lại.
        theo_email["google_sub"] = identity.sub
        theo_email["updated_at"] = moc_thoi_gian
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
