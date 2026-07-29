"""Structured logging (JSON) cho toàn bộ ứng dụng — không đổi thư viện logging
chuẩn của Python, chỉ đổi formatter + gắn `request_id`/`correlation_id` vào
mọi dòng log (qua `CorrelationIdLogFilter`, xem `app/core/correlation.py`).

QUY TẮC BẮT BUỘC khi ghi log ở bất kỳ đâu trong ứng dụng: KHÔNG log nội dung
prompt gửi AI, câu trả lời của AI, hay câu trả lời của học sinh — những nội
dung này có thể chứa dữ liệu nhạy cảm/cá nhân. Chỉ log độ dài, hash, hoặc
metadata (model, latency_ms, status, error_code) — đúng như
`analytics_service.record_event()` hiện tại đã làm.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from app.core.correlation import CorrelationIdLogFilter

_RESERVED_RECORD_ATTRS = frozenset(logging.LogRecord(
    name="", level=0, pathname="", lineno=0, msg="", args=(), exc_info=None
).__dict__.keys()) | {"message", "asctime"}


class JsonLogFormatter(logging.Formatter):
    """Định dạng mỗi log line thành một dòng JSON — dễ parse bởi công cụ quan
    sát bên ngoài (nếu sau này có), vẫn đọc được trực tiếp trong terminal khi
    phát triển cục bộ.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            "correlation_id": getattr(record, "correlation_id", "-"),
        }
        # Cho phép truyền thêm field tuỳ endpoint qua `logger.info(msg, extra={...})`
        # — bất kỳ key nào caller tự thêm (không nằm trong field chuẩn của
        # LogRecord) đều được đưa vào JSON, hỗ trợ log timing/metric có cấu
        # trúc (upload/parse/embed/retrieval/AI-response/chấm bài) theo đúng
        # yêu cầu observability.
        for key, value in record.__dict__.items():
            if key not in _RESERVED_RECORD_ATTRS and key not in payload:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    """Gọi một lần lúc khởi động (app/main.py và app/worker.py).

    An toàn gọi lại nhiều lần (ví dụ trong test) — luôn xoá handler cũ trước
    khi thêm handler mới để tránh log bị nhân đôi.
    """
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    for existing_handler in list(root_logger.handlers):
        root_logger.removeHandler(existing_handler)

    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    root_logger.addHandler(handler)

    has_correlation_filter = any(
        isinstance(existing_filter, CorrelationIdLogFilter) for existing_filter in root_logger.filters
    )
    if not has_correlation_filter:
        root_logger.addFilter(CorrelationIdLogFilter())
