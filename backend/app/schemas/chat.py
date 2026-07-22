from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, Field
from app.schemas.feedback import FeedbackResponse


class ChatAskRequest(BaseModel):
    document_id: str
    question: str = Field(..., min_length=1, max_length=2000)


class SourceChunk(BaseModel):
    chunk_index: Optional[int] = None
    text: str
    distance: Optional[float] = None
    text_preview: Optional[str] = None


class ChatMessageResponse(BaseModel):
    id: str
    document_id: str
    question: str
    answer: str
    source_chunks: List[SourceChunk]
    created_at: datetime


class AdvancedChatAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None
    document_ids: Optional[List[str]] = Field(default_factory=list)
    scope: Literal["general", "document", "multiple_documents", "all_documents", "web_only"] = "general"
    use_web_search: bool = True
    response_style: Literal["concise", "normal", "detailed", "beginner"] = "normal"
    request_id: Optional[str] = None


class WebCitation(BaseModel):
    title: str
    url: str
    publisher: Optional[str] = None
    published_date: Optional[str] = None
    accessed_at: Optional[str] = None
    supporting_excerpt: Optional[str] = None
    relevance_score: Optional[float] = None
    source_id: Optional[str] = None


class SourceChunkResponse(BaseModel):
    document_id: str
    document_title: str
    page_number: Optional[int] = None
    section: Optional[str] = None
    heading: Optional[str] = None
    chunk_id: str
    excerpt: str
    relevance_score: Optional[float] = None
    source_id: Optional[str] = None


class AdvancedChatResponse(BaseModel):
    answer: str
    short_answer: Optional[str] = None
    explanation: Optional[str] = None
    key_points: Optional[List[str]] = None
    examples: Optional[List[str]] = None
    internal_citations: List[SourceChunkResponse]
    web_citations: List[WebCitation]
    retrieval_mode: Literal["internal_only", "web_only", "hybrid", "model_knowledge", "clarification_required"]
    evidence_status: Literal["well_supported", "partially_supported", "insufficient_evidence", "conflicting_sources", "unverified"]
    confidence: float
    external_search_status: str
    conversation_id: str
    message_id: str
    model_name: str
    follow_up_suggestions: List[str]


import re
from pydantic import field_validator, model_validator

class ConversationResponse(BaseModel):
    id: str
    title: str
    scope: str
    document_ids: List[str]
    created_at: datetime
    updated_at: datetime
    is_pinned: Optional[bool] = False
    pinned_at: Optional[datetime] = None


class ConversationListResponse(BaseModel):
    conversations: List[ConversationResponse]
    next_cursor: Optional[str] = None
    has_more: bool = False


class ConversationUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    is_pinned: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Tiêu đề không được trống hoặc chỉ chứa khoảng trắng.")
        # Check control characters
        if re.search(r"[\x00-\x1f\x7f-\x9f]", v):
            raise ValueError("Tiêu đề không được chứa ký tự điều khiển.")
        return v

    @model_validator(mode="after")
    def validate_not_empty(self) -> "ConversationUpdateRequest":
        fields = self.model_fields_set
        if not fields:
            raise ValueError("Payload không được rỗng.")
        if all(getattr(self, f) is None for f in fields):
            raise ValueError("Cần ít nhất một trường thông tin hợp lệ để cập nhật.")
        return self


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    retrieval_mode: Optional[str] = None
    evidence_status: Optional[str] = None
    confidence: Optional[float] = None
    internal_citations: Optional[List[SourceChunkResponse]] = None
    web_citations: Optional[List[WebCitation]] = None
    status: str
    created_at: datetime
    user_feedback: Optional[FeedbackResponse] = None


class ConversationMessagesListResponse(BaseModel):
    messages: List[MessageResponse]
    next_cursor: Optional[str] = None
    has_more: bool = False


