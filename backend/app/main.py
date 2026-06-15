import sys
from pathlib import Path
from contextlib import asynccontextmanager

# Đảm bảo import được các module trong thư mục app khi chạy trực tiếp file main.py
sys.path.append(str(Path(__file__).resolve().parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.database.mongodb import connect_to_mongo, close_mongo_connection
from app.routers import db_test

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Khởi động kết nối MongoDB khi startup
    await connect_to_mongo()
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

# Đăng ký các router
app.include_router(db_test.router, prefix=f"{settings.API_V1_STR}/db", tags=["Database"])

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)