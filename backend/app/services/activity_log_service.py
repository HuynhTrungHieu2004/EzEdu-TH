from __future__ import annotations

import hashlib
import logging
import math
from datetime import datetime, time, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import Request

from app.core.config import settings
from app.database.mongodb import get_database
from app.schemas.activity_logs import (
    ActivityAction,
    ActivityCategory,
    ActivityStatus,
    UserActivityLogCreate,
    UserActivityLogItem,
    UserActivityLogListResponse,
    UserActivityLogStatisticsResponse,
)

logger = logging.getLogger(__name__)

COLLECTION = "user_activity_logs"
SENSITIVE_METADATA_KEYS = {
    "password",
    "hashed_password",
    "access_token",
    "refresh_token",
    "token",
    "api_key",
    "secret",
    "prompt",
    "question",
    "answer",
    "content",
    "full_text",
    "extracted_text",
    "transcript",
    "conversation",
}
MAX_METADATA_DEPTH = 3
MAX_METADATA_LIST_ITEMS = 20
MAX_METADATA_STRING_LENGTH = 240


def _now() -> datetime:
    return datetime.now(timezone.utc)


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


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    if request.client:
        return request.client.host
    return None


def hash_ip(ip_address: Optional[str]) -> Optional[str]:
    if not ip_address:
        return None
    secret = settings.JWT_SECRET_KEY or "activity-log-salt"
    digest = hashlib.sha256(f"{secret}:{ip_address}".encode("utf-8")).hexdigest()
    return digest[:32]


def summarize_user_agent(user_agent: Optional[str]) -> Optional[str]:
    if not user_agent:
        return None
    ua = user_agent.lower()
    browser = "Other"
    if "edg/" in ua:
        browser = "Edge"
    elif "chrome/" in ua and "chromium" not in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua and "chrome/" not in ua:
        browser = "Safari"

    platform = "Unknown"
    if "windows" in ua:
        platform = "Windows"
    elif "mac os" in ua or "macintosh" in ua:
        platform = "macOS"
    elif "android" in ua:
        platform = "Android"
    elif "iphone" in ua or "ipad" in ua:
        platform = "iOS"
    elif "linux" in ua:
        platform = "Linux"
    return f"{browser} on {platform}"


def request_id_from_request(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    return (
        request.headers.get("x-request-id")
        or request.headers.get("x-correlation-id")
        or request.headers.get("cf-ray")
    )


def _sanitize_scalar(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        if isinstance(value, str) and len(value) > MAX_METADATA_STRING_LENGTH:
            return f"{value[:MAX_METADATA_STRING_LENGTH]}..."
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)[:MAX_METADATA_STRING_LENGTH]


def sanitize_metadata(value: Any, *, depth: int = 0) -> Any:
    if depth >= MAX_METADATA_DEPTH:
        return "[truncated]"
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for raw_key, raw_value in value.items():
            key = str(raw_key)
            if key.lower() in SENSITIVE_METADATA_KEYS:
                continue
            sanitized[key] = sanitize_metadata(raw_value, depth=depth + 1)
        return sanitized
    if isinstance(value, (list, tuple, set)):
        return [sanitize_metadata(item, depth=depth + 1) for item in list(value)[:MAX_METADATA_LIST_ITEMS]]
    return _sanitize_scalar(value)


def _item(doc: dict[str, Any]) -> UserActivityLogItem:
    return UserActivityLogItem(
        id=str(doc["_id"]),
        user_id=doc.get("user_id"),
        action=str(doc.get("action", "")),
        category=str(doc.get("category", "")),
        resource_type=doc.get("resource_type"),
        resource_id=doc.get("resource_id"),
        status=str(doc.get("status", "")),
        timestamp=doc.get("timestamp") or _now(),
        request_id=doc.get("request_id"),
        metadata=doc.get("metadata") or {},
        error_code=doc.get("error_code"),
        duration_ms=doc.get("duration_ms"),
        ip_hash=doc.get("ip_hash"),
        user_agent_summary=doc.get("user_agent_summary"),
    )


async def record_activity(
    *,
    action: ActivityAction,
    category: ActivityCategory,
    user_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    status: ActivityStatus = "success",
    request: Optional[Request] = None,
    request_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    error_code: Optional[str] = None,
    duration_ms: Optional[int] = None,
    database: Any = None,
) -> None:
    """Best-effort activity logging. Never raises into the caller."""
    try:
        payload = UserActivityLogCreate(
            user_id=user_id,
            action=action,
            category=category,
            resource_type=resource_type,
            resource_id=resource_id,
            status=status,
            timestamp=_now(),
            request_id=request_id or request_id_from_request(request),
            metadata=sanitize_metadata(metadata or {}),
            error_code=error_code,
            duration_ms=duration_ms,
            ip_hash=hash_ip(_client_ip(request)),
            user_agent_summary=summarize_user_agent(request.headers.get("user-agent") if request else None),
        )
        doc = payload.model_dump(exclude_none=True)
        db = database or get_database()
        await db[COLLECTION].insert_one(doc)
    except Exception as exc:  # pragma: no cover - defensive by design
        logger.warning("Activity logging failed: %s", type(exc).__name__)


def build_activity_query(
    *,
    user_id: Optional[str] = None,
    category: Optional[str] = None,
    action: Optional[str] = None,
    status_value: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    error_only: bool = False,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if user_id:
        query["user_id"] = user_id
    if category:
        query["category"] = category
    if action:
        query["action"] = action
    if status_value:
        query["status"] = status_value
    if resource_type:
        query["resource_type"] = resource_type
    if resource_id:
        query["resource_id"] = resource_id
    if error_only:
        query["$or"] = [{"status": {"$in": ["failure", "denied"]}}, {"error_code": {"$ne": None}}]

    if date_from or date_to:
        time_clause: dict[str, Any] = {}
        if date_from:
            time_clause["$gte"] = _date_start(date_from)
        if date_to:
            time_clause["$lte"] = _date_end(date_to)
        query["timestamp"] = time_clause

    if search:
        pattern = str(search).strip()
        if pattern:
            search_clause = [
                {"action": {"$regex": pattern, "$options": "i"}},
                {"category": {"$regex": pattern, "$options": "i"}},
                {"resource_type": {"$regex": pattern, "$options": "i"}},
                {"resource_id": {"$regex": pattern, "$options": "i"}},
                {"request_id": {"$regex": pattern, "$options": "i"}},
                {"error_code": {"$regex": pattern, "$options": "i"}},
            ]
            if "$or" in query:
                query = {"$and": [query, {"$or": search_clause}]}
            else:
                query["$or"] = search_clause
    return query


async def list_activity_logs(
    *,
    page: int = 1,
    page_size: int = 50,
    user_id: Optional[str] = None,
    category: Optional[str] = None,
    action: Optional[str] = None,
    status_value: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    search: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    error_only: bool = False,
) -> UserActivityLogListResponse:
    db = get_database()
    query = build_activity_query(
        user_id=user_id,
        category=category,
        action=action,
        status_value=status_value,
        date_from=date_from,
        date_to=date_to,
        search=search,
        resource_type=resource_type,
        resource_id=resource_id,
        error_only=error_only,
    )
    total = await db[COLLECTION].count_documents(query)
    cursor = (
        db[COLLECTION]
        .find(query)
        .sort("timestamp", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    items = [_item(doc) async for doc in cursor]
    return UserActivityLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, math.ceil(total / page_size)) if total else 1,
        generated_at=_now(),
        retention_days=settings.ACTIVITY_LOG_RETENTION_DAYS,
    )


async def activity_statistics(
    *,
    user_id: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> UserActivityLogStatisticsResponse:
    db = get_database()
    start = _date_start(date_from) if date_from else datetime.combine(_now().date(), time.min, tzinfo=timezone.utc)
    end = _date_end(date_to) if date_to else _now()
    base: dict[str, Any] = {"timestamp": {"$gte": start, "$lte": end}}
    if user_id:
        base["user_id"] = user_id

    total_today = await db[COLLECTION].count_documents(base)
    success_count = await db[COLLECTION].count_documents({**base, "status": "success"})
    failure_count = await db[COLLECTION].count_documents({**base, "status": "failure"})
    permission_denied_count = await db[COLLECTION].count_documents({**base, "action": "permission_denied"})
    quota_exceeded_count = await db[COLLECTION].count_documents({**base, "action": "quota_exceeded"})

    by_category = {
        item["_id"]: item["count"]
        for item in await db[COLLECTION].aggregate([
            {"$match": base},
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        ]).to_list(None)
        if item.get("_id")
    }
    by_status = {
        item["_id"]: item["count"]
        for item in await db[COLLECTION].aggregate([
            {"$match": base},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]).to_list(None)
        if item.get("_id")
    }

    return UserActivityLogStatisticsResponse(
        total_today=total_today,
        success_count=success_count,
        failure_count=failure_count,
        permission_denied_count=permission_denied_count,
        quota_exceeded_count=quota_exceeded_count,
        by_category=by_category,
        by_status=by_status,
        generated_at=_now(),
        retention_days=settings.ACTIVITY_LOG_RETENTION_DAYS,
    )
