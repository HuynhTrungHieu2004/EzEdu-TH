"""Xác minh danh tính Facebook và ánh xạ sang tài khoản EzEdu.

Giống `google_auth_service`, module này cố ý KHÔNG import FastAPI: toàn bộ logic
bảo mật ở đây phải test được mà không cần dựng một request HTTP. Lỗi được ném
bằng `FacebookAuthError` mang sẵn mã trạng thái, router chỉ việc dịch sang
`HTTPException`.

Facebook khác Google ở chỗ căn bản: Google trả ID token — một JWT ta tự kiểm
được bằng khoá công khai, không cần hỏi ai. Facebook trả access token đục, muốn
biết nó là gì thì phải hỏi ngược Facebook. Nên ở đây có hai lệnh gọi mạng nằm
ngay trên đường đăng nhập, và mọi trục trặc của Facebook đều thành lỗi của ta.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.core.config import settings
from app.services.social_auth_service import (
    SocialIdentity,
    create_social_user,
    find_or_link_social_user,
)

#: Tên trường lưu định danh Facebook trong bảng `users`.
PROVIDER_FIELD = "facebook_id"

#: Facebook chậm thì người dùng ngồi chờ ở màn đăng nhập. Thà báo lỗi rõ ràng
#: sau 10 giây còn hơn treo cho tới khi trình duyệt tự bỏ cuộc.
GRAPH_TIMEOUT_SECONDS = 10.0


class FacebookAuthError(Exception):
    """Lỗi đăng nhập Facebook, mang sẵn mã HTTP và câu thông báo tiếng Việt."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass(frozen=True)
class FacebookIdentity:
    user_id: str
    email: str
    full_name: str
    avatar_url: Optional[str]


def _graph_url(duong_dan: str) -> str:
    return f"https://graph.facebook.com/{settings.FACEBOOK_GRAPH_VERSION}/{duong_dan}"


async def _lay_json(duong_dan: str, params: dict[str, str]) -> dict[str, Any]:
    """Gọi một endpoint Graph API và trả JSON.

    Mọi trục trặc phía Facebook — mất mạng, timeout, 500, JSON hỏng — đều thành
    503 chứ không phải 401. Phân biệt chỗ này quan trọng: 401 nói với người dùng
    "đăng nhập của bạn không hợp lệ", trong khi sự thật là máy chủ ta không liên
    lạc được với Facebook. Báo sai khiến người dùng đi thử lại mật khẩu, đổi tài
    khoản, và không ai biết đường sửa.
    """
    try:
        async with httpx.AsyncClient(timeout=GRAPH_TIMEOUT_SECONDS) as client:
            phan_hoi = await client.get(_graph_url(duong_dan), params=params)
            phan_hoi.raise_for_status()
            return phan_hoi.json()
    except Exception as exc:  # noqa: BLE001 - mọi lỗi mạng/parse đều cùng một nghĩa
        raise FacebookAuthError(
            503, "Không liên lạc được với Facebook. Vui lòng thử lại sau."
        ) from exc


async def verify_facebook_access_token(raw_token: str) -> FacebookIdentity:
    """Xác minh access token và trả về danh tính đã được Facebook bảo chứng.

    Hai bước, không bỏ bước nào:

    1. `/debug_token` — token này còn hiệu lực không, VÀ nó được cấp cho app nào.
    2. `/me` — lấy tên, email, ảnh.

    Bước 1 kiểm `app_id` là chốt chặn quan trọng nhất của cả module này. Một
    access token do Facebook cấp cho ứng dụng BẤT KỲ khác cũng có `is_valid:
    true` — chỉ kiểm `is_valid` thì ai có một app Facebook riêng cũng đăng nhập
    được vào EzEdu bằng token của app họ. Đây đúng là cái bẫy mà bản Google chặn
    qua tham số `aud`; Facebook không chặn hộ, phải tự tay.
    """
    if not settings.FACEBOOK_APP_ID or not settings.FACEBOOK_APP_SECRET:
        raise FacebookAuthError(503, "Chưa cấu hình đăng nhập Facebook trên máy chủ.")

    tu_choi = FacebookAuthError(401, "Không đăng nhập được bằng Facebook. Vui lòng thử lại.")

    # `access_token` của chính app, dạng "APP_ID|APP_SECRET" — đây là lý do
    # backend cần App Secret, khác hẳn Google.
    token_app = f"{settings.FACEBOOK_APP_ID}|{settings.FACEBOOK_APP_SECRET}"
    kiem_tra = await _lay_json(
        "debug_token", {"input_token": raw_token, "access_token": token_app}
    )
    du_lieu = kiem_tra.get("data") or {}

    if not du_lieu.get("is_valid"):
        raise tu_choi

    # So sánh dạng chuỗi: Graph API trả app_id là số ở chỗ này và chuỗi ở chỗ
    # khác tuỳ phiên bản, còn settings luôn là chuỗi.
    if str(du_lieu.get("app_id") or "") != str(settings.FACEBOOK_APP_ID):
        raise tu_choi

    ho_so = await _lay_json(
        "me", {"fields": "id,name,email,picture.type(large)", "access_token": raw_token}
    )

    user_id = ho_so.get("id")
    if not user_id:
        raise tu_choi

    email = ho_so.get("email")
    if not email:
        # Người đăng ký Facebook bằng số điện thoại không có email, và người
        # dùng cũng bỏ tick được quyền này. Cả hệ thống khoá theo email nên
        # không có email là không đi tiếp được. Nói thẳng thay vì bịa một email
        # giả: email giả sẽ nằm lại trong bảng người dùng, hiện ở trang quản
        # trị, và mọi thư hệ thống gửi tới đó đều rơi vào hư không.
        raise FacebookAuthError(
            403,
            "Tài khoản Facebook này không chia sẻ email. "
            "Vui lòng đăng nhập bằng Google hoặc bằng email và mật khẩu.",
        )

    return FacebookIdentity(
        user_id=str(user_id),
        email=str(email).lower(),
        full_name=str(ho_so.get("name") or email),
        avatar_url=((ho_so.get("picture") or {}).get("data") or {}).get("url"),
    )


def to_social_identity(identity: FacebookIdentity) -> SocialIdentity:
    """Chuyển sang hình dạng chung mà lõi `social_auth_service` hiểu."""
    return SocialIdentity(
        provider_field=PROVIDER_FIELD,
        provider_id=identity.user_id,
        email=identity.email,
        full_name=identity.full_name,
        avatar_url=identity.avatar_url,
    )


async def find_or_link_facebook_user(db, identity: FacebookIdentity) -> tuple[Optional[dict], bool]:
    """Tìm tài khoản ứng với danh tính Facebook này. Xem `find_or_link_social_user`."""
    return await find_or_link_social_user(db, to_social_identity(identity))


async def create_facebook_user(db, identity: FacebookIdentity, role: str) -> dict:
    """Tạo tài khoản mới từ danh tính Facebook. Xem `create_social_user`."""
    return await create_social_user(db, to_social_identity(identity), role)
