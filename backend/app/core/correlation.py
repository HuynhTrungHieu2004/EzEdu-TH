"""Correlation ID / Request ID cho structured logging xuyên suốt một request.

Middleware sinh (hoặc tái sử dụng nếu client đã gửi) hai giá trị:
- request_id: định danh riêng cho lần gọi HTTP này.
- correlation_id: định danh xuyên suốt một luồng nghiệp vụ có thể gồm nhiều
  request (ví dụ: một job nền được kích hoạt từ request này) — client có thể
  gửi lên qua header `X-Correlation-ID` để nối các bước lại với nhau; nếu
  không gửi, correlation_id mặc định trùng request_id của request đầu tiên.

Dùng contextvars để mọi log line trong cùng một request tự động có 2 giá trị
này mà không cần truyền tay qua từng hàm — logging_filter() gắn vào root
logger một lần ở app/main.py.
"""

from __future__ import annotations

import logging
import time
import uuid
from contextvars import ContextVar
from typing import Callable

from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"
CORRELATION_ID_HEADER = "X-Correlation-ID"

_request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")
_correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="-")


def get_request_id() -> str:
    return _request_id_ctx.get()


def get_correlation_id() -> str:
    return _correlation_id_ctx.get()


def new_id() -> str:
    return uuid.uuid4().hex


class CorrelationIdLogFilter(logging.Filter):
    """Gắn request_id/correlation_id hiện tại vào mọi LogRecord.

    Đăng ký một lần trên root logger (`app/main.py`) — mọi `logging.getLogger(x)`
    trong toàn bộ codebase kế thừa filter này tự động, không cần sửa từng nơi
    gọi `logger.info(...)` hiện có.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        record.correlation_id = get_correlation_id()
        return True


async def correlation_id_middleware(request: Request, call_next: Callable) -> Response:
    """Middleware FastAPI: sinh/lan truyền request_id + correlation_id.

    Đặt TRƯỚC error_monitoring_middleware trong chuỗi middleware (đăng ký sau
    trong `add_middleware`/`@app.middleware` chạy trước — xem app/main.py) để
    log lỗi cũng có sẵn 2 id này.
    """
    incoming_request_id = request.headers.get(REQUEST_ID_HEADER)
    incoming_correlation_id = request.headers.get(CORRELATION_ID_HEADER)

    request_id = incoming_request_id or new_id()
    correlation_id = incoming_correlation_id or request_id

    request_token = _request_id_ctx.set(request_id)
    correlation_token = _correlation_id_ctx.set(correlation_id)
    request.state.request_id = request_id
    request.state.correlation_id = correlation_id

    started_at = time.perf_counter()
    try:
        response = await call_next(request)
    finally:
        _request_id_ctx.reset(request_token)
        _correlation_id_ctx.reset(correlation_token)

    duration_ms = (time.perf_counter() - started_at) * 1000
    response.headers[REQUEST_ID_HEADER] = request_id
    response.headers[CORRELATION_ID_HEADER] = correlation_id
    response.headers["X-Response-Time-Ms"] = f"{duration_ms:.1f}"
    return response
