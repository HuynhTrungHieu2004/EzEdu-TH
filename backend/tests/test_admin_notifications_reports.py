import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

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


async def response_bytes(response) -> bytes:
    chunks = []
    async for chunk in response.body_iterator:
        chunks.append(chunk)
    return b"".join(chunks)


class AdminNotificationsReportsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_admin_notifications_reports"]
        patches = [
            patch("app.routers.admin_notifications.get_database", return_value=self.db),
            patch("app.routers.admin_reports.get_database", return_value=self.db),
            patch("app.services.admin_audit_service.get_database", return_value=self.db),
        ]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.admin = actor("admin")
        self.user_id = ObjectId()
        await self.db["users"].insert_many([
            {
                "_id": self.user_id,
                "email": "learner@example.com",
                "full_name": "Learner",
                "role": "student",
                "status": "active",
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
                "hashed_password": "never-export-me",
            },
            {
                "_id": ObjectId(),
                "email": "teacher@example.com",
                "full_name": "Teacher",
                "role": "lecturer",
                "status": "active",
                "is_active": True,
                "created_at": datetime.now(timezone.utc),
            },
        ])

    async def test_create_publish_notification_and_read_counts(self):
        from app.routers.admin_notifications import create_notification, publish_notification
        from app.schemas.admin_notifications_reports import NotificationCreateRequest, NotificationReasonRequest

        item = await create_notification(
            NotificationCreateRequest(
                title="Bảo trì tối nay",
                content="Hệ thống bảo trì lúc 23:00.",
                type="maintenance_banner",
                audience_type="roles",
                target_roles=["student"],
                priority="high",
                starts_at=datetime.now(timezone.utc) + timedelta(hours=1),
            ),
            current_user=self.admin,
        )
        self.assertEqual(item.status, "draft")
        self.assertEqual(item.audience_count, 1)
        await self.db["notification_reads"].insert_one({
            "notification_id": item.id,
            "user_id": str(self.user_id),
            "read_at": datetime.now(timezone.utc),
        })
        published = await publish_notification(
            item.id,
            NotificationReasonRequest(reason="planned maintenance"),
            current_user=self.admin,
        )
        self.assertEqual(published.status, "scheduled")
        self.assertEqual(published.read_count, 1)
        self.assertEqual(published.unread_count, 0)
        audit = await self.db["admin_audit_logs"].find_one({"action": "notification_published", "target_id": item.id})
        self.assertIsNotNone(audit)
        self.assertEqual(audit["reason"], "planned maintenance")

    async def test_notification_permission(self):
        guard = require_permission(Permission.NOTIFICATIONS_MANAGE)
        self.assertEqual((await guard(self.admin)).role, "admin")
        with self.assertRaises(HTTPException):
            await guard(actor("analyst"))

    async def test_report_export_csv_sanitizes_password_hash_and_writes_audit(self):
        from app.routers.admin_reports import export_report

        response = await export_report(report_type="users", format="csv", limit=10, current_user=self.admin)
        payload = (await response_bytes(response)).decode("utf-8-sig")
        self.assertIn("learner@example.com", payload)
        self.assertNotIn("never-export-me", payload)
        self.assertNotIn("hashed_password", payload)
        audit = await self.db["admin_audit_logs"].find_one({"action": "report_exported", "target_id": "users"})
        self.assertIsNotNone(audit)
        self.assertEqual(audit["after"]["row_count"], 2)

    async def test_report_permission(self):
        guard = require_permission(Permission.REPORTS_EXPORT)
        self.assertEqual((await guard(actor("analyst"))).role, "analyst")
        with self.assertRaises(HTTPException):
            await guard(actor("support"))


if __name__ == "__main__":
    unittest.main()
