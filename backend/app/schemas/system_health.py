from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

HealthStatus = Literal["healthy", "degraded", "down", "unknown"]
AlertSeverity = Literal["info", "warning", "critical"]
ErrorSeverity = Literal["info", "warning", "critical"]


class HealthComponent(BaseModel):
    name: str
    status: HealthStatus
    checked_at: datetime
    latency_ms: Optional[int] = None
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class HealthAlert(BaseModel):
    severity: AlertSeverity
    message: str
    component: Optional[str] = None
    value: Optional[float] = None
    threshold: Optional[float] = None


class SystemHealthResponse(BaseModel):
    status: HealthStatus
    services: dict[str, HealthStatus]
    components: list[HealthComponent]
    history: list[HealthComponent] = Field(default_factory=list)
    alerts: list[HealthAlert] = Field(default_factory=list)
    project_name: str
    api_v1_path: str
    generated_at: datetime


class ErrorLogItem(BaseModel):
    error_id: str
    timestamp: datetime
    service: str
    endpoint: str
    method: str
    status_code: int
    error_code: str
    message_safe: str
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    duration_ms: int
    severity: ErrorSeverity
    occurrence_count: int = 1


class ErrorMonitoringSummary(BaseModel):
    total_errors: int
    by_severity: dict[str, int] = Field(default_factory=dict)
    top_endpoints: list[dict[str, Any]] = Field(default_factory=list)
    top_ai_models: list[dict[str, Any]] = Field(default_factory=list)
    timeout_count: int = 0
    error_rate: Optional[float] = None
    latency: dict[str, Optional[float]] = Field(default_factory=dict)
    warnings: list[HealthAlert] = Field(default_factory=list)


class ErrorMonitoringResponse(BaseModel):
    summary: ErrorMonitoringSummary
    items: list[ErrorLogItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime
