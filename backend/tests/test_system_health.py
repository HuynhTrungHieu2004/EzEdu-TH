import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient
from starlette.requests import Request

from app.core.rbac import Permission, require_permission
from app.schemas.auth import UserResponse


def actor(role: str = "admin") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


def request(path: str = "/api/v1/admin/dashboard/boom", method: str = "GET") -> Request:
    return Request({
        "type": "http",
        "method": method,
        "path": path,
        "headers": [(b"x-request-id", b"req-123")],
        "query_string": b"",
        "server": ("testserver", 80),
        "scheme": "http",
        "client": ("127.0.0.1", 12345),
    })


class SystemHealthTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_system_health"]
        self.db_patch = patch("app.services.system_health_service.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def test_health_success(self):
        from app.services import system_health_service as service

        async def ok():
            return "healthy", "ok", {}

        with patch.object(service, "_check_fastapi", ok), \
            patch.object(service, "_check_mongodb", ok), \
            patch.object(service, "_check_mongodb_indexes", ok), \
            patch.object(service, "_check_chromadb", ok), \
            patch.object(service, "_check_provider", AsyncMock(return_value=("healthy", "configured", {"live_ping": False}))), \
            patch.object(service, "_check_embedding", ok), \
            patch.object(service, "_check_web_search", ok), \
            patch.object(service, "_check_document_processing", ok), \
            patch.object(service, "_check_background_jobs", ok), \
            patch.object(service, "_check_storage", ok):
            health = await service.get_system_health(database=self.db)

        self.assertEqual(health.status, "healthy")
        self.assertGreaterEqual(len(health.components), 12)
        self.assertEqual(await self.db["system_health_snapshots"].count_documents({}), 1)

    async def test_health_timeout_marks_component_down(self):
        from app.services import system_health_service as service

        async def slow():
            await asyncio.sleep(0.05)
            return "healthy", "late", {}

        with patch.object(service, "HEALTH_CHECK_TIMEOUT_SECONDS", 0.001):
            component = await service._timed_component("slow_service", slow)

        self.assertEqual(component.status, "down")
        self.assertEqual(component.details.get("error_code"), "HEALTH_TIMEOUT")

    async def test_record_error_log_does_not_leak_secret_message_for_server_errors(self):
        from app.services.system_health_service import record_error_log

        doc = await record_error_log(
            request=request(),
            status_code=500,
            duration_ms=42,
            message="password_hash=secret jwt_token=abc stack trace",
            error_code="CRASH",
            user_id="user-1",
            database=self.db,
        )

        self.assertEqual(doc["message_safe"], "Lỗi máy chủ nội bộ.")
        self.assertNotIn("secret", str(doc).lower())
        stored = await self.db["system_error_logs"].find_one({"error_id": doc["error_id"]})
        self.assertIsNotNone(stored)
        self.assertEqual(stored["request_id"], "req-123")

    async def test_permission(self):
        guard = require_permission(Permission.SYSTEM_HEALTH_VIEW)
        self.assertEqual((await guard(actor("admin"))).role, "admin")
        with self.assertRaises(HTTPException):
            await guard(actor("user"))

    async def test_error_aggregation(self):
        from app.services.system_health_service import get_error_monitoring

        now = datetime.now(timezone.utc)
        await self.db["system_error_logs"].insert_many([
            {
                "error_id": "err-1",
                "timestamp": now - timedelta(minutes=3),
                "service": "fastapi",
                "endpoint": "/api/v1/documents",
                "method": "POST",
                "status_code": 504,
                "error_code": "TIMEOUT",
                "message_safe": "Yêu cầu quá thời gian.",
                "duration_ms": 3000,
                "severity": "critical",
            },
            {
                "error_id": "err-2",
                "timestamp": now - timedelta(minutes=2),
                "service": "fastapi",
                "endpoint": "/api/v1/documents",
                "method": "POST",
                "status_code": 429,
                "error_code": "RATE_LIMITED",
                "message_safe": "Vượt giới hạn sử dụng.",
                "duration_ms": 250,
                "severity": "warning",
            },
        ])
        await self.db["ai_usage_events"].insert_many([
            {
                "created_at": now,
                "status": "failure",
                "provider": "gemini",
                "model": "gemini-2.5-flash",
            },
            {
                "created_at": now,
                "status": "success",
                "provider": "gemini",
                "model": "gemini-2.5-flash",
            },
        ])

        result = await get_error_monitoring(
            from_date=now - timedelta(hours=1),
            to_date=now + timedelta(seconds=1),
            database=self.db,
        )

        self.assertEqual(result.summary.total_errors, 2)
        self.assertEqual(result.summary.timeout_count, 1)
        self.assertEqual(result.summary.by_severity["critical"], 1)
        self.assertEqual(result.summary.top_endpoints[0]["endpoint"], "/api/v1/documents")
        self.assertEqual(result.summary.top_ai_models[0]["model"], "gemini-2.5-flash")
        self.assertAlmostEqual(result.summary.error_rate, 66.6666, places=2)

    async def test_unknown_provider_when_not_configured(self):
        from app.services.system_health_service import _check_provider

        with patch("app.services.llm_service.is_gemini_available", return_value=False):
            status, message, details = await _check_provider("gemini")

        self.assertEqual(status, "unknown")
        self.assertFalse(details["live_ping"])
        self.assertNotIn("api_key", message.lower())


if __name__ == "__main__":
    unittest.main()
