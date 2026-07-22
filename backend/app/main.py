import sys
from pathlib import Path
from contextlib import asynccontextmanager

# Đảm bảo import được các module trong thư mục app khi chạy trực tiếp file main.py
sys.path.append(str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.database.mongodb import connect_to_mongo, close_mongo_connection
from app.routers import db_test, auth, documents, questions, chat, verification, admin

BACKEND_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BACKEND_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

import logging
logger = logging.getLogger("app.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động kết nối MongoDB khi startup
    await connect_to_mongo()

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

app.mount("/static", StaticFiles(directory=str(UPLOADS_DIR)), name="static")

# Đăng ký các router
app.include_router(db_test.router, prefix=f"{settings.API_V1_STR}/db", tags=["Database"])
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Documents"])
app.include_router(questions.router, prefix=f"{settings.API_V1_STR}/questions", tags=["Questions"])
app.include_router(chat.router, prefix=f"{settings.API_V1_STR}/chat", tags=["Chat & Q&A"])
app.include_router(verification.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Verification"])
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin/dashboard", tags=["Admin Dashboard"])



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
