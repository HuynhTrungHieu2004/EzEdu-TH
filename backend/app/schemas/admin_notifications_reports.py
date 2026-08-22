from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


NotificationType = Literal[
    "system",
    "maintenance_banner",
    "new_feature",
    "quota_warning",
    "private",
]
NotificationAudienceType = Literal["all", "roles", "users"]
NotificationPriority = Literal["low", "normal", "high", "urgent"]
NotificationStatus = Literal["draft", "scheduled", "published", "expired", "cancelled"]


class NotificationBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    content: str = Field(..., min_length=1, max_length=4000)
    type: NotificationType = "system"
    audience_type: NotificationAudienceType = "all"
    target_roles: list[str] = Field(default_factory=list, max_length=20)
    target_user_ids: list[str] = Field(default_factory=list, max_length=1000)
    priority: NotificationPriority = "normal"
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    @field_validator("target_roles", "target_user_ids")
    @classmethod
    def clean_list(cls, value: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for item in value:
            cleaned = str(item).strip()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                result.append(cleaned)
        return result


class NotificationCreateRequest(NotificationBase):
    status: Literal["draft", "scheduled", "published"] = "draft"
    reason: Optional[str] = Field(default=None, max_length=500)


class NotificationUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=160)
    content: Optional[str] = Field(default=None, min_length=1, max_length=4000)
    type: Optional[NotificationType] = None
    audience_type: Optional[NotificationAudienceType] = None
    target_roles: Optional[list[str]] = Field(default=None, max_length=20)
    target_user_ids: Optional[list[str]] = Field(default=None, max_length=1000)
    priority: Optional[NotificationPriority] = None
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


class NotificationReasonRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class NotificationItem(BaseModel):
    id: str
    title: str
    content: str
    type: NotificationType
    audience_type: NotificationAudienceType
    target_roles: list[str] = Field(default_factory=list)
    target_user_ids: list[str] = Field(default_factory=list)
    priority: NotificationPriority
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    status: NotificationStatus
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    read_count: int = 0
    unread_count: int = 0
    audience_count: int = 0


class NotificationListResponse(BaseModel):
    items: list[NotificationItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime


class NotificationStatisticsResponse(BaseModel):
    total: int
    draft: int
    scheduled: int
    published: int
    expired: int
    cancelled: int
    unread_total: int
    generated_at: datetime


class UserNotificationItem(BaseModel):
    id: str
    title: str
    content: str
    type: NotificationType
    priority: NotificationPriority
    created_at: datetime
    is_read: bool = False


ReportType = Literal[
    "users",
    "activity_logs",
    "admin_audit_logs",
    "documents",
    "questions",
    "ai_usage",
    "quota",
    "system_errors",
    "ai_quality",
]
ReportFormat = Literal["csv", "xlsx", "pdf"]


class ReportTypeItem(BaseModel):
    key: ReportType
    label: str
    description: str
    formats: list[ReportFormat]


class ReportTypesResponse(BaseModel):
    items: list[ReportTypeItem]
    max_limit: int
    generated_at: datetime


class ReportExportQuery(BaseModel):
    report_type: ReportType
    format: ReportFormat = "csv"
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    limit: int = Field(default=1000, ge=1, le=5000)
    search: Optional[str] = Field(default=None, max_length=120)
    role: Optional[str] = Field(default=None, max_length=40)
    status: Optional[str] = Field(default=None, max_length=60)
    user_id: Optional[str] = Field(default=None, max_length=80)
    provider: Optional[str] = Field(default=None, max_length=60)
    model: Optional[str] = Field(default=None, max_length=120)
    feature: Optional[str] = Field(default=None, max_length=80)
    severity: Optional[str] = Field(default=None, max_length=40)
    category: Optional[str] = Field(default=None, max_length=80)
    action: Optional[str] = Field(default=None, max_length=100)
    target_type: Optional[str] = Field(default=None, max_length=80)
