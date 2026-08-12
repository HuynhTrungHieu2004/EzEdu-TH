"""Chạy trích xuất tri thức tự động qua hàng đợi job nền.

Vì sao cần: `process_document_knowledge_graph` là thứ duy nhất sinh ra
`learning_items` kèm `q_matrix_weights` — bản đồ nối câu hỏi với đơn vị kiến
thức. Không có bản đồ đó thì `process_learning_event` luôn thoát ở nhánh
`missing_q_matrix`, nên BKT và IRT không bao giờ chạy.

Trước đây hàm này chỉ gọi được qua một endpoint mà không giao diện nào dùng,
nên dù người dùng thao tác bao nhiêu, `learning_items` vẫn rỗng vĩnh viễn.

Chạy nền chứ không chạy trong request: bước này gọi AI trên toàn bộ nội dung
tài liệu nên chậm và có thể thất bại. Giáo viên sinh câu hỏi xong phải nhận
kết quả ngay, không việc gì phải chờ một bước bổ trợ.
"""

from __future__ import annotations

import logging
from typing import Any, Dict

from app.core.config import settings
from app.personalization.services.knowledge_extraction_service import (
    process_document_knowledge_graph,
)

logger = logging.getLogger(__name__)

KNOWLEDGE_EXTRACTION_JOB_TYPE = "extract_document_knowledge"


async def enqueue_knowledge_extraction(db, *, document_id: str, user_id: str) -> None:
    """Xếp hàng trích xuất tri thức cho một tài liệu.

    Không làm gì khi tính năng cá nhân hoá đang tắt — mặc định cả hai cờ đều
    tắt, nên hệ thống giữ nguyên hành vi cũ cho tới khi quản trị viên bật.
    """
    if not settings.PERSONALIZATION_ENABLED or not settings.KNOWLEDGE_GRAPH_ENABLED:
        return
    if not document_id or not user_id:
        return

    from app.services.background_job_service import enqueue

    await enqueue(
        db,
        job_type=KNOWLEDGE_EXTRACTION_JOB_TYPE,
        payload={"document_id": document_id, "user_id": user_id},
        # Sinh câu hỏi nhiều lần trên cùng tài liệu chỉ cần trích xuất một lần.
        idempotency_key=f"knowledge-extraction:{document_id}:{user_id}",
    )


async def extract_document_knowledge_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handler cho job `extract_document_knowledge` — gọi từ `app/worker.py`."""
    return await process_document_knowledge_graph(
        document_id=payload["document_id"],
        user_id=payload["user_id"],
    )


CLUSTER_ASSIGNMENT_JOB_TYPE = "assign_personalization_clusters"


async def assign_personalization_clusters_job(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handler cho job `assign_personalization_clusters` — gọi từ `app/worker.py`.

    Gán nhãn cụm cho mọi loại cụm. Chạy sau khi đã huấn luyện; nếu chưa có mô
    hình active nào thì từng loại tự trả `no_active_model` chứ không lỗi.
    """
    from app.personalization.services.cluster_assignment_service import assign_all_clusters

    if not settings.PERSONALIZATION_ENABLED:
        return {"status": "disabled"}
    return await assign_all_clusters()
