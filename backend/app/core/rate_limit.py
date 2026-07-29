"""Rate limiter dùng chung cho các API tốn chi phí (AI call, web-grounding...).

Chuyển ra từ `app/services/learning_chat_service.py` (nơi định nghĩa gốc,
dùng riêng cho chat) thành tiện ích dùng chung — không đổi hành vi, chỉ đổi
vị trí để các phân hệ mới (web-knowledge, curriculum ingest...) tái sử dụng
thay vì mỗi nơi tự viết lại.

Giới hạn đã biết: đây là bộ đếm trong-tiến-trình (in-memory), không chia sẻ
giữa nhiều worker process — đủ dùng cho quy mô hiện tại (một tiến trình
uvicorn). Nếu triển khai nhiều worker/instance sau này, cân nhắc Redis (xem
docs/feature-expansion/01-target-architecture.md — hiện chưa cần).
"""

from __future__ import annotations

import asyncio
import time
from typing import Dict, List

from fastapi import HTTPException, status


class SlidingWindowLimiter:
    def __init__(self, limit: int, window: int = 60):
        self.limit = limit
        self.window = window
        self.history: Dict[str, List[float]] = {}
        self.lock = asyncio.Lock()

    async def check_rate_limit(self, user_id: str, *, detail: str | None = None) -> None:
        async with self.lock:
            now = time.time()
            if user_id not in self.history:
                self.history[user_id] = []

            self.history[user_id] = [t for t in self.history[user_id] if now - t < self.window]

            if len(self.history[user_id]) >= self.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=detail
                    or f"Bạn đã vượt quá giới hạn (tối đa {self.limit} lượt/{self.window}s). Vui lòng thử lại sau.",
                )

            self.history[user_id].append(now)
