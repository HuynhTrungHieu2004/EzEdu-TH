"""AI quota resolution and enforcement."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException, Request, status
from bson import ObjectId

from app.core.config import settings
from app.database.mongodb import get_database
from app.services.activity_log_service import record_activity
from app.services.system_settings_service import get_setting_value


ERROR_CODE = "AI_QUOTA_EXCEEDED"

DEFAULT_ROLE_QUOTAS: dict[str, dict[str, int]] = {
    "super_admin": {
        "requests_per_day": 100000,
        "requests_per_month": 3000000,
        "tokens_per_day": 200000000,
        "tokens_per_month": 6000000000,
        "max_questions_per_request": 200,
        "max_document_size_bytes": 200 * 1024 * 1024,
        "max_documents": 100000,
    },
    "admin": {
        "requests_per_day": 10000,
        "requests_per_month": 300000,
        "tokens_per_day": 20000000,
        "tokens_per_month": 600000000,
        "max_questions_per_request": 100,
        "max_document_size_bytes": 100 * 1024 * 1024,
        "max_documents": 10000,
    },
    "moderator": {
        "requests_per_day": 2000,
        "requests_per_month": 60000,
        "tokens_per_day": 4000000,
        "tokens_per_month": 120000000,
        "max_questions_per_request": 80,
        "max_document_size_bytes": 80 * 1024 * 1024,
        "max_documents": 5000,
    },
    "support": {
        "requests_per_day": 500,
        "requests_per_month": 15000,
        "tokens_per_day": 1000000,
        "tokens_per_month": 30000000,
        "max_questions_per_request": 30,
        "max_document_size_bytes": 50 * 1024 * 1024,
        "max_documents": 1000,
    },
    "analyst": {
        "requests_per_day": 300,
        "requests_per_month": 9000,
        "tokens_per_day": 600000,
        "tokens_per_month": 18000000,
        "max_questions_per_request": 20,
        "max_document_size_bytes": 50 * 1024 * 1024,
        "max_documents": 500,
    },
    "lecturer": {
        "requests_per_day": 100,
        "requests_per_month": 2500,
        "tokens_per_day": 250000,
        "tokens_per_month": 5000000,
        "max_questions_per_request": 50,
        "max_document_size_bytes": 20 * 1024 * 1024,
        "max_documents": 200,
    },
    "student": {
        "requests_per_day": 50,
        "requests_per_month": 1000,
        "tokens_per_day": 120000,
        "tokens_per_month": 2500000,
        "max_questions_per_request": 20,
        "max_document_size_bytes": 20 * 1024 * 1024,
        "max_documents": 100,
    },
    "user": {
        "requests_per_day": 50,
        "requests_per_month": 1000,
        "tokens_per_day": 120000,
        "tokens_per_month": 2500000,
        "max_questions_per_request": 20,
        "max_document_size_bytes": 20 * 1024 * 1024,
        "max_documents": 100,
    },
}


@dataclass
class QuotaCheckResult:
    allowed: bool
    quota_key: Optional[str] = None
    limit: Optional[int] = None
    used: Optional[int] = None
    message: str = ""
    effective_quota: Optional[dict[str, int]] = None


ROLE_QUOTA_COLLECTION = "ai_role_quota_overrides"
_role_quota_cache: Optional[dict[str, dict[str, int]]] = None


def invalidate_role_quota_cache() -> None:
    global _role_quota_cache
    _role_quota_cache = None


def _apply_overrides(merged: dict[str, dict[str, int]], role: str, overrides: dict[str, Any]) -> None:
    base = dict(merged.get(role, merged["user"]))
    for key, raw_limit in overrides.items():
        try:
            base[key] = int(raw_limit)
        except (TypeError, ValueError):
            continue
    merged[role] = base


async def _role_quota_from_settings(database: Any = None) -> dict[str, dict[str, int]]:
    """Effective role quota defaults: hard-coded DEFAULT_ROLE_QUOTAS, overridden by
    the AI_ROLE_QUOTA_JSON env var (legacy, requires restart), overridden again by
    admin-configurable DB rows in ai_role_quota_overrides (no restart needed)."""
    global _role_quota_cache
    if _role_quota_cache is not None:
        return _role_quota_cache

    merged = {role: dict(quota) for role, quota in DEFAULT_ROLE_QUOTAS.items()}

    raw = getattr(settings, "AI_ROLE_QUOTA_JSON", "") or ""
    if raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            for role, value in parsed.items():
                if isinstance(role, str) and isinstance(value, dict):
                    _apply_overrides(merged, role, value)

    db = database if database is not None else get_database()
    try:
        docs = await db[ROLE_QUOTA_COLLECTION].find({}).to_list(None)
    except Exception:
        docs = []
    for doc in docs:
        role = doc.get("role")
        overrides = doc.get("overrides") or {}
        if isinstance(role, str) and isinstance(overrides, dict):
            _apply_overrides(merged, role, overrides)

    _role_quota_cache = merged
    return merged


async def default_role_quotas(database: Any = None) -> dict[str, dict[str, int]]:
    quotas = await _role_quota_from_settings(database=database)
    return {role: dict(quota) for role, quota in quotas.items()}


async def merge_quota(role: str | None, override: Optional[dict[str, Any]], database: Any = None) -> dict[str, int]:
    quotas = await _role_quota_from_settings(database=database)
    effective = dict(quotas.get(role or "user") or quotas["user"])
    if override:
        for key, value in override.items():
            try:
                effective[key] = int(value)
            except (TypeError, ValueError):
                continue
    return effective


async def update_role_quota_defaults(
    role: str, overrides: dict[str, int], *, database: Any = None
) -> dict[str, int]:
    if role not in DEFAULT_ROLE_QUOTAS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role không hợp lệ.")
    db = database if database is not None else get_database()
    now = datetime.now(timezone.utc)
    await db[ROLE_QUOTA_COLLECTION].update_one(
        {"role": role},
        {"$set": {"role": role, "overrides": overrides, "updated_at": now}},
        upsert=True,
    )
    invalidate_role_quota_cache()
    quotas = await default_role_quotas(database=db)
    return quotas[role]


def _day_start(now: datetime) -> datetime:
    return datetime.combine(now.date(), time.min, tzinfo=timezone.utc)


def _month_start(now: datetime) -> datetime:
    return datetime(now.year, now.month, 1, tzinfo=timezone.utc)


async def usage_snapshot(user_id: str, *, now: Optional[datetime] = None, database: Any = None) -> dict[str, int]:
    db = database if database is not None else get_database()
    now = now or datetime.now(timezone.utc)
    day_start = _day_start(now)
    month_start = _month_start(now)

    async def count_since(start: datetime) -> int:
        return await db["ai_usage_events"].count_documents({
            "user_id": user_id,
            "is_final": True,
            "event_kind": "logical_operation",
            "created_at": {"$gte": start, "$lte": now},
        })

    async def tokens_since(start: datetime) -> int:
        docs = await db["ai_usage_events"].aggregate([
            {"$match": {
                "user_id": user_id,
                "is_final": True,
                "event_kind": "logical_operation",
                "created_at": {"$gte": start, "$lte": now},
            }},
            {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$total_tokens", 0]}}}},
        ]).to_list(1)
        return int(docs[0]["total"]) if docs else 0

    document_count = await db["documents"].count_documents({"user_id": user_id, "deleted_at": None})
    return {
        "requests_today": await count_since(day_start),
        "requests_this_month": await count_since(month_start),
        "tokens_today": await tokens_since(day_start),
        "tokens_this_month": await tokens_since(month_start),
        "document_count": document_count,
    }


async def claude_token_usage(*, database: Any = None) -> int:
    db = database if database is not None else get_database()
    rows = await db["ai_usage_events"].aggregate([
        {"$match": {
            "provider": "anthropic",
            "is_final": True,
            "event_kind": "logical_operation",
        }},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$total_tokens", 0]}}}},
    ]).to_list(1)
    return int(rows[0]["total"]) if rows else 0


def _failure(key: str, used: int, limit: int) -> QuotaCheckResult:
    return QuotaCheckResult(
        allowed=False,
        quota_key=key,
        used=used,
        limit=limit,
        message=f"Vượt quota AI: {key} ({used}/{limit}).",
    )


async def check_ai_quota(
    *,
    user_id: str,
    role: str | None,
    quota_override: Optional[dict[str, Any]] = None,
    expected_tokens: int = 0,
    question_count: Optional[int] = None,
    document_size_bytes: Optional[int] = None,
    database: Any = None,
) -> QuotaCheckResult:
    db = database if database is not None else get_database()
    if settings.AI_TEXT_PROVIDER == "claude" and settings.CLAUDE_TOTAL_TOKEN_BUDGET > 0:
        used = await claude_token_usage(database=db)
        if used >= settings.CLAUDE_TOTAL_TOKEN_BUDGET:
            return _failure("claude_total_tokens", used, settings.CLAUDE_TOTAL_TOKEN_BUDGET)
    if quota_override is None or role is None:
        user_doc = await db["users"].find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(user_id) else None
        if user_doc:
            role = role or user_doc.get("role")
            quota_override = quota_override if quota_override is not None else (user_doc.get("ai_quota") or user_doc.get("current_quota"))
    effective = await merge_quota(role, quota_override, database=db)
    if not quota_override and (role or "user") in {"user", "student", "lecturer"}:
        effective["requests_per_day"] = int(await get_setting_value("default_daily_quota", effective.get("requests_per_day", 50), database=db))
        effective["requests_per_month"] = int(await get_setting_value("default_monthly_quota", effective.get("requests_per_month", 1000), database=db))
    usage = await usage_snapshot(user_id, database=db)

    checks = [
        ("requests_per_day", usage["requests_today"] + 1),
        ("requests_per_month", usage["requests_this_month"] + 1),
        ("tokens_per_day", usage["tokens_today"] + max(0, int(expected_tokens or 0))),
        ("tokens_per_month", usage["tokens_this_month"] + max(0, int(expected_tokens or 0))),
        ("max_documents", usage["document_count"]),
    ]
    if question_count is not None:
        checks.append(("max_questions_per_request", int(question_count)))
    if document_size_bytes is not None:
        checks.append(("max_document_size_bytes", int(document_size_bytes)))

    for key, used in checks:
        limit = int(effective.get(key, 0))
        if limit > 0 and used > limit:
            result = _failure(key, used, limit)
            result.effective_quota = effective
            return result
    return QuotaCheckResult(allowed=True, effective_quota=effective)


async def enforce_ai_quota(
    *,
    user_id: str,
    role: str | None,
    feature: str,
    quota_override: Optional[dict[str, Any]] = None,
    expected_tokens: int = 0,
    question_count: Optional[int] = None,
    document_size_bytes: Optional[int] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    request: Optional[Request] = None,
    database: Any = None,
) -> QuotaCheckResult:
    result = await check_ai_quota(
        user_id=user_id,
        role=role,
        quota_override=quota_override,
        expected_tokens=expected_tokens,
        question_count=question_count,
        document_size_bytes=document_size_bytes,
        database=database,
    )
    if result.allowed:
        return result

    await record_activity(
        action="quota_exceeded",
        category="ai",
        status="failure",
        user_id=user_id,
        resource_type=resource_type or feature,
        resource_id=resource_id,
        request=request,
        error_code=ERROR_CODE,
        metadata={
            "feature": feature,
            "quota_key": result.quota_key,
            "used": result.used,
            "limit": result.limit,
        },
        database=database,
    )
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "error_code": ERROR_CODE,
            "message": result.message,
            "quota_key": result.quota_key,
            "used": result.used,
            "limit": result.limit,
        },
    )
