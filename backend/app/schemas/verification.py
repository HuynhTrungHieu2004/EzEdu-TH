from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


IssueType = Literal[
    "ocr_error",
    "factual_error",
    "suspicious_number",
    "terminology_error",
    "internal_contradiction",
    "incomplete_content",
]
IssueSeverity = Literal["low", "medium", "high", "critical"]
ResolutionAction = Literal["accepted", "rejected", "edited"]
SessionStatus = Literal["pending", "processing", "completed", "partially_completed", "failed"]


class VerificationIssue(BaseModel):
    """A single issue found during content verification."""

    chunk_index: int = Field(..., ge=0)
    issue_type: IssueType
    severity: IssueSeverity = "medium"
    original_text: str = Field(..., min_length=1, max_length=12_000)
    suggested_fix: str = Field(..., min_length=1, max_length=12_000)
    reason: str = Field(..., min_length=1, max_length=8_000)
    confidence: float = Field(..., ge=0.0, le=1.0)
    source_reference: Optional[str] = Field(None, max_length=2_048)
    external_verified: bool = False
    ai_provider: Literal["claude", "gemini", "groq", "both", "unknown"] = "unknown"


class VerificationSessionResponse(BaseModel):
    session_id: str
    document_id: str
    status: SessionStatus
    total_chunks: int = 0
    total_chunks_processed: int = 0
    total_issues_found: int = 0
    issues_accepted: int = 0
    issues_rejected: int = 0
    issues_pending: int = 0
    successful_chunks: int = 0
    failed_chunks: int = 0
    ai_model: Optional[str] = None
    summary: Optional[str] = None
    severity_stats: Optional[dict] = None
    error_message: Optional[str] = None
    is_stale: bool = False
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class VerificationIssueResponse(BaseModel):
    id: str
    session_id: str
    document_id: str
    chunk_index: int
    issue_type: str
    severity: str
    original_text: str
    suggested_fix: str
    reason: str
    confidence: float
    source_reference: Optional[str] = None
    external_verified: bool = False
    ai_provider: str
    resolution: str = "pending"
    user_edited_text: Optional[str] = None
    resolved_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None
    created_at: datetime


class IssueResolution(BaseModel):
    """A single resolve action for one issue."""

    issue_id: str = Field(..., pattern=r"^[0-9a-fA-F]{24}$")
    action: ResolutionAction
    edited_text: Optional[str] = Field(None, max_length=12_000)

    @model_validator(mode="after")
    def validate_edited_text(self):
        if self.action == "edited":
            normalized = (self.edited_text or "").strip()
            if not normalized:
                raise ValueError("edited_text không được để trống khi action là edited.")
            self.edited_text = normalized
        else:
            self.edited_text = None
        return self


class ResolveRequest(BaseModel):
    """Batch resolve request."""

    resolutions: List[IssueResolution] = Field(..., min_length=1)
    session_id: Optional[str] = Field(None, pattern=r"^[0-9a-fA-F]{24}$")

    @model_validator(mode="after")
    def ensure_unique_issue_ids(self):
        issue_ids = [resolution.issue_id for resolution in self.resolutions]
        if len(issue_ids) != len(set(issue_ids)):
            raise ValueError("Mỗi issue_id chỉ được xuất hiện một lần.")
        return self


class VerifyTriggerResponse(BaseModel):
    session_id: str
    status: str
    message: str


class ResolveResponse(BaseModel):
    resolved_count: int
    message: str


class ApplyRequest(BaseModel):
    """Optional optimistic-concurrency guard for cross-tab safety."""

    session_id: Optional[str] = Field(None, pattern=r"^[0-9a-fA-F]{24}$")


class ApplyResponse(BaseModel):
    applied_count: int
    reindexed: bool
    message: str
