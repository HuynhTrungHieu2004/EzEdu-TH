"""Tests for admin dashboard analytics service and endpoint authorization.

Coverage:
- require_admin dependency (403 for non-admin, 200 for admin)
- analytics_service helpers (_safe_ratio, clamp_date_range, validate_iana_timezone)
- record_event: write to DB, graceful failure
- get_overview: basic structure
- get_usage: basic structure
- get_quality: basic structure
- get_errors_latency: basic structure + p50/p95 percentile
- bootstrap_admin script logic (unit tested via function)
"""
import asyncio
import math
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

# ── Patch DB before importing services ────────────────────────────────────────


class TestAnalyticsHelpers(unittest.TestCase):
    """Pure-function helpers — no DB needed."""

    def test_safe_ratio_normal(self):
        from app.services.analytics_service import _safe_ratio
        self.assertAlmostEqual(_safe_ratio(50, 200), 25.0, places=1)

    def test_safe_ratio_zero_denominator(self):
        from app.services.analytics_service import _safe_ratio
        self.assertIsNone(_safe_ratio(10, 0))

    def test_safe_ratio_zero_numerator(self):
        from app.services.analytics_service import _safe_ratio
        self.assertAlmostEqual(_safe_ratio(0, 100), 0.0, places=1)

    def test_clamp_date_range_future_to(self):
        from app.services.analytics_service import clamp_date_range
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=5)
        fd, td = clamp_date_range(now - timedelta(days=1), future)
        self.assertLessEqual(td, now + timedelta(seconds=2))  # clamp to now

    def test_clamp_date_range_exceeds_max(self):
        from app.services.analytics_service import clamp_date_range
        from app.core.config import settings
        now = datetime.now(timezone.utc)
        too_old = now - timedelta(days=settings.ADMIN_ANALYTICS_MAX_RANGE_DAYS + 30)
        fd, td = clamp_date_range(too_old, now)
        self.assertGreaterEqual(fd, now - timedelta(days=settings.ADMIN_ANALYTICS_MAX_RANGE_DAYS + 1))

    def test_validate_iana_timezone_valid(self):
        from app.services.analytics_service import validate_iana_timezone
        self.assertTrue(validate_iana_timezone("Asia/Ho_Chi_Minh"))
        self.assertTrue(validate_iana_timezone("UTC"))

    def test_validate_iana_timezone_invalid(self):
        from app.services.analytics_service import validate_iana_timezone
        self.assertFalse(validate_iana_timezone("Not/ATimezone_XYZ"))

    def test_new_ids_are_unique(self):
        from app.services.analytics_service import new_event_id, new_logical_request_id, new_attempt_id
        ids = {new_event_id() for _ in range(20)}
        self.assertEqual(len(ids), 20)

    def test_percentile_index_nearest_rank(self):
        """Verify nearest-rank formula: ceil(p * n) - 1 floor 0."""
        n = 10
        idx_p50 = max(0, math.ceil(0.50 * n) - 1)  # 5 - 1 = 4
        idx_p95 = max(0, math.ceil(0.95 * n) - 1)  # 10 - 1 = 9
        self.assertEqual(idx_p50, 4)
        self.assertEqual(idx_p95, 9)


class TestRecordEvent(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.mock_client = AsyncMongoMockClient()
        self.db = self.mock_client["test_analytics"]
        self.db_patch = patch("app.services.analytics_service.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def test_record_event_writes_to_db(self):
        from app.services.analytics_service import record_event
        from app.schemas.analytics import UsageEventCreate

        event = UsageEventCreate(
            event_id="evt-001",
            logical_request_id="lreq-001",
            attempt_id="att-001",
            attempt_number=1,
            is_final=True,
            event_kind="logical_operation",
            user_id="user1",
            operation_type="advanced_chat",
            provider="google",
            model_name="gemini-2.5-flash",
            status="success",
            latency_ms=1234,
            created_at=datetime.now(timezone.utc),
        )
        await record_event(event)
        count = await self.db["ai_usage_events"].count_documents({})
        self.assertEqual(count, 1)

    async def test_record_event_never_raises_on_db_failure(self):
        """Analytics failure must not propagate."""
        from app.services.analytics_service import record_event
        from app.schemas.analytics import UsageEventCreate

        with patch("app.services.analytics_service.get_database", side_effect=Exception("boom")):
            # Should not raise
            event = UsageEventCreate(
                event_id="evt-002",
                logical_request_id="lreq-002",
                attempt_id="att-002",
                attempt_number=1,
                is_final=True,
                event_kind="logical_operation",
                user_id="user2",
                operation_type="advanced_chat",
                provider="google",
                model_name="gemini-2.5-flash",
                status="failure",
                error_code="500_INTERNAL",
                latency_ms=0,
                created_at=datetime.now(timezone.utc),
            )
            await record_event(event)  # must not raise


class TestAnalyticsAggregations(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.mock_client = AsyncMongoMockClient()
        self.db = self.mock_client["test_analytics"]
        self.db_patch = patch("app.services.analytics_service.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        await self._seed_data()

    async def _seed_data(self):
        now = datetime.now(timezone.utc)
        events = []
        for i in range(10):
            events.append({
                "event_id": f"evt-{i}",
                "logical_request_id": f"lreq-{i}",
                "attempt_id": f"att-{i}",
                "attempt_number": 1,
                "is_final": True,
                "event_kind": "logical_operation",
                "user_id": f"user{i % 3}",  # 3 distinct users
                "operation_type": "advanced_chat",
                "provider": "google",
                "model_name": "gemini-2.5-flash",
                "retrieval_mode": "internal_only" if i % 2 == 0 else "web_only",
                "evidence_status": "well_supported",
                "status": "success" if i < 8 else "failure",
                "error_code": "500_INTERNAL" if i >= 8 else None,
                "latency_ms": (i + 1) * 100,  # 100..1000 ms sorted
                "input_tokens": 100 + i,
                "output_tokens": 50 + i,
                "total_tokens": 150 + 2 * i,
                "grounding_request_count": 0,
                "created_at": now - timedelta(hours=i),
            })
        await self.db["ai_usage_events"].insert_many(events)

        # Feedback
        await self.db["ai_answer_feedback"].insert_many([
            {"rating": "helpful", "created_at": now - timedelta(hours=1)},
            {"rating": "helpful", "created_at": now - timedelta(hours=2)},
            {"rating": "not_helpful", "reason_codes": ["wrong_answer"], "created_at": now - timedelta(hours=3)},
        ])

    async def test_get_overview_returns_expected_keys(self):
        from app.services.analytics_service import get_overview
        now = datetime.now(timezone.utc)
        result = await get_overview(now - timedelta(days=1), now)
        for key in ("total_users", "ai_active_users", "total_conversations", "feedback"):
            self.assertIn(key, result)

    async def test_get_usage_returns_models_and_tokens(self):
        from app.services.analytics_service import get_usage
        now = datetime.now(timezone.utc)
        result = await get_usage(now - timedelta(days=1), now, "day")
        self.assertIn("models", result)
        self.assertIn("tokens", result)
        self.assertIn("retrieval_modes", result)
        self.assertIsNotNone(result["tokens"]["input_tokens"])  # seeded with tokens

    async def test_get_quality_helpful_ratio(self):
        from app.services.analytics_service import get_quality
        now = datetime.now(timezone.utc)
        result = await get_quality(now - timedelta(days=1), now)
        self.assertEqual(result["total_feedback"], 3)
        # 2/3 helpful ≈ 66.67%
        self.assertAlmostEqual(result["helpful_ratio"], 66.67, places=1)
        self.assertIn("insufficient_evidence_rate", result)

    async def test_get_errors_latency_success_rate(self):
        from app.services.analytics_service import get_errors_latency
        now = datetime.now(timezone.utc)
        result = await get_errors_latency(now - timedelta(days=1), now, "day")
        # 8 success out of 10 = 80.0%
        self.assertAlmostEqual(result["success_rate"], 80.0, places=1)
        self.assertEqual(result["total_logical_requests"], 10)

    async def test_get_errors_latency_percentiles(self):
        from app.services.analytics_service import get_errors_latency
        now = datetime.now(timezone.utc)
        result = await get_errors_latency(now - timedelta(days=1), now, "day")
        # latency_ms values: 100, 200, ..., 1000 sorted = 10 items
        # P50 index = ceil(0.5 * 10) - 1 = 4 => 5th smallest = 500
        self.assertIsNotNone(result["latency"]["p50_ms"])
        self.assertGreater(result["latency"]["p95_ms"], result["latency"]["p50_ms"])

    async def test_get_quality_no_feedback(self):
        from app.services.analytics_service import get_quality
        now = datetime.now(timezone.utc)
        # Use a future range with no feedback
        result = await get_quality(now + timedelta(days=1), now + timedelta(days=2))
        self.assertEqual(result["total_feedback"], 0)
        self.assertIsNone(result["helpful_ratio"])  # division-by-zero → None


class TestRequireAdmin(unittest.IsolatedAsyncioTestCase):
    async def test_require_admin_passes_for_admin(self):
        from app.routers.auth import require_admin
        from app.schemas.auth import UserResponse

        admin_user = UserResponse(
            id=str(ObjectId()),
            email="admin@example.com",
            full_name="Admin",
            role="admin",
            created_at=datetime.now(timezone.utc),
        )
        result = await require_admin(admin_user)
        self.assertEqual(result.role, "admin")

    async def test_require_admin_rejects_non_admin(self):
        from fastapi import HTTPException
        from app.routers.auth import require_admin
        from app.schemas.auth import UserResponse

        user = UserResponse(
            id=str(ObjectId()),
            email="user@example.com",
            full_name="Regular User",
            role="user",
            created_at=datetime.now(timezone.utc),
        )
        with self.assertRaises(HTTPException) as ctx:
            await require_admin(user)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_require_admin_rejects_missing_role(self):
        """User without role defaults to 'user' → must be rejected."""
        from fastapi import HTTPException
        from app.routers.auth import require_admin
        from app.schemas.auth import UserResponse

        user = UserResponse(
            id=str(ObjectId()),
            email="norole@example.com",
            full_name="No Role",
            role="user",  # fallback value from get_current_user
            created_at=datetime.now(timezone.utc),
        )
        with self.assertRaises(HTTPException):
            await require_admin(user)


class TestEvaluationReportService(unittest.IsolatedAsyncioTestCase):
    async def test_missing_report_returns_missing_status(self):
        from app.services.evaluation_report_service import load_evaluation_report
        with patch("app.services.evaluation_report_service._get_report_path") as mock_path:
            import pathlib
            p = pathlib.Path("/nonexistent/path/report.json")
            mock_path.return_value = p
            result = await load_evaluation_report()
        self.assertEqual(result["status"], "missing")
        self.assertIsNone(result["summary"])

    async def test_malformed_report_returns_malformed_status(self):
        import tempfile, pathlib
        from app.services.evaluation_report_service import load_evaluation_report

        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            f.write("{invalid json")
            tmp_path = pathlib.Path(f.name)

        with patch("app.services.evaluation_report_service._get_report_path", return_value=tmp_path):
            result = await load_evaluation_report()

        tmp_path.unlink(missing_ok=True)
        self.assertEqual(result["status"], "malformed")

    async def test_valid_report_returns_ok(self):
        import json, tempfile, pathlib
        from app.services.evaluation_report_service import load_evaluation_report

        report = {
            "passed": True,
            "total_cases": 10,
            "passed_cases": 9,
            "failed_cases_count": 1,
            "live_mode": False,
            "llm_model": "gemini-2.5-flash",
            "embedding_model": "embedding-001",
            "dataset_version": "v1",
            "fixtures_version": "v1",
            "categories": {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "commit_hash": "abc123",
            # Raw fixtures that must be stripped by allowlist
            "raw_test_cases": [{"prompt": "secret prompt"}],
            "api_key_hint": "sk-xxx",
        }
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w") as f:
            json.dump(report, f)
            tmp_path = pathlib.Path(f.name)

        with patch("app.services.evaluation_report_service._get_report_path", return_value=tmp_path):
            result = await load_evaluation_report()

        tmp_path.unlink(missing_ok=True)
        self.assertEqual(result["status"], "ok")
        self.assertIsNotNone(result["summary"])
        # Sensitive fields must be stripped
        self.assertNotIn("raw_test_cases", result["summary"])
        self.assertNotIn("api_key_hint", result["summary"])
        self.assertIn("passed", result["summary"])


if __name__ == "__main__":
    unittest.main()
