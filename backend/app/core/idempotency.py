"""Cơ chế idempotency-key dùng chung cho mọi API tạo/nộp/xử lý.

Thiết kế tối giản trên MongoDB (không cần Redis — xem
docs/feature-expansion/01-target-architecture.md): một collection
`idempotency_records` với unique index trên `(scope, key)`. Lần gọi đầu tiên
với một key "claim" bản ghi bằng insert (atomic — MongoDB tự chặn trùng qua
unique index), chạy hàm nghiệp vụ, rồi lưu kết quả. Lần gọi lặp lại với cùng
key trả thẳng kết quả đã lưu, không chạy lại hàm nghiệp vụ.

Dùng cho: bắt đầu bài thi, nộp bài, autosave, tạo blueprint, generate đề,
webhook Cloudinary (idempotent theo notification_type+asset_id+timestamp).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional, TypeVar

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

logger = logging.getLogger("app.core.idempotency")

COLLECTION_NAME = "idempotency_records"

T = TypeVar("T")


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_idempotency_index(db) -> None:
    """Tạo unique index (scope, key) — gọi 1 lần lúc khởi động app.

    `create_index` là thao tác idempotent phía MongoDB (không tạo trùng nếu
    đã tồn tại cùng định nghĩa), an toàn gọi lại mỗi lần khởi động.
    """
    await db[COLLECTION_NAME].create_index(
        [("scope", 1), ("key", 1)], name="scope_key_unique", unique=True
    )


class IdempotencyConflict(Exception):
    """Một request khác với cùng idempotency-key đang xử lý dở (chưa xong)."""


async def run_idempotent(
    db,
    *,
    scope: str,
    key: str,
    fn: Callable[[], Awaitable[T]],
) -> T:
    """Chạy `fn()` đúng một lần cho mỗi `(scope, key)`.

    - Nếu key đã có kết quả hoàn tất → trả lại kết quả cũ, KHÔNG chạy `fn`.
    - Nếu key đang "in_progress" (một request khác cùng key chưa xử lý xong)
      → raise `IdempotencyConflict` (router quyết định trả 409 hay chờ).
    - Nếu key chưa tồn tại → claim bằng insert, chạy `fn`, lưu kết quả.
    - Nếu `fn` raise lỗi → xoá bản ghi claim để lần gọi sau (retry) được phép
      chạy lại — không khoá vĩnh viễn một key chỉ vì lần thử đầu thất bại.
    """
    collection = db[COLLECTION_NAME]
    existing = await collection.find_one({"scope": scope, "key": key})
    if existing is not None:
        if existing.get("status") == "completed":
            return existing["result"]
        raise IdempotencyConflict(
            f"Yêu cầu với idempotency-key '{key}' đang được xử lý, vui lòng thử lại sau."
        )

    try:
        await collection.insert_one(
            {
                "scope": scope,
                "key": key,
                "status": "in_progress",
                "result": None,
                "created_at": _now(),
                "completed_at": None,
            }
        )
    except DuplicateKeyError:
        # Thua trong cuộc đua claim (request khác vừa insert trước) — đọc lại.
        existing = await collection.find_one({"scope": scope, "key": key})
        if existing and existing.get("status") == "completed":
            return existing["result"]
        raise IdempotencyConflict(
            f"Yêu cầu với idempotency-key '{key}' đang được xử lý, vui lòng thử lại sau."
        )

    try:
        result = await fn()
    except Exception:
        await collection.delete_one({"scope": scope, "key": key})
        raise

    await collection.update_one(
        {"scope": scope, "key": key},
        {"$set": {"status": "completed", "result": result, "completed_at": _now()}},
    )
    return result


async def require_idempotency_key(idempotency_key: Optional[str]) -> str:
    """Dependency helper: bắt buộc header Idempotency-Key cho endpoint nhạy cảm."""
    if not idempotency_key or not idempotency_key.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Thiếu header Idempotency-Key bắt buộc cho thao tác này.",
        )
    return idempotency_key.strip()
