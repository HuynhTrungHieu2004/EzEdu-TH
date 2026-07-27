from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

SortOrder = Literal["asc", "desc"]
ContentStatus = Literal["active", "deleted", "quarantined", "all"]


class AdminOwnerSnapshot(BaseModel):
    id: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None


class AdminReasonRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class AdminDocumentSummary(BaseModel):
    id: str
    original_filename: str
    owner: AdminOwnerSnapshot
    file_type: str
    file_size: int
    uploaded_at: datetime
    processing_status: str
    page_count: Optional[int] = None
    chunk_count: int = 0
    question_count: int = 0
    knowledge_verification_status: Optional[str] = None
    latest_error: Optional[str] = None
    is_quarantined: bool = False
    deleted_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AdminDocumentDetail(AdminDocumentSummary):
    media_kind: str = "document"
    cloudinary_resource_type: Optional[str] = None
    processing_history: list[dict[str, Any]] = Field(default_factory=list)


class AdminDocumentListResponse(BaseModel):
    items: list[AdminDocumentSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime


class AdminQuestionSummary(BaseModel):
    id: str
    question_set_id: str
    question_index: int
    question_preview: str
    question_type: Optional[str] = None
    difficulty: Optional[str] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    source_document_id: Optional[str] = None
    source_document_name: Optional[str] = None
    owner: AdminOwnerSnapshot
    citation_status: Optional[str] = None
    hallucination_risk: Optional[str] = None
    moderation_status: str = "draft"
    created_at: datetime
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class AdminQuestionDetail(AdminQuestionSummary):
    question: str
    options: Optional[dict[str, str]] = None
    correct_answer: str
    explanation: str
    tags: list[str] = Field(default_factory=list)
    bloom_level: Optional[str] = None
    evidence: list[dict[str, Any]] = Field(default_factory=list)


class AdminQuestionListResponse(BaseModel):
    items: list[AdminQuestionSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime


class AdminQuestionUpdateRequest(BaseModel):
    question: Optional[str] = Field(None, min_length=1, max_length=4000)
    options: Optional[dict[str, str]] = None
    correct_answer: Optional[str] = Field(None, min_length=1, max_length=1000)
    explanation: Optional[str] = Field(None, min_length=1, max_length=8000)
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
    question_type: Optional[Literal["multiple_choice", "true_false", "short_answer"]] = None
    bloom_level: Optional[Literal["remember", "understand", "apply", "analyze"]] = None
    tags: Optional[list[str]] = None
    reason: Optional[str] = Field(default=None, max_length=500)


class AdminQuestionModerationRequest(BaseModel):
    status: Literal["draft", "review_pending", "approved", "published"] = "approved"
    reason: Optional[str] = Field(default=None, max_length=500)


class AdminExamSummary(BaseModel):
    id: str
    name: str
    owner: AdminOwnerSnapshot
    question_count: int
    created_at: datetime
    last_exported_at: Optional[datetime] = None
    status: str
    source_document_id: Optional[str] = None
    source_document_name: Optional[str] = None
    deleted_at: Optional[datetime] = None


class AdminExamListResponse(BaseModel):
    items: list[AdminExamSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime
