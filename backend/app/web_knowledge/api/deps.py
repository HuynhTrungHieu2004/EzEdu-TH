"""Dependency cho phân hệ khám phá kiến thức Internet. Học sinh VÀ giáo viên
đều được khám phá (`require_web_knowledge_actor`); chỉ giáo viên/admin được
lưu thành học liệu + duyệt (`require_teacher_actor`) — tái sử dụng tập vai
trò giống `app/exam_bank/api/deps.py` cho nhất quán, không import chéo giữa
2 phân hệ độc lập (đúng quy ước đã áp dụng ở exam_bank/attempt_service.py)."""

from fastapi import Depends, HTTPException, status

from app.core.config import settings
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse

_TEACHER_ROLES = {"user", "lecturer", "admin", "super_admin"}
_ADMIN_ROLES = {"admin", "super_admin"}


def _require_feature_enabled() -> None:
    if not settings.ENABLE_WEB_KNOWLEDGE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tính năng khám phá kiến thức Internet hiện chưa được bật.",
        )


async def require_web_knowledge_actor(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    _require_feature_enabled()
    return current_user


async def require_teacher_actor(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    _require_feature_enabled()
    if getattr(current_user, "role", "user") not in _TEACHER_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ giáo viên và quản trị viên được lưu/duyệt học liệu Internet.",
        )
    return current_user


def is_admin_actor(user: UserResponse) -> bool:
    return getattr(user, "role", "user") in _ADMIN_ROLES
