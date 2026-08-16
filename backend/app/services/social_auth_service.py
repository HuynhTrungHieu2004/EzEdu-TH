"""Lõi chung cho mọi cách đăng nhập qua mạng xã hội (Google, Facebook, ...).

Phần "xác minh danh tính" mỗi nhà cung cấp mỗi khác và nằm ở service riêng của
nhà cung cấp đó. Phần "danh tính này ứng với tài khoản EzEdu nào" thì giống hệt
nhau, và nằm ở đây.

Gộp vào một chỗ vì hai lẽ. Một: logic này mang mấy chốt bảo mật tinh tế — chốt
không ghi đè khi gắn, chốt không tạo lại tài khoản đã bị quản trị xoá mềm. Hai
bản sao sẽ lệch nhau ngay lần sửa lỗi đầu tiên, và bản không ai sờ tới sẽ âm thầm
giữ nguyên lỗi. Hai: mỗi nhà cung cấp mới chỉ còn phải viết đúng phần xác minh.

Module này KHÔNG import FastAPI: toàn bộ logic ở đây phải test được mà không cần
dựng một request HTTP.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional


@dataclass(frozen=True)
class SocialIdentity:
    """Danh tính đã được nhà cung cấp bảo chứng, đã chuẩn hoá về một hình dạng.

    `provider_field` là tên trường lưu định danh trong bảng `users`
    (`google_sub`, `facebook_id`, ...). Để nó đi cùng danh tính thay vì truyền
    riêng: hai thứ này luôn phải khớp nhau, tách ra là mời gọi việc gọi nhầm.
    """

    provider_field: str
    provider_id: str
    email: str
    full_name: str
    avatar_url: Optional[str]


async def find_or_link_social_user(db, identity: SocialIdentity) -> tuple[Optional[dict], bool]:
    """Tìm tài khoản ứng với danh tính này.

    Trả `(tài_khoản, vừa_gắn_mới)`. `(None, False)` nghĩa là người dùng hoàn
    toàn mới — hàm này KHÔNG tạo tài khoản, vì việc tạo còn phải qua cổng chặn
    đăng ký và cần biết vai người dùng chọn.

    Cố ý KHÔNG lọc `deleted_at: None`: một tài khoản đã bị quản trị xoá mềm
    vẫn phải được TÌM THẤY ở đây. Lọc nó ra sẽ khiến router coi chủ email đó
    là người hoàn toàn mới và tạo một doc thứ hai cùng email — lách thẳng qua
    lệnh xoá của quản trị (chỉ mục email cố ý non-unique nên Mongo không chặn
    việc này).
    """
    theo_dinh_danh = await db["users"].find_one({identity.provider_field: identity.provider_id})
    if theo_dinh_danh:
        return theo_dinh_danh, False

    theo_email = await db["users"].find_one({"email": identity.email})
    if theo_email:
        if theo_email.get("deleted_at") is not None:
            # Không gắn định danh vào tài khoản đã xoá, không tạo gì thêm —
            # chỉ trả về nguyên trạng để router tự chặn bằng 403.
            return theo_email, False
        # Gắn thêm, không ghi đè: giữ nguyên vai, mật khẩu cũ và mọi dữ liệu.
        # Một người có thể gắn cả Google lẫn Facebook vào cùng tài khoản.
        moc_thoi_gian = datetime.now(timezone.utc)
        await db["users"].update_one(
            {"_id": theo_email["_id"]},
            {"$set": {identity.provider_field: identity.provider_id, "updated_at": moc_thoi_gian}},
        )
        # Đồng bộ dict trả về với DB — thiếu dòng dưới thì updated_at trong
        # dict vẫn là giá trị cũ, khiến nơi gọi vô tình ghi đè lùi lại.
        theo_email[identity.provider_field] = identity.provider_id
        theo_email["updated_at"] = moc_thoi_gian
        return theo_email, True

    return None, False


async def create_social_user(db, identity: SocialIdentity, role: str) -> dict:
    """Tạo tài khoản mới từ danh tính mạng xã hội, với vai người dùng vừa chọn.

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
        # Nhà cung cấp đã xác minh email, không bắt người dùng xác minh lại.
        "email_verified": True,
        identity.provider_field: identity.provider_id,
        "avatar_url": identity.avatar_url,
        "permissions_override": [],
        "deleted_at": None,
        "created_at": now,
        "updated_at": None,
    }
    result = await db["users"].insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    return user_doc
