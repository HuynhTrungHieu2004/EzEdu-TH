import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.routers.notifications import (
    dismiss_notification_route,
    list_my_notifications_route,
    mark_all_read_route,
    mark_notification_read_route,
)
from app.schemas.auth import UserResponse


def actor(role: str) -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}-{ObjectId()}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class UserNotificationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_user_notifications"]
        self.student = actor("student")
        self.teacher = actor("lecturer")
        self.db_patch = patch("app.routers.notifications.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def _notification(self, **changes):
        now = datetime.now(timezone.utc)
        doc = {
            "title": "Thông báo",
            "content": "Nội dung",
            "type": "system",
            "audience_type": "roles",
            "target_roles": ["student"],
            "target_user_ids": [],
            "priority": "normal",
            "status": "published",
            "starts_at": now - timedelta(minutes=1),
            "expires_at": now + timedelta(days=1),
            "created_by": str(ObjectId()),
            "created_at": now,
            **changes,
        }
        return str((await self.db["admin_notifications"].insert_one(doc)).inserted_id)

    async def test_lists_only_active_matching_audience(self):
        visible_id = await self._notification()
        await self._notification(title="Teacher", target_roles=["lecturer"])
        await self._notification(title="Draft", status="draft")
        await self._notification(title="Expired", expires_at=datetime.now(timezone.utc) - timedelta(minutes=1))

        items = await list_my_notifications_route(current_user=self.student)
        self.assertEqual([item.id for item in items], [visible_id])
        self.assertFalse(items[0].is_read)

    async def test_read_all_and_dismiss_are_per_user(self):
        notification_id = await self._notification()
        marked = await mark_notification_read_route(notification_id, current_user=self.student)
        self.assertTrue(marked.is_read)
        await mark_all_read_route(current_user=self.student)
        await dismiss_notification_route(notification_id, current_user=self.student)

        self.assertEqual(await list_my_notifications_route(current_user=self.student), [])
        self.assertEqual(len(await list_my_notifications_route(current_user=self.teacher)), 0)
        read = await self.db["notification_reads"].find_one({"notification_id": notification_id, "user_id": self.student.id})
        self.assertIsNotNone(read.get("dismissed_at"))

    async def test_returns_optional_action_url(self):
        await self._notification(action_url="/exams/exam-1/grading")

        items = await list_my_notifications_route(current_user=self.student)

        self.assertEqual(items[0].action_url, "/exams/exam-1/grading")


if __name__ == "__main__":
    unittest.main()
