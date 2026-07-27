import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.rbac import ALL_PERMISSIONS, Permission, effective_permissions, has_permission, require_permission
from app.schemas.auth import UserResponse


def make_user(role: str) -> UserResponse:
    return UserResponse(
        id=str(ObjectId()),
        email=f"{role.replace('_', '.')}@example.com",
        full_name=role,
        role=role,
        created_at=datetime.now(timezone.utc),
    )


class TestRBACMatrix(unittest.IsolatedAsyncioTestCase):
    async def test_regular_user_cannot_access_admin_api(self):
        guard = require_permission(Permission.ANALYTICS_VIEW)
        with self.assertRaises(HTTPException) as ctx:
            await guard(make_user("user"))
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_analyst_only_views_reports_and_ai_quality(self):
        analyst = make_user("analyst")
        self.assertTrue(has_permission(analyst, Permission.ANALYTICS_VIEW))
        self.assertTrue(has_permission(analyst, Permission.AI_USAGE_VIEW))
        self.assertTrue(has_permission(analyst, Permission.REPORTS_EXPORT))
        self.assertFalse(has_permission(analyst, Permission.USERS_VIEW))
        self.assertFalse(has_permission(analyst, Permission.SYSTEM_HEALTH_VIEW))

    async def test_support_can_view_users_but_cannot_delete_or_change_role(self):
        support = make_user("support")
        self.assertTrue(has_permission(support, Permission.USERS_VIEW))
        self.assertFalse(has_permission(support, Permission.USERS_DELETE))
        self.assertFalse(has_permission(support, Permission.USERS_CHANGE_ROLE))

        delete_guard = require_permission(Permission.USERS_DELETE)
        with self.assertRaises(HTTPException):
            await delete_guard(support)

    async def test_moderator_manages_content_but_cannot_change_roles(self):
        moderator = make_user("moderator")
        self.assertTrue(has_permission(moderator, Permission.DOCUMENTS_UPDATE))
        self.assertTrue(has_permission(moderator, Permission.DOCUMENTS_DELETE))
        self.assertTrue(has_permission(moderator, Permission.QUESTIONS_UPDATE))
        self.assertTrue(has_permission(moderator, Permission.QUESTIONS_DELETE))
        self.assertFalse(has_permission(moderator, Permission.USERS_CHANGE_ROLE))

    async def test_super_admin_has_all_permissions(self):
        super_admin = make_user("super_admin")
        self.assertEqual(effective_permissions(super_admin), ALL_PERMISSIONS)


class TestAdminSuperAdminProtection(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.mock_client = AsyncMongoMockClient()
        self.db = self.mock_client["test_rbac_admin"]
        self.admin = make_user("admin")
        self.super_admin = make_user("super_admin")
        self.target_super_id = ObjectId()
        await self.db["users"].insert_one({
            "_id": self.target_super_id,
            "email": "root@example.com",
            "full_name": "Root",
            "hashed_password": "x",
            "role": "super_admin",
            "status": "active",
            "is_active": True,
            "permissions_override": [],
            "created_at": datetime.now(timezone.utc),
        })
        self.db_patch = patch("app.routers.admin.get_database", return_value=self.db)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def test_admin_cannot_change_super_admin_role(self):
        from app.routers.admin import AdminUserRoleUpdate, admin_update_user_role

        with self.assertRaises(HTTPException) as ctx:
            await admin_update_user_role(
                str(self.target_super_id),
                AdminUserRoleUpdate(role="admin"),
                self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_admin_cannot_lock_super_admin(self):
        from app.routers.admin import AdminUserStatusUpdate, admin_update_user_status

        with self.assertRaises(HTTPException) as ctx:
            await admin_update_user_status(
                str(self.target_super_id),
                AdminUserStatusUpdate(is_active=False),
                self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_admin_cannot_promote_self_to_super_admin(self):
        from app.routers.admin import AdminUserRoleUpdate, admin_update_user_role

        admin_id = ObjectId(self.admin.id)
        await self.db["users"].insert_one({
            "_id": admin_id,
            "email": self.admin.email,
            "full_name": self.admin.full_name,
            "hashed_password": "x",
            "role": "admin",
            "status": "active",
            "is_active": True,
            "permissions_override": [],
            "created_at": datetime.now(timezone.utc),
        })
        with self.assertRaises(HTTPException) as ctx:
            await admin_update_user_role(
                self.admin.id,
                AdminUserRoleUpdate(role="super_admin"),
                self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
