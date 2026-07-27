from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

AdminAuditAction = Literal[
    "user_created",
    "user_updated",
    "user_locked",
    "user_unlocked",
    "user_soft_deleted",
    "user_restored",
    "user_role_changed",
    "user_quota_changed",
    "user_force_logout",
    "password_reset_requested",
    "document_deleted",
    "document_reprocessed",
    "document_quarantined",
    "document_unquarantined",
    "document_restored",
    "question_updated",
    "question_deleted",
    "question_restored",
    "system_setting_updated",
    "feature_flag_updated",
    "website_content_updated",
    "website_content_published",
    "notification_created",
    "notification_updated",
    "notification_published",
    "notification_cancelled",
    "report_exported",
]

AdminAuditResult = Literal["success", "failure"]


class AdminAuditLogCreate(BaseModel):
    admin_user_id: str
    admin_email_snapshot: str
    action: AdminAuditAction
    target_type: str = Field(..., min_length=1, max_length=80)
    target_id: str = Field(..., min_length=1, max_length=120)
    timestamp: Optional[datetime] = None
    reason: Optional[str] = Field(default=None, max_length=500)
    before: Optional[dict[str, Any]] = None
    after: Optional[dict[str, Any]] = None
    changed_fields: list[str] = Field(default_factory=list)
    request_id: Optional[str] = Field(default=None, max_length=120)
    result: AdminAuditResult = "success"
    error_code: Optional[str] = Field(default=None, max_length=80)
    ip_hash: Optional[str] = None
    user_agent_summary: Optional[str] = None


class AdminAuditLogItem(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "id": "60c72b2f9b1d8b234a5c9e2b",
            "admin_user_id": "60c72b2f9b1d8b234a5c9e2a",
            "admin_email_snapshot": "admin@example.com",
            "action": "user_locked",
            "target_type": "user",
            "target_id": "60c72b2f9b1d8b234a5c9e2c",
            "timestamp": "2026-07-26T03:20:00Z",
            "reason": "Vi phạm điều khoản",
            "before": {"status": "active"},
            "after": {"status": "locked"},
            "changed_fields": ["is_active", "status"],
            "request_id": "req-123",
            "result": "success",
            "error_code": None,
            "ip_hash": "a1b2c3d4e5f60718",
            "user_agent_summary": "Chrome on macOS",
        }
    })

    id: str
    admin_user_id: str
    admin_email_snapshot: str
    action: str
    target_type: str
    target_id: str
    timestamp: datetime
    reason: Optional[str] = None
    before: Optional[dict[str, Any]] = None
    after: Optional[dict[str, Any]] = None
    changed_fields: list[str] = Field(default_factory=list)
    request_id: Optional[str] = None
    result: str
    error_code: Optional[str] = None
    ip_hash: Optional[str] = None
    user_agent_summary: Optional[str] = None


class AdminAuditLogListResponse(BaseModel):
    items: list[AdminAuditLogItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime


class AdminAuditLogStatisticsResponse(BaseModel):
    total: int
    success_count: int
    failure_count: int
    by_action: dict[str, int]
    by_target_type: dict[str, int]
    generated_at: datetime
