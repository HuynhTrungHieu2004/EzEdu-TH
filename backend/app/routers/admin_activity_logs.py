from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query

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
