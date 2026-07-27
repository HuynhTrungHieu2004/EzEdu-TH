from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.rbac import Permission, require_permission
from app.schemas.admin_audit_logs import (
    AdminAuditAction,
    AdminAuditLogItem,
    AdminAuditLogListResponse,
    AdminAuditLogStatisticsResponse,
    AdminAuditResult,
)
from app.schemas.auth import UserResponse
from app.services.admin_audit_service import (
    admin_audit_statistics,
    get_admin_audit_log,
    list_admin_audit_logs,
)

router = APIRouter()


@router.get("/audit-logs", response_model=AdminAuditLogListResponse)
async def get_admin_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    admin_user_id: Optional[str] = Query(None, max_length=80),
    action: Optional[AdminAuditAction] = Query(None),
    target_type: Optional[str] = Query(None, max_length=80),
    target_id: Optional[str] = Query(None, max_length=120),
    result: Optional[AdminAuditResult] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    search: Optional[str] = Query(None, max_length=120),
    current_user: UserResponse = Depends(require_permission(Permission.ADMIN_AUDIT_LOGS_VIEW)),
):
    return await list_admin_audit_logs(
        page=page,
        page_size=page_size,
        admin_user_id=admin_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        result=result,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )


@router.get("/audit-logs/statistics", response_model=AdminAuditLogStatisticsResponse)
async def get_admin_audit_log_statistics(
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    current_user: UserResponse = Depends(require_permission(Permission.ADMIN_AUDIT_LOGS_VIEW)),
):
    return await admin_audit_statistics(date_from=date_from, date_to=date_to)


@router.get("/audit-logs/{audit_id}", response_model=AdminAuditLogItem)
async def get_admin_audit_log_detail(
    audit_id: str,
    current_user: UserResponse = Depends(require_permission(Permission.ADMIN_AUDIT_LOGS_VIEW)),
):
    return await get_admin_audit_log(audit_id)
