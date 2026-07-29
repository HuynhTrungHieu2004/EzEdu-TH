import logging
import asyncio
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
    client_options = {
        "serverSelectionTimeoutMS": 3000,
        "connectTimeoutMS": 3000,
        "socketTimeoutMS": 3000,
        "waitQueueTimeoutMS": 3000,
    }
    uri_lower = settings.MONGODB_URI.lower()
    if uri_lower.startswith("mongodb+srv://") or "tls=true" in uri_lower or "ssl=true" in uri_lower:
        client_options["tlsCAFile"] = certifi.where()
    return AsyncIOMotorClient(settings.MONGODB_URI, **client_options)

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
        # Kiểm tra thử kết nối. wait_for tránh việc DNS/Atlas treo làm startup kẹt vô hạn.
        await asyncio.wait_for(db_manager.client.admin.command('ping'), timeout=5)
        logger.info("Kết nối MongoDB Atlas thành công!")
    except Exception as e:
        logger.error(f"Lỗi kết nối tới MongoDB: {e}")
        if AsyncMongoMockClient is not None:
            db_manager.client.close()
            db_manager.client = create_mock_mongo_client()
            db_manager.using_mock = True
            logger.warning("Đang chuyển sang Mongo mock trong bộ nhớ để tiếp tục phát triển local.")

    await create_database_indexes()

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


mongodb_indexes_created = False


async def create_database_indexes():
    """Khởi tạo chỉ mục cho các collection"""
    global mongodb_indexes_created
    try:
        db = get_database()
        # Users / RBAC indexes. Keep email non-unique here to avoid breaking
        # startup on legacy databases that may already contain duplicates.
        await db["users"].create_index([("email", 1)])
        await db["users"].create_index([("role", 1)])
        await db["users"].create_index([("status", 1)])
        await db["users"].create_index([("created_at", -1)])
        await db["users"].create_index([("last_login_at", -1)])
        await db["users"].create_index([("deleted_at", 1)])
        await db["users"].create_index([("role", 1), ("status", 1), ("created_at", -1)])
        await db["users"].create_index([("is_active", 1), ("created_at", -1)])
        await db["users"].create_index([("deleted_at", 1), ("created_at", -1)])

        # Conversations index 1: user_id + deleted_at + is_pinned + pinned_at + updated_at + _id (for cursor-based list/sorting)
        await db["conversations"].create_index([
            ("user_id", 1),
            ("deleted_at", 1),
            ("is_pinned", -1),
            ("pinned_at", -1),
            ("updated_at", -1),
            ("_id", -1)
        ])
        
        # Conversations index 2: search by normalized_title
        await db["conversations"].create_index([
            ("user_id", 1),
            ("deleted_at", 1),
            ("normalized_title", 1)
        ])
        
        # Messages index 1: compound conversation_id + created_at + _id (for cursor-based history pagination)
        await db["conversation_messages"].create_index([
            ("conversation_id", 1),
            ("created_at", -1),
            ("_id", -1)
        ])
        
        # Messages index 2: unique request_id + role compound index
        await db["conversation_messages"].create_index([("request_id", 1), ("role", 1)], unique=True)
        
        # Messages index 3: compound user_id + conversation_id
        await db["conversation_messages"].create_index([("user_id", 1), ("conversation_id", 1)])
        
        # Chat locks unique index
        await db["chat_locks"].create_index([("conversation_id", 1)], unique=True)
        
        # Chat locks TTL index
        await db["chat_locks"].create_index([("expires_at", 1)], expireAfterSeconds=0)

        # AI Answer Feedback unique compound index
        await db["ai_answer_feedback"].create_index([("user_id", 1), ("message_id", 1)], unique=True)

        # AI Answer Feedback query index
        await db["ai_answer_feedback"].create_index([("conversation_id", 1), ("user_id", 1)])

        # AI Usage Events indexes
        # Unique per event_id
        await db["ai_usage_events"].create_index([("event_id", 1)], unique=True)
        # Time-range queries (most common)
        await db["ai_usage_events"].create_index([("created_at", 1)])
        # By operation type + time (usage tab aggregation)
        await db["ai_usage_events"].create_index([("operation_type", 1), ("created_at", 1)])
        await db["ai_usage_events"].create_index([("feature", 1), ("created_at", 1)])
        # By status + time (error rate)
        await db["ai_usage_events"].create_index([("status", 1), ("created_at", 1)])
        # Per-user quota queries
        await db["ai_usage_events"].create_index([("user_id", 1), ("created_at", 1)])
        await db["ai_usage_events"].create_index([("provider", 1), ("created_at", 1)])
        await db["ai_usage_events"].create_index([("model", 1), ("created_at", 1)])
        await db["ai_usage_events"].create_index([("model_name", 1), ("created_at", 1)])
        await db["ai_usage_events"].create_index([("request_id", 1)])
        await db["ai_usage_events"].create_index([("document_id", 1), ("created_at", 1)])
        await db["ai_usage_events"].create_index([("conversation_id", 1), ("created_at", 1)])
        # Final logical operation queries (most dashboard queries)
        await db["ai_usage_events"].create_index([
            ("is_final", 1), ("event_kind", 1), ("created_at", 1)
        ])

        # Admin audit logs
        await db["audit_logs"].create_index([("created_at", -1)])
        await db["audit_logs"].create_index([("event_type", 1), ("created_at", -1)])
        await db["audit_logs"].create_index([("actor_user_id", 1), ("created_at", -1)])

        # User activity logs. Retention is configured separately and no TTL
        # index is created unless a cleanup job is explicitly introduced later.
        await db["user_activity_logs"].create_index([("user_id", 1), ("timestamp", -1)])
        await db["user_activity_logs"].create_index([("action", 1), ("timestamp", -1)])
        await db["user_activity_logs"].create_index([("category", 1), ("timestamp", -1)])
        await db["user_activity_logs"].create_index([("status", 1), ("timestamp", -1)])
        await db["user_activity_logs"].create_index([("resource_id", 1)])
        await db["user_activity_logs"].create_index([("resource_type", 1), ("timestamp", -1)])

        # Immutable admin audit logs for administrative mutations.
        await db["admin_audit_logs"].create_index([("admin_user_id", 1), ("timestamp", -1)])
        await db["admin_audit_logs"].create_index([("target_type", 1), ("target_id", 1)])
        await db["admin_audit_logs"].create_index([("action", 1), ("timestamp", -1)])
        await db["admin_audit_logs"].create_index([("result", 1), ("timestamp", -1)])

        # Website CMS content and immutable version snapshots.
        await db["website_content"].create_index([("section_key", 1)], unique=True)
        await db["website_content"].create_index([("status", 1), ("updated_at", -1)])
        await db["website_content_versions"].create_index([("section_key", 1), ("version", -1)])
        await db["website_content_versions"].create_index([("section_key", 1), ("created_at", -1)])

        # Runtime System Settings and Feature Flags.
        await db["system_settings"].create_index([("key", 1)], unique=True)
        await db["system_settings"].create_index([("category", 1), ("key", 1)])
        await db["system_settings"].create_index([("is_public", 1)])
        await db["feature_flags"].create_index([("key", 1)], unique=True)
        await db["feature_flags"].create_index([("enabled", 1), ("key", 1)])

        # System health and standardized error monitoring.
        await db["system_error_logs"].create_index([("timestamp", -1)])
        await db["system_error_logs"].create_index([("endpoint", 1), ("timestamp", -1)])
        await db["system_error_logs"].create_index([("severity", 1), ("timestamp", -1)])
        await db["system_error_logs"].create_index([("error_code", 1), ("timestamp", -1)])
        await db["system_error_logs"].create_index([("request_id", 1)])
        await db["system_health_snapshots"].create_index([("checked_at", -1)])

        # Notification Center and exportable admin reports.
        await db["admin_notifications"].create_index([("status", 1), ("starts_at", -1)])
        await db["admin_notifications"].create_index([("type", 1), ("created_at", -1)])
        await db["admin_notifications"].create_index([("audience_type", 1), ("created_at", -1)])
        await db["admin_notifications"].create_index([("target_roles", 1), ("starts_at", -1)])
        await db["admin_notifications"].create_index([("target_user_ids", 1), ("starts_at", -1)])
        await db["admin_notifications"].create_index([("expires_at", 1)])
        await db["notification_reads"].create_index([("notification_id", 1), ("user_id", 1)], unique=True)
        await db["notification_reads"].create_index([("user_id", 1), ("read_at", -1)])

        # Admin content management indexes
        await db["documents"].create_index([("user_id", 1), ("created_at", -1)])
        await db["documents"].create_index([("file_type", 1), ("created_at", -1)])
        await db["documents"].create_index([("status", 1), ("created_at", -1)])
        await db["documents"].create_index([("deleted_at", 1), ("created_at", -1)])
        await db["documents"].create_index([("quarantined_at", 1), ("created_at", -1)])
        await db["documents"].create_index([("user_id", 1), ("checksum", 1)])
        await db["verification_sessions"].create_index([("document_id", 1), ("created_at", -1)])
        await db["verification_sessions"].create_index([("status", 1), ("created_at", -1)])

        # Question Sets indexes
        # Primary: user history listing with soft-delete filter and sort
        await db["question_sets"].create_index([
            ("user_id", 1),
            ("deleted_at", 1),
            ("created_at", -1),
            ("_id", -1),
        ])
        # Per-document listing
        await db["question_sets"].create_index([
            ("document_id", 1),
            ("user_id", 1),
            ("deleted_at", 1),
            ("created_at", -1),
        ])
        # Published question bank listing
        await db["question_sets"].create_index([
            ("deleted_at", 1),
            ("published_question_count", -1),
            ("updated_at", -1),
        ])
        await db["question_sets"].create_index([("user_id", 1), ("created_at", -1)])
        await db["question_sets"].create_index([("document_id", 1), ("created_at", -1)])
        await db["question_sets"].create_index([("deleted_at", 1), ("created_at", -1)])
        await db["question_sets"].create_index([("question_type", 1), ("created_at", -1)])
        await db["question_sets"].create_index([("difficulty", 1), ("created_at", -1)])
        # Learner attempt history
        await db["question_attempts"].create_index([
            ("question_set_id", 1),
            ("user_id", 1),
            ("created_at", -1),
        ])
        await db["question_attempts"].create_index([
            ("document_id", 1),
            ("user_id", 1),
            ("created_at", -1),
        ])

        # Lecturer classes / student groups (exam assignment targeting)
        await db["classes"].create_index([("owner_id", 1), ("deleted_at", 1)])
        await db["classes"].create_index([("student_ids", 1)])
        await db["classes"].create_index([("deleted_at", 1), ("created_at", -1)])

        logger.info("Đã khởi tạo thành công các chỉ mục MongoDB cho hỏi đáp nâng cao.")
        mongodb_indexes_created = True
    except Exception as e:
        logger.error(f"Lỗi khi khởi tạo chỉ mục MongoDB: {e}")
        mongodb_indexes_created = False


def is_indexes_ready() -> bool:
    """Check if indexes are created successfully"""
    return mongodb_indexes_created
