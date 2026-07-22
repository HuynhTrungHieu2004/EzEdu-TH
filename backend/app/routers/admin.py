"""Admin dashboard router — all endpoints require require_admin."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.routers.auth import require_admin
from app.schemas.auth import UserResponse
from app.services import analytics_service
from app.services.evaluation_report_service import load_evaluation_report
from app.core.config import settings

logger = logging.getLogger("app.admin")
router = APIRouter()

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

# ─────────────────────────── Endpoints ────────────────────────────────────

@router.get("/overview")
async def admin_overview(
    from_date: Optional[str] = Query(None, description="ISO 8601 start date"),
    to_date: Optional[str] = Query(None, description="ISO 8601 end date"),
    timezone: str = Query("UTC", description="IANA timezone, e.g. Asia/Ho_Chi_Minh"),
    current_user: UserResponse = Depends(require_admin),
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
    current_user: UserResponse = Depends(require_admin),
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
    current_user: UserResponse = Depends(require_admin),
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
    current_user: UserResponse = Depends(require_admin),
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
    current_user: UserResponse = Depends(require_admin),
):
    _check_rate_limit(current_user.id)
    return await load_evaluation_report()
