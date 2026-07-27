"""Admin dashboard router — all endpoints require require_admin."""
from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.rbac import Permission, ROLE_NAMES, SUPER_ADMIN_ROLE, require_permission, sanitize_permissions
from app.database.mongodb import get_database
from app.schemas.auth import UserResponse
from app.services import analytics_service
from app.services.evaluation_report_service import load_evaluation_report
from app.schemas.system_health import ErrorMonitoringResponse, SystemHealthResponse
from app.services.system_health_service import get_error_monitoring, get_system_health
from app.core.config import settings
from app.routers.admin_users import SENSITIVE_FIELDS

logger = logging.getLogger("app.admin")
router = APIRouter()

AUDIT_COLLECTION = "audit_logs"


class AdminUserRoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        role = value.strip()
        if role not in ROLE_NAMES:
            raise ValueError(f"role phải là một trong: {', '.join(sorted(ROLE_NAMES))}.")
        return role


class AdminUserStatusUpdate(BaseModel):
    is_active: bool


class AdminUserItem(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    status: Literal["active", "locked", "deleted"] = "active"
    is_active: bool = True
    permissions_override: list[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    deleted_at: Optional[str] = None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserItem]
    total: int
    limit: int
    skip: int
    generated_at: str


class AuditLogItem(BaseModel):
    id: str
    event_type: str
    severity: Literal["info", "warning", "error"] = "info"
    message: str
    actor_user_id: Optional[str] = None
    target_user_id: Optional[str] = None
    user_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class AuditLogResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    limit: int
    skip: int
    generated_at: str

# ─────────────────────────── Rate Limiter ──────────────────────────────────
# Simple in-memory rate limiter for admin API (no Redis; uses per-user token bucket)
from collections import defaultdict
from time import monotonic

_rate_store: dict[str, tuple[float, int]] = defaultdict(lambda: (monotonic(), 0))
_LIMIT = settings.ADMIN_ANALYTICS_RATE_LIMIT_PER_MINUTE
_WINDOW = 60.0

def _check_rate_limit(user_id: str) -> None:
    now = monotonic()
    window_start, count = _rate_store[user_id]
    if now - window_start > _WINDOW:
        _rate_store[user_id] = (now, 1)
        return
    if count >= _LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Vượt giới hạn truy cập Admin Analytics ({_LIMIT} req/min)."
        )
    _rate_store[user_id] = (window_start, count + 1)

# ─────────────────────────── Helpers ───────────────────────────────────────

def _parse_date_range(
    from_date: Optional[str],
    to_date: Optional[str],
    tz_str: str,
) -> tuple[datetime, datetime]:
    """Parse and validate from_date/to_date strings."""
    try:
        tz = ZoneInfo(tz_str)
    except (ZoneInfoNotFoundError, KeyError):
        raise HTTPException(status_code=400, detail=f"Timezone không hợp lệ: '{tz_str}'")

    now = datetime.now(timezone.utc)
    default_to = now
    default_from = now.replace(hour=0, minute=0, second=0, microsecond=0)  # today

    try:
        fd = datetime.fromisoformat(from_date).astimezone(timezone.utc) if from_date else default_from
        td = datetime.fromisoformat(to_date).astimezone(timezone.utc) if to_date else default_to
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="from_date hoặc to_date không hợp lệ (ISO 8601).")

    if fd > td:
        raise HTTPException(status_code=400, detail="from_date phải nhỏ hơn hoặc bằng to_date.")

    fd, td = analytics_service.clamp_date_range(fd, td)
    return fd, td

def _validate_bucket(bucket: str) -> str:
    allowed = {"hour", "day", "week"}
    if bucket not in allowed:
        raise HTTPException(status_code=400, detail=f"bucket phải là một trong: {', '.join(allowed)}.")
    return bucket


def _parse_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(status_code=400, detail="user_id không hợp lệ.")


def _iso(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.isoformat()
    if value:
        return str(value)
    return None


def _normalize_user_status(doc: dict[str, Any]) -> Literal["active", "locked", "deleted"]:
    if doc.get("deleted_at") is not None:
        return "deleted"
    status_value = str(doc.get("status") or "").strip()
    if status_value in {"active", "locked", "deleted"}:
        return status_value  # type: ignore[return-value]
    return "active" if doc.get("is_active", True) is not False else "locked"


def _user_item(doc: dict[str, Any]) -> AdminUserItem:
    status_value = _normalize_user_status(doc)
    return AdminUserItem(
        id=str(doc["_id"]),
        email=str(doc.get("email", "")),
        full_name=str(doc.get("full_name", "")),
        role=str(doc.get("role", "student")),
        status=status_value,
        is_active=bool(doc.get("is_active", True)) and status_value != "locked",
        permissions_override=sanitize_permissions(doc.get("permissions_override")),
        created_at=_iso(doc.get("created_at")),
        updated_at=_iso(doc.get("updated_at")),
        deleted_at=_iso(doc.get("deleted_at")),
    )


def _ensure_can_manage_target_user(
    *,
    current_user: UserResponse,
    target_user: dict[str, Any],
    requested_role: Optional[str] = None,
) -> None:
    target_role = str(target_user.get("role", "user"))
    if target_role == SUPER_ADMIN_ROLE and current_user.role != SUPER_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không thể thay đổi tài khoản super_admin.",
        )
    if requested_role == SUPER_ADMIN_ROLE and current_user.role != SUPER_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ super_admin mới được cấp quyền super_admin.",
        )


async def _write_audit_log(
    *,
    event_type: str,
    message: str,
    actor_user_id: Optional[str] = None,
    target_user_id: Optional[str] = None,
    user_id: Optional[str] = None,
    severity: Literal["info", "warning", "error"] = "info",
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    """Best-effort admin audit trail. Never blocks the primary operation."""
    try:
        db = get_database()
        await db[AUDIT_COLLECTION].insert_one({
            "event_type": event_type,
            "severity": severity,
            "message": message,
            "actor_user_id": actor_user_id,
            "target_user_id": target_user_id,
            "user_id": user_id,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc),
        })
    except Exception as exc:
        logger.warning("Admin audit log write failed: %s", type(exc).__name__)


def _audit_item(doc: dict[str, Any]) -> AuditLogItem:
    created_at = doc.get("created_at")
    severity = doc.get("severity", "info")
    if severity not in {"info", "warning", "error"}:
        severity = "info"
    return AuditLogItem(
        id=str(doc.get("_id") or doc.get("id") or ""),
        event_type=str(doc.get("event_type", "system_event")),
        severity=severity,
        message=str(doc.get("message", "")),
        actor_user_id=str(doc["actor_user_id"]) if doc.get("actor_user_id") else None,
        target_user_id=str(doc["target_user_id"]) if doc.get("target_user_id") else None,
        user_id=str(doc["user_id"]) if doc.get("user_id") else None,
        metadata=doc.get("metadata") or {},
        created_at=created_at.isoformat() if isinstance(created_at, datetime) else str(created_at or ""),
    )

# ─────────────────────────── Endpoints ────────────────────────────────────

@router.get("/overview")
async def admin_overview(
    from_date: Optional[str] = Query(None, description="ISO 8601 start date"),
    to_date: Optional[str] = Query(None, description="ISO 8601 end date"),
    timezone: str = Query("UTC", description="IANA timezone, e.g. Asia/Ho_Chi_Minh"),
    current_user: UserResponse = Depends(require_permission(Permission.ANALYTICS_VIEW)),
):
    _check_rate_limit(current_user.id)
    fd, td = _parse_date_range(from_date, to_date, timezone)
    try:
        return await asyncio.wait_for(
            analytics_service.get_overview(fd, td),
            timeout=settings.ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Truy vấn quá thời gian cho phép.")


@router.get("/usage")
async def admin_usage(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    timezone: str = Query("UTC"),
    bucket: str = Query("day"),
    current_user: UserResponse = Depends(require_permission(Permission.AI_USAGE_VIEW)),
):
    _check_rate_limit(current_user.id)
    fd, td = _parse_date_range(from_date, to_date, timezone)
    bucket = _validate_bucket(bucket)
    try:
        return await asyncio.wait_for(
            analytics_service.get_usage(fd, td, bucket),
            timeout=settings.ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Truy vấn quá thời gian cho phép.")


@router.get("/quality")
async def admin_quality(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    timezone: str = Query("UTC"),
    current_user: UserResponse = Depends(require_permission(Permission.ANALYTICS_VIEW)),
):
    _check_rate_limit(current_user.id)
    fd, td = _parse_date_range(from_date, to_date, timezone)
    try:
        return await asyncio.wait_for(
            analytics_service.get_quality(fd, td),
            timeout=settings.ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Truy vấn quá thời gian cho phép.")


@router.get("/errors-latency")
async def admin_errors_latency(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    timezone: str = Query("UTC"),
    bucket: str = Query("day"),
    current_user: UserResponse = Depends(require_permission(Permission.ANALYTICS_VIEW)),
):
    _check_rate_limit(current_user.id)
    fd, td = _parse_date_range(from_date, to_date, timezone)
    bucket = _validate_bucket(bucket)
    try:
        return await asyncio.wait_for(
            analytics_service.get_errors_latency(fd, td, bucket),
            timeout=settings.ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Truy vấn quá thời gian cho phép.")


@router.get("/evaluation")
async def admin_evaluation(
    current_user: UserResponse = Depends(require_permission(Permission.ANALYTICS_VIEW)),
):
    _check_rate_limit(current_user.id)
    return await load_evaluation_report()


@router.get("/users", response_model=AdminUserListResponse)
async def admin_list_users(
    search: Optional[str] = Query(None, max_length=120),
    role: Optional[str] = Query(None, max_length=40),
    status_filter: Optional[Literal["active", "locked"]] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: UserResponse = Depends(require_permission(Permission.USERS_VIEW)),
):
    _check_rate_limit(current_user.id)
    db = get_database()
    query: dict[str, Any] = {}

    if role:
        if role not in ROLE_NAMES:
            raise HTTPException(status_code=400, detail="role không hợp lệ.")
        query["role"] = role
    if status_filter == "active":
        query["is_active"] = {"$ne": False}
    elif status_filter == "locked":
        query["is_active"] = False
    if search:
        pattern = re.escape(search.strip())
        query["$or"] = [
            {"email": {"$regex": pattern, "$options": "i"}},
            {"full_name": {"$regex": pattern, "$options": "i"}},
        ]

    total = await db["users"].count_documents(query)
    docs = await (
        db["users"]
        .find(query, SENSITIVE_FIELDS)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )
    return AdminUserListResponse(
        items=[_user_item(doc) for doc in docs],
        total=total,
        limit=limit,
        skip=skip,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.patch("/users/{user_id}/role", response_model=AdminUserItem)
async def admin_update_user_role(
    user_id: str,
    payload: AdminUserRoleUpdate,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_CHANGE_ROLE)),
):
    _check_rate_limit(current_user.id)
    if payload.role == SUPER_ADMIN_ROLE and current_user.role != SUPER_ADMIN_ROLE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ super_admin mới được cấp quyền super_admin.",
        )
    if user_id == current_user.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Không thể tự hạ quyền admin của chính mình.")

    db = get_database()
    oid = _parse_object_id(user_id)
    existing = await db["users"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    _ensure_can_manage_target_user(
        current_user=current_user,
        target_user=existing,
        requested_role=payload.role,
    )
    old_role = str(existing.get("role", "student"))

    now = datetime.now(timezone.utc)
    result = await db["users"].find_one_and_update(
        {"_id": oid},
        {"$set": {"role": payload.role, "updated_at": now}},
        return_document=True,
        projection=SENSITIVE_FIELDS,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    await _write_audit_log(
        event_type="user_role_updated",
        message=f"Đổi quyền người dùng {result.get('email')} từ {old_role} sang {payload.role}.",
        actor_user_id=current_user.id,
        target_user_id=user_id,
        user_id=user_id,
        metadata={"old_role": old_role, "new_role": payload.role},
    )
    return _user_item(result)


@router.patch("/users/{user_id}/status", response_model=AdminUserItem)
async def admin_update_user_status(
    user_id: str,
    payload: AdminUserStatusUpdate,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_LOCK)),
):
    _check_rate_limit(current_user.id)
    if user_id == current_user.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Không thể khóa chính tài khoản admin đang sử dụng.")

    db = get_database()
    oid = _parse_object_id(user_id)
    existing = await db["users"].find_one({"_id": oid})
    if not existing:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    _ensure_can_manage_target_user(
        current_user=current_user,
        target_user=existing,
    )

    old_status = bool(existing.get("is_active", True))
    now = datetime.now(timezone.utc)
    next_status = "active" if payload.is_active else "locked"
    result = await db["users"].find_one_and_update(
        {"_id": oid},
        {"$set": {"is_active": payload.is_active, "status": next_status, "updated_at": now}},
        return_document=True,
        projection=SENSITIVE_FIELDS,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")

    await _write_audit_log(
        event_type="user_status_updated",
        message=(
            f"{'Kích hoạt' if payload.is_active else 'Khóa'} tài khoản người dùng "
            f"{result.get('email')}."
        ),
        actor_user_id=current_user.id,
        target_user_id=user_id,
        user_id=user_id,
        metadata={"old_is_active": old_status, "new_is_active": payload.is_active},
        severity="warning" if not payload.is_active else "info",
    )
    return _user_item(result)


@router.get("/audit-logs", response_model=AuditLogResponse)
async def admin_audit_logs(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    timezone_param: str = Query("UTC", alias="timezone"),
    search: Optional[str] = Query(None, max_length=120),
    event_type: Optional[str] = Query(None, max_length=80),
    severity: Optional[Literal["info", "warning", "error"]] = Query(None),
    limit: int = Query(80, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: UserResponse = Depends(require_permission(Permission.ADMIN_AUDIT_LOGS_VIEW)),
):
    _check_rate_limit(current_user.id)
    fd, td = _parse_date_range(from_date, to_date, timezone_param)
    db = get_database()

    query: dict[str, Any] = {"created_at": {"$gte": fd, "$lte": td}}
    if severity:
        query["severity"] = severity
    if event_type:
        query["event_type"] = event_type
    if search:
        query["message"] = {"$regex": re.escape(search.strip()), "$options": "i"}

    audit_docs = await (
        db[AUDIT_COLLECTION]
        .find(query)
        .sort("created_at", -1)
        .limit(limit + skip)
        .to_list(limit + skip)
    )

    operational_logs: list[dict[str, Any]] = []
    if (not severity or severity == "error") and (not event_type or event_type == "ai_usage_failure"):
        ai_query: dict[str, Any] = {
            "created_at": {"$gte": fd, "$lte": td},
            "status": "failure",
        }
        if search:
            ai_query["$or"] = [
                {"operation_type": {"$regex": re.escape(search.strip()), "$options": "i"}},
                {"error_code": {"$regex": re.escape(search.strip()), "$options": "i"}},
                {"model_name": {"$regex": re.escape(search.strip()), "$options": "i"}},
            ]
        ai_docs = await (
            db[analytics_service.COLLECTION]
            .find(ai_query)
            .sort("created_at", -1)
            .limit(limit)
            .to_list(limit)
        )
        operational_logs.extend({
            "id": str(doc.get("_id")),
            "event_type": "ai_usage_failure",
            "severity": "error",
            "message": (
                f"{doc.get('operation_type', 'AI')} thất bại"
                f"{' · ' + str(doc.get('error_code')) if doc.get('error_code') else ''}"
            ),
            "actor_user_id": None,
            "target_user_id": None,
            "user_id": doc.get("user_id"),
            "metadata": {
                "provider": doc.get("provider"),
                "model_name": doc.get("model_name"),
                "latency_ms": doc.get("latency_ms"),
                "logical_request_id": doc.get("logical_request_id"),
            },
            "created_at": doc.get("created_at"),
        } for doc in ai_docs)

    if (not severity or severity == "error") and (not event_type or event_type == "document_processing_failure"):
        doc_query: dict[str, Any] = {
            "updated_at": {"$gte": fd, "$lte": td},
            "status": {"$in": ["failed", "index_failed"]},
        }
        if search:
            doc_query["$or"] = [
                {"filename": {"$regex": re.escape(search.strip()), "$options": "i"}},
                {"original_filename": {"$regex": re.escape(search.strip()), "$options": "i"}},
                {"error_message": {"$regex": re.escape(search.strip()), "$options": "i"}},
            ]
        failed_docs = await (
            db["documents"]
            .find(doc_query)
            .sort("updated_at", -1)
            .limit(limit)
            .to_list(limit)
        )
        operational_logs.extend({
            "id": str(doc.get("_id")),
            "event_type": "document_processing_failure",
            "severity": "error",
            "message": (
                f"Học liệu {doc.get('original_filename') or doc.get('filename') or doc.get('_id')} "
                f"gặp lỗi xử lý."
            ),
            "actor_user_id": None,
            "target_user_id": None,
            "user_id": doc.get("user_id"),
            "metadata": {
                "status": doc.get("status"),
                "error_message": doc.get("error_message"),
                "mime_type": doc.get("mime_type"),
            },
            "created_at": doc.get("updated_at") or doc.get("created_at"),
        } for doc in failed_docs)

    combined = [_audit_item(doc) for doc in audit_docs] + [_audit_item(doc) for doc in operational_logs]
    combined.sort(key=lambda item: item.created_at, reverse=True)
    items = combined[skip:skip + limit]
    return AuditLogResponse(
        items=items,
        total=len(combined),
        limit=limit,
        skip=skip,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


@router.get("/backend-health", response_model=SystemHealthResponse)
async def admin_backend_health(
    current_user: UserResponse = Depends(require_permission(Permission.SYSTEM_HEALTH_VIEW)),
):
    """Protected backend readiness snapshot for the admin dashboard."""
    _check_rate_limit(current_user.id)
    return await get_system_health()


@router.get("/error-monitoring", response_model=ErrorMonitoringResponse)
async def admin_error_monitoring(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    timezone_param: str = Query("UTC", alias="timezone"),
    search: Optional[str] = Query(None, max_length=120),
    severity: Optional[Literal["info", "warning", "critical"]] = Query(None),
    service: Optional[str] = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(require_permission(Permission.SYSTEM_HEALTH_VIEW)),
):
    _check_rate_limit(current_user.id)
    fd, td = _parse_date_range(from_date, to_date, timezone_param)
    return await get_error_monitoring(
        from_date=fd,
        to_date=td,
        search=search,
        severity=severity,
        service=service,
        page=page,
        page_size=page_size,
    )
