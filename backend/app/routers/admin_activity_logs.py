from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Query

from app.database.mongodb import get_database

from app.core.rbac import Permission, require_permission
from app.schemas.activity_logs import (
    ActivityAction,
    ActivityCategory,
    ActivityStatus,
    UserActivityLogListResponse,
    UserActivityLogStatisticsResponse,
)
from app.schemas.auth import UserResponse
from app.services.activity_log_service import activity_statistics, list_activity_logs
from app.services.user_behavior_service import analyze_user_behavior_groups

router = APIRouter()

SortOrder = Literal["asc", "desc"]


@router.get("/activity-logs", response_model=UserActivityLogListResponse)
async def get_admin_activity_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user_id: Optional[str] = Query(None, max_length=80),
    category: Optional[ActivityCategory] = Query(None),
    action: Optional[ActivityAction] = Query(None),
    status_filter: Optional[ActivityStatus] = Query(None, alias="status"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None, max_length=120),
    resource_type: Optional[str] = Query(None, max_length=80),
    resource_id: Optional[str] = Query(None, max_length=120),
    error_only: bool = Query(False),
    current_user: UserResponse = Depends(require_permission(Permission.ACTIVITY_LOGS_VIEW)),
):
    return await list_activity_logs(
        page=page,
        page_size=page_size,
        user_id=user_id,
        category=category,
        action=action,
        status_value=status_filter,
        date_from=date_from,
        date_to=date_to,
        search=search,
        resource_type=resource_type,
        resource_id=resource_id,
        error_only=error_only,
    )


@router.get("/activity-logs/statistics", response_model=UserActivityLogStatisticsResponse)
async def get_admin_activity_log_statistics(
    user_id: Optional[str] = Query(None, max_length=80),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    current_user: UserResponse = Depends(require_permission(Permission.ACTIVITY_LOGS_VIEW)),
):
    return await activity_statistics(user_id=user_id, date_from=date_from, date_to=date_to)


@router.get("/users/{user_id}/activity", response_model=UserActivityLogListResponse)
async def get_admin_user_activity(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[ActivityCategory] = Query(None),
    action: Optional[ActivityAction] = Query(None),
    status_filter: Optional[ActivityStatus] = Query(None, alias="status"),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None, max_length=120),
    resource_type: Optional[str] = Query(None, max_length=80),
    resource_id: Optional[str] = Query(None, max_length=120),
    error_only: bool = Query(False),
    current_user: UserResponse = Depends(require_permission(Permission.ACTIVITY_LOGS_VIEW)),
):
    return await list_activity_logs(
        page=page,
        page_size=page_size,
        user_id=user_id,
        category=category,
        action=action,
        status_value=status_filter,
        date_from=date_from,
        date_to=date_to,
        search=search,
        resource_type=resource_type,
        resource_id=resource_id,
        error_only=error_only,
    )


@router.get("/behavior-groups")
async def get_user_behavior_groups(
    days: int = Query(90, ge=1, le=365),
    current_user: UserResponse = Depends(require_permission(Permission.ACTIVITY_LOGS_VIEW)),
):
    """Phân nhóm hành vi người dùng bằng K-Means trên nhật ký hoạt động.

    Dùng để đặt hạn mức AI theo phân khúc sử dụng thật thay vì theo vai trò
    cứng, và để phát hiện tài khoản có hành vi không giống bất kỳ nhóm nào.
    """
    db = get_database()
    since = datetime.now(timezone.utc) - timedelta(days=days)

    logs = [
        doc
        async for doc in db["user_activity_logs"].find(
            {"timestamp": {"$gte": since}},
            {"user_id": 1, "action": 1, "status": 1, "duration_ms": 1, "timestamp": 1},
        )
    ]
    ai_events = [
        doc
        async for doc in db["ai_usage_events"].find(
            {"created_at": {"$gte": since}},
            {"user_id": 1, "total_tokens": 1, "estimated_cost": 1},
        )
    ]

    result = analyze_user_behavior_groups(logs, ai_events)
    result["window_days"] = days

    # Ghép tên/email để quản trị viên đọc được thay vì một dãy id.
    user_ids = [u["user_id"] for u in result.get("users", [])]
    object_ids = [ObjectId(uid) for uid in user_ids if ObjectId.is_valid(uid)]
    directory: dict[str, dict] = {}
    if object_ids:
        async for doc in db["users"].find(
            {"_id": {"$in": object_ids}}, {"_id": 1, "full_name": 1, "email": 1, "role": 1}
        ):
            directory[str(doc["_id"])] = {
                "full_name": doc.get("full_name", ""),
                "email": doc.get("email", ""),
                "role": doc.get("role", ""),
            }
    for user in result.get("users", []):
        info = directory.get(user["user_id"], {})
        user["full_name"] = info.get("full_name", "")
        user["email"] = info.get("email", "")
        user["role"] = info.get("role", "")

    return result
