"""Kho tri thức chuẩn — source registry: mỗi bản ghi là một nguồn tri thức
đã qua duyệt (từ "Khám phá kiến thức Internet" Giai đoạn 6, hoặc nhập tay),
được nạp (ingest) thành chunk có gắn nhãn môn/lớp/chủ đề để tìm kiếm dùng
chung toàn nền tảng — khác `document_chunks` (chỉ tìm trong tài liệu của
riêng 1 người dùng).
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.chat import WebCitation

# Đặt tên riêng — KHÔNG trùng `WebKnowledgeSourceStatus`/`QuestionBankStatus`
# dù hình dạng giống nhau (draft→reviewing→approved→published→archived) —
# đúng quy ước đã áp dụng xuyên suốt dự án cho mỗi state machine.
CurriculumReviewStatus = Literal["draft", "reviewing", "approved", "published", "archived"]

_REVIEW_TRANSITIONS: Dict[str, set] = {
    "draft": {"reviewing"},
    "reviewing": {"draft", "approved"},
    "approved": {"draft", "published"},
    "published": {"archived"},
    "archived": set(),
}


def is_valid_review_transition(current: str, target: str) -> bool:
    return target in _REVIEW_TRANSITIONS.get(current, set())


# Cùng 3 giá trị với `QuestionBankResponse.quality_status` (exam_bank) — tái
# sử dụng đúng vốn từ đã có, không phát minh thang đánh giá thứ 2.
CurriculumQualityStatus = Literal["unreviewed", "flagged", "verified"]

CurriculumIngestStatus = Literal["not_ingested", "pending", "ingested", "failed"]

CurriculumOriginType = Literal["web_knowledge", "web_crawl", "manual", "catalog"]


class CurriculumSourceCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=300)
    content_text: str = Field(..., min_length=10, max_length=20000)
    subject_id: str
    grade: Optional[int] = Field(None, ge=1, le=12)
    topic_id: Optional[str] = None
    curriculum_version: Optional[str] = None
    citations: List[WebCitation] = Field(default_factory=list)


class CurriculumSourceReviewRequest(BaseModel):
    version: int = Field(ge=1)
    target_status: CurriculumReviewStatus


class CurriculumSourceResponse(BaseModel):
    id: str
    title: str
    content_text: str
    subject_id: str
    grade: Optional[int] = None
    topic_id: Optional[str] = None
    curriculum_version: Optional[str] = None
    citations: List[WebCitation] = Field(default_factory=list)
    origin_type: CurriculumOriginType
    origin_id: Optional[str] = None
    review_status: CurriculumReviewStatus
    quality_status: CurriculumQualityStatus
    ingest_status: CurriculumIngestStatus
    chunk_count: int = 0
    ingest_error: Optional[str] = None
    version: int
    owner_id: str
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    dataset_key: Optional[str] = None
    manifest_version: Optional[int] = None
    source_key: Optional[str] = None
    source_checksum: Optional[str] = None
    source_language: Optional[Literal["vi", "en"]] = None
    canonical_url: Optional[str] = None
    license_id: Optional[str] = None
    license_url: Optional[str] = None
    attribution: Optional[str] = None
    upstream_revision: Optional[str] = None
    noncommercial_only: bool = False
    demo_disposal_required: bool = False


class CurriculumSourceListResponse(BaseModel):
    items: List[CurriculumSourceResponse]
    total: int


class CurriculumSearchResultItem(BaseModel):
    source_id: str
    title: str
    chunk_text: str
    subject_id: str
    grade: Optional[int] = None
    topic_id: Optional[str] = None
    citations: List[WebCitation] = Field(default_factory=list)
    relevance_score: float


class CurriculumSearchResponse(BaseModel):
    query: str
    results: List[CurriculumSearchResultItem]
