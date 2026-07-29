import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException

from app.core.config import settings
from app.exam_bank.api.deps import is_admin_actor, require_exam_bank_actor, require_student_actor
from app.schemas.auth import UserResponse


def _actor(role: str) -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


class ExamBankRoleGuardTests(unittest.IsolatedAsyncioTestCase):
    """Học sinh KHÔNG được dùng ngân hàng câu hỏi & ma trận đề — công cụ chỉ
    dành cho giáo viên/quản trị viên (yêu cầu 'Không hiện công cụ này cho
    học sinh'). Test "allowed" bật tạm `ENABLE_EXAM_BLUEPRINT`/
    `ENABLE_TIMED_EXAM` (mặc định False, thêm ở Giai đoạn 8) để kiểm đúng
    phần kiểm tra VAI TRÒ, tách khỏi phần kiểm tra feature flag (đã có test
    riêng bên dưới)."""

    async def test_student_is_rejected(self):
        with patch.object(settings, "ENABLE_EXAM_BLUEPRINT", True):
            with self.assertRaises(HTTPException) as ctx:
                await require_exam_bank_actor(_actor("student"))
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_lecturer_is_allowed(self):
        with patch.object(settings, "ENABLE_EXAM_BLUEPRINT", True):
            result = await require_exam_bank_actor(_actor("lecturer"))
        self.assertEqual(result.role, "lecturer")

    async def test_legacy_user_role_is_allowed(self):
        with patch.object(settings, "ENABLE_EXAM_BLUEPRINT", True):
            result = await require_exam_bank_actor(_actor("user"))
        self.assertEqual(result.role, "user")

    async def test_admin_is_allowed(self):
        with patch.object(settings, "ENABLE_EXAM_BLUEPRINT", True):
            result = await require_exam_bank_actor(_actor("admin"))
        self.assertEqual(result.role, "admin")

    async def test_analyst_admin_console_role_is_rejected(self):
        # 'analyst' có quyền trong RBAC quản trị nhưng KHÔNG nằm trong tập vai
        # trò được phép dùng ngân hàng câu hỏi (chỉ user/lecturer/admin/super_admin).
        with patch.object(settings, "ENABLE_EXAM_BLUEPRINT", True):
            with self.assertRaises(HTTPException) as ctx:
                await require_exam_bank_actor(_actor("analyst"))
        self.assertEqual(ctx.exception.status_code, 403)

    def test_is_admin_actor_distinguishes_admin_from_lecturer(self):
        self.assertTrue(is_admin_actor(_actor("admin")))
        self.assertTrue(is_admin_actor(_actor("super_admin")))
        self.assertFalse(is_admin_actor(_actor("lecturer")))
        self.assertFalse(is_admin_actor(_actor("student")))

    async def test_require_student_actor_allows_only_student(self):
        with patch.object(settings, "ENABLE_TIMED_EXAM", True):
            result = await require_student_actor(_actor("student"))
            self.assertEqual(result.role, "student")
            for role in ("lecturer", "user", "admin"):
                with self.assertRaises(HTTPException) as ctx:
                    await require_student_actor(_actor(role))
                self.assertEqual(ctx.exception.status_code, 403)

    async def test_exam_blueprint_feature_flag_off_blocks_everyone(self):
        with patch.object(settings, "ENABLE_EXAM_BLUEPRINT", False):
            with self.assertRaises(HTTPException) as ctx:
                await require_exam_bank_actor(_actor("admin"))
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_timed_exam_feature_flag_off_blocks_everyone(self):
        with patch.object(settings, "ENABLE_TIMED_EXAM", False):
            with self.assertRaises(HTTPException) as ctx:
                await require_student_actor(_actor("student"))
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
