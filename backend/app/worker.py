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
import logging
import signal
import uuid
from typing import Awaitable, Callable, Dict

from app.core.config import settings
from app.core.logging_config import configure_logging
from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database
from app.services.background_job_service import ensure_background_job_indexes, process_one
from app.exam_bank.services.attempt_service import GRADE_ESSAY_JOB_TYPE, grade_essay_answer_job, sweep_expired_attempts
from app.services.cloudinary_service import CLEANUP_ASSET_JOB_TYPE, cleanup_cloudinary_asset_job
from app.curriculum_kb.services.ingestion_service import INGEST_JOB_TYPE, ingest_curriculum_source_job
from app.personalization.services.knowledge_extraction_job import (
    CLUSTER_ASSIGNMENT_JOB_TYPE,
    KNOWLEDGE_EXTRACTION_JOB_TYPE,
    assign_personalization_clusters_job,
    extract_document_knowledge_job,
)
from app.exam_bank.services.study_exam_service import (
    STUDY_EXAM_JOB_TYPE,
    generate_study_exam_job,
)

logger = logging.getLogger("app.worker")

# Đăng ký handler theo job_type — giai đoạn 4 thêm chấm tự luận AI, giai đoạn
# 5 thêm xoá asset Cloudinary có retry, giai đoạn 7 thêm nạp kho tri thức chuẩn,
# giai đoạn 8 thêm trích xuất tri thức để mở đường cho mô hình người học.
HANDLERS: Dict[str, Callable[[dict], Awaitable[object]]] = {
    GRADE_ESSAY_JOB_TYPE: lambda payload: grade_essay_answer_job(get_database(), payload),
    CLEANUP_ASSET_JOB_TYPE: cleanup_cloudinary_asset_job,
    INGEST_JOB_TYPE: lambda payload: ingest_curriculum_source_job(get_database(), payload),
    KNOWLEDGE_EXTRACTION_JOB_TYPE: extract_document_knowledge_job,
    CLUSTER_ASSIGNMENT_JOB_TYPE: assign_personalization_clusters_job,
    STUDY_EXAM_JOB_TYPE: lambda payload: generate_study_exam_job(get_database(), payload),
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
                submitted = await sweep_expired_attempts(db)
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
