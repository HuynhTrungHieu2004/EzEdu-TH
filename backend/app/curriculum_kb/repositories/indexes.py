"""Index cho kho tri thức chuẩn (Giai đoạn 7)."""

import logging

from pymongo import ASCENDING, DESCENDING

from app.curriculum_kb.constants.collections import CURRICULUM_SOURCES

logger = logging.getLogger("app.curriculum_kb.repositories.indexes")


async def ensure_curriculum_kb_indexes(db) -> None:
    try:
        await db[CURRICULUM_SOURCES].create_index([("owner_id", ASCENDING), ("review_status", ASCENDING)], name="source_owner_review")
        await db[CURRICULUM_SOURCES].create_index(
            [("review_status", ASCENDING), ("ingest_status", ASCENDING), ("subject_id", ASCENDING)], name="source_published_lookup"
        )
        await db[CURRICULUM_SOURCES].create_index([("created_at", DESCENDING)], name="source_created_at")
    except Exception as e:  # noqa: BLE001 - không chặn startup vì 1 index lỗi
        logger.error("curriculum_kb.index_creation_failed", extra={"error": str(e)})
