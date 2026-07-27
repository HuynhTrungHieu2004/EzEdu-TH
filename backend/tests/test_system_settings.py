import unittest
from datetime import datetime, timezone
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


class SystemSettingsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from app.services.system_settings_service import invalidate_runtime_config_cache

        invalidate_runtime_config_cache()
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_system_settings"]
        self.patch_router = patch("app.routers.system_settings.get_database", return_value=self.db)
        self.patch_service = patch("app.services.system_settings_service.get_database", return_value=self.db)
        self.patch_router.start()
        self.patch_service.start()
        self.addCleanup(self.patch_router.stop)
        self.addCleanup(self.patch_service.stop)
        self.addCleanup(invalidate_runtime_config_cache)
        self.admin = actor("admin")

    async def test_default_fallback_seeds_settings(self):
        from app.services.system_settings_service import get_all_feature_flags, get_setting_value

        self.assertEqual(await get_setting_value("max_questions_per_request"), 50)
        flags = await get_all_feature_flags()
        self.assertIn("enable_maintenance_mode", flags)
        self.assertFalse(flags["enable_maintenance_mode"]["enabled"])

    async def test_validation_rejects_invalid_setting_value(self):
        from app.services.system_settings_service import update_setting

        with self.assertRaises(HTTPException):
            await update_setting("max_file_size_mb", -1, admin_user_id=self.admin.id)

        with self.assertRaises(HTTPException):
            await update_setting("allowed_file_types", ["pdf", "exe"], admin_user_id=self.admin.id)

    async def test_cache_invalidates_after_update(self):
        from app.services.system_settings_service import get_setting_value, update_setting

        self.assertEqual(await get_setting_value("default_daily_quota"), 50)
        await update_setting("default_daily_quota", 99, admin_user_id=self.admin.id)
        self.assertEqual(await get_setting_value("default_daily_quota"), 99)

    async def test_feature_disabled(self):
        from app.services.system_settings_service import is_feature_enabled, update_feature_flag

        self.assertTrue(await is_feature_enabled("enable_question_export", user_role="lecturer", user_id="u1"))
        await update_feature_flag("enable_question_export", admin_user_id=self.admin.id, enabled=False)
        self.assertFalse(await is_feature_enabled("enable_question_export", user_role="lecturer", user_id="u1"))

    async def test_admin_setting_update_writes_audit_log(self):
        from app.routers.system_settings import patch_system_setting
        from app.schemas.system_settings import SystemSettingUpdateRequest

        updated = await patch_system_setting(
            "default_question_count",
            SystemSettingUpdateRequest(value=12, reason="align product default"),
            request=None,
            current_user=self.admin,
        )
        self.assertEqual(updated.value, 12)
        audit = await self.db["admin_audit_logs"].find_one({"action": "system_setting_updated", "target_id": "default_question_count"})
        self.assertIsNotNone(audit)
        self.assertEqual(audit["reason"], "align product default")
        self.assertNotIn("api_key", str(audit).lower())

    async def test_feature_flag_update_writes_audit_log(self):
        from app.routers.system_settings import patch_feature_flag
        from app.schemas.system_settings import FeatureFlagUpdateRequest

        updated = await patch_feature_flag(
            "enable_advanced_chat",
            FeatureFlagUpdateRequest(enabled=False, reason="incident mitigation"),
            request=None,
            current_user=self.admin,
        )
        self.assertFalse(updated.enabled)
        audit = await self.db["admin_audit_logs"].find_one({"action": "feature_flag_updated", "target_id": "enable_advanced_chat"})
        self.assertEqual(audit["reason"], "incident mitigation")

    async def test_permissions(self):
        view_guard = require_permission(Permission.SYSTEM_SETTINGS_VIEW)
        update_guard = require_permission(Permission.SYSTEM_SETTINGS_UPDATE)
        self.assertEqual((await view_guard(self.admin)).role, "admin")
        with self.assertRaises(HTTPException):
            await update_guard(actor("support"))


if __name__ == "__main__":
    unittest.main()
