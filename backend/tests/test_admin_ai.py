import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.schemas.auth import UserResponse


def actor(role: str = "admin") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class AdminAITests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_admin_ai"]
        self.patch_admin_ai = patch("app.routers.admin_ai.get_database", return_value=self.db)
        self.patch_quota = patch("app.services.ai_quota_service.get_database", return_value=self.db)
        self.patch_analytics = patch("app.services.analytics_service.get_database", return_value=self.db)
        self.patch_admin_ai.start()
        self.patch_quota.start()
        self.patch_analytics.start()
        self.addCleanup(self.patch_admin_ai.stop)
        self.addCleanup(self.patch_quota.stop)
        self.addCleanup(self.patch_analytics.stop)
        self.admin = actor("admin")
        self.user_id = ObjectId()
        self.now = datetime.now(timezone.utc)
        await self.db["users"].insert_one({
            "_id": self.user_id,
            "email": "heavy@example.com",
            "full_name": "Heavy User",
            "role": "student",
            "ai_quota": {"requests_per_day": 1, "tokens_per_day": 100},
            "created_at": self.now,
            "deleted_at": None,
        })
        await self.db["ai_usage_events"].insert_many([
            {
                "event_id": "evt-1",
                "logical_request_id": "req-1",
                "attempt_id": "att-1",
                "attempt_number": 1,
                "is_final": True,
                "event_kind": "logical_operation",
                "user_id": str(self.user_id),
                "operation_type": "advanced_chat",
                "feature": "advanced_chat",
                "provider": "google",
                "model_name": "gemini-2.5-flash",
                "model": "gemini-2.5-flash",
                "status": "success",
                "latency_ms": 100,
                "input_tokens": 40,
                "output_tokens": 20,
                "total_tokens": 60,
                "estimated_cost": 0.000062,
                "currency": "USD",
                "created_at": self.now - timedelta(minutes=5),
            },
            {
                "event_id": "evt-2",
                "logical_request_id": "req-2",
                "attempt_id": "att-2",
                "attempt_number": 1,
                "is_final": True,
                "event_kind": "logical_operation",
                "user_id": str(self.user_id),
                "operation_type": "question_generation",
                "feature": "question_generation",
                "provider": "mixed",
                "model_name": "groq+gemini",
                "model": "groq+gemini",
                "status": "failure",
                "error_code": "500_INTERNAL",
                "latency_ms": 1000,
                "total_tokens": 0,
                "estimated_cost": 0,
                "currency": "USD",
                "created_at": self.now - timedelta(minutes=1),
            },
        ])

    async def test_record_event_adds_cost_and_alias_fields(self):
        from app.schemas.analytics import UsageEventCreate
        from app.services.analytics_service import record_event

        await record_event(UsageEventCreate(
            event_id="evt-cost",
            logical_request_id="req-cost",
            attempt_id="att-cost",
            attempt_number=1,
            is_final=True,
            event_kind="logical_operation",
            user_id=str(self.user_id),
            operation_type="advanced_chat",
            provider="google",
            model_name="gemini-2.5-flash",
            status="success",
            latency_ms=10,
            input_tokens=1000,
            output_tokens=1000,
            total_tokens=2000,
            created_at=self.now,
        ))
        doc = await self.db["ai_usage_events"].find_one({"event_id": "evt-cost"})
        self.assertEqual(doc["feature"], "advanced_chat")
        self.assertEqual(doc["model"], "gemini-2.5-flash")
        self.assertEqual(doc["request_id"], "req-cost")
        self.assertGreater(doc["estimated_cost"], 0)
        self.assertEqual(doc["currency"], "USD")

    async def test_usage_dashboard_summary_and_filters(self):
        from app.routers.admin_ai import get_admin_ai_usage

        result = await get_admin_ai_usage(
            from_date=self.now - timedelta(days=1),
            to_date=self.now + timedelta(days=1),
            user_id=None,
            provider=None,
            model=None,
            feature=None,
            status_filter=None,
            page=1,
            page_size=10,
            sort_order="desc",
            current_user=self.admin,
        )
        self.assertEqual(result.summary.total_requests, 2)
        self.assertEqual(result.summary.success_requests, 1)
        self.assertEqual(result.summary.failed_requests, 1)
        self.assertEqual(result.summary.total_tokens, 60)
        self.assertEqual(result.summary.p50_latency_ms, 100)
        self.assertEqual(result.items[0].user_email, "heavy@example.com")
        self.assertTrue(result.top_users)
        self.assertTrue(result.warnings)

    async def test_quota_exceeded_records_activity_and_raises_429(self):
        from app.services.ai_quota_service import enforce_ai_quota

        with self.assertRaises(HTTPException) as ctx:
            await enforce_ai_quota(
                user_id=str(self.user_id),
                role="student",
                feature="advanced_chat",
                database=self.db,
            )
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.detail["error_code"], "AI_QUOTA_EXCEEDED")
        log = await self.db["user_activity_logs"].find_one({"action": "quota_exceeded"})
        self.assertIsNotNone(log)
        self.assertEqual(log["metadata"]["quota_key"], "requests_per_day")

    async def test_global_claude_token_budget_blocks_new_ai_requests(self):
        from app.core.config import settings
        from app.services.ai_quota_service import enforce_ai_quota

        await self.db["ai_usage_events"].insert_one({
            "event_id": "evt-claude-budget",
            "logical_request_id": "req-claude-budget",
            "attempt_id": "att-claude-budget",
            "attempt_number": 1,
            "is_final": True,
            "event_kind": "logical_operation",
            "user_id": str(self.user_id),
            "operation_type": "advanced_chat",
            "provider": "anthropic",
            "model_name": "claude-haiku-test",
            "status": "success",
            "latency_ms": 1,
            "total_tokens": 100,
            "created_at": self.now,
        })
        with patch.object(settings, "AI_TEXT_PROVIDER", "claude"), \
             patch.object(settings, "CLAUDE_TOTAL_TOKEN_BUDGET", 100), \
             self.assertRaises(HTTPException) as ctx:
            await enforce_ai_quota(
                user_id=str(self.user_id),
                role="admin",
                feature="advanced_chat",
                database=self.db,
            )

        self.assertEqual(ctx.exception.detail["quota_key"], "claude_total_tokens")

    async def test_quota_view_update_reset_and_history(self):
        from app.routers.admin_ai import (
            AIQuotaResetRequest,
            AIQuotaUpdateRequest,
            get_user_ai_quota,
            get_user_ai_quota_history,
            reset_user_ai_quota,
            update_user_ai_quota,
        )

        view = await get_user_ai_quota(str(self.user_id), current_user=self.admin)
        self.assertEqual(view.override_quota["requests_per_day"], 1)

        updated = await update_user_ai_quota(
            str(self.user_id),
            AIQuotaUpdateRequest(current_quota={"requests_per_day": 5}, reason="temporary increase"),
            current_user=self.admin,
        )
        self.assertEqual(updated.quota.override_quota["requests_per_day"], 5)

        reset = await reset_user_ai_quota(
            str(self.user_id),
            AIQuotaResetRequest(reason="back to default"),
            current_user=self.admin,
        )
        self.assertEqual(reset.quota.override_quota, {})

        history = await get_user_ai_quota_history(str(self.user_id), current_user=self.admin)
        self.assertEqual(history.total, 2)
        self.assertTrue(all(item.reason for item in history.items))

    def test_quota_payload_rejects_unknown_or_negative_limits(self):
        from pydantic import ValidationError
        from app.schemas.admin_ai import AIQuotaUpdateRequest, RoleQuotaUpdateRequest

        with self.assertRaises(ValidationError):
            AIQuotaUpdateRequest(current_quota={"requests_per_day": -1}, reason="invalid")
        with self.assertRaises(ValidationError):
            RoleQuotaUpdateRequest(overrides={"unknown_limit": 10}, reason="invalid")


if __name__ == "__main__":
    unittest.main()
