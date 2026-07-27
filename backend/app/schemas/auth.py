from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict

class UserRegister(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(..., min_length=6, description="Mật khẩu chứa ít nhất 6 ký tự")
    role: Literal["student", "lecturer"] = "student"

class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "id": "60c72b2f9b1d8b234a5c9e2b",
            "email": "user@example.com",
            "full_name": "Nguyen Van A",
            "role": "student",
            "status": "active",
            "student_profile_completed": False,
            "is_active": True,
            "permissions_override": [],
            "created_at": "2026-06-16T03:20:00Z",
            "updated_at": None,
            "last_login_at": None,
            "deleted_at": None
        }
    })
    id: str
    email: EmailStr
    full_name: str
    role: Literal[
        "user",
        "student",
        "lecturer",
        "analyst",
        "support",
        "moderator",
        "admin",
        "super_admin",
    ] = "student"
    status: Literal["active", "locked", "deleted"] = "active"
    student_profile_completed: bool = False
    is_active: bool = True
    permissions_override: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None
