"""Index cho phân hệ khám phá kiến thức Internet (Giai đoạn 6)."""

import logging

from pymongo import ASCENDING, DESCENDING

from app.web_knowledge.constants.collections import (
    WEB_KNOWLEDGE_CACHE,
    WEB_KNOWLEDGE_QUOTA,
    WEB_KNOWLEDGE_SOURCES,
)

logger = logging.getLogger("app.web_knowledge.repositories.indexes")


async def ensure_web_knowledge_indexes(db) -> None:
    try:
        await db[WEB_KNOWLEDGE_CACHE].create_index([("normalized_query", ASCENDING)], name="cache_normalized_query", unique=True)
        await db[WEB_KNOWLEDGE_CACHE].create_index([("expires_at", ASCENDING)], name="cache_ttl", expireAfterSeconds=0)
        await db[WEB_KNOWLEDGE_QUOTA].create_index([("user_id", ASCENDING), ("date", ASCENDING)], name="quota_user_date", unique=True)
        await db[WEB_KNOWLEDGE_SOURCES].create_index([("owner_id", ASCENDING), ("status", ASCENDING)], name="source_owner_status")
        await db[WEB_KNOWLEDGE_SOURCES].create_index([("status", ASCENDING), ("created_at", DESCENDING)], name="source_status_created")
    except Exception as e:  # noqa: BLE001 - không chặn startup vì 1 index lỗi
        logger.error("web_knowledge.index_creation_failed", extra={"error": str(e)})
