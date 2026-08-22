"""Single-use account tokens stored as hashes, never as bearer secrets."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from pymongo import ReturnDocument


COLLECTION = "account_tokens"


def _hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def ensure_account_token_indexes(db) -> None:
    await db[COLLECTION].create_index("expires_at", expireAfterSeconds=0)
    await db[COLLECTION].create_index([("token_hash", 1), ("purpose", 1)], unique=True)


async def issue_account_token(
    db,
    *,
    user_id: str,
    purpose: str,
    expires_minutes: int = 30,
) -> str:
    now = datetime.now(timezone.utc)
    await db[COLLECTION].update_many(
        {"user_id": user_id, "purpose": purpose, "used_at": None},
        {"$set": {"used_at": now}},
    )
    raw_token = secrets.token_urlsafe(32)
    await db[COLLECTION].insert_one({
        "user_id": user_id,
        "purpose": purpose,
        "token_hash": _hash(raw_token),
        "expires_at": now + timedelta(minutes=expires_minutes),
        "used_at": None,
        "created_at": now,
    })
    return raw_token


async def consume_account_token(db, *, raw_token: str, purpose: str) -> str | None:
    now = datetime.now(timezone.utc)
    doc = await db[COLLECTION].find_one_and_update(
        {
            "token_hash": _hash(raw_token),
            "purpose": purpose,
            "used_at": None,
            "expires_at": {"$gt": now},
        },
        {"$set": {"used_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    return str(doc["user_id"]) if doc else None
