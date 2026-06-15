from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

class UserRegister(BaseModel):
    email: EmailStr
    full_name: str
    password: str = Field(..., min_length=6, description="Mật khẩu chứa ít nhất 6 ký tự")

class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    created_at: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "id": "60c72b2f9b1d8b234a5c9e2b",
                "email": "user@example.com",
                "full_name": "Nguyen Van A",
                "created_at": "2026-06-16T03:20:00Z"
            }
        }

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    exp: Optional[int] = None
