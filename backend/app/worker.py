"""Tiến trình worker độc lập cho hàng đợi `background_jobs`.

Chạy: `python -m app.worker` (từ thư mục `backend/`, cùng cách chạy
`uvicorn app.main:app` hiện có). KHÔNG chạy trong tiến trình FastAPI —
tách riêng để một job AI chạy lâu không chiếm event loop phục vụ HTTP request.

Đăng ký handler mới cho từng loại job ở dict `HANDLERS` bên dưới khi các
giai đoạn sau cần (auto-submit sweeper ở giai đoạn 4, ingest kho tri thức
chuẩn ở giai đoạn 7, v.v.) — file này chỉ là khung chạy, không chứa nghiệp vụ.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
import signal
import uuid
from typing import Awaitable, Callable, Dict

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database
from app.services.background_job_service import ensure_background_job_indexes, process_one

logger = logging.getLogger("app.worker")

HANDLER_SPECS = {
    "grade_essay_answer": ("app.exam_bank.services.attempt_service", "grade_essay_answer_job", True),
    "cleanup_cloudinary_asset": ("app.services.cloudinary_service", "cleanup_cloudinary_asset_job", False),
    "ingest_curriculum_source": ("app.curriculum_kb.services.ingestion_service", "ingest_curriculum_source_job", True),
    "extract_document_knowledge": ("app.personalization.services.knowledge_extraction_job", "extract_document_knowledge_job", False),
    "assign_personalization_clusters": ("app.personalization.services.knowledge_extraction_job", "assign_personalization_clusters_job", False),
    "generate_study_exam": ("app.exam_bank.services.study_exam_service", "generate_study_exam_job", True),
    "crawl_curriculum_sources": ("app.curriculum_kb.services.crawler_service", "crawl_batch_job", True),
    "student_document_classify": ("app.services.student_review_service", "classify_student_document_job", True),
    "student_review_generate": ("app.services.student_review_service", "generate_student_review_job", True),
}


async def _dispatch_handler(job_type: str, payload: dict) -> object:
    module_name, function_name, needs_db = HANDLER_SPECS[job_type]
    handler = getattr(importlib.import_module(module_name), function_name)
    return await handler(get_database(), payload) if needs_db else await handler(payload)


async def _sweep_expired_attempts(db) -> int:
    module = importlib.import_module("app.exam_bank.services.attempt_service")
    return await module.sweep_expired_attempts(db)


HANDLERS: Dict[str, Callable[[dict], Awaitable[object]]] = {
    job_type: lambda payload, job_type=job_type: _dispatch_handler(job_type, payload)
    for job_type in HANDLER_SPECS
}

POLL_INTERVAL_SECONDS = 3.0
# Lớp tự nộp bài thứ 3 (xem app/exam_bank/schemas/attempt.py): quét định kỳ
# các lượt làm bài quá giờ mà học sinh không quay lại (đóng tab hẳn).
SWEEP_INTERVAL_SECONDS = 30.0


async def run_worker(*, stop_event: asyncio.Event) -> None:
    await connect_to_mongo()
    db = get_database()
    await ensure_background_job_indexes(db)

    worker_id = f"worker-{uuid.uuid4().hex[:8]}"
    logger.info("worker.started", extra={"worker_id": worker_id})
    last_sweep = 0.0

    try:
        while not stop_event.is_set():
            loop_now = asyncio.get_event_loop().time()
            if loop_now - last_sweep >= SWEEP_INTERVAL_SECONDS:
                last_sweep = loop_now
                submitted = await _sweep_expired_attempts(db)
                if submitted:
                    logger.info("worker.sweep_expired_attempts", extra={"count": submitted})

            if not HANDLERS:
                await asyncio.wait_for(stop_event.wait(), timeout=POLL_INTERVAL_SECONDS)
                continue

            processed = await process_one(
                db, job_types=list(HANDLERS.keys()), worker_id=worker_id, handlers=HANDLERS
            )
            if not processed:
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=POLL_INTERVAL_SECONDS)
                except asyncio.TimeoutError:
                    pass
    except asyncio.TimeoutError:
        pass
    finally:
        logger.info("worker.stopping", extra={"worker_id": worker_id})
        await close_mongo_connection()


def main() -> None:
    configure_logging()
    stop_event = asyncio.Event()

    def _handle_signal(*_args: object) -> None:
        stop_event.set()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:  # pragma: no cover - Windows không hỗ trợ
            pass

    try:
        loop.run_until_complete(run_worker(stop_event=stop_event))
    finally:
        loop.close()


if __name__ == "__main__":
    main()
