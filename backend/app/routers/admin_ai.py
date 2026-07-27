from __future__ import annotations

import math
import re
from datetime import datetime, time, timedelta, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.rbac import Permission, require_permission
from app.database.mongodb import get_database
from app.schemas.admin_ai import (
    AIAggregateRow,
    AIModelPricingResponse,
    AIQuotaHistoryItem,
    AIQuotaHistoryResponse,
    AIQuotaMutationResponse,
    AIQuotaResetRequest,
    AIQuotaUpdateRequest,
    AIQuotaView,
    AIUsageDashboardResponse,
    AIUsageEventItem,
    AIUsageStatus,
    AIUsageSummary,
    AIUsageWarning,
    RoleQuotaUpdateRequest,
    SortOrder,
)
from app.schemas.auth import UserResponse
from app.services.admin_audit_service import record_admin_audit, require_reason
from app.services.ai_pricing import pricing_catalog
from app.services.ai_quota_service import default_role_quotas, merge_quota, update_role_quota_defaults, usage_snapshot
from app.services.system_settings_service import get_setting_value

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_oid(value: str, name: str = "id") -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail=f"{name} không hợp lệ.")
    return ObjectId(value)


def _parse_date(value: Optional[datetime], default: datetime, *, end: bool = False) -> datetime:
    result = value or default
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    if end and result.time() == time.min:
        result = result.replace(hour=23, minute=59, second=59, microsecond=999999)
    return result.astimezone(timezone.utc)


def _feature(doc: dict[str, Any]) -> str:
    value = doc.get("feature") or doc.get("operation_type") or "unknown"
    if value == "material_verification":
        return "document_verification"
    if value == "web_grounding":
        return "web_search"
    return str(value)


def _model(doc: dict[str, Any]) -> str:
    return str(doc.get("model") or doc.get("model_name") or "unknown")


def _final_query(
    *,
    from_date: datetime,
    to_date: datetime,
    user_id: Optional[str],
    provider: Optional[str],
    model: Optional[str],
    feature: Optional[str],
    status_filter: Optional[str],
) -> dict[str, Any]:
    query: dict[str, Any] = {
        "created_at": {"$gte": from_date, "$lte": to_date},
        "is_final": True,
        "event_kind": "logical_operation",
    }
    if user_id:
        query["user_id"] = user_id
    if provider:
        query["provider"] = provider
    if model:
        query["$or"] = [{"model": model}, {"model_name": model}]
    if feature:
        query["$and"] = [{"$or": [{"feature": feature}, {"operation_type": feature}]}]
    if status_filter:
        query["status"] = status_filter
    return query


async def _percentile(db, query: dict[str, Any], p: float) -> Optional[float]:
    count = await db["ai_usage_events"].count_documents({**query, "latency_ms": {"$ne": None}})
    if not count:
        return None
    index = max(0, math.ceil(count * p) - 1)
    docs = await (
        db["ai_usage_events"]
        .find({**query, "latency_ms": {"$ne": None}}, {"latency_ms": 1})
        .sort("latency_ms", 1)
        .skip(index)
        .limit(1)
        .to_list(1)
    )
    return float(docs[0].get("latency_ms", 0)) if docs else None


async def _user_email_map(db, user_ids: set[str]) -> dict[str, str]:
    ids = [ObjectId(item) for item in user_ids if ObjectId.is_valid(item)]
    docs = await db["users"].find({"_id": {"$in": ids}}, {"email": 1}).to_list(None)
    return {str(item["_id"]): item.get("email", "") for item in docs}


async def _aggregate_rows(db, query: dict[str, Any], group_expr: Any, *, labels: Optional[dict[str, str]] = None) -> list[AIAggregateRow]:
    docs = await db["ai_usage_events"].aggregate([
        {"$match": query},
        {"$group": {
            "_id": group_expr,
            "request_count": {"$sum": 1},
            "total_tokens": {"$sum": {"$ifNull": ["$total_tokens", 0]}},
            "estimated_cost": {"$sum": {"$ifNull": ["$estimated_cost", 0]}},
            "avg_latency_ms": {"$avg": "$latency_ms"},
        }},
        {"$sort": {"total_tokens": -1, "request_count": -1}},
        {"$limit": 10},
    ]).to_list(10)
    rows: list[AIAggregateRow] = []
    for item in docs:
        key = str(item.get("_id") or "unknown")
        rows.append(AIAggregateRow(
            key=key,
            label=(labels or {}).get(key),
            request_count=int(item.get("request_count", 0)),
            total_tokens=int(item.get("total_tokens", 0)),
            estimated_cost=round(float(item.get("estimated_cost", 0)), 6),
            avg_latency_ms=round(float(item["avg_latency_ms"]), 2) if item.get("avg_latency_ms") is not None else None,
        ))
    return rows


def _warnings(summary: AIUsageSummary, previous_cost: float) -> list[AIUsageWarning]:
    warnings: list[AIUsageWarning] = []
    if summary.total_requests >= 20:
        error_rate = (summary.failed_requests / summary.total_requests) * 100
        if error_rate >= 20:
            warnings.append(AIUsageWarning(type="high_error_rate", severity="critical", message="Tỷ lệ lỗi AI cao.", value=round(error_rate, 2), threshold=20))
        elif error_rate >= 10:
            warnings.append(AIUsageWarning(type="high_error_rate", message="Tỷ lệ lỗi AI đang tăng.", value=round(error_rate, 2), threshold=10))
    if summary.p95_latency_ms is not None and summary.p95_latency_ms >= 10000:
        warnings.append(AIUsageWarning(type="high_latency", severity="critical", message="P95 latency AI vượt ngưỡng.", value=summary.p95_latency_ms, threshold=10000))
    elif summary.p95_latency_ms is not None and summary.p95_latency_ms >= 5000:
        warnings.append(AIUsageWarning(type="high_latency", message="P95 latency AI đang cao.", value=summary.p95_latency_ms, threshold=5000))
    if previous_cost > 0 and summary.estimated_cost >= previous_cost * 1.5:
        warnings.append(AIUsageWarning(type="cost_spike", message="Chi phí ước tính tăng bất thường so với kỳ trước.", value=summary.estimated_cost, threshold=round(previous_cost * 1.5, 6)))
    warnings.append(AIUsageWarning(type="provider_quota_visibility", severity="info", message="Quota provider chính thức chưa được đồng bộ từ nhà cung cấp; cảnh báo dựa trên usage nội bộ."))
    return warnings


async def _provider_quota_warnings(db) -> list[AIUsageWarning]:
    """Providers like Gemini/Groq don't expose a queryable "remaining quota" API,
    so this compares today's internal request counts against an admin-configured
    ceiling (system_settings) instead of a real provider-side quota check."""
    now = _now()
    day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    rows = await db["ai_usage_events"].aggregate([
        {"$match": {"is_final": True, "event_kind": "logical_operation", "created_at": {"$gte": day_start, "$lte": now}}},
        {"$group": {"_id": {"$ifNull": ["$provider", "unknown"]}, "count": {"$sum": 1}}},
    ]).to_list(None)
    counts = {str(row["_id"]): int(row["count"]) for row in rows}

    warnings: list[AIUsageWarning] = []
    for provider_key, setting_key in (("gemini", "gemini_daily_request_ceiling"), ("groq", "groq_daily_request_ceiling")):
        ceiling = int(await get_setting_value(setting_key, 0, database=db))
        if ceiling <= 0:
            continue
        used = counts.get(provider_key, 0)
        ratio = used / ceiling
        if ratio >= 0.95:
            warnings.append(AIUsageWarning(
                type="provider_quota_near_limit", severity="critical",
                message=f"Provider {provider_key} sắp chạm ngưỡng request/ngày đã cấu hình.",
                value=used, threshold=ceiling,
            ))
        elif ratio >= 0.8:
            warnings.append(AIUsageWarning(
                type="provider_quota_near_limit",
                message=f"Provider {provider_key} đã dùng {round(ratio * 100)}% ngưỡng request/ngày đã cấu hình.",
                value=used, threshold=ceiling,
            ))
    return warnings


@router.get("/usage", response_model=AIUsageDashboardResponse)
async def get_admin_ai_usage(
    from_date: Optional[datetime] = Query(None),
    to_date: Optional[datetime] = Query(None),
    user_id: Optional[str] = Query(None, max_length=80),
    provider: Optional[str] = Query(None, max_length=40),
    model: Optional[str] = Query(None, max_length=120),
    feature: Optional[str] = Query(None, max_length=80),
    status_filter: Optional[AIUsageStatus] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    sort_order: SortOrder = Query("desc"),
    current_user: UserResponse = Depends(require_permission(Permission.AI_USAGE_VIEW)),
):
    db = get_database()
    now = _now()
    end = _parse_date(to_date, now, end=True)
    start = _parse_date(from_date, end - timedelta(days=7))
    query = _final_query(
        from_date=start,
        to_date=end,
        user_id=user_id,
        provider=provider,
        model=model,
        feature=feature,
        status_filter=status_filter,
    )
    total = await db["ai_usage_events"].count_documents(query)
    aggregate = await db["ai_usage_events"].aggregate([
        {"$match": query},
        {"$group": {
            "_id": None,
            "success": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
            "failure": {"$sum": {"$cond": [{"$eq": ["$status", "failure"]}, 1, 0]}},
            "input_tokens": {"$sum": {"$ifNull": ["$input_tokens", 0]}},
            "output_tokens": {"$sum": {"$ifNull": ["$output_tokens", 0]}},
            "total_tokens": {"$sum": {"$ifNull": ["$total_tokens", 0]}},
            "estimated_cost": {"$sum": {"$ifNull": ["$estimated_cost", 0]}},
            "avg_latency_ms": {"$avg": "$latency_ms"},
        }},
    ]).to_list(1)
    row = aggregate[0] if aggregate else {}
    summary = AIUsageSummary(
        total_requests=total,
        success_requests=int(row.get("success", 0)),
        failed_requests=int(row.get("failure", 0)),
        input_tokens=int(row.get("input_tokens", 0)),
        output_tokens=int(row.get("output_tokens", 0)),
        total_tokens=int(row.get("total_tokens", 0)),
        estimated_cost=round(float(row.get("estimated_cost", 0)), 6),
        avg_latency_ms=round(float(row["avg_latency_ms"]), 2) if row.get("avg_latency_ms") is not None else None,
        p50_latency_ms=await _percentile(db, query, 0.50),
        p95_latency_ms=await _percentile(db, query, 0.95),
        p99_latency_ms=await _percentile(db, query, 0.99),
    )

    previous_start = start - (end - start)
    previous_query = {**query, "created_at": {"$gte": previous_start, "$lt": start}}
    previous_docs = await db["ai_usage_events"].aggregate([
        {"$match": previous_query},
        {"$group": {"_id": None, "estimated_cost": {"$sum": {"$ifNull": ["$estimated_cost", 0]}}}},
    ]).to_list(1)
    previous_cost = float(previous_docs[0].get("estimated_cost", 0)) if previous_docs else 0

    docs = await (
        db["ai_usage_events"]
        .find(query)
        .sort("created_at", 1 if sort_order == "asc" else -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    email_map = await _user_email_map(db, {str(doc.get("user_id", "")) for doc in docs})
    user_labels = await _user_email_map(db, set(await db["ai_usage_events"].distinct("user_id", query)))

    return AIUsageDashboardResponse(
        summary=summary,
        top_users=await _aggregate_rows(db, query, "$user_id", labels=user_labels),
        top_models=await _aggregate_rows(db, query, {"$ifNull": ["$model", "$model_name"]}),
        top_features=await _aggregate_rows(db, query, {"$ifNull": ["$feature", "$operation_type"]}),
        warnings=_warnings(summary, previous_cost) + await _provider_quota_warnings(db),
        items=[
            AIUsageEventItem(
                id=str(doc["_id"]),
                user_id=str(doc.get("user_id", "")),
                user_email=email_map.get(str(doc.get("user_id", ""))),
                feature=_feature(doc),
                provider=str(doc.get("provider") or "unknown"),
                model=_model(doc),
                input_tokens=int(doc.get("input_tokens") or 0),
                output_tokens=int(doc.get("output_tokens") or 0),
                total_tokens=int(doc.get("total_tokens") or 0),
                estimated_cost=doc.get("estimated_cost"),
                currency=str(doc.get("currency") or "USD"),
                latency_ms=int(doc.get("latency_ms") or 0),
                status=doc.get("status", "failure"),
                error_code=doc.get("error_code"),
                request_id=doc.get("request_id") or doc.get("logical_request_id"),
                document_id=doc.get("document_id"),
                conversation_id=doc.get("conversation_id"),
                created_at=doc.get("created_at") or _now(),
            )
            for doc in docs
        ],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
        generated_at=_now(),
    )


async def _load_user(db, user_id: str) -> dict[str, Any]:
    user = await db["users"].find_one({"_id": _parse_oid(user_id, "user_id")})
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    return user


async def _quota_view(db, user_id: str) -> AIQuotaView:
    user = await _load_user(db, user_id)
    role = str(user.get("role") or "user")
    defaults = await default_role_quotas(database=db)
    override = user.get("ai_quota") or user.get("current_quota") or {}
    return AIQuotaView(
        user_id=user_id,
        role=role,
        default_quota=defaults.get(role) or defaults["user"],
        override_quota=override,
        effective_quota=await merge_quota(role, override, database=db),
        usage=await usage_snapshot(user_id, database=db),
        generated_at=_now(),
    )


@router.get("/quota/defaults")
async def get_ai_quota_defaults(
    current_user: UserResponse = Depends(require_permission(Permission.AI_USAGE_VIEW)),
):
    return {"items": await default_role_quotas(), "generated_at": _now()}


@router.patch("/quota/defaults/{role}")
async def update_ai_quota_defaults(
    role: str,
    payload: RoleQuotaUpdateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.AI_SETTINGS_UPDATE)),
):
    """Change the role-level default AI quota at runtime (DB-backed), instead of
    requiring the AI_ROLE_QUOTA_JSON env var + a process restart."""
    reason = require_reason(payload.reason, "thay đổi quota mặc định theo role")
    db = get_database()
    before = (await default_role_quotas(database=db)).get(role)
    after = await update_role_quota_defaults(role, payload.overrides, database=db)
    audit = await record_admin_audit(
        admin=current_user,
        action="system_setting_updated",
        target_type="ai_role_quota",
        target_id=role,
        reason=reason,
        before=before,
        after=after,
        changed=sorted(payload.overrides.keys()),
        request=request,
        database=db,
    )
    return {"role": role, "quota": after, "audit_event": {"audit_log_id": str(audit["_id"])}}


@router.get("/quota/users/{user_id}", response_model=AIQuotaView)
async def get_user_ai_quota(
    user_id: str,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_MANAGE_QUOTA)),
):
    return await _quota_view(get_database(), user_id)


@router.patch("/quota/users/{user_id}", response_model=AIQuotaMutationResponse)
async def update_user_ai_quota(
    user_id: str,
    payload: AIQuotaUpdateRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_MANAGE_QUOTA)),
):
    reason = require_reason(payload.reason, "thay quota AI")
    db = get_database()
    before = await _load_user(db, user_id)
    after = await db["users"].find_one_and_update(
        {"_id": before["_id"]},
        {"$set": {"ai_quota": payload.current_quota, "updated_at": _now()}},
        return_document=True,
        projection={"hashed_password": 0},
    )
    audit = await record_admin_audit(
        admin=current_user,
        action="user_quota_changed",
        target_type="user",
        target_id=user_id,
        reason=reason,
        before={"ai_quota": before.get("ai_quota") or before.get("current_quota")},
        after={"ai_quota": after.get("ai_quota")},
        changed=["ai_quota"],
        request=request,
        database=db,
    )
    return AIQuotaMutationResponse(quota=await _quota_view(db, user_id), audit_event={"audit_log_id": str(audit["_id"])})


@router.post("/quota/users/{user_id}/reset", response_model=AIQuotaMutationResponse)
async def reset_user_ai_quota(
    user_id: str,
    payload: AIQuotaResetRequest,
    request: Request = None,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_MANAGE_QUOTA)),
):
    reason = require_reason(payload.reason, "reset quota AI")
    db = get_database()
    before = await _load_user(db, user_id)
    after = await db["users"].find_one_and_update(
        {"_id": before["_id"]},
        {"$set": {"ai_quota": {}, "updated_at": _now()}},
        return_document=True,
        projection={"hashed_password": 0},
    )
    audit = await record_admin_audit(
        admin=current_user,
        action="user_quota_changed",
        target_type="user",
        target_id=user_id,
        reason=reason,
        before={"ai_quota": before.get("ai_quota") or before.get("current_quota")},
        after={"ai_quota": after.get("ai_quota")},
        changed=["ai_quota"],
        request=request,
        database=db,
    )
    return AIQuotaMutationResponse(quota=await _quota_view(db, user_id), audit_event={"audit_log_id": str(audit["_id"])})


@router.get("/quota/users/{user_id}/history", response_model=AIQuotaHistoryResponse)
async def get_user_ai_quota_history(
    user_id: str,
    current_user: UserResponse = Depends(require_permission(Permission.USERS_MANAGE_QUOTA)),
):
    db = get_database()
    docs = await (
        db["admin_audit_logs"]
        .find({"target_id": user_id, "action": "user_quota_changed"})
        .sort("timestamp", -1)
        .limit(50)
        .to_list(50)
    )
    return AIQuotaHistoryResponse(
        items=[
            AIQuotaHistoryItem(
                id=str(doc["_id"]),
                admin_user_id=str(doc.get("admin_user_id", "")),
                admin_email_snapshot=str(doc.get("admin_email_snapshot", "")),
                reason=doc.get("reason"),
                before=doc.get("before"),
                after=doc.get("after"),
                changed_fields=doc.get("changed_fields") or [],
                timestamp=doc.get("timestamp") or _now(),
            )
            for doc in docs
        ],
        total=len(docs),
        generated_at=_now(),
    )


@router.get("/pricing", response_model=AIModelPricingResponse)
async def get_ai_pricing(
    current_user: UserResponse = Depends(require_permission(Permission.AI_USAGE_VIEW)),
):
    return AIModelPricingResponse(items=pricing_catalog(), generated_at=_now())
