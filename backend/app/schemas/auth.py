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


class AccountEmailRequest(BaseModel):
    email: EmailStr


class PasswordResetRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)
    new_password: str = Field(..., min_length=6, max_length=128)


class EmailVerificationRequest(BaseModel):
    token: str = Field(..., min_length=20, max_length=512)


class MessageResponse(BaseModel):
    message: str


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


class GoogleLoginRequest(BaseModel):
    id_token: str = Field(..., min_length=1, max_length=4096)
    # Chỉ gửi ở lần gọi thứ hai, sau khi người dùng mới chọn vai. Literal chặn
    # sẵn việc tự phong 'admin' bằng cách sửa request.
    role: Optional[Literal["student", "lecturer"]] = None


class GoogleLoginResponse(BaseModel):
    needs_role: bool = False
    access_token: Optional[str] = None
    token_type: str = "bearer"
    # Hai trường dưới chỉ dùng để hiện lời chào ở màn chọn vai.
    email: Optional[str] = None
    full_name: Optional[str] = None


class FacebookLoginRequest(BaseModel):
    # Access token của Facebook, không phải ID token như Google. Dài hơn nhiều
    # nên nới trần lên; token dài thật của Facebook vượt xa 4096.
    access_token: str = Field(..., min_length=1, max_length=8192)
    # Chỉ gửi ở lần gọi thứ hai, sau khi người dùng mới chọn vai. Literal chặn
    # sẵn việc tự phong 'admin' bằng cách sửa request.
    role: Optional[Literal["student", "lecturer"]] = None


#: Facebook trả về đúng hình dạng như Google — cùng luồng hai bước, cùng màn hỏi
#: vai. Đặt bí danh thay vì định nghĩa lại một lớp giống hệt.
FacebookLoginResponse = GoogleLoginResponse
