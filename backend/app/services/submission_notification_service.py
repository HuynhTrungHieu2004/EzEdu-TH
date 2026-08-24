"""Best-effort notifications for submitted exam attempts."""

import logging
from datetime import datetime, timezone

from pymongo import ASCENDING


logger = logging.getLogger(__name__)


async def ensure_submission_notification_indexes(db) -> None:
    collection = db["admin_notifications"]
    indexes = await collection.index_information()
    if any(
        index.get("key") == [("dedupe_key", ASCENDING)]
        and index.get("unique") is True
        and index.get("sparse") is True
        for index in indexes.values()
    ):
        return
    await collection.create_index(
        [("dedupe_key", ASCENDING)],
        unique=True,
        sparse=True,
    )


async def upsert_submission_notification(
    db,
    *,
    teacher_id: str,
    attempt_id: str,
    title: str,
    content: str,
    action_url: str,
) -> bool:
    now = datetime.now(timezone.utc)
    dedupe_key = f"submission:{attempt_id}"
    try:
        await db["admin_notifications"].update_one(
            {"dedupe_key": dedupe_key},
            {
                "$set": {
                    "title": title,
                    "content": content,
                    "action_url": action_url,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "type": "exam",
                    "audience_type": "users",
                    "target_roles": [],
                    "target_user_ids": [teacher_id],
                    "priority": "normal",
                    "status": "published",
                    "starts_at": now,
                    "expires_at": None,
                    "created_by": "system",
                    "created_at": now,
                    "published_at": now,
                    "source_type": "submission",
                    "source_id": attempt_id,
                    "dedupe_key": dedupe_key,
                },
            },
            upsert=True,
        )
        return True
    except Exception:
        logger.exception("submission_notification.upsert_failed", extra={"attempt_id": attempt_id})
        return False
