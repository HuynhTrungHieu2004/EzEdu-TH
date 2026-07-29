"""Hàng đợi job nền tối giản trên MongoDB — thay thế Celery/RQ/Temporal.

Quyết định kiến trúc (xem docs/feature-expansion/01-target-architecture.md):
`BackgroundTasks` hiện có (transcribe video, verify tài liệu) KHÔNG bền qua
restart và không có retry/trạng thái truy vấn được. Thay vì thêm hạ tầng
nặng (Celery cần broker riêng, Temporal cần server riêng), module này cung
cấp một job-queue đơn giản trên chính MongoDB đang dùng — đủ đáp ứng: bền
qua restart, retry có giới hạn với backoff, trạng thái truy vấn được,
dead-letter khi hết số lần thử, và idempotent theo `idempotency_key` tuỳ
chọn.

KHÔNG migrate 2 tác vụ BackgroundTasks hiện có trong phạm vi giai đoạn này
(rủi ro/lợi ích không tương xứng — xem risk register R2). Module này chỉ
dùng cho các tác vụ MỚI ở các giai đoạn sau (auto-submit sweeper, chấm tự
luận AI, ingest kho tri thức chuẩn, retry Cloudinary).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, Optional

from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger("app.services.background_job_service")

COLLECTION_NAME = "background_jobs"

JobStatus = str  # "pending" | "running" | "succeeded" | "failed" | "dead_letter"

DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BACKOFF_SECONDS = 30
DEFAULT_LOCK_SECONDS = 300  # nếu worker chết giữa chừng, job được nhận lại sau khoảng thời gian này


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_background_job_indexes(db) -> None:
    """Gọi 1 lần lúc khởi động app — idempotent."""
    collection = db[COLLECTION_NAME]
    await collection.create_index(
        [("status", ASCENDING), ("job_type", ASCENDING), ("next_run_at", ASCENDING)],
        name="status_type_next_run",
    )
    await collection.create_index(
        [("idempotency_key", ASCENDING)],
        name="idempotency_key_unique",
        unique=True,
        partialFilterExpression={"idempotency_key": {"$type": "string"}},
    )


async def enqueue(
    db,
    *,
    job_type: str,
    payload: Dict[str, Any],
    idempotency_key: Optional[str] = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    run_after: Optional[datetime] = None,
    correlation_id: Optional[str] = None,
) -> str:
    """Thêm một job vào hàng đợi. Trả về job_id (string).

    Nếu `idempotency_key` trùng một job đã tồn tại (bất kỳ trạng thái nào),
    trả về job_id đã có thay vì tạo job mới — tránh xử lý trùng cùng một
    yêu cầu logic (ví dụ: không tạo 2 job "xoá asset Cloudinary" cho cùng
    một document nếu người dùng bấm xoá 2 lần).
    """
    document = {
        "job_type": job_type,
        "payload": payload,
        "status": "pending",
        "attempts": 0,
        "max_attempts": max_attempts,
        "next_run_at": run_after or _now(),
        "locked_by": None,
        "locked_until": None,
        "result": None,
        "error": None,
        "idempotency_key": idempotency_key,
        "correlation_id": correlation_id,
        "created_at": _now(),
        "updated_at": _now(),
    }
    try:
        insert_result = await db[COLLECTION_NAME].insert_one(document)
        return str(insert_result.inserted_id)
    except DuplicateKeyError:
        existing = await db[COLLECTION_NAME].find_one({"idempotency_key": idempotency_key})
        if existing is None:  # pragma: no cover - race cực hiếm, phòng thủ
            raise
        logger.info(
            "background_job.enqueue.duplicate_idempotency_key",
            extra={"job_type": job_type, "idempotency_key": idempotency_key},
        )
        return str(existing["_id"])


async def claim_next(db, *, job_types: list[str], worker_id: str) -> Optional[Dict[str, Any]]:
    """Nhận job tiếp theo sẵn sàng chạy, khoá an toàn cho đúng 1 worker.

    Điều kiện atomic: job phải `status in {"pending","failed"}` (failed vẫn
    còn lượt retry) VÀ `next_run_at <= now` VÀ (chưa bị khoá HOẶC khoá đã hết
    hạn `locked_until` — worker cũ có thể đã chết). `find_one_and_update` là
    thao tác nguyên tử của MongoDB — hai worker gọi đồng thời không bao giờ
    cùng nhận một job (đúng yêu cầu "hai worker cùng xử lý không được tạo
    hai kết quả").
    """
    now = _now()
    result = await db[COLLECTION_NAME].find_one_and_update(
        {
            "job_type": {"$in": job_types},
            "status": {"$in": ["pending", "failed"]},
            "next_run_at": {"$lte": now},
            "$or": [{"locked_until": None}, {"locked_until": {"$lt": now}}],
        },
        {
            "$set": {
                "status": "running",
                "locked_by": worker_id,
                "locked_until": now + timedelta(seconds=DEFAULT_LOCK_SECONDS),
                "updated_at": now,
            },
            "$inc": {"attempts": 1},
        },
        sort=[("next_run_at", ASCENDING)],
        return_document=True,
    )
    return result


async def mark_succeeded(db, job_id: str, *, result: Any = None) -> None:
    from bson import ObjectId

    await db[COLLECTION_NAME].update_one(
        {"_id": ObjectId(job_id)},
        {
            "$set": {
                "status": "succeeded",
                "result": result,
                "locked_by": None,
                "locked_until": None,
                "updated_at": _now(),
            }
        },
    )


async def mark_failed(db, job_id: str, *, error: str) -> None:
    """Đánh dấu thất bại. Nếu còn lượt retry, quay về `pending` với backoff
    tăng dần theo số lần thử; hết lượt thì chuyển `dead_letter`.
    """
    from bson import ObjectId

    job = await db[COLLECTION_NAME].find_one({"_id": ObjectId(job_id)})
    if job is None:  # pragma: no cover
        return

    attempts = job.get("attempts", 1)
    max_attempts = job.get("max_attempts", DEFAULT_MAX_ATTEMPTS)
    now = _now()

    if attempts >= max_attempts:
        await db[COLLECTION_NAME].update_one(
            {"_id": ObjectId(job_id)},
            {
                "$set": {
                    "status": "dead_letter",
                    "error": error,
                    "locked_by": None,
                    "locked_until": None,
                    "updated_at": now,
                }
            },
        )
        logger.error(
            "background_job.dead_letter",
            extra={"job_id": job_id, "job_type": job.get("job_type"), "attempts": attempts, "error": error},
        )
        return

    backoff_seconds = DEFAULT_BACKOFF_SECONDS * (2 ** (attempts - 1))
    await db[COLLECTION_NAME].update_one(
        {"_id": ObjectId(job_id)},
        {
            "$set": {
                "status": "failed",
                "error": error,
                "next_run_at": now + timedelta(seconds=backoff_seconds),
                "locked_by": None,
                "locked_until": None,
                "updated_at": now,
            }
        },
    )


@dataclass(frozen=True)
class JobHandlerResult:
    result: Any = None


JobHandler = Callable[[Dict[str, Any]], Awaitable[Any]]


async def process_one(db, *, job_types: list[str], worker_id: str, handlers: Dict[str, JobHandler]) -> bool:
    """Nhận và xử lý đúng 1 job nếu có. Trả về True nếu đã xử lý (kể cả lỗi),
    False nếu hàng đợi hiện không có job nào sẵn sàng.
    """
    job = await claim_next(db, job_types=job_types, worker_id=worker_id)
    if job is None:
        return False

    job_id = str(job["_id"])
    handler = handlers.get(job["job_type"])
    if handler is None:
        await mark_failed(db, job_id, error=f"Không có handler đăng ký cho job_type='{job['job_type']}'")
        return True

    try:
        outcome = await handler(job["payload"])
        await mark_succeeded(db, job_id, result=outcome)
    except Exception as exc:  # noqa: BLE001 - job xấu không được làm chết worker
        logger.exception("background_job.handler_failed", extra={"job_id": job_id, "job_type": job["job_type"]})
        await mark_failed(db, job_id, error=str(exc))
    return True
