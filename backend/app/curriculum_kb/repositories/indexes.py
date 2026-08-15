"""Index cho kho tri thức chuẩn (Giai đoạn 7)."""

import logging

from pymongo import ASCENDING, DESCENDING

from app.curriculum_kb.constants.collections import CRAWL_BATCHES, CRAWL_ITEMS, CURRICULUM_SOURCES

logger = logging.getLogger("app.curriculum_kb.repositories.indexes")


async def ensure_curriculum_kb_indexes(db) -> None:
    try:
        await db[CURRICULUM_SOURCES].create_index([("owner_id", ASCENDING), ("review_status", ASCENDING)], name="source_owner_review")
        await db[CURRICULUM_SOURCES].create_index(
            [("review_status", ASCENDING), ("ingest_status", ASCENDING), ("subject_id", ASCENDING)], name="source_published_lookup"
        )
        await db[CURRICULUM_SOURCES].create_index([("created_at", DESCENDING)], name="source_created_at")
        await db[CRAWL_BATCHES].create_index(
            [("owner_id", ASCENDING), ("created_at", DESCENDING)], name="crawl_batch_owner_created"
        )
        await db[CRAWL_ITEMS].create_index(
            [("batch_id", ASCENDING), ("canonical_url", ASCENDING)],
            name="crawl_item_batch_url",
            unique=True,
        )
        await db[CRAWL_ITEMS].create_index(
            [("owner_id", ASCENDING), ("review_status", ASCENDING)], name="crawl_item_owner_review"
        )
    except Exception as e:  # noqa: BLE001 - không chặn startup vì 1 index lỗi
        logger.error("curriculum_kb.index_creation_failed", extra={"error": str(e)})
