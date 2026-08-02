import sys
import time
from pathlib import Path
from contextlib import asynccontextmanager

# Đảm bảo import được các module trong thư mục app khi chạy trực tiếp file main.py
sys.path.append(str(Path(__file__).resolve().parent.parent))

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.database.mongodb import connect_to_mongo, close_mongo_connection
from app.routers import db_test, auth, documents, questions, chat, verification, admin, admin_users, admin_activity_logs, admin_audit_logs, admin_content, admin_ai, admin_notifications, admin_reports, website_content, system_settings, classes, teacher_history
from app.personalization.api import router as personalization_router, onboarding_router as personalization_onboarding_router
from app.exam_bank.api import router as exam_bank_router
from app.web_knowledge.api import router as web_knowledge_router
from app.curriculum_kb.api import router as curriculum_kb_router
from app.services.system_settings_service import require_feature_enabled

BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BACKEND_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

import logging
from app.core.logging_config import configure_logging

# JSON logging có gắn request_id/correlation_id vào MỌI log line của toàn bộ
# ứng dụng — cấu hình một lần ở đây, mọi `logging.getLogger(__name__)` hiện
# có kế thừa tự động, không cần sửa từng nơi gọi logger.info(...). Không ảnh
# hưởng log riêng của uvicorn (uvicorn dùng logger propagate=False).
configure_logging()

logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động kết nối MongoDB khi startup
    await connect_to_mongo()

    # Tạo index cho hạ tầng dùng chung (idempotency-key, hàng đợi job nền) —
    # idempotent, an toàn gọi lại mỗi lần khởi động.
    try:
        from app.database.mongodb import get_database
        from app.core.idempotency import ensure_idempotency_index
        from app.services.background_job_service import ensure_background_job_indexes

        _db = get_database()
        await ensure_idempotency_index(_db)
        await ensure_background_job_indexes(_db)
    except Exception as e:
        logger.error(f"Lỗi khi tạo index cho hạ tầng dùng chung (idempotency/background_jobs): {e}")

    # Index cho ngân hàng câu hỏi & ma trận đề (giai đoạn 3).
    try:
        from app.exam_bank.repositories.indexes import ensure_exam_bank_indexes

        await ensure_exam_bank_indexes(get_database())
    except Exception as e:
        logger.error(f"Lỗi khi tạo index cho ngân hàng câu hỏi & ma trận đề: {e}")

    # Index cho khám phá kiến thức Internet có kiểm chứng (giai đoạn 6).
    try:
        from app.web_knowledge.repositories.indexes import ensure_web_knowledge_indexes

        await ensure_web_knowledge_indexes(get_database())
    except Exception as e:
        logger.error(f"Lỗi khi tạo index cho khám phá kiến thức Internet: {e}")

    # Index cho kho tri thức chuẩn (giai đoạn 7).
    try:
        from app.curriculum_kb.repositories.indexes import ensure_curriculum_kb_indexes

        await ensure_curriculum_kb_indexes(get_database())
    except Exception as e:
        logger.error(f"Lỗi khi tạo index cho kho tri thức chuẩn: {e}")

    # BackgroundTasks không tồn tại qua lần khởi động lại. Giải phóng các
    # session còn treo để người dùng có thể chạy kiểm tra lại.
    try:
        from app.services.verification_service import recover_interrupted_verification_sessions
        recovered = await recover_interrupted_verification_sessions()
        if recovered:
            logger.warning("Đã đánh dấu failed cho %s phiên kiểm tra bị gián đoạn.", recovered)
    except Exception as e:
        logger.error(f"Lỗi khi khôi phục phiên kiểm tra bị gián đoạn: {e}")

    # Chỉ tạo tài khoản demo khi quản trị viên chủ động bật cờ môi trường.
    if settings.CREATE_DEFAULT_TEST_USER:
        from app.database.mongodb import get_database
        from app.core.security import get_password_hash
        from datetime import datetime, timezone
        try:
            db = get_database()
            existing = await db["users"].find_one({"email": "test@test.com"})
            if not existing:
                user_doc = {
                    "email": "test@test.com",
                    "full_name": "Test User",
                    "hashed_password": get_password_hash("123456"),
                    "created_at": datetime.now(timezone.utc)
                }
                await db["users"].insert_one(user_doc)
                logger.info("Đã tạo tài khoản kiểm thử mặc định: test@test.com")
        except Exception as e:
            logger.error(f"Lỗi khi tự động tạo tài khoản mặc định: {e}")
        
    yield
    # Đóng kết nối MongoDB khi shutdown
    await close_mongo_connection()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Thiết lập CORS middleware
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )


@app.middleware("http")
async def maintenance_mode_middleware(request, call_next):
    path = request.url.path
    health_paths = {"/health", "/health/ready", f"{settings.API_V1_STR}/runtime-config"}
    if path in health_paths or path.startswith("/static") or path.endswith("/openapi.json"):
        return await call_next(request)

    try:
        from app.core.security import decode_access_token
        from app.database.mongodb import get_database
        from app.services.system_settings_service import is_feature_enabled

        if not await is_feature_enabled("enable_maintenance_mode"):
            return await call_next(request)

        auth_paths = {
            f"{settings.API_V1_STR}/auth/login",
            f"{settings.API_V1_STR}/auth/login-swagger",
        }
        if path in auth_paths:
            return await call_next(request)

        token = None
        auth_header = request.headers.get("authorization") or ""
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        if not token:
            token = request.query_params.get("token")
        if token:
            payload = decode_access_token(token) or {}
            user_id = payload.get("sub")
            if user_id:
                from bson import ObjectId

                db = get_database()
                user = await db["users"].find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(user_id) else None
                if user and user.get("role") in {"admin", "super_admin"}:
                    return await call_next(request)
    except Exception:
        return await call_next(request)

    return JSONResponse(
        status_code=503,
        content={
            "detail": "Hệ thống đang bảo trì. Vui lòng quay lại sau.",
            "error_code": "MAINTENANCE_MODE",
        },
    )


@app.middleware("http")
async def error_monitoring_middleware(request, call_next):
    started = time.perf_counter()
    user_id = None
    try:
        auth_header = request.headers.get("authorization") or ""
        token = auth_header.split(" ", 1)[1].strip() if auth_header.lower().startswith("bearer ") else request.query_params.get("token")
        if token:
            from app.core.security import decode_access_token

            payload = decode_access_token(token) or {}
            user_id = payload.get("sub")
    except Exception:
        user_id = None

    try:
        response = await call_next(request)
    except Exception:
        from app.services.system_health_service import record_error_log

        duration_ms = int((time.perf_counter() - started) * 1000)
        await record_error_log(
            request=request,
            status_code=500,
            duration_ms=duration_ms,
            error_code="UNHANDLED_EXCEPTION",
            user_id=user_id,
        )
        raise

    if response.status_code >= 400 and not request.url.path.startswith("/static"):
        from app.services.system_health_service import record_error_log

        duration_ms = int((time.perf_counter() - started) * 1000)
        await record_error_log(
            request=request,
            status_code=response.status_code,
            duration_ms=duration_ms,
            user_id=user_id,
        )
    return response


# Đăng ký SAU error_monitoring_middleware một cách có chủ đích: Starlette xây
# middleware stack theo thứ tự add_middleware(insert ở đầu danh sách), nên
# middleware đăng ký SAU cùng trở thành lớp NGOÀI CÙNG — request_id/
# correlation_id phải có sẵn TRƯỚC KHI error_monitoring_middleware chạy để log
# lỗi cũng gắn được 2 id này.
from app.core.correlation import correlation_id_middleware  # noqa: E402

app.middleware("http")(correlation_id_middleware)


app.mount("/static", StaticFiles(directory=str(UPLOADS_DIR)), name="static")

# Đăng ký các router
app.include_router(db_test.router, prefix=f"{settings.API_V1_STR}/db", tags=["Database"])
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Documents"])
app.include_router(teacher_history.router, prefix=f"{settings.API_V1_STR}/teacher", tags=["Teacher History"])
app.include_router(questions.router, prefix=f"{settings.API_V1_STR}/questions", tags=["Questions"])
app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/chat", tags=["Chat & Q&A"])
app.include_router(verification.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Verification"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin/dashboard", tags=["Admin Dashboard"])
app.include_router(admin_activity_logs.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin Activity Logs"])
app.include_router(admin_audit_logs.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin Audit Logs"])
app.include_router(admin_content.router, prefix=f"{settings.API_V1_STR}/admin/content", tags=["Admin Content"])
app.include_router(admin_ai.router, prefix=f"{settings.API_V1_STR}/admin/ai", tags=["Admin AI"])
app.include_router(admin_notifications.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin Notifications"])
app.include_router(admin_reports.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin Reports"])
app.include_router(website_content.admin_router, prefix=f"{settings.API_V1_STR}/admin/website-content", tags=["Admin Website Content"])
app.include_router(system_settings.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin System Settings"])
app.include_router(admin_users.router, prefix=f"{settings.API_V1_STR}/admin/users", tags=["Admin Users"])
app.include_router(website_content.router, prefix=f"{settings.API_V1_STR}/website-content", tags=["Website Content"])
app.include_router(system_settings.public_router, prefix=f"{settings.API_V1_STR}", tags=["Runtime Config"])
app.include_router(
    personalization_onboarding_router,
    prefix=f"{settings.API_V1_STR}/personalization",
)
app.include_router(
    personalization_router,
    prefix=f"{settings.API_V1_STR}/personalization",
    dependencies=[Depends(require_feature_enabled("enable_personalization"))],
)
app.include_router(classes.router, prefix=f"{settings.API_V1_STR}/classes", tags=["Classes"])
app.include_router(exam_bank_router, prefix=settings.API_V1_STR)
app.include_router(web_knowledge_router, prefix=settings.API_V1_STR)
app.include_router(curriculum_kb_router, prefix=settings.API_V1_STR)



@app.get("/")
def read_root():
    return {
        "message": "Welcome to FastAPI Backend API",
        "project_name": settings.PROJECT_NAME,
        "api_v1_path": settings.API_V1_STR,
        "status": "healthy"
    }

@app.get("/health", status_code=200)
def health_check():
    return {"status": "ok"}

@app.get("/health/ready")
async def readiness_check():
    from app.database.mongodb import ping_database, is_indexes_ready
    from app.services.rag_service import ping_chroma
    from app.services.llm_service import is_gemini_available, is_groq_available

    mongo_ok = await ping_database()
    chroma_ok = ping_chroma()
    indexes_ok = is_indexes_ready()
    gemini_ok = is_gemini_available()
    groq_ok = is_groq_available()

    services_status = {
        "mongodb": "healthy" if mongo_ok else "unavailable",
        "chromadb": "healthy" if chroma_ok else "unavailable",
        "mongodb_indexes": "healthy" if indexes_ok else "degraded",
        "gemini": "healthy" if gemini_ok else "unavailable",
        "groq": "healthy" if groq_ok else "unavailable"
    }

    if not mongo_ok or not chroma_ok:
        status_str = "unavailable"
        status_code = 503
    elif not indexes_ok or not gemini_ok or not groq_ok:
        status_str = "degraded"
        status_code = 200
    else:
        status_str = "healthy"
        status_code = 200

    from fastapi import Response
    import json
    return Response(
        content=json.dumps({
            "status": status_str,
            "services": services_status
        }),
        media_type="application/json",
        status_code=status_code
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
