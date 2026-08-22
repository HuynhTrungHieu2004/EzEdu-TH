import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId

from app.routers.my_activity import list_my_activity, my_activity_statistics
from app.schemas.auth import UserResponse


class MyActivityTests(unittest.IsolatedAsyncioTestCase):
    async def test_routes_force_current_user_scope(self):
        user = UserResponse(
            id=str(ObjectId()), email="user@example.com", full_name="User", role="lecturer",
            created_at=datetime.now(timezone.utc),
        )
        with patch("app.routers.my_activity.list_activity_logs", new=AsyncMock(return_value={"items": [], "total": 0, "page": 1, "page_size": 20, "total_pages": 0, "generated_at": datetime.now(timezone.utc)})) as listed:
            await list_my_activity(current_user=user)
            self.assertEqual(listed.await_args.kwargs["user_id"], user.id)
        with patch("app.routers.my_activity.activity_statistics", new=AsyncMock(return_value={})) as stats:
            await my_activity_statistics(current_user=user)
            self.assertEqual(stats.await_args.kwargs["user_id"], user.id)


if __name__ == "__main__":
    unittest.main()
