from fastapi import APIRouter, HTTPException, status
from app.database.mongodb import ping_database

router = APIRouter()

@router.get("/ping", status_code=status.HTTP_200_OK)
async def ping_db():
    """Endpoint kiểm tra kết nối tới cơ sở dữ liệu MongoDB"""
    is_connected = await ping_database()
    if is_connected:
        return {
            "status": "ok",
            "message": "MongoDB connected successfully"
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cannot connect to MongoDB Atlas"
        )
