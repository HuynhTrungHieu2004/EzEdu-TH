from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.rbac import ROLE_NAMES
from app.schemas.admin_ai import validated_quota


UserStatus = Literal["active", "locked", "deleted"]
UserSortBy = Literal[
    "created_at",
    "updated_at",
    "last_login_at",
    "email",
    "full_name",
    "role",
    "status",
]
SortOrder = Literal["asc", "desc"]


def validate_role_value(value: str) -> str:
    role = value.strip()
    if role not in ROLE_NAMES:
        raise ValueError(f"role phải là một trong: {', '.join(sorted(ROLE_NAMES))}.")
    return role


class AdminUserBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=160)
    email: EmailStr
    role: str = "user"
    status: UserStatus = "active"
    is_active: bool = True
    email_verified: bool = False
    permissions_override: list[str] = Field(default_factory=list)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return validate_role_value(value)


class AdminUserCreateRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=160)
    email: EmailStr
    role: str = "user"
    password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    temporary_password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    email_verified: bool = False
    current_quota: Optional[dict[str, Any]] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return validate_role_value(value)


class AdminUserUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    email: Optional[EmailStr] = None
    status: Optional[UserStatus] = None
    is_active: Optional[bool] = None
    email_verified: Optional[bool] = None
    permissions_override: Optional[list[str]] = None


class AdminUserRoleUpdateRequest(BaseModel):
    role: str
    reason: Optional[str] = Field(default=None, max_length=500)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        return validate_role_value(value)


class AdminUserQuotaUpdateRequest(BaseModel):
    current_quota: dict[str, Any] = Field(default_factory=dict)
    reason: Optional[str] = Field(default=None, max_length=500)

    @field_validator("current_quota")
    @classmethod
    def validate_current_quota(cls, value: dict[str, Any]) -> dict[str, int]:
        return validated_quota(value)


class AdminUserReasonRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class AdminPasswordResetRequest(BaseModel):
    temporary_password: Optional[str] = Field(default=None, min_length=6, max_length=128)
    require_password_change: bool = True


class AdminPasswordResetResponse(BaseModel):
    user_id: str
    temporary_password: str
    password_reset_required: bool
    updated_at: datetime
    audit_event: dict[str, Any]


class AdminUserSummary(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    role: str
    status: UserStatus
    is_active: bool
    email_verified: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    current_quota: Optional[dict[str, Any]] = None


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0


class AdminUserDetail(AdminUserSummary):
    document_count: int = 0
    question_count: int = 0
    conversation_count: int = 0
    ai_request_count: int = 0
    token_usage: TokenUsage = Field(default_factory=TokenUsage)


class AdminUserListResponse(BaseModel):
    items: list[AdminUserSummary]
    total: int
    page: int
    page_size: int
    total_pages: int
    generated_at: datetime


class AdminUserStatisticsResponse(BaseModel):
    total_users: int
    active_users: int
    locked_users: int
    deleted_users: int
    users_created_today: int
    users_created_last_7_days: int
    users_created_last_30_days: int
    active_last_24_hours: int
    active_last_7_days: int
    generated_at: datetime


class AdminUserMutationResponse(BaseModel):
    user: AdminUserDetail
    audit_event: dict[str, Any]
