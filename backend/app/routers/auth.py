import logging
import time
from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.core.rbac import has_role, sanitize_permissions
from app.database.mongodb import get_database
from app.personalization.constants.collections import LEARNER_PROFILES
from app.schemas.auth import (
    UserRegister, UserLogin, UserResponse, Token, TokenPayload,
    GoogleLoginRequest, GoogleLoginResponse,
    FacebookLoginRequest, FacebookLoginResponse,
    AccountEmailRequest, PasswordResetRequest, EmailVerificationRequest, MessageResponse,
)
from app.services.activity_log_service import record_activity
from app.services.system_settings_service import get_setting_value, is_feature_enabled
from app.services.google_auth_service import (
    GoogleAuthError,
    verify_google_id_token,
)
from app.services.google_auth_service import to_social_identity as google_to_social
from app.services.facebook_auth_service import (
    FacebookAuthError,
    verify_facebook_access_token,
)
from app.services.facebook_auth_service import to_social_identity as facebook_to_social
from app.services.social_auth_service import (
    SocialIdentity,
    create_social_user,
    find_or_link_social_user,
)
from app.services.account_token_service import consume_account_token, issue_account_token
from app.services.email_service import is_email_configured, send_account_email

router = APIRouter()
logger = logging.getLogger(__name__)

# Swagger UI Authorize sẽ sử dụng endpoint login-swagger
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login-swagger", auto_error=False)


def _normalize_user_status(user_doc: dict) -> str:
    if user_doc.get("deleted_at") is not None:
        return "deleted"
    status_value = str(user_doc.get("status") or "").strip()
    if status_value in {"active", "locked", "deleted"}:
        return status_value
    return "active" if user_doc.get("is_active", True) is not False else "locked"


def _token_iat_datetime(payload: dict) -> Optional[datetime]:
    raw_iat = payload.get("iat")
    if raw_iat is None:
        return None
    try:
        return datetime.fromtimestamp(int(raw_iat), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None

async def get_current_user(
    token_header: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token")
) -> UserResponse:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = token_header or token_query
    if not token:
        raise credentials_exception
        
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    token_data = TokenPayload(sub=user_id)
        
    db = get_database()
    try:
        user_doc = await db["users"].find_one({"_id": ObjectId(token_data.sub)})
    except Exception:
        raise credentials_exception
        
    if user_doc is None:
        raise credentials_exception

    force_logout_at = user_doc.get("force_logout_at")
    if isinstance(force_logout_at, datetime):
        token_iat = _token_iat_datetime(payload)
        if token_iat is None or token_iat <= force_logout_at:
            raise credentials_exception

    user_status = _normalize_user_status(user_doc)
    if user_doc.get("is_active", True) is False or user_status in {"locked", "deleted"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        )
        
    student_profile_completed = False
    if user_doc.get("role", "user") == "student":
        profile = await db[LEARNER_PROFILES].find_one(
            {"user_id": str(user_doc["_id"])},
            {"onboarding_completed": 1},
        )
        student_profile_completed = bool((profile or {}).get("onboarding_completed"))

    return UserResponse(
        id=str(user_doc["_id"]),
        email=user_doc["email"],
        full_name=user_doc["full_name"],
        role=user_doc.get("role", "user"),
        status=user_status,
        student_profile_completed=student_profile_completed,
        is_active=user_doc.get("is_active", True),
        permissions_override=sanitize_permissions(user_doc.get("permissions_override")),
        created_at=user_doc["created_at"],
        updated_at=user_doc.get("updated_at"),
        last_login_at=user_doc.get("last_login_at"),
        deleted_at=user_doc.get("deleted_at"),
    )

async def require_admin(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Backward-compatible admin dependency."""
    if not has_role(current_user, {"admin", "super_admin"}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Quyền truy cập bị từ chối. Chỉ dành cho quản trị viên."
        )
    return current_user

def _email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower() if "@" in email else ""


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(payload: AccountEmailRequest):
    if not is_email_configured():
        raise HTTPException(status_code=503, detail="Máy chủ chưa cấu hình dịch vụ gửi email.")

    db = get_database()
    user = await db["users"].find_one({
        "email": str(payload.email).lower(),
        "is_active": {"$ne": False},
        "deleted_at": None,
    })
    if user:
        raw = await issue_account_token(
            db,
            user_id=str(user["_id"]),
            purpose="password_reset",
            expires_minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES,
        )
        link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/reset-password?token={raw}"
        try:
            await send_account_email(
                recipient=user["email"],
                subject="Đặt lại mật khẩu EzEdu AI",
                body=f"Mở liên kết sau để đặt lại mật khẩu. Liên kết chỉ dùng một lần:\n\n{link}",
            )
        except Exception:
            # Do not reveal account existence through a provider outage.
            logger.exception("Password reset email delivery failed")

    return MessageResponse(message="Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(payload: PasswordResetRequest):
    db = get_database()
    user_id = await consume_account_token(db, raw_token=payload.token, purpose="password_reset")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.")
    now = datetime.now(timezone.utc)
    result = await db["users"].update_one(
        {"_id": ObjectId(user_id), "is_active": {"$ne": False}, "deleted_at": None},
        {"$set": {
            "hashed_password": get_password_hash(payload.new_password),
            "force_logout_at": now,
            "updated_at": now,
        }},
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=400, detail="Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.")
    return MessageResponse(message="Mật khẩu đã được cập nhật.")


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(payload: EmailVerificationRequest):
    db = get_database()
    user_id = await consume_account_token(db, raw_token=payload.token, purpose="email_verification")
    if not user_id or not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=400, detail="Liên kết xác thực email không hợp lệ hoặc đã hết hạn.")
    result = await db["users"].update_one(
        {"_id": ObjectId(user_id), "deleted_at": None},
        {"$set": {"email_verified": True, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count != 1:
        raise HTTPException(status_code=400, detail="Liên kết xác thực email không hợp lệ hoặc đã hết hạn.")
    return MessageResponse(message="Email đã được xác thực.")


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(current_user: UserResponse = Depends(get_current_user)):
    if not is_email_configured():
        raise HTTPException(status_code=503, detail="Máy chủ chưa cấu hình dịch vụ gửi email.")

    db = get_database()
    user = await db["users"].find_one({"_id": ObjectId(current_user.id), "deleted_at": None})
    if not user:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản.")
    if user.get("email_verified") is True:
        return MessageResponse(message="Email đã được xác thực.")

    raw = await issue_account_token(
        db,
        user_id=current_user.id,
        purpose="email_verification",
        expires_minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES,
    )
    link = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/verify-email?token={raw}"
    await send_account_email(
        recipient=user["email"],
        subject="Xác thực email EzEdu AI",
        body=f"Mở liên kết sau để xác thực email. Liên kết chỉ dùng một lần:\n\n{link}",
    )
    return MessageResponse(message="Đã gửi liên kết xác thực email.")


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserRegister, request: Request):
    started = time.perf_counter()
    db = get_database()
    registration_enabled = bool(await get_setting_value("registration_enabled", True, database=db))
    flag_enabled = await is_feature_enabled("enable_user_registration", database=db)
    if not registration_enabled or not flag_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Đăng ký tài khoản hiện đang tạm tắt.",
        )
    # Kiểm tra trùng email
    existing_user = await db["users"].find_one({"email": user_in.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    hashed_password = get_password_hash(user_in.password)
    forced_role = str(await get_setting_value("default_role", "", database=db))
    role = forced_role if forced_role in {"student", "lecturer"} else user_in.role
    user_doc = {
        "email": user_in.email,
        "full_name": user_in.full_name,
        "hashed_password": hashed_password,
        "role": role,
        "status": "active",
        "is_active": True,
        "email_verified": not bool(await get_setting_value("email_verification_required", False, database=db)),
        "permissions_override": [],
        "deleted_at": None,
        "created_at": datetime.now(timezone.utc),
        "updated_at": None,
    }
    
    result = await db["users"].insert_one(user_doc)
    user_id = str(result.inserted_id)
    await record_activity(
        action="user_registered",
        category="auth",
        status="success",
        user_id=user_id,
        resource_type="user",
        resource_id=user_id,
        request=request,
        duration_ms=int((time.perf_counter() - started) * 1000),
        metadata={"role": role, "email_domain": _email_domain(user_in.email)},
        database=db,
    )
    
    return UserResponse(
        id=user_id,
        email=user_in.email,
        full_name=user_in.full_name,
        role=role,
        status="active",
        student_profile_completed=False,
        is_active=True,
        permissions_override=[],
        created_at=user_doc["created_at"],
        updated_at=None,
        last_login_at=None,
        deleted_at=None,
    )

@router.post("/login", response_model=Token)
async def login(user_in: UserLogin, request: Request):
    """Endpoint đăng nhập chính thức sử dụng JSON Body (UserLogin schema)"""
    started = time.perf_counter()
    db = get_database()
    user = await db["users"].find_one({"email": user_in.email})
    mat_khau_bam = user.get("hashed_password") if user else None
    # Tài khoản đăng ký bằng Google không có mật khẩu. Đọc thẳng khoá này làm
    # cả endpoint trả HTTP 500 thay vì báo cho người dùng biết phải bấm nút nào.
    if not user or not mat_khau_bam or not verify_password(user_in.password, mat_khau_bam):
        await record_activity(
            action="login_failed",
            category="auth",
            status="failure",
            user_id=str(user["_id"]) if user else None,
            resource_type="user",
            resource_id=str(user["_id"]) if user else None,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="INVALID_CREDENTIALS",
            metadata={"email_domain": _email_domain(user_in.email), "known_user": bool(user)},
            database=db,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            # Lộ "email này tồn tại và dùng Google" khi báo tài khoản chỉ-Google
            # là đánh đổi có chủ đích: đổi lấy việc người dùng biết đúng nút cần
            # bấm. Trang đăng ký đã lộ điều tương tự qua "Email already registered".
            detail=(
                "Tài khoản này đăng nhập bằng Google. Hãy dùng nút \"Đăng nhập với Google\"."
                if user and not mat_khau_bam
                else "Email hoặc mật khẩu không đúng."
            ),
        )
    user_status = _normalize_user_status(user)
    if user.get("is_active", True) is False or user_status in {"locked", "deleted"}:
        await record_activity(
            action="login_failed",
            category="auth",
            status="failure",
            user_id=str(user["_id"]),
            resource_type="user",
            resource_id=str(user["_id"]),
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="ACCOUNT_BLOCKED",
            metadata={"status": user_status, "role": user.get("role", "user")},
            database=db,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        )

    if await is_feature_enabled("enable_maintenance_mode", database=db):
        if user.get("role") not in {"admin", "super_admin"}:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Hệ thống đang bảo trì. Vui lòng quay lại sau.",
            )

    now = datetime.now(timezone.utc)
    await db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": now, "updated_at": user.get("updated_at") or now}},
    )
    access_token = create_access_token(subject=str(user["_id"]))
    await record_activity(
        action="login_success",
        category="auth",
        status="success",
        user_id=str(user["_id"]),
        resource_type="user",
        resource_id=str(user["_id"]),
        request=request,
        duration_ms=int((time.perf_counter() - started) * 1000),
        metadata={"role": user.get("role", "user")},
        database=db,
    )
    return Token(access_token=access_token, token_type="bearer")

@router.post("/login-swagger", response_model=Token, include_in_schema=True)
async def login_swagger(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """Endpoint phụ trợ giúp Swagger UI tương thích với nút Authorize dùng Form Data"""
    started = time.perf_counter()
    db = get_database()
    user = await db["users"].find_one({"email": form_data.username})
    mat_khau_bam = user.get("hashed_password") if user else None
    # Tài khoản đăng ký bằng Google không có mật khẩu. Đọc thẳng khoá này làm
    # cả endpoint trả HTTP 500 thay vì báo cho người dùng biết phải bấm nút nào.
    if not user or not mat_khau_bam or not verify_password(form_data.password, mat_khau_bam):
        await record_activity(
            action="login_failed",
            category="auth",
            status="failure",
            user_id=str(user["_id"]) if user else None,
            resource_type="user",
            resource_id=str(user["_id"]) if user else None,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="INVALID_CREDENTIALS",
            metadata={"email_domain": _email_domain(form_data.username), "known_user": bool(user), "via": "swagger"},
            database=db,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            # Lộ "email này tồn tại và dùng Google" khi báo tài khoản chỉ-Google
            # là đánh đổi có chủ đích: đổi lấy việc người dùng biết đúng nút cần
            # bấm. Trang đăng ký đã lộ điều tương tự qua "Email already registered".
            detail=(
                "Tài khoản này đăng nhập bằng Google. Hãy dùng nút \"Đăng nhập với Google\"."
                if user and not mat_khau_bam
                else "Email hoặc mật khẩu không đúng."
            ),
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_status = _normalize_user_status(user)
    if user.get("is_active", True) is False or user_status in {"locked", "deleted"}:
        await record_activity(
            action="login_failed",
            category="auth",
            status="failure",
            user_id=str(user["_id"]),
            resource_type="user",
            resource_id=str(user["_id"]),
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="ACCOUNT_BLOCKED",
            metadata={"status": user_status, "role": user.get("role", "user"), "via": "swagger"},
            database=db,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if await is_feature_enabled("enable_maintenance_mode", database=db):
        if user.get("role") not in {"admin", "super_admin"}:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Hệ thống đang bảo trì. Vui lòng quay lại sau.",
            )

    now = datetime.now(timezone.utc)
    await db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": now, "updated_at": user.get("updated_at") or now}},
    )
    access_token = create_access_token(subject=str(user["_id"]))
    await record_activity(
        action="login_success",
        category="auth",
        status="success",
        user_id=str(user["_id"]),
        resource_type="user",
        resource_id=str(user["_id"]),
        request=request,
        duration_ms=int((time.perf_counter() - started) * 1000),
        metadata={"role": user.get("role", "user"), "via": "swagger"},
        database=db,
    )
    return Token(access_token=access_token, token_type="bearer")

async def _dang_nhap_mang_xa_hoi(
    *,
    identity: SocialIdentity,
    role: Optional[str],
    provider: str,
    request: Request,
    started: float,
    db,
) -> GoogleLoginResponse:
    """Phần chung của mọi luồng đăng nhập mạng xã hội, tính từ sau bước xác minh.

    Nhà cung cấp nào cũng chỉ khác nhau ở cách chứng minh "người này là ai".
    Chứng minh xong rồi thì mọi thứ còn lại giống hệt: hỏi vai nếu là người mới,
    tôn trọng cổng chặn đăng ký, tôn trọng `default_role`, chặn tài khoản bị khoá
    hoặc đã xoá, chặn lúc bảo trì, ghi nhật ký.

    Để chung một chỗ chứ không chép cho từng nhà cung cấp: khối này mang mấy chốt
    bảo mật mà ai đọc lướt sẽ không thấy. Hai bản sao sẽ lệch nhau ngay lần sửa
    đầu tiên, và bản không ai sờ tới sẽ âm thầm giữ nguyên lỗi.
    """
    user, _ = await find_or_link_social_user(db, identity)
    la_nguoi_moi = user is None

    if la_nguoi_moi:
        if role is None:
            # Chưa tạo gì cả — chỉ hỏi vai rồi chờ lần gọi thứ hai.
            return GoogleLoginResponse(
                needs_role=True, email=identity.email, full_name=identity.full_name
            )
        dang_ky_bat = bool(await get_setting_value("registration_enabled", True, database=db))
        if not dang_ky_bat or not await is_feature_enabled("enable_user_registration", database=db):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Đăng ký tài khoản hiện đang tạm tắt.",
            )
        # Cài đặt default_role khoá vai tự chọn, giống hệt luồng /register —
        # thiếu chốt này thì quản trị đặt default_role=student vẫn không ngăn
        # được người mới tự phong lecturer qua nút mạng xã hội.
        forced_role = str(await get_setting_value("default_role", "", database=db))
        vai = forced_role if forced_role in {"student", "lecturer"} else role
        user = await create_social_user(db, identity, role=vai)

    user_status = _normalize_user_status(user)
    if user.get("is_active", True) is False or user_status in {"locked", "deleted"}:
        await record_activity(
            action="login_failed",
            category="auth", status="failure",
            user_id=str(user["_id"]), resource_type="user", resource_id=str(user["_id"]),
            request=request, duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="ACCOUNT_BLOCKED",
            metadata={"provider": provider, "status": user_status, "role": user.get("role", "user")},
            database=db,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
        )

    if await is_feature_enabled("enable_maintenance_mode", database=db):
        if user.get("role") not in {"admin", "super_admin"}:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Hệ thống đang bảo trì. Vui lòng quay lại sau.",
            )

    now = datetime.now(timezone.utc)
    await db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": now, "updated_at": user.get("updated_at") or now}},
    )
    await record_activity(
        action="user_registered" if la_nguoi_moi else "login_success",
        category="auth", status="success",
        user_id=str(user["_id"]), resource_type="user", resource_id=str(user["_id"]),
        request=request, duration_ms=int((time.perf_counter() - started) * 1000),
        metadata={"provider": provider, "role": user.get("role", "user")},
        database=db,
    )
    return GoogleLoginResponse(
        needs_role=False,
        access_token=create_access_token(subject=str(user["_id"])),
        token_type="bearer",
    )


async def _ghi_nhan_token_bi_tu_choi(*, provider: str, error_code: str, request: Request,
                                     started: float, db) -> None:
    await record_activity(
        action="login_failed", category="auth", status="failure",
        user_id=None, resource_type="user", resource_id=None, request=request,
        duration_ms=int((time.perf_counter() - started) * 1000),
        error_code=error_code,
        metadata={"provider": provider}, database=db,
    )


@router.post("/google", response_model=GoogleLoginResponse)
async def google_login(payload: GoogleLoginRequest, request: Request):
    """Đăng nhập/đăng ký bằng tài khoản Google.

    Gọi lần đầu chỉ với `id_token`. Nếu là người dùng mới, trả `needs_role` và
    KHÔNG tạo gì; frontend hỏi vai rồi gọi lại cùng endpoint kèm `role`.
    """
    started = time.perf_counter()
    db = get_database()

    if not await is_feature_enabled("enable_google_login", database=db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Đăng nhập bằng Google hiện không khả dụng.",
        )

    try:
        identity = verify_google_id_token(payload.id_token)
    except GoogleAuthError as exc:
        await _ghi_nhan_token_bi_tu_choi(
            provider="google", error_code="GOOGLE_TOKEN_REJECTED",
            request=request, started=started, db=db,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return await _dang_nhap_mang_xa_hoi(
        identity=google_to_social(identity), role=payload.role, provider="google",
        request=request, started=started, db=db,
    )


@router.post("/facebook", response_model=FacebookLoginResponse)
async def facebook_login(payload: FacebookLoginRequest, request: Request):
    """Đăng nhập/đăng ký bằng tài khoản Facebook.

    Luồng hai bước giống hệt `/google`: gọi lần đầu chỉ với `access_token`, nếu
    là người mới thì trả `needs_role` và KHÔNG tạo gì, frontend hỏi vai rồi gọi
    lại kèm `role`.

    Khác Google ở chỗ `verify_facebook_access_token` phải gọi ngược Graph API
    (xem `facebook_auth_service`), nên nó là hàm bất đồng bộ và có thể ném 503
    khi không liên lạc được với Facebook.
    """
    started = time.perf_counter()
    db = get_database()

    if not await is_feature_enabled("enable_facebook_login", database=db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Đăng nhập bằng Facebook hiện không khả dụng.",
        )

    try:
        identity = await verify_facebook_access_token(payload.access_token)
    except FacebookAuthError as exc:
        await _ghi_nhan_token_bi_tu_choi(
            provider="facebook", error_code="FACEBOOK_TOKEN_REJECTED",
            request=request, started=started, db=db,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    return await _dang_nhap_mang_xa_hoi(
        identity=facebook_to_social(identity), role=payload.role, provider="facebook",
        request=request, started=started, db=db,
    )


@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: UserResponse = Depends(get_current_user)):
    return current_user


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(request: Request, current_user: UserResponse = Depends(get_current_user)):
    await record_activity(
        action="logout",
        category="auth",
        status="success",
        user_id=current_user.id,
        resource_type="user",
        resource_id=current_user.id,
        request=request,
        metadata={"role": current_user.role},
        database=get_database(),
    )
    return {"status": "ok"}
