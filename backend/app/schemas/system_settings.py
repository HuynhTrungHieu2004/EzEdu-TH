from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

SettingValueType = Literal["string", "int", "float", "bool", "list"]
SettingCategory = Literal["upload", "question_generation", "ai", "user", "logs"]


class SystemSettingItem(BaseModel):
    key: str
    value: Any
    value_type: SettingValueType
    category: SettingCategory
    description: str
    is_public: bool = False
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None


class SystemSettingUpdateRequest(BaseModel):
    value: Any
    reason: str = Field(..., min_length=1, max_length=500)


class SystemSettingsResponse(BaseModel):
    items: list[SystemSettingItem]
    generated_at: datetime


class FeatureFlagItem(BaseModel):
    key: str
    enabled: bool
    description: str
    rollout_percentage: int = Field(100, ge=0, le=100)
    allowed_roles: list[str] = Field(default_factory=list)
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None


class FeatureFlagUpdateRequest(BaseModel):
    enabled: Optional[bool] = None
    description: Optional[str] = Field(None, max_length=500)
    rollout_percentage: Optional[int] = Field(None, ge=0, le=100)
    allowed_roles: Optional[list[str]] = None
    reason: str = Field(..., min_length=1, max_length=500)

    @field_validator("allowed_roles")
    @classmethod
    def clean_roles(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return value
        result: list[str] = []
        seen: set[str] = set()
        for item in value:
            role = str(item).strip()
            if role and role not in seen:
                seen.add(role)
                result.append(role)
        return result[:20]


class FeatureFlagsResponse(BaseModel):
    items: list[FeatureFlagItem]
    generated_at: datetime


class PublicRuntimeConfigResponse(BaseModel):
    settings: dict[str, Any] = Field(default_factory=dict)
    feature_flags: dict[str, bool] = Field(default_factory=dict)
    generated_at: datetime
