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
            "created_at": "2026-06-16T03:20:00Z"
        }
    })
    id: str
    email: EmailStr
    full_name: str
    role: Literal["user", "student", "lecturer", "admin"] = "student"
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None
