from __future__ import annotations

import logging
import math
from datetime import datetime, time, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException, Request, status

from app.database.mongodb import get_database
from app.schemas.admin_audit_logs import (
    AdminAuditAction,
    AdminAuditLogCreate,
    AdminAuditLogItem,
    AdminAuditLogListResponse,
    AdminAuditLogStatisticsResponse,
    AdminAuditResult,
)
from app.schemas.auth import UserResponse
from app.services.activity_log_service import hash_ip, request_id_from_request, summarize_user_agent

logger = logging.getLogger(__name__)

COLLECTION = "admin_audit_logs"
SENSITIVE_KEYS = {
    "password",
    "hashed_password",
    "password_hash",
    "access_token",
    "refresh_token",
    "token",
    "tokens",
    "api_key",
    "api_keys",
    "secret",
    "secrets",
    "authorization",
    "authorization_header",
}
MAX_DEPTH = 4
MAX_LIST_ITEMS = 50
MAX_STRING_LENGTH = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


def require_reason(reason: Optional[str], action_label: str = "thao tác này") -> str:
    cleaned = (reason or "").strip()
    if not cleaned:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cần nhập lý do cho {action_label}.",
        )
    return cleaned


def sanitize_snapshot(value: Any, *, depth: int = 0) -> Any:
    if depth >= MAX_DEPTH:
        return "[truncated]"
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for raw_key, raw_value in value.items():
            key = str(raw_key)
            if key.lower() in SENSITIVE_KEYS:
                continue
            result[key] = sanitize_snapshot(raw_value, depth=depth + 1)
        return result
    if isinstance(value, (list, tuple, set)):
        return [sanitize_snapshot(item, depth=depth + 1) for item in list(value)[:MAX_LIST_ITEMS]]
    if isinstance(value, str):
        return value if len(value) <= MAX_STRING_LENGTH else f"{value[:MAX_STRING_LENGTH]}..."
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:MAX_STRING_LENGTH]


def changed_fields(before: Optional[dict[str, Any]], after: Optional[dict[str, Any]]) -> list[str]:
    before_clean = sanitize_snapshot(before or {})
    after_clean = sanitize_snapshot(after or {})
    keys = set(before_clean.keys()) | set(after_clean.keys())
    return sorted(key for key in keys if before_clean.get(key) != after_clean.get(key))


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return None


def _item(doc: dict[str, Any]) -> AdminAuditLogItem:
    return AdminAuditLogItem(
        id=str(doc["_id"]),
        admin_user_id=str(doc.get("admin_user_id", "")),
        admin_email_snapshot=str(doc.get("admin_email_snapshot", "")),
        action=str(doc.get("action", "")),
        target_type=str(doc.get("target_type", "")),
        target_id=str(doc.get("target_id", "")),
        timestamp=doc.get("timestamp") or _now(),
        reason=doc.get("reason"),
        before=doc.get("before"),
        after=doc.get("after"),
        changed_fields=list(doc.get("changed_fields") or []),
        request_id=doc.get("request_id"),
        result=str(doc.get("result", "success")),
        error_code=doc.get("error_code"),
        ip_hash=doc.get("ip_hash"),
        user_agent_summary=doc.get("user_agent_summary"),
    )


async def record_admin_audit(
    *,
    admin: UserResponse,
    action: AdminAuditAction,
    target_type: str,
    target_id: str,
    reason: Optional[str] = None,
    before: Optional[dict[str, Any]] = None,
    after: Optional[dict[str, Any]] = None,
    changed: Optional[list[str]] = None,
    request: Optional[Request] = None,
    result: AdminAuditResult = "success",
    error_code: Optional[str] = None,
    database: Any = None,
) -> dict[str, Any]:
    before_clean = sanitize_snapshot(before) if before is not None else None
    after_clean = sanitize_snapshot(after) if after is not None else None
    payload = AdminAuditLogCreate(
        admin_user_id=admin.id,
        admin_email_snapshot=str(admin.email),
        action=action,
        target_type=target_type,
        target_id=target_id,
        timestamp=_now(),
        reason=reason.strip() if reason else None,
        before=before_clean,
        after=after_clean,
        changed_fields=changed or changed_fields(before_clean, after_clean),
        request_id=request_id_from_request(request),
        result=result,
        error_code=error_code,
        ip_hash=hash_ip(_client_ip(request)),
        user_agent_summary=summarize_user_agent(request.headers.get("user-agent") if request else None),
    )
    doc = payload.model_dump(exclude_none=True)
    db = database or get_database()
    inserted = await db[COLLECTION].insert_one(doc)
    doc["_id"] = inserted.inserted_id
    return doc


def _date_start(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _date_end(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    if value.time() == time.min:
        value = value.replace(hour=23, minute=59, second=59, microsecond=999999)
    return value.astimezone(timezone.utc)


def build_audit_query(
    *,
    admin_user_id: Optional[str] = None,
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    result: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if admin_user_id:
        query["admin_user_id"] = admin_user_id
    if action:
        query["action"] = action
    if target_type:
        query["target_type"] = target_type
    if target_id:
        query["target_id"] = target_id
    if result:
        query["result"] = result
    if date_from or date_to:
        clause: dict[str, Any] = {}
        if date_from:
            clause["$gte"] = _date_start(date_from)
        if date_to:
            clause["$lte"] = _date_end(date_to)
        query["timestamp"] = clause
    if search:
        pattern = str(search).strip()
        if pattern:
            query["$or"] = [
                {"admin_email_snapshot": {"$regex": pattern, "$options": "i"}},
                {"action": {"$regex": pattern, "$options": "i"}},
                {"target_type": {"$regex": pattern, "$options": "i"}},
                {"target_id": {"$regex": pattern, "$options": "i"}},
                {"reason": {"$regex": pattern, "$options": "i"}},
                {"request_id": {"$regex": pattern, "$options": "i"}},
                {"error_code": {"$regex": pattern, "$options": "i"}},
            ]
    return query


async def list_admin_audit_logs(
    *,
    page: int = 1,
    page_size: int = 50,
    admin_user_id: Optional[str] = None,
    action: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    result: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
) -> AdminAuditLogListResponse:
    db = get_database()
    query = build_audit_query(
        admin_user_id=admin_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        result=result,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    total = await db[COLLECTION].count_documents(query)
    cursor = (
        db[COLLECTION]
        .find(query)
        .sort("timestamp", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    return AdminAuditLogListResponse(
        items=[_item(doc) async for doc in cursor],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)) if total else 1,
        generated_at=_now(),
    )


async def get_admin_audit_log(audit_id: str) -> AdminAuditLogItem:
    if not ObjectId.is_valid(audit_id):
        raise HTTPException(status_code=404, detail="Audit log không tồn tại.")
    doc = await get_database()[COLLECTION].find_one({"_id": ObjectId(audit_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Audit log không tồn tại.")
    return _item(doc)


async def admin_audit_statistics(
    *,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> AdminAuditLogStatisticsResponse:
    db = get_database()
    query = build_audit_query(date_from=date_from, date_to=date_to)
    total = await db[COLLECTION].count_documents(query)
    success_count = await db[COLLECTION].count_documents({**query, "result": "success"})
    failure_count = await db[COLLECTION].count_documents({**query, "result": "failure"})
    by_action = {
        item["_id"]: item["count"]
        for item in await db[COLLECTION].aggregate([
            {"$match": query},
            {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        ]).to_list(None)
        if item.get("_id")
    }
    by_target_type = {
        item["_id"]: item["count"]
        for item in await db[COLLECTION].aggregate([
            {"$match": query},
            {"$group": {"_id": "$target_type", "count": {"$sum": 1}}},
        ]).to_list(None)
        if item.get("_id")
    }
    return AdminAuditLogStatisticsResponse(
        total=total,
        success_count=success_count,
        failure_count=failure_count,
        by_action=by_action,
        by_target_type=by_target_type,
        generated_at=_now(),
    )
