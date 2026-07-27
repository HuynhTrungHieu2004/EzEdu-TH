from __future__ import annotations

import math
import re
from datetime import datetime, time, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.core.rbac import Permission, ROLE_NAMES, require_permission
from app.database.mongodb import get_database
from app.schemas.admin_notifications_reports import (
    NotificationCreateRequest,
    NotificationItem,
    NotificationListResponse,
    NotificationReasonRequest,
    NotificationStatisticsResponse,
    NotificationStatus,
    NotificationUpdateRequest,
)
from app.schemas.auth import UserResponse
from app.services.admin_audit_service import record_admin_audit, require_reason

router = APIRouter()

NOTIFICATION_COLLECTION = "admin_notifications"
NOTIFICATION_READ_COLLECTION = "notification_reads"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Thông báo không tồn tại.")
    return ObjectId(value)


def _date_clause(start: Optional[datetime], end: Optional[datetime]) -> dict[str, Any]:
    if not start and not end:
        return {}
    clause: dict[str, Any] = {}
    if start:
        clause["$gte"] = start.astimezone(timezone.utc) if start.tzinfo else start.replace(tzinfo=timezone.utc)
    if end:
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if end.time() == time.min:
            end = end.replace(hour=23, minute=59, second=59, microsecond=999999)
        clause["$lte"] = end.astimezone(timezone.utc)
    return {"created_at": clause}


def _effective_status(doc: dict[str, Any], now: Optional[datetime] = None) -> NotificationStatus:
    status_value = str(doc.get("status") or "draft")
    now = now or _now()
    expires_at = _aware(doc.get("expires_at"))
    starts_at = _aware(doc.get("starts_at"))
    if status_value in {"cancelled", "draft"}:
        return status_value  # type: ignore[return-value]
    if expires_at and expires_at <= now:
        return "expired"
    if status_value in {"published", "scheduled"} and starts_at and starts_at > now:
        return "scheduled"
    if status_value in {"published", "scheduled"}:
        return "published"
    return "draft"


def _validate_payload(payload: NotificationCreateRequest | NotificationUpdateRequest) -> None:
    audience_type = getattr(payload, "audience_type", None)
    target_roles = getattr(payload, "target_roles", None) or []
    target_user_ids = getattr(payload, "target_user_ids", None) or []
    starts_at = getattr(payload, "starts_at", None)
    expires_at = getattr(payload, "expires_at", None)
    if audience_type == "roles":
        unknown = [role for role in target_roles if role not in ROLE_NAMES]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Role không hợp lệ: {', '.join(unknown)}.")
    if audience_type == "roles" and not target_roles:
        raise HTTPException(status_code=422, detail="Cần chọn ít nhất một role.")
    if audience_type == "users" and not target_user_ids:
        raise HTTPException(status_code=422, detail="Cần chọn ít nhất một user.")
    if expires_at and starts_at and expires_at <= starts_at:
        raise HTTPException(status_code=422, detail="expires_at phải sau starts_at.")


async def _audience_count(db, doc: dict[str, Any]) -> int:
    base: dict[str, Any] = {"deleted_at": None}
    audience_type = doc.get("audience_type")
    if audience_type == "roles":
        roles = list(doc.get("target_roles") or [])
        return await db["users"].count_documents({**base, "role": {"$in": roles}}) if roles else 0
    if audience_type == "users":
        user_ids = list(doc.get("target_user_ids") or [])
        return len(set(user_ids))
    return await db["users"].count_documents(base)


async def _item(db, doc: dict[str, Any]) -> NotificationItem:
    notification_id = str(doc["_id"])
    audience_count = await _audience_count(db, doc)
    read_count = await db[NOTIFICATION_READ_COLLECTION].count_documents({"notification_id": notification_id})
    return NotificationItem(
        id=notification_id,
        title=str(doc.get("title") or ""),
        content=str(doc.get("content") or ""),
        type=doc.get("type") or "system",
        audience_type=doc.get("audience_type") or "all",
        target_roles=list(doc.get("target_roles") or []),
        target_user_ids=list(doc.get("target_user_ids") or []),
        priority=doc.get("priority") or "normal",
        starts_at=doc.get("starts_at"),
        expires_at=doc.get("expires_at"),
        status=_effective_status(doc),
        created_by=str(doc.get("created_by") or ""),
        created_at=doc.get("created_at") or _now(),
        updated_at=doc.get("updated_at"),
        published_at=doc.get("published_at"),
        cancelled_at=doc.get("cancelled_at"),
        read_count=read_count,
        unread_count=max(0, audience_count - read_count),
        audience_count=audience_count,
    )


async def _load(db, notification_id: str) -> dict[str, Any]:
    doc = await db[NOTIFICATION_COLLECTION].find_one({"_id": _oid(notification_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Thông báo không tồn tại.")
    return doc


@router.get("/notifications", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=120),
    status_filter: Optional[NotificationStatus] = Query(None, alias="status"),
    type_filter: Optional[str] = Query(None, alias="type", max_length=40),
    audience_type: Optional[str] = Query(None, max_length=40),
    created_from: Optional[datetime] = Query(None),
    created_to: Optional[datetime] = Query(None),
    current_user: UserResponse = Depends(require_permission(Permission.NOTIFICATIONS_MANAGE)),
):
    db = get_database()
    query: dict[str, Any] = {}
    if search:
        pattern = re.escape(search.strip())
        query["$or"] = [
            {"title": {"$regex": pattern, "$options": "i"}},
            {"content": {"$regex": pattern, "$options": "i"}},
        ]
    if status_filter:
        query["status"] = status_filter
    if type_filter:
        query["type"] = type_filter
    if audience_type:
        query["audience_type"] = audience_type
    query.update(_date_clause(created_from, created_to))
    total = await db[NOTIFICATION_COLLECTION].count_documents(query)
    docs = await (
        db[NOTIFICATION_COLLECTION]
        .find(query)
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    return NotificationListResponse(
        items=[await _item(db, doc) for doc in docs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
        generated_at=_now(),
    )


@router.get("/notifications/statistics", response_model=NotificationStatisticsResponse)
async def notification_statistics(
    current_user: UserResponse = Depends(require_permission(Permission.NOTIFICATIONS_MANAGE)),
):
    db = get_database()
    docs = await db[NOTIFICATION_COLLECTION].find({}, {"status": 1, "starts_at": 1, "expires_at": 1}).to_list(None)
    counts = {status_name: 0 for status_name in ["draft", "scheduled", "published", "expired", "cancelled"]}
    unread_total = 0
    for doc in docs:
        status_value = _effective_status(doc)
        counts[status_value] = counts.get(status_value, 0) + 1
        unread_total += max(0, await _audience_count(db, doc) - await db[NOTIFICATION_READ_COLLECTION].count_documents({"notification_id": str(doc["_id"])}))
    return NotificationStatisticsResponse(total=len(docs), unread_total=unread_total, generated_at=_now(), **counts)


@router.get("/notifications/{notification_id}", response_model=NotificationItem)
async def get_notification(
    notification_id: str,
    current_user: UserResponse = Depends(require_permission(Permission.NOTIFICATIONS_MANAGE)),
):
    db = get_database()
    return await _item(db, await _load(db, notification_id))


@router.post("/notifications", response_model=NotificationItem, status_code=status.HTTP_201_CREATED)
async def create_notification(
    payload: NotificationCreateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.NOTIFICATIONS_MANAGE)),
):
    _validate_payload(payload)
    db = get_database()
    now = _now()
    status_value = payload.status
    if status_value == "published" and payload.starts_at and payload.starts_at > now:
        status_value = "scheduled"
    doc = payload.model_dump(exclude={"reason"})
    doc.update({"status": status_value, "created_by": current_user.id, "created_at": now, "updated_at": now})
    if status_value == "published":
        doc["published_at"] = now
    result = await db[NOTIFICATION_COLLECTION].insert_one(doc)
    doc["_id"] = result.inserted_id
    audit_action = "notification_published" if status_value in {"published", "scheduled"} else "notification_created"
    await record_admin_audit(
        admin=current_user,
        action=audit_action,
        target_type="notification",
        target_id=str(result.inserted_id),
        reason=payload.reason,
        after=doc,
        request=request,
        database=db,
    )
    return await _item(db, doc)


@router.patch("/notifications/{notification_id}", response_model=NotificationItem)
async def update_notification(
    notification_id: str,
    payload: NotificationUpdateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.NOTIFICATIONS_MANAGE)),
):
    _validate_payload(payload)
    db = get_database()
    before = await _load(db, notification_id)
    if _effective_status(before) in {"expired", "cancelled"}:
        raise HTTPException(status_code=409, detail="Không thể sửa thông báo đã hết hạn hoặc đã hủy.")
    update = payload.model_dump(exclude_unset=True)
    if not update:
        return await _item(db, before)
    update["updated_at"] = _now()
    after = await db[NOTIFICATION_COLLECTION].find_one_and_update(
        {"_id": before["_id"]},
        {"$set": update},
        return_document=True,
    )
    await record_admin_audit(
        admin=current_user,
        action="notification_updated",
        target_type="notification",
        target_id=notification_id,
        before=before,
        after=after,
        request=request,
        database=db,
    )
    return await _item(db, after)


@router.post("/notifications/{notification_id}/publish", response_model=NotificationItem)
async def publish_notification(
    notification_id: str,
    payload: NotificationReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.NOTIFICATIONS_MANAGE)),
):
    reason = require_reason(payload.reason, "xuất bản thông báo")
    db = get_database()
    before = await _load(db, notification_id)
    now = _now()
    starts_at = _aware(before.get("starts_at"))
    new_status = "scheduled" if starts_at and starts_at > now else "published"
    after = await db[NOTIFICATION_COLLECTION].find_one_and_update(
        {"_id": before["_id"]},
        {"$set": {"status": new_status, "published_at": now, "updated_at": now}},
        return_document=True,
    )
    await record_admin_audit(
        admin=current_user,
        action="notification_published",
        target_type="notification",
        target_id=notification_id,
        reason=reason,
        before=before,
        after=after,
        request=request,
        database=db,
    )
    return await _item(db, after)


@router.post("/notifications/{notification_id}/cancel", response_model=NotificationItem)
async def cancel_notification(
    notification_id: str,
    payload: NotificationReasonRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.NOTIFICATIONS_MANAGE)),
):
    reason = require_reason(payload.reason, "hủy thông báo")
    db = get_database()
    before = await _load(db, notification_id)
    now = _now()
    after = await db[NOTIFICATION_COLLECTION].find_one_and_update(
        {"_id": before["_id"]},
        {"$set": {"status": "cancelled", "cancelled_at": now, "updated_at": now}},
        return_document=True,
    )
    await record_admin_audit(
        admin=current_user,
        action="notification_cancelled",
        target_type="notification",
        target_id=notification_id,
        reason=reason,
        before=before,
        after=after,
        request=request,
        database=db,
    )
    return await _item(db, after)
