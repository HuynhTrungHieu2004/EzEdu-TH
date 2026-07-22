"""Evaluation report service: reads the offline benchmark report from server-side path.

Security: path is loaded from server config only, never from client input.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger("app.evaluation_report")

# Allowlist of top-level summary keys that are safe to return to admin clients.
# Raw test cases, fixture prompts, and secrets are excluded.
_SUMMARY_ALLOWLIST = {
    "passed", "total_cases", "passed_cases", "failed_cases_count",
    "live_mode", "llm_model", "embedding_model",
    "dataset_version", "fixtures_version",
    "categories", "timestamp", "commit_hash",
}

# How old a report can be before it is flagged as stale (7 days)
_STALE_THRESHOLD_DAYS = 7


def _get_report_path() -> Path:
    """Resolve report path relative to project root (two levels above app/core)."""
    base = Path(__file__).resolve().parents[3]  # project root
    return base / settings.EVALUATION_REPORT_PATH


class EvaluationReportError(Exception):
    pass


async def load_evaluation_report() -> dict[str, Any]:
    """Load, validate, and sanitize the evaluation benchmark report.

    Returns a response dict with:
        - summary: allowlist-filtered fields
        - meta: source_mode (mock/live), is_stale, generated_at
        - status: "ok" | "missing" | "malformed" | "oversized" | "stale"
    """
    path = _get_report_path()

    # 1. Existence check
    if not path.exists():
        return {
            "status": "missing",
            "message": "Tệp báo cáo benchmark chưa được tạo.",
            "summary": None,
            "meta": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # 2. Size check
    size = path.stat().st_size
    if size > settings.EVALUATION_REPORT_MAX_SIZE_BYTES:
        return {
            "status": "oversized",
            "message": f"Tệp báo cáo quá lớn ({size} bytes). Tối đa {settings.EVALUATION_REPORT_MAX_SIZE_BYTES} bytes.",
            "summary": None,
            "meta": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # 3. Parse JSON
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Evaluation report malformed: %s", type(exc).__name__)
        return {
            "status": "malformed",
            "message": "Tệp báo cáo benchmark không hợp lệ (JSON lỗi định dạng).",
            "summary": None,
            "meta": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # 4. Schema validation (required fields)
    required = {"passed", "total_cases", "timestamp"}
    if not required.issubset(raw.keys()):
        return {
            "status": "malformed",
            "message": "Tệp báo cáo benchmark thiếu trường bắt buộc.",
            "summary": None,
            "meta": None,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # 5. Stale check
    try:
        report_ts = datetime.fromisoformat(str(raw["timestamp"]).replace("Z", "+00:00"))
        is_stale = (datetime.now(timezone.utc) - report_ts) > timedelta(days=_STALE_THRESHOLD_DAYS)
    except (ValueError, TypeError):
        is_stale = True
        report_ts = None

    # 6. Allowlist filter – exclude raw cases, fixture prompts, secrets
    summary = {k: v for k, v in raw.items() if k in _SUMMARY_ALLOWLIST}

    # 7. Distinguish mock vs live mode
    live_mode = bool(raw.get("live_mode", False))
    source_mode = "live" if live_mode else "mock"

    overall_status = "stale" if is_stale else "ok"

    return {
        "status": overall_status,
        "summary": summary,
        "meta": {
            "source_mode": source_mode,
            "is_stale": is_stale,
            "report_timestamp": report_ts.isoformat() if report_ts else None,
            "report_path_configured": True,  # confirm path loaded from server config
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
