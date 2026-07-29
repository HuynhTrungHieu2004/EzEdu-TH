import logging
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.correlation import (
    CorrelationIdLogFilter,
    correlation_id_middleware,
    get_correlation_id,
    get_request_id,
)


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.middleware("http")(correlation_id_middleware)

    @app.get("/ping")
    async def ping():
        return {"request_id": get_request_id(), "correlation_id": get_correlation_id()}

    return app


class CorrelationMiddlewareTests(unittest.TestCase):
    """Kiểm thử middleware sinh/lan truyền request_id + correlation_id
    (backend/app/core/correlation.py) — hạ tầng cho structured logging và
    truy vết một luồng nghiệp vụ xuyên nhiều request/job nền.
    """

    def setUp(self):
        self.client = TestClient(_build_test_app())

    def test_generates_request_id_and_correlation_id_when_absent(self):
        response = self.client.get("/ping")
        body = response.json()

        self.assertIn("X-Request-ID", response.headers)
        self.assertIn("X-Correlation-ID", response.headers)
        self.assertEqual(response.headers["X-Request-ID"], body["request_id"])
        # Không có Correlation-ID gửi lên → mặc định trùng request_id của request đầu tiên.
        self.assertEqual(response.headers["X-Correlation-ID"], response.headers["X-Request-ID"])

    def test_reuses_client_supplied_correlation_id(self):
        response = self.client.get("/ping", headers={"X-Correlation-ID": "trace-abc-123"})
        self.assertEqual(response.headers["X-Correlation-ID"], "trace-abc-123")
        # request_id vẫn được sinh mới cho riêng lần gọi này, khác correlation_id.
        self.assertNotEqual(response.headers["X-Request-ID"], "trace-abc-123")

    def test_reuses_client_supplied_request_id(self):
        response = self.client.get("/ping", headers={"X-Request-ID": "my-request-id"})
        self.assertEqual(response.headers["X-Request-ID"], "my-request-id")

    def test_two_requests_get_different_request_ids(self):
        first = self.client.get("/ping").headers["X-Request-ID"]
        second = self.client.get("/ping").headers["X-Request-ID"]
        self.assertNotEqual(first, second)

    def test_response_includes_timing_header(self):
        response = self.client.get("/ping")
        self.assertIn("X-Response-Time-Ms", response.headers)
        self.assertGreaterEqual(float(response.headers["X-Response-Time-Ms"]), 0)


class CorrelationLogFilterTests(unittest.TestCase):
    def test_filter_attaches_default_dash_outside_request_context(self):
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname=__file__, lineno=1, msg="hello", args=(), exc_info=None
        )
        CorrelationIdLogFilter().filter(record)
        self.assertEqual(record.request_id, "-")
        self.assertEqual(record.correlation_id, "-")


if __name__ == "__main__":
    unittest.main()
