from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ActivityCategory = Literal[
    "auth",
    "document",
    "question",
    "exam",
    "chat",
    "ai",
    "export",
    "profile",
    "security",
    "system",
]

ActivityStatus = Literal["success", "failure", "started", "denied"]

ActivityAction = Literal[
    "user_registered",
    "login_success",
    "login_failed",
    "logout",
    "password_changed",
    "profile_updated",
    "document_uploaded",
    "document_reused",
    "document_processing_started",
    "document_processing_completed",
    "document_processing_failed",
    "document_deleted",
    "question_generation_started",
    "question_generation_completed",
    "question_generation_failed",
    "exam_created",
    "exam_exported",
    "exam_published",
    "class_created",
    "class_updated",
    "class_deleted",
    "class_student_added",
    "class_student_removed",
    "ai_chat_started",
    "ai_chat_completed",
    "ai_chat_failed",
    "quota_exceeded",
    "permission_denied",
]


class UserActivityLogCreate(BaseModel):
    user_id: Optional[str] = None
    action: ActivityAction
    category: ActivityCategory
    resource_type: Optional[str] = Field(default=None, max_length=80)
    resource_id: Optional[str] = Field(default=None, max_length=120)
    status: ActivityStatus = "success"
    timestamp: Optional[datetime] = None
    request_id: Optional[str] = Field(default=None, max_length=120)
    metadata: dict[str, Any] = Field(default_factory=dict)
    error_code: Optional[str] = Field(default=None, max_length=80)
    duration_ms: Optional[int] = Field(default=None, ge=0)
    ip_hash: Optional[str] = None
    user_agent_summary: Optional[str] = None


class UserActivityLogItem(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "id": "60c72b2f9b1d8b234a5c9e2b",
            "user_id": "60c72b2f9b1d8b234a5c9e2a",
            "action": "login_success",
            "category": "auth",
            "resource_type": "user",
            "resource_id": "60c72b2f9b1d8b234a5c9e2a",
            "status": "success",
            "timestamp": "2026-07-26T03:20:00Z",
            "request_id": "req-123",
            "metadata": {"role": "student"},
            "error_code": None,
            "duration_ms": 18,
            "ip_hash": "a1b2c3d4e5f60718",
            "user_agent_summary": "Chrome on macOS",
        }
    })

    id: str
    user_id: Optional[str] = None
    action: str
    category: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    status: str
    timestamp: datetime
    request_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    error_code: Optional[str] = None
    duration_ms: Optional[int] = None
    ip_hash: Optional[str] = None
    user_agent_summary: Optional[str] = None


class UserActivityLogListResponse(BaseModel):
    items: list[UserActivityLogItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime
    retention_days: Optional[int] = None


class UserActivityLogStatisticsResponse(BaseModel):
    total_today: int
    success_count: int
    failure_count: int
    permission_denied_count: int
    quota_exceeded_count: int
    by_category: dict[str, int]
    by_status: dict[str, int]
    generated_at: datetime
    retention_days: Optional[int] = None
