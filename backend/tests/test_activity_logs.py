import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.rbac import Permission, require_permission
from app.schemas.auth import UserResponse


def make_user(role: str = "admin") -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


# Đồng hồ ghim cho cả lớp test. Thống kê "hôm nay" đếm trong cửa sổ
# [nửa đêm UTC, bây giờ], nên nếu để dữ liệu mẫu bám giờ thật thì một lần chạy
# vắt qua nửa đêm UTC sẽ đẩy cả hai bản ghi sang "hôm qua" và test đỏ mà không
# ai đụng vào mã. Đã tái hiện được: seed lúc 23:58, thống kê chạy lúc 00:01 thì
# total_today = 0 thay vì 2.
#
# Chọn giữa trưa để mọi mốc trong test (±5 phút, −2 ngày) đều nằm gọn một phía
# của ranh giới ngày.
FIXED_NOW = datetime(2026, 8, 13, 12, 0, tzinfo=timezone.utc)

# Dữ liệu mẫu cần "vài sự kiện đã xảy ra trước đó trong cùng ngày", nên đồng hồ
# ghim phải cách nửa đêm đủ xa. Đặt FIXED_NOW vào lúc 00:01 thì bản ghi "5 phút
# trước" rơi sang hôm qua và các phép đếm sai — không phải lỗi mã, mà là dữ liệu
# mẫu vô nghĩa. Chặn ngay ở đây để người sửa sau thấy lý do thay vì thấy một con
# số đếm lệch khó hiểu.
assert FIXED_NOW.hour >= 1, (
    "FIXED_NOW phải cách nửa đêm UTC ít nhất 1 giờ: dữ liệu mẫu có bản ghi "
    "'5 phút trước' và nó cần nằm cùng ngày với FIXED_NOW."
)


class ActivityLogServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_activity_logs"]
        self.patch_db = patch("app.services.activity_log_service.get_database", return_value=self.db)
        self.patch_db.start()
        self.addCleanup(self.patch_db.stop)
        self.patch_now = patch("app.services.activity_log_service._now", return_value=FIXED_NOW)
        self.patch_now.start()
        self.addCleanup(self.patch_now.stop)
        self.admin = make_user("admin")
        self.user_id = str(ObjectId())
        self.now = FIXED_NOW

    async def test_record_activity_sanitizes_private_metadata(self):
        from app.services.activity_log_service import record_activity

        await record_activity(
            action="ai_chat_completed",
            category="chat",
            status="success",
            user_id=self.user_id,
            resource_type="conversation",
            resource_id="conv1",
            metadata={
                "model_ai": "gemini",
                "total_tokens": 10,
                "password": "secret",
                "prompt": "private prompt",
                "nested": {"access_token": "token", "status": "ok"},
            },
        )
        stored = await self.db["user_activity_logs"].find_one({"user_id": self.user_id})
        self.assertEqual(stored["metadata"]["model_ai"], "gemini")
        self.assertEqual(stored["metadata"]["nested"]["status"], "ok")
        payload = str(stored)
        self.assertNotIn("secret", payload)
        self.assertNotIn("private prompt", payload)
        self.assertNotIn("access_token", payload)

    async def _seed(self):
        await self.db["user_activity_logs"].insert_many([
            {
                "user_id": self.user_id,
                "action": "login_success",
                "category": "auth",
                "resource_type": "user",
                "resource_id": self.user_id,
                "status": "success",
                "timestamp": self.now,
                "metadata": {"role": "student"},
            },
            {
                "user_id": self.user_id,
                "action": "permission_denied",
                "category": "security",
                "resource_type": "route",
                "resource_id": "/api/v1/admin/users",
                "status": "denied",
                "timestamp": self.now - timedelta(minutes=5),
                "metadata": {},
                "error_code": "RBAC_PERMISSION_DENIED",
            },
            {
                "user_id": str(ObjectId()),
                "action": "quota_exceeded",
                "category": "ai",
                "resource_type": "advanced_chat",
                "resource_id": None,
                "status": "failure",
                "timestamp": self.now - timedelta(days=2),
                "metadata": {},
                "error_code": "CHAT_RATE_LIMIT",
            },
        ])

    async def test_list_activity_logs_filters_and_paginates(self):
        from app.services.activity_log_service import list_activity_logs

        await self._seed()
        page = await list_activity_logs(page=1, page_size=1, user_id=self.user_id)
        self.assertEqual(page.total, 2)
        self.assertEqual(len(page.items), 1)

        errors = await list_activity_logs(page=1, page_size=10, error_only=True)
        self.assertEqual(errors.total, 2)
        self.assertTrue(all(item.status in {"failure", "denied"} or item.error_code for item in errors.items))

        security = await list_activity_logs(page=1, page_size=10, category="security", search="admin/users")
        self.assertEqual(security.total, 1)
        self.assertEqual(security.items[0].action, "permission_denied")

    async def test_statistics_counts_today(self):
        from app.services.activity_log_service import activity_statistics

        await self._seed()
        stats = await activity_statistics()
        self.assertEqual(stats.total_today, 2)
        self.assertEqual(stats.success_count, 1)
        self.assertEqual(stats.failure_count, 0)
        self.assertEqual(stats.permission_denied_count, 1)
        self.assertEqual(stats.quota_exceeded_count, 0)
        self.assertEqual(stats.by_category["auth"], 1)

    async def test_today_window_starts_at_midnight_not_24_hours_ago(self):
        """Chốt ranh giới ngày — đây chính là chỗ từng làm test chớp nháy.

        "Hôm nay" tính từ nửa đêm UTC, không phải "24 giờ gần nhất". Một bản
        ghi lúc 23:59 hôm qua nằm ngoài, dù chỉ cách hiện tại vài phút.
        """
        from app.services.activity_log_service import activity_statistics

        gan_nua_dem_hom_qua = FIXED_NOW.replace(hour=0, minute=0) - timedelta(minutes=1)
        vua_qua_nua_dem = FIXED_NOW.replace(hour=0, minute=1)
        await self.db["user_activity_logs"].insert_many([
            {"user_id": self.user_id, "action": "login_success", "category": "auth",
             "status": "success", "timestamp": gan_nua_dem_hom_qua, "metadata": {}},
            {"user_id": self.user_id, "action": "login_success", "category": "auth",
             "status": "success", "timestamp": vua_qua_nua_dem, "metadata": {}},
        ])

        stats = await activity_statistics()

        self.assertEqual(stats.total_today, 1, "chỉ bản ghi sau nửa đêm mới tính là hôm nay")

    async def test_admin_user_activity_endpoint_uses_user_filter(self):
        from app.routers.admin_activity_logs import get_admin_user_activity

        await self._seed()
        result = await get_admin_user_activity(
            self.user_id,
            page=1,
            page_size=10,
            category=None,
            action=None,
            status_filter=None,
            date_from=None,
            date_to=None,
            search=None,
            resource_type=None,
            resource_id=None,
            error_only=False,
            current_user=self.admin,
        )
        self.assertEqual(result.total, 2)
        self.assertTrue(all(item.user_id == self.user_id for item in result.items))

    async def test_permission_guard_for_activity_logs(self):
        support = make_user("support")
        analyst = make_user("analyst")
        guard = require_permission(Permission.ACTIVITY_LOGS_VIEW)

        self.assertEqual((await guard(support)).role, "support")
        with self.assertRaises(HTTPException):
            await guard(analyst)


if __name__ == "__main__":
    unittest.main()
