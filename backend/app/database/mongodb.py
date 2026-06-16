import logging
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ConnectionFailure
from typing import Optional

try:
    from mongomock_motor import AsyncMongoMockClient
except ImportError:  # pragma: no cover - optional development fallback
    AsyncMongoMockClient = None

from app.core.config import settings

logger = logging.getLogger(__name__)

class MongoClientManager:
    client: Optional[AsyncIOMotorClient] = None
    using_mock: bool = False

db_manager = MongoClientManager()

def create_mongo_client() -> AsyncIOMotorClient:
    """Create a Motor client instance from the current settings."""
    return AsyncIOMotorClient(
        settings.MONGODB_URI,
        serverSelectionTimeoutMS=5000,
        tlsCAFile=certifi.where()
    )

def create_mock_mongo_client() -> AsyncIOMotorClient:
    """Create an in-memory async Mongo-compatible client for local fallback."""
    if AsyncMongoMockClient is None:
        raise RuntimeError("mongomock-motor is not installed.")
    return AsyncMongoMockClient()

async def connect_to_mongo():
    """Khởi tạo kết nối tới MongoDB"""
    if not settings.MONGODB_URI:
        if AsyncMongoMockClient is None:
            logger.error("MONGODB_URI chưa được cấu hình!")
            return
        db_manager.client = create_mock_mongo_client()
        db_manager.using_mock = True
        logger.warning("MONGODB_URI chưa được cấu hình. Đang dùng bộ nhớ mock cho môi trường local.")
        return

    if db_manager.client is None:
        db_manager.client = create_mongo_client()
        db_manager.using_mock = False

    try:
        # Kiểm tra thử kết nối
        await db_manager.client.admin.command('ping')
        logger.info("Kết nối MongoDB Atlas thành công!")
    except Exception as e:
        logger.error(f"Lỗi kết nối tới MongoDB: {e}")
        if AsyncMongoMockClient is not None:
            db_manager.client = create_mock_mongo_client()
            db_manager.using_mock = True
            logger.warning("Đang chuyển sang Mongo mock trong bộ nhớ để tiếp tục phát triển local.")

async def close_mongo_connection():
    """Đóng kết nối MongoDB"""
    if db_manager.client:
        db_manager.client.close()
        logger.info("Đã đóng kết nối MongoDB.")
        db_manager.client = None
        db_manager.using_mock = False

def get_database():
    """Lấy database instance"""
    if db_manager.client is None:
        if settings.MONGODB_URI:
            db_manager.client = create_mongo_client()
            db_manager.using_mock = False
        elif AsyncMongoMockClient is not None:
            db_manager.client = create_mock_mongo_client()
            db_manager.using_mock = True
        else:
            raise RuntimeError("Chưa cấu hình MONGODB_URI!")
    return db_manager.client[settings.MONGODB_DB_NAME]

def is_using_mock_database() -> bool:
    """Indicates whether the app is running against the in-memory mock database."""
    return db_manager.using_mock

async def ping_database() -> bool:
    """Kiểm tra sức khỏe kết nối MongoDB"""
    if not db_manager.client:
        return False
    if db_manager.using_mock:
        return True
    try:
        await db_manager.client.admin.command('ping')
        return True
    except ConnectionFailure:
        return False
    except Exception:
        return False
