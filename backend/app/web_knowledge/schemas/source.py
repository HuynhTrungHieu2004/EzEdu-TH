"""Khám phá kiến thức Internet có kiểm chứng (Gemini Grounding with Google
Search) — KHÔNG scrape HTML kết quả Google, chỉ dùng tool `google_search` có
sẵn của Gemini (xem `app/services/learning_chat_service.py`, đã dùng thật từ
trước — phân hệ này mở rộng/đóng gói lại thành tính năng riêng, không viết
lại cơ chế gọi Gemini).
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.chat import WebCitation

# Đặt tên riêng, KHÔNG trùng `QuestionBankStatus`/`ExamStatus` — mỗi state
# machine trong dự án cố ý đặt tên riêng dù hình dạng giống nhau, tránh nhầm
# hai khái niệm nghiệp vụ khác nhau (xem ghi chú ở exam_bank/schemas/question.py).
WebKnowledgeSourceStatus = Literal["draft", "reviewing", "approved", "published", "archived"]

_SOURCE_TRANSITIONS: Dict[WebKnowledgeSourceStatus, set] = {
    "draft": {"reviewing"},
    "reviewing": {"draft", "approved"},
    "approved": {"draft", "published"},
    "published": {"archived"},
    "archived": set(),
}


def is_valid_source_transition(current: WebKnowledgeSourceStatus, target: WebKnowledgeSourceStatus) -> bool:
    return target in _SOURCE_TRANSITIONS.get(current, set())


class ExploreRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=500)


class ExploreResponse(BaseModel):
    query: str
    answer: str
    citations: List[WebCitation]
    evidence_status: Literal[
        "well_supported", "partially_supported", "insufficient_evidence", "conflicting_sources", "unverified"
    ]
    confidence: float
    from_cache: bool
    generated_at: datetime


class SaveSourceRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=500)
    answer: str = Field(..., min_length=1, max_length=8000)
    citations: List[WebCitation] = Field(default_factory=list)
    subject_id: Optional[str] = None
    grade: Optional[int] = Field(None, ge=1, le=12)
    topic_id: Optional[str] = None


class SourceReviewRequest(BaseModel):
    version: int = Field(ge=1)
    target_status: WebKnowledgeSourceStatus


class SourceResponse(BaseModel):
    id: str
    query: str
    answer: str
    citations: List[WebCitation]
    subject_id: Optional[str] = None
    grade: Optional[int] = None
    topic_id: Optional[str] = None
    status: WebKnowledgeSourceStatus
    version: int
    owner_id: str
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime


class SourceListResponse(BaseModel):
    items: List[SourceResponse]
    total: int
