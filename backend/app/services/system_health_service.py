from __future__ import annotations

import asyncio
import shutil
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import Request

from app.core.config import settings
from app.database.mongodb import get_database
from app.schemas.system_health import (
    ErrorLogItem,
    ErrorMonitoringResponse,
    ErrorMonitoringSummary,
    HealthAlert,
    HealthComponent,
    HealthStatus,
    SystemHealthResponse,
)
from app.services.activity_log_service import request_id_from_request
from app.services.system_settings_service import is_feature_enabled


ERROR_LOG_COLLECTION = "system_error_logs"
HEALTH_HISTORY_COLLECTION = "system_health_snapshots"
HEALTH_CHECK_TIMEOUT_SECONDS = 3.0
SAFE_ERROR_MESSAGES = {
    400: "Yêu cầu không hợp lệ.",
    401: "Chưa xác thực.",
    403: "Không có quyền truy cập.",
    404: "Không tìm thấy tài nguyên.",
    409: "Xung đột trạng thái.",
    422: "Dữ liệu không hợp lệ.",
    429: "Vượt giới hạn sử dụng.",
    500: "Lỗi máy chủ nội bộ.",
    503: "Dịch vụ tạm thời không khả dụng.",
    504: "Yêu cầu quá thời gian.",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def severity_for_status(status_code: int) -> str:
    if status_code >= 500:
        return "critical"
    if status_code in {408, 409, 429} or status_code >= 400:
        return "warning"
    return "info"


def error_code_for_status(status_code: int, explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit[:80]
    if status_code == 429:
        return "RATE_LIMITED"
    if status_code == 503:
        return "SERVICE_UNAVAILABLE"
    if status_code == 504:
        return "TIMEOUT"
    if status_code >= 500:
        return "INTERNAL_ERROR"
    return f"HTTP_{status_code}"


def safe_message(status_code: int, message: Optional[str] = None) -> str:
    if status_code < 500 and message:
        return str(message)[:240]
    return SAFE_ERROR_MESSAGES.get(status_code, "Yêu cầu gặp lỗi.")[:240]


def _route_path(request: Request) -> str:
    route = request.scope.get("route")
    return getattr(route, "path", None) or request.url.path


async def record_error_log(
    *,
    request: Request,
    status_code: int,
    duration_ms: int,
    message: Optional[str] = None,
    error_code: Optional[str] = None,
    user_id: Optional[str] = None,
    database: Any = None,
) -> dict[str, Any]:
    db = database or get_database()
    doc = {
        "error_id": str(uuid.uuid4()),
        "timestamp": now_utc(),
        "service": "fastapi",
        "endpoint": _route_path(request),
        "method": request.method,
        "status_code": int(status_code),
        "error_code": error_code_for_status(status_code, error_code),
        "message_safe": safe_message(status_code, message),
        "request_id": request_id_from_request(request),
        "user_id": user_id,
        "duration_ms": max(0, int(duration_ms)),
        "severity": severity_for_status(status_code),
    }
    try:
        await db[ERROR_LOG_COLLECTION].insert_one(doc)
    except Exception:
        pass
    return doc


async def _timed_component(name: str, check) -> HealthComponent:
    started = time.perf_counter()
    checked_at = now_utc()
    try:
        result = await asyncio.wait_for(check(), timeout=HEALTH_CHECK_TIMEOUT_SECONDS)
        if isinstance(result, HealthComponent):
            return result
        status, message, details = result
    except asyncio.TimeoutError:
        status, message, details = "down", "Health check quá thời gian.", {"error_code": "HEALTH_TIMEOUT"}
    except Exception:
        status, message, details = "down", "Health check thất bại.", {"error_code": "HEALTH_CHECK_FAILED"}
    return HealthComponent(
        name=name,
        status=status,
        checked_at=checked_at,
        latency_ms=int((time.perf_counter() - started) * 1000),
        message=message,
        details=details,
    )


async def _check_fastapi():
    return "healthy", "FastAPI đang phản hồi.", {"app_env": settings.APP_ENV}


async def _check_mongodb():
    from app.database.mongodb import ping_database

    ok = await ping_database()
    return ("healthy" if ok else "down"), ("MongoDB ping thành công." if ok else "MongoDB không phản hồi."), {}


async def _check_mongodb_indexes():
    from app.database.mongodb import is_indexes_ready

    ok = bool(is_indexes_ready())
    return ("healthy" if ok else "degraded"), ("MongoDB indexes đã sẵn sàng." if ok else "MongoDB indexes chưa sẵn sàng."), {}


async def _check_chromadb():
    from app.services.rag_service import init_chroma_client

    client = init_chroma_client()
    collections = client.list_collections()
    return "healthy", "Vector database có thể truy cập.", {"collection_count": len(collections)}


async def _check_provider(name: str):
    from app.services.llm_service import is_gemini_available, is_groq_available

    ok = is_gemini_available() if name == "gemini" else is_groq_available()
    return ("healthy" if ok else "unknown"), ("Provider đã cấu hình." if ok else "Provider chưa cấu hình hoặc chưa thể kiểm tra live."), {"live_ping": False}


async def _check_embedding():
    from app.services.llm_service import is_gemini_available

    if is_gemini_available():
        return "healthy", "Embedding có thể dùng Gemini hoặc fallback local.", {"provider": "gemini_or_local"}
    return "degraded", "Embedding sẽ dùng fallback local hash.", {"provider": "local_fallback"}


async def _check_web_search():
    enabled = await is_feature_enabled("enable_web_search")
    return ("healthy" if enabled else "unknown"), ("Web search đang bật." if enabled else "Web search đang tắt hoặc chưa có provider riêng."), {"feature_flag": enabled}


async def _check_document_processing():
    db = get_database()
    busy = await db["documents"].count_documents({"status": {"$in": ["extracting", "indexing", "transcribing"]}})
    failed = await db["documents"].count_documents({"status": {"$in": ["failed", "index_failed"]}})
    status = "healthy"
    if failed > 0:
        status = "degraded"
    return status, "Theo dõi trạng thái xử lý học liệu từ collection documents.", {"busy": busy, "failed": failed}


async def _check_background_jobs():
    return "unknown", "Project chưa có queue/background worker registry tập trung.", {"queue_supported": False}


async def _check_storage():
    path = Path(__file__).resolve().parents[2] / "uploads"
    path.mkdir(parents=True, exist_ok=True)
    usage = shutil.disk_usage(path)
    free_ratio = usage.free / usage.total if usage.total else 0
    status: HealthStatus = "healthy" if free_ratio >= 0.1 else "degraded"
    return status, "Storage uploads có thể truy cập.", {"free_mb": round(usage.free / 1024 / 1024, 2), "free_ratio": round(free_ratio, 4)}


async def get_system_health(*, include_history: bool = True, database: Any = None) -> SystemHealthResponse:
    db = database or get_database()
    checks = [
        ("fastapi_backend", _check_fastapi),
        ("mongodb", _check_mongodb),
        ("mongodb_indexes", _check_mongodb_indexes),
        ("chromadb", _check_chromadb),
        ("gemini", lambda: _check_provider("gemini")),
        ("groq", lambda: _check_provider("groq")),
        ("embedding_service", _check_embedding),
        ("web_search", _check_web_search),
        ("document_processing", _check_document_processing),
        ("background_jobs", _check_background_jobs),
        ("storage", _check_storage),
        ("frontend_api_connectivity", _check_fastapi),
    ]
    components = await asyncio.gather(*[_timed_component(name, check) for name, check in checks])
    services = {component.name: component.status for component in components}

    if any(component.status == "down" for component in components):
        overall: HealthStatus = "down"
    elif any(component.status == "degraded" for component in components):
        overall = "degraded"
    else:
        overall = "healthy"

    alerts: list[HealthAlert] = [
        HealthAlert(
            severity="critical" if component.status == "down" else "warning",
            message=f"{component.name}: {component.message}",
            component=component.name,
        )
        for component in components
        if component.status in {"down", "degraded"}
    ]

    provider_quota_errors = await db["ai_usage_events"].count_documents({
        "created_at": {"$gte": now_utc() - timedelta(hours=24)},
        "error_code": {"$in": ["429_EXHAUSTED", "RESOURCE_EXHAUSTED", "AI_QUOTA_EXCEEDED"]},
    })
    if provider_quota_errors:
        alerts.append(HealthAlert(severity="warning", message="Có lỗi quota provider/AI trong 24 giờ qua.", component="ai_provider", value=provider_quota_errors))

    snapshot = {
        "checked_at": now_utc(),
        "status": overall,
        "components": [component.model_dump() for component in components],
    }
    try:
        await db[HEALTH_HISTORY_COLLECTION].insert_one(snapshot)
    except Exception:
        pass

    history: list[HealthComponent] = []
    if include_history:
        docs = await db[HEALTH_HISTORY_COLLECTION].find({}).sort("checked_at", -1).limit(25).to_list(25)
        for doc in docs:
            history.append(HealthComponent(
                name="system",
                status=doc.get("status", "unknown"),
                checked_at=doc.get("checked_at") or now_utc(),
                latency_ms=None,
                message="Snapshot health tổng thể.",
                details={"component_count": len(doc.get("components") or [])},
            ))

    return SystemHealthResponse(
        status=overall,
        services=services,
        components=components,
        history=history,
        alerts=alerts,
        project_name=settings.PROJECT_NAME,
        api_v1_path=settings.API_V1_STR,
        generated_at=now_utc(),
    )


def _percentile(values: list[int], percentile: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * percentile))))
    return float(ordered[index])


def _error_item(doc: dict[str, Any], occurrence_count: int = 1) -> ErrorLogItem:
    return ErrorLogItem(
        error_id=str(doc.get("error_id") or doc.get("_id") or ""),
        timestamp=doc.get("timestamp") or doc.get("created_at") or now_utc(),
        service=str(doc.get("service") or "fastapi"),
        endpoint=str(doc.get("endpoint") or doc.get("operation_type") or "unknown"),
        method=str(doc.get("method") or "UNKNOWN"),
        status_code=int(doc.get("status_code") or 500),
        error_code=str(doc.get("error_code") or "UNKNOWN"),
        message_safe=str(doc.get("message_safe") or "Yêu cầu gặp lỗi."),
        request_id=doc.get("request_id") or doc.get("logical_request_id"),
        user_id=doc.get("user_id"),
        duration_ms=int(doc.get("duration_ms") or doc.get("latency_ms") or 0),
        severity=str(doc.get("severity") or "critical"),
        occurrence_count=occurrence_count,
    )


async def get_error_monitoring(
    *,
    from_date: datetime,
    to_date: datetime,
    search: Optional[str] = None,
    severity: Optional[str] = None,
    service: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    database: Any = None,
) -> ErrorMonitoringResponse:
    db = database or get_database()
    query: dict[str, Any] = {"timestamp": {"$gte": from_date, "$lte": to_date}}
    if severity:
        query["severity"] = severity
    if service:
        query["service"] = service
    if search:
        query["$or"] = [
            {"endpoint": {"$regex": search, "$options": "i"}},
            {"error_code": {"$regex": search, "$options": "i"}},
            {"message_safe": {"$regex": search, "$options": "i"}},
            {"request_id": {"$regex": search, "$options": "i"}},
        ]

    total = await db[ERROR_LOG_COLLECTION].count_documents(query)
    skip = (page - 1) * page_size
    docs = await db[ERROR_LOG_COLLECTION].find(query).sort("timestamp", -1).skip(skip).limit(page_size).to_list(page_size)
    all_docs = await db[ERROR_LOG_COLLECTION].find(query, {"duration_ms": 1, "severity": 1, "endpoint": 1, "error_code": 1, "status_code": 1}).to_list(None)

    by_severity: dict[str, int] = {}
    endpoint_counts: dict[str, int] = {}
    timeout_count = 0
    durations: list[int] = []
    for doc in all_docs:
        sev = str(doc.get("severity") or "unknown")
        by_severity[sev] = by_severity.get(sev, 0) + 1
        endpoint = str(doc.get("endpoint") or "unknown")
        endpoint_counts[endpoint] = endpoint_counts.get(endpoint, 0) + 1
        if doc.get("error_code") == "TIMEOUT" or doc.get("status_code") == 504:
            timeout_count += 1
        if isinstance(doc.get("duration_ms"), int):
            durations.append(doc["duration_ms"])

    successful_ai_requests = await db["ai_usage_events"].count_documents({
        "created_at": {"$gte": from_date, "$lte": to_date},
        "status": {"$in": ["success", "completed"]},
    })
    observed_requests = total + successful_ai_requests
    error_rate = (total / observed_requests * 100) if observed_requests else None

    ai_pipeline = [
        {"$match": {"created_at": {"$gte": from_date, "$lte": to_date}, "status": "failure"}},
        {"$group": {"_id": {"model": {"$ifNull": ["$model", "$model_name"]}, "provider": "$provider"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_ai_models = [
        {"model": (row.get("_id") or {}).get("model") or "unknown", "provider": (row.get("_id") or {}).get("provider") or "unknown", "count": row.get("count", 0)}
        for row in await db["ai_usage_events"].aggregate(ai_pipeline).to_list(10)
    ]

    warnings: list[HealthAlert] = []
    if total >= 20:
        warnings.append(HealthAlert(severity="warning", message="Số lỗi trong khoảng thời gian đang cao.", value=total, threshold=20))
    if by_severity.get("critical", 0) > 0:
        warnings.append(HealthAlert(severity="critical", message="Có lỗi critical cần kiểm tra.", value=by_severity["critical"]))
    recent_start = to_date - timedelta(hours=1)
    prev_start = to_date - timedelta(hours=2)
    recent = await db[ERROR_LOG_COLLECTION].count_documents({"timestamp": {"$gte": recent_start, "$lte": to_date}})
    previous = await db[ERROR_LOG_COLLECTION].count_documents({"timestamp": {"$gte": prev_start, "$lt": recent_start}})
    if recent >= 5 and recent >= max(2 * previous, 5):
        warnings.append(HealthAlert(severity="warning", message="Lỗi tăng đột biến trong 1 giờ gần nhất.", value=recent, threshold=max(previous, 1)))

    summary = ErrorMonitoringSummary(
        total_errors=total,
        by_severity=by_severity,
        top_endpoints=[
            {"endpoint": key, "count": count}
            for key, count in sorted(endpoint_counts.items(), key=lambda item: item[1], reverse=True)[:10]
        ],
        top_ai_models=top_ai_models,
        timeout_count=timeout_count,
        error_rate=error_rate,
        latency={
            "p50_ms": _percentile(durations, 0.50),
            "p95_ms": _percentile(durations, 0.95),
            "p99_ms": _percentile(durations, 0.99),
        },
        warnings=warnings,
    )
    return ErrorMonitoringResponse(
        summary=summary,
        items=[_error_item(doc) for doc in docs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
        generated_at=now_utc(),
    )
