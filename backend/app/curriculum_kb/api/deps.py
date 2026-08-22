"""Dependency cho kho tri thức chuẩn. Tìm kiếm/duyệt kho: mọi vai trò đã
đăng nhập. Đăng ký/duyệt/nạp nguồn: chỉ giáo viên/admin — tái sử dụng đúng
tập vai trò như `app/web_knowledge/api/deps.py` (không import chéo, mỗi
phân hệ tự định nghĩa, đúng quy ước đã áp dụng xuyên suốt dự án)."""

from fastapi import Depends, HTTPException, status

from app.core.config import settings
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse

_TEACHER_ROLES = {"user", "lecturer", "admin", "super_admin"}
_ADMIN_ROLES = {"admin", "super_admin"}


def _require_feature_enabled() -> None:
    if not settings.ENABLE_CURRICULUM_KB:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Kho tri thức chuẩn hiện chưa được bật."
        )


async def require_curriculum_kb_actor(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    _require_feature_enabled()
    return current_user


async def require_teacher_actor(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    _require_feature_enabled()
    if getattr(current_user, "role", "user") not in _TEACHER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ giáo viên và quản trị viên được quản lý kho tri thức chuẩn.",
        )
    return current_user


async def require_dataset_admin(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    _require_feature_enabled()
    if getattr(current_user, "role", "user") not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ quản trị viên được xem báo cáo dataset chương trình.",
        )
    return current_user


def is_admin_actor(user: UserResponse) -> bool:
    return getattr(user, "role", "user") in _ADMIN_ROLES
