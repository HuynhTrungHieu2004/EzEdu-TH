"""Analytics service: write events and aggregate dashboard metrics."""
from __future__ import annotations

import asyncio
import logging
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfoNotFoundError

try:
    from zoneinfo import ZoneInfo, available_timezones
    def _validate_tz(tz_str: str) -> bool:
        try:
            ZoneInfo(tz_str)
            return True
        except (ZoneInfoNotFoundError, KeyError):
            return False
except ImportError:  # Python < 3.9 fallback
    def _validate_tz(tz_str: str) -> bool:
        return True  # best-effort on older runtimes

from bson import ObjectId

from app.core.config import settings
from app.database.mongodb import get_database
from app.schemas.analytics import UsageEventCreate
from app.services.ai_pricing import estimate_cost

logger = logging.getLogger("app.analytics")

COLLECTION = "ai_usage_events"

# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

def new_event_id() -> str:
    return str(uuid.uuid4())

def new_logical_request_id() -> str:
    return str(uuid.uuid4())

def new_attempt_id() -> str:
    return str(uuid.uuid4())

def validate_iana_timezone(tz_str: str) -> bool:
    return _validate_tz(tz_str)

def clamp_date_range(from_date: datetime, to_date: datetime) -> tuple[datetime, datetime]:
    """Clamp to_date and enforce max range. Both must be UTC-aware."""
    now = datetime.now(timezone.utc)
    if to_date > now:
        to_date = now
    max_delta = timedelta(days=settings.ADMIN_ANALYTICS_MAX_RANGE_DAYS)
    if to_date - from_date > max_delta:
        from_date = to_date - max_delta
    return from_date, to_date

def _safe_ratio(numerator: int | float, denominator: int | float) -> Optional[float]:
    """Return percentage (0-100) or None when denominator is 0."""
    if denominator == 0:
        return None
    return round((numerator / denominator) * 100, 2)

# ──────────────────────────────────────────────────────────────────────
# Write event (fire-and-forget, never fails the caller)
# ──────────────────────────────────────────────────────────────────────

async def record_event(event: UsageEventCreate) -> None:
    """Persist a usage event; logs a warning on failure but never raises."""
    try:
        db = get_database()
        doc = event.model_dump()
        doc["feature"] = doc.get("feature") or doc.get("operation_type")
        doc["model"] = doc.get("model") or doc.get("model_name")
        doc["request_id"] = doc.get("request_id") or doc.get("logical_request_id")
        if doc.get("estimated_cost") is None:
            cost, currency = estimate_cost(
                provider=doc.get("provider"),
                model=doc.get("model_name"),
                input_tokens=doc.get("input_tokens"),
                output_tokens=doc.get("output_tokens"),
            )
            doc["estimated_cost"] = cost
            doc["currency"] = doc.get("currency") or currency
        # Replace event_id with a unique MongoDB-level unique index field
        await asyncio.wait_for(
            db[COLLECTION].insert_one(doc),
            timeout=3.0
        )
    except Exception as exc:
        logger.warning("Analytics write failure (non-critical): %s", type(exc).__name__)

# ──────────────────────────────────────────────────────────────────────
# Percentile calculation (nearest-rank, sorted cursor, O(1) memory)
# ──────────────────────────────────────────────────────────────────────

async def _percentile_latency(
    db,
    query_filter: dict,
    p: float,
    timeout: float
) -> Optional[float]:
    """Compute pth percentile (nearest-rank) of latency_ms without loading dataset into RAM."""
    count = await asyncio.wait_for(
        db[COLLECTION].count_documents(query_filter),
        timeout=timeout
    )
    if count == 0:
        return None
    # nearest-rank: index = ceil(p * count) - 1, floor-bounded at 0
    idx = max(0, math.ceil(p * count) - 1)
    cursor = (
        db[COLLECTION]
        .find(query_filter, {"latency_ms": 1, "_id": 0})
        .sort("latency_ms", 1)
        .skip(idx)
        .limit(1)
    )
    doc = await asyncio.wait_for(cursor.to_list(1), timeout=timeout)
    if not doc:
        return None
    return float(doc[0].get("latency_ms", 0))

# ──────────────────────────────────────────────────────────────────────
# Dashboard Aggregations
# ──────────────────────────────────────────────────────────────────────

async def get_overview(from_date: datetime, to_date: datetime) -> dict[str, Any]:
    """Current-state metrics + feedback totals."""
    timeout = settings.ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS
    db = get_database()
    time_filter = {"created_at": {"$gte": from_date, "$lte": to_date}}

    # AI-active users: distinct user_ids in final logical operations in range
    final_filter = {**time_filter, "is_final": True, "event_kind": "logical_operation"}
    ai_active_users_pipeline = [
        {"$match": final_filter},
        {"$group": {"_id": "$user_id"}},
        {"$count": "total"},
    ]

    async def _run(coro):
        return await asyncio.wait_for(coro, timeout=timeout)

    ai_active_agg = await _run(db[COLLECTION].aggregate(ai_active_users_pipeline).to_list(None))
    ai_active_users = ai_active_agg[0]["total"] if ai_active_agg else 0

    total_users = await _run(db["users"].count_documents({}))

    # Conversations (active only — deleted_at null)
    total_conversations = await _run(db["conversations"].count_documents({"deleted_at": None}))

    # Messages belonging to non-deleted conversations
    active_conv_ids = await _run(
        db["conversations"].distinct("_id", {"deleted_at": None})
    )
    user_msgs = await _run(db["conversation_messages"].count_documents(
        {"conversation_id": {"$in": active_conv_ids}, "role": "user"}
    ))
    assistant_msgs = await _run(db["conversation_messages"].count_documents(
        {"conversation_id": {"$in": active_conv_ids}, "role": "assistant"}
    ))

    # Documents
    total_docs = await _run(db["documents"].count_documents({}))
    indexed_docs = await _run(db["documents"].count_documents({"status": "indexed"}))
    failed_docs = await _run(db["documents"].count_documents({"status": "index_failed"}))

    # Verification sessions
    verification_success = await _run(db["verification_sessions"].count_documents(
        {"status": "completed", "total_issues_found": 0}
    ))
    verification_warning = await _run(db["verification_sessions"].count_documents(
        {"status": "completed", "total_issues_found": {"$gt": 0}}
    ))
    verification_failed = await _run(db["verification_sessions"].count_documents(
        {"status": "failed"}
    ))

    # Feedback
    total_feedback = await _run(db["ai_answer_feedback"].count_documents({}))
    helpful = await _run(db["ai_answer_feedback"].count_documents({"rating": "helpful"}))
    not_helpful = await _run(db["ai_answer_feedback"].count_documents({"rating": "not_helpful"}))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "time_range": {"from_date": from_date.isoformat(), "to_date": to_date.isoformat()},
        "tracking_started_at": None,  # no dedicated tracking start field; dashboard shows raw events
        "total_users": total_users,
        "ai_active_users": ai_active_users,
        "total_conversations": total_conversations,
        "total_messages": {"user": user_msgs, "assistant": assistant_msgs},
        "documents": {
            "total": total_docs,
            "indexed": indexed_docs,
            "failed": failed_docs,
        },
        "verification": {
            "success": verification_success,
            "warning": verification_warning,
            "failed": verification_failed,
        },
        "feedback": {
            "helpful": helpful,
            "not_helpful": not_helpful,
            "total": total_feedback,
            "helpful_ratio": _safe_ratio(helpful, total_feedback),
        },
    }


async def get_usage(from_date: datetime, to_date: datetime, bucket: str) -> dict[str, Any]:
    """AI usage aggregated by bucket (hour/day/week)."""
    timeout = settings.ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS
    db = get_database()

    bucket_map = {"hour": "%Y-%m-%dT%H:00:00Z", "day": "%Y-%m-%d", "week": "%Y-W%V"}
    if bucket not in bucket_map:
        bucket = "day"

    time_filter = {"created_at": {"$gte": from_date, "$lte": to_date}}
    final_logic_filter = {**time_filter, "is_final": True, "event_kind": "logical_operation"}

    pipeline = [
        {"$match": time_filter},
        {"$group": {
            "_id": {"$dateToString": {"format": bucket_map[bucket], "date": "$created_at"}},
            "logical_requests": {
                "$sum": {"$cond": [
                    {"$and": [{"$eq": ["$is_final", True]}, {"$eq": ["$event_kind", "logical_operation"]}]},
                    1, 0
                ]}
            },
            "attempts": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]

    bucket_docs = await asyncio.wait_for(
        db[COLLECTION].aggregate(pipeline).to_list(None),
        timeout=timeout
    )

    # Model breakdown (final logical only)
    model_pipeline = [
        {"$match": final_logic_filter},
        {"$group": {"_id": "$model_name", "count": {"$sum": 1}}},
    ]
    model_docs = await asyncio.wait_for(
        db[COLLECTION].aggregate(model_pipeline).to_list(None),
        timeout=timeout
    )
    models = {d["_id"]: d["count"] for d in model_docs}

    # Retrieval mode breakdown
    retrieval_pipeline = [
        {"$match": {**final_logic_filter, "operation_type": "advanced_chat"}},
        {"$group": {"_id": "$retrieval_mode", "count": {"$sum": 1}}},
    ]
    retrieval_docs = await asyncio.wait_for(
        db[COLLECTION].aggregate(retrieval_pipeline).to_list(None),
        timeout=timeout
    )
    retrieval_modes = {d["_id"]: d["count"] for d in retrieval_docs if d["_id"]}

    # Token totals (sum only where not null)
    token_pipeline = [
        {"$match": {**time_filter, "input_tokens": {"$ne": None}}},
        {"$group": {
            "_id": None,
            "input_tokens": {"$sum": "$input_tokens"},
            "output_tokens": {"$sum": "$output_tokens"},
            "total_tokens": {"$sum": "$total_tokens"},
            "events_with_usage_metadata": {"$sum": 1},
        }},
    ]
    token_docs = await asyncio.wait_for(
        db[COLLECTION].aggregate(token_pipeline).to_list(None),
        timeout=timeout
    )
    tokens = token_docs[0] if token_docs else {}

    # Total events without usage metadata (for transparency)
    total_events = await asyncio.wait_for(
        db[COLLECTION].count_documents(time_filter),
        timeout=timeout
    )
    events_without_metadata = total_events - tokens.get("events_with_usage_metadata", 0)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "time_range": {"from_date": from_date.isoformat(), "to_date": to_date.isoformat()},
        "bucket": bucket,
        "buckets": [
            {
                "time": d["_id"],
                "logical_requests": d["logical_requests"],
                "attempts": d["attempts"],
            }
            for d in bucket_docs
        ],
        "models": models,
        "retrieval_modes": retrieval_modes,
        "tokens": {
            "input_tokens": tokens.get("input_tokens", None),
            "output_tokens": tokens.get("output_tokens", None),
            "total_tokens": tokens.get("total_tokens", None),
            "events_with_usage_metadata": tokens.get("events_with_usage_metadata", 0),
            "events_without_usage_metadata": events_without_metadata,
        },
        "provider_quota_status": "unsupported",  # No official quota API integrated
    }


async def get_quality(from_date: datetime, to_date: datetime) -> dict[str, Any]:
    """Feedback quality metrics and citation analysis."""
    timeout = settings.ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS
    db = get_database()
    time_filter = {"created_at": {"$gte": from_date, "$lte": to_date}}

    # Feedback totals
    total_fb = await asyncio.wait_for(
        db["ai_answer_feedback"].count_documents(time_filter),
        timeout=timeout
    )
    helpful_count = await asyncio.wait_for(
        db["ai_answer_feedback"].count_documents({**time_filter, "rating": "helpful"}),
        timeout=timeout
    )
    not_helpful_count = total_fb - helpful_count

    # Reason codes breakdown (from not_helpful)
    reason_pipeline = [
        {"$match": {**time_filter, "rating": "not_helpful"}},
        {"$unwind": "$reason_codes"},
        {"$group": {"_id": "$reason_codes", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    reason_docs = await asyncio.wait_for(
        db["ai_answer_feedback"].aggregate(reason_pipeline).to_list(None),
        timeout=timeout
    )
    negative_reasons = {d["_id"]: d["count"] for d in reason_docs}

    # insufficient_evidence_rate: from ai_usage_events evidence_status
    chat_final_filter = {
        **time_filter,
        "is_final": True,
        "event_kind": "logical_operation",
        "operation_type": "advanced_chat",
    }
    total_chat = await asyncio.wait_for(
        db[COLLECTION].count_documents(chat_final_filter),
        timeout=timeout
    )
    insufficient = await asyncio.wait_for(
        db[COLLECTION].count_documents({**chat_final_filter, "evidence_status": "insufficient_evidence"}),
        timeout=timeout
    )

    # external_search_failure_rate: from web_grounding provider_attempt events
    web_filter = {
        **time_filter,
        "event_kind": "provider_attempt",
        "operation_type": "web_grounding",
    }
    total_web = await asyncio.wait_for(db[COLLECTION].count_documents(web_filter), timeout=timeout)
    web_failed = await asyncio.wait_for(
        db[COLLECTION].count_documents({**web_filter, "status": "failure"}),
        timeout=timeout
    )

    # Correlations: not_helpful rate by retrieval_mode
    corr_pipeline = [
        {"$match": {**chat_final_filter}},
        {"$lookup": {
            "from": "ai_answer_feedback",
            "localField": "logical_request_id",
            "foreignField": "logical_request_id",
            "as": "fb",
        }},
        {"$group": {
            "_id": "$retrieval_mode",
            "total": {"$sum": 1},
            "not_helpful": {"$sum": {"$cond": [{"$eq": [{"$size": {"$filter": {
                "input": "$fb",
                "cond": {"$eq": ["$$this.rating", "not_helpful"]},
            }}}, 0]}, 0, 1]}},
        }},
    ]
    # Note: this correlation is best-effort and may be approximate if feedback not always linked
    # We provide a simpler aggregation for now using reported citation snapshot
    by_retrieval = {}
    for d in await asyncio.wait_for(db[COLLECTION].aggregate(corr_pipeline).to_list(None), timeout=timeout):
        by_retrieval[d["_id"]] = _safe_ratio(d["not_helpful"], d["total"])

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "time_range": {"from_date": from_date.isoformat(), "to_date": to_date.isoformat()},
        "helpful_ratio": _safe_ratio(helpful_count, total_fb),
        "not_helpful_ratio": _safe_ratio(not_helpful_count, total_fb),
        "total_feedback": total_fb,
        "negative_reasons": negative_reasons,
        "insufficient_evidence_rate": _safe_ratio(insufficient, total_chat),
        "external_search_failure_rate": _safe_ratio(web_failed, total_web),
        "correlations": {
            "not_helpful_by_retrieval_mode": by_retrieval,
        },
    }


async def get_errors_latency(from_date: datetime, to_date: datetime, bucket: str) -> dict[str, Any]:
    """Error rates and latency percentiles."""
    timeout = settings.ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS
    db = get_database()
    time_filter = {"created_at": {"$gte": from_date, "$lte": to_date}}
    final_filter = {**time_filter, "is_final": True, "event_kind": "logical_operation"}

    bucket_map = {"hour": "%Y-%m-%dT%H:00:00Z", "day": "%Y-%m-%d", "week": "%Y-W%V"}
    if bucket not in bucket_map:
        bucket = "day"

    total_final = await asyncio.wait_for(
        db[COLLECTION].count_documents(final_filter), timeout=timeout
    )
    success_final = await asyncio.wait_for(
        db[COLLECTION].count_documents({**final_filter, "status": "success"}), timeout=timeout
    )

    # Error code breakdown
    error_pipeline = [
        {"$match": {**final_filter, "status": "failure", "error_code": {"$ne": None}}},
        {"$group": {"_id": "$error_code", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    error_docs = await asyncio.wait_for(
        db[COLLECTION].aggregate(error_pipeline).to_list(None), timeout=timeout
    )
    errors = {d["_id"]: d["count"] for d in error_docs}

    # Latency average
    avg_pipeline = [
        {"$match": final_filter},
        {"$group": {"_id": None, "avg_ms": {"$avg": "$latency_ms"}}},
    ]
    avg_docs = await asyncio.wait_for(
        db[COLLECTION].aggregate(avg_pipeline).to_list(None), timeout=timeout
    )
    avg_ms = round(avg_docs[0]["avg_ms"], 2) if avg_docs and avg_docs[0].get("avg_ms") is not None else None

    # Percentiles using nearest-rank skip cursor
    p50 = await _percentile_latency(db, final_filter, 0.50, timeout)
    p95 = await _percentile_latency(db, final_filter, 0.95, timeout)

    # Bucketed success rate
    bucket_pipeline = [
        {"$match": final_filter},
        {"$group": {
            "_id": {"$dateToString": {"format": bucket_map[bucket], "date": "$created_at"}},
            "total": {"$sum": 1},
            "success": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
            "avg_latency_ms": {"$avg": "$latency_ms"},
        }},
        {"$sort": {"_id": 1}},
    ]
    bucket_docs = await asyncio.wait_for(
        db[COLLECTION].aggregate(bucket_pipeline).to_list(None), timeout=timeout
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "time_range": {"from_date": from_date.isoformat(), "to_date": to_date.isoformat()},
        "bucket": bucket,
        "success_rate": _safe_ratio(success_final, total_final),
        "total_logical_requests": total_final,
        "errors": errors,
        "latency": {
            "average_ms": avg_ms,
            "p50_ms": p50,
            "p95_ms": p95,
        },
        "buckets": [
            {
                "time": d["_id"],
                "success_rate": _safe_ratio(d["success"], d["total"]),
                "avg_latency_ms": round(d["avg_latency_ms"], 2) if d.get("avg_latency_ms") is not None else None,
                "total": d["total"],
            }
            for d in bucket_docs
        ],
    }
