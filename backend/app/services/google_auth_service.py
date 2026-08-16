"""Xác minh danh tính Google và ánh xạ sang tài khoản EzEdu.

Module này cố ý KHÔNG import FastAPI: toàn bộ logic bảo mật ở đây phải test
được mà không cần dựng một request HTTP. Lỗi được ném bằng `GoogleAuthError`
mang sẵn mã trạng thái, router chỉ việc dịch sang `HTTPException`.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import settings
from app.services.social_auth_service import (
    SocialIdentity,
    create_social_user,
    find_or_link_social_user,
)

#: Tên trường lưu định danh Google trong bảng `users`.
PROVIDER_FIELD = "google_sub"


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

    sub = thong_tin.get("sub")
    if not sub:
        raise GoogleAuthError(401, "Không đăng nhập được bằng Google. Vui lòng thử lại.")

    return GoogleIdentity(
        sub=str(sub),
        email=str(thong_tin["email"]).lower(),
        email_verified=True,
        full_name=str(thong_tin.get("name") or thong_tin["email"]),
        avatar_url=thong_tin.get("picture"),
    )


def to_social_identity(identity: GoogleIdentity) -> SocialIdentity:
    """Chuyển sang hình dạng chung mà lõi `social_auth_service` hiểu."""
    return SocialIdentity(
        provider_field=PROVIDER_FIELD,
        provider_id=identity.sub,
        email=identity.email,
        full_name=identity.full_name,
        avatar_url=identity.avatar_url,
    )


async def find_or_link_google_user(db, identity: GoogleIdentity) -> tuple[Optional[dict], bool]:
    """Tìm tài khoản ứng với danh tính Google này. Xem `find_or_link_social_user`."""
    return await find_or_link_social_user(db, to_social_identity(identity))


async def create_google_user(db, identity: GoogleIdentity, role: str) -> dict:
    """Tạo tài khoản mới từ danh tính Google. Xem `create_social_user`."""
    return await create_social_user(db, to_social_identity(identity), role)
