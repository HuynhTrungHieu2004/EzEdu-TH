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


class AdminAuditLogsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_admin_audit_logs"]
        self.patch_admin_users = patch("app.routers.admin_users.get_database", return_value=self.db)
        self.patch_service = patch("app.services.admin_audit_service.get_database", return_value=self.db)
        self.patch_admin_users.start()
        self.patch_service.start()
        self.addCleanup(self.patch_admin_users.stop)
        self.addCleanup(self.patch_service.stop)
        self.admin = actor("admin")
        self.user_id = ObjectId()
        await self.db["users"].insert_one({
            "_id": self.user_id,
            "email": "target@example.com",
            "full_name": "Target User",
            "hashed_password": "secret-hash",
            "role": "student",
            "status": "active",
            "is_active": True,
            "email_verified": False,
            "permissions_override": [],
            "created_at": datetime.now(timezone.utc),
            "updated_at": None,
            "deleted_at": None,
        })

    async def test_lock_user_writes_admin_audit_log(self):
        from app.routers.admin_users import AdminUserReasonRequest, lock_admin_user

        await lock_admin_user(
            str(self.user_id),
            AdminUserReasonRequest(reason="abuse report"),
            current_user=self.admin,
        )
        audit = await self.db["admin_audit_logs"].find_one({"target_id": str(self.user_id), "action": "user_locked"})
        self.assertIsNotNone(audit)
        self.assertEqual(audit["reason"], "abuse report")
        self.assertEqual(audit["before"]["status"], "active")
        self.assertEqual(audit["after"]["status"], "locked")
        self.assertIn("status", audit["changed_fields"])

    async def test_change_role_writes_before_after(self):
        from app.routers.admin_users import AdminUserRoleUpdateRequest, change_admin_user_role

        await change_admin_user_role(
            str(self.user_id),
            AdminUserRoleUpdateRequest(role="support", reason="support rotation"),
            current_user=self.admin,
        )
        audit = await self.db["admin_audit_logs"].find_one({"target_id": str(self.user_id), "action": "user_role_changed"})
        self.assertEqual(audit["before"]["role"], "student")
        self.assertEqual(audit["after"]["role"], "support")
        self.assertEqual(audit["changed_fields"], ["role"])

    async def test_audit_sanitizer_does_not_expose_password_hash(self):
        from app.services.admin_audit_service import record_admin_audit

        await record_admin_audit(
            admin=self.admin,
            action="user_updated",
            target_type="user",
            target_id=str(self.user_id),
            before={"email": "old@example.com", "hashed_password": "secret-hash"},
            after={"email": "new@example.com", "password": "plain"},
            database=self.db,
        )
        audit = await self.db["admin_audit_logs"].find_one({"action": "user_updated"})
        payload = str(audit)
        self.assertIn("old@example.com", payload)
        self.assertNotIn("secret-hash", payload)
        self.assertNotIn("plain", payload)
        self.assertNotIn("hashed_password", payload)

    async def test_no_update_or_delete_audit_routes(self):
        from app.main import app

        paths = app.openapi()["paths"]
        audit_paths = {path: methods for path, methods in paths.items() if "/admin/audit-logs" in path}
        self.assertTrue(audit_paths)
        for methods in audit_paths.values():
            self.assertNotIn("patch", methods)
            self.assertNotIn("put", methods)
            self.assertNotIn("delete", methods)

    async def test_regular_user_cannot_view_audit_logs(self):
        guard = require_permission(Permission.ADMIN_AUDIT_LOGS_VIEW)
        with self.assertRaises(HTTPException):
            await guard(actor("user"))


if __name__ == "__main__":
    unittest.main()
