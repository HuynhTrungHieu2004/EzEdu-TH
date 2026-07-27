from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

SortOrder = Literal["asc", "desc"]
AIUsageStatus = Literal["success", "failure"]


class AIUsageFilters(BaseModel):
    from_date: datetime
    to_date: datetime
    user_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    feature: Optional[str] = None
    status: Optional[AIUsageStatus] = None


class AIUsageEventItem(BaseModel):
    id: str
    user_id: str
    user_email: Optional[str] = None
    feature: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost: Optional[float] = None
    currency: str = "USD"
    latency_ms: int = 0
    status: AIUsageStatus
    error_code: Optional[str] = None
    request_id: Optional[str] = None
    document_id: Optional[str] = None
    conversation_id: Optional[str] = None
    created_at: datetime


class AIAggregateRow(BaseModel):
    key: str
    label: Optional[str] = None
    request_count: int
    total_tokens: int = 0
    estimated_cost: float = 0
    avg_latency_ms: Optional[float] = None


class AIUsageSummary(BaseModel):
    total_requests: int = 0
    success_requests: int = 0
    failed_requests: int = 0
    total_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost: float = 0
    currency: str = "USD"
    avg_latency_ms: Optional[float] = None
    p50_latency_ms: Optional[float] = None
    p95_latency_ms: Optional[float] = None
    p99_latency_ms: Optional[float] = None


class AIUsageWarning(BaseModel):
    type: str
    severity: Literal["info", "warning", "critical"] = "warning"
    message: str
    value: Optional[float] = None
    threshold: Optional[float] = None


class AIUsageDashboardResponse(BaseModel):
    summary: AIUsageSummary
    top_users: list[AIAggregateRow] = Field(default_factory=list)
    top_models: list[AIAggregateRow] = Field(default_factory=list)
    top_features: list[AIAggregateRow] = Field(default_factory=list)
    warnings: list[AIUsageWarning] = Field(default_factory=list)
    items: list[AIUsageEventItem] = Field(default_factory=list)
    total: int = 0
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime


class AIQuotaView(BaseModel):
    user_id: str
    role: str
    default_quota: dict[str, int]
    override_quota: dict[str, Any] = Field(default_factory=dict)
    effective_quota: dict[str, int]
    usage: dict[str, int]
    generated_at: datetime


class AIQuotaUpdateRequest(BaseModel):
    current_quota: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(..., min_length=1, max_length=500)


class AIQuotaResetRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class RoleQuotaUpdateRequest(BaseModel):
    overrides: dict[str, int] = Field(default_factory=dict)
    reason: str = Field(..., min_length=1, max_length=500)


class AIQuotaMutationResponse(BaseModel):
    quota: AIQuotaView
    audit_event: dict[str, Any]


class AIQuotaHistoryItem(BaseModel):
    id: str
    admin_user_id: str
    admin_email_snapshot: str
    reason: Optional[str] = None
    before: Optional[dict[str, Any]] = None
    after: Optional[dict[str, Any]] = None
    changed_fields: list[str] = Field(default_factory=list)
    timestamp: datetime


class AIQuotaHistoryResponse(BaseModel):
    items: list[AIQuotaHistoryItem]
    total: int
    generated_at: datetime


class AIModelPricingItem(BaseModel):
    provider: str
    model: str
    input_per_1m: float
    output_per_1m: float
    currency: str = "USD"


class AIModelPricingResponse(BaseModel):
    items: list[AIModelPricingItem]
    generated_at: datetime
