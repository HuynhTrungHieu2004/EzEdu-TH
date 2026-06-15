import logging
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure

from app.core.config import settings

logger = logging.getLogger(__name__)

class MongoClientManager:
    client: AsyncIOMotorClient = None

db_manager = MongoClientManager()

async def connect_to_mongo():
    """Khởi tạo kết nối tới MongoDB"""
    if not settings.MONGODB_URI:
        logger.error("MONGODB_URI chưa được cấu hình!")
        return
    try:
        db_manager.client = AsyncIOMotorClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            tlsCAFile=certifi.where()
        )
        # Kiểm tra thử kết nối
        await db_manager.client.admin.command('ping')
        logger.info("Kết nối MongoDB Atlas thành công!")
    except Exception as e:
        logger.error(f"Lỗi kết nối tới MongoDB: {e}")
        db_manager.client = None

async def close_mongo_connection():
    """Đóng kết nối MongoDB"""
    if db_manager.client:
        db_manager.client.close()
        logger.info("Đã đóng kết nối MongoDB.")

def get_database():
    """Lấy database instance"""
    if db_manager.client is None:
        raise RuntimeError("Chưa khởi tạo kết nối database!")
    return db_manager.client[settings.MONGODB_DB_NAME]

async def ping_database() -> bool:
    """Kiểm tra sức khỏe kết nối MongoDB"""
    if not db_manager.client:
        return False
    try:
        await db_manager.client.admin.command('ping')
        return True
    except ConnectionFailure:
        return False
    except Exception:
        return False
