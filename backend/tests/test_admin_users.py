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


class AdminUsersTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_admin_users"]
        self.patch_db = patch("app.routers.admin_users.get_database", return_value=self.db)
        self.patch_db.start()
        self.addCleanup(self.patch_db.stop)
        self.admin = actor("admin")
        self.super_admin = actor("super_admin")
        self.now = datetime.now(timezone.utc)
        await self._seed()

    async def _seed(self):
        docs = []
        for index in range(12):
            role = "lecturer" if index % 2 == 0 else "student"
            docs.append({
                "_id": ObjectId(),
                "email": f"user{index}@example.com",
                "full_name": f"User {index}",
                "hashed_password": "secret-hash",
                "role": role,
                "status": "active",
                "is_active": True,
                "email_verified": index % 2 == 0,
                "permissions_override": [],
                "created_at": self.now - timedelta(days=index),
                "updated_at": None,
                "last_login_at": self.now - timedelta(hours=index),
                "deleted_at": None,
            })
        self.target_id = docs[0]["_id"]
        self.super_target_id = ObjectId()
        docs.append({
            "_id": self.super_target_id,
            "email": "root@example.com",
            "full_name": "Root",
            "hashed_password": "secret-hash",
            "role": "super_admin",
            "status": "active",
            "is_active": True,
            "created_at": self.now,
            "deleted_at": None,
        })
        await self.db["users"].insert_many(docs)
        await self.db["documents"].insert_one({"user_id": str(self.target_id)})
        await self.db["question_sets"].insert_one({"user_id": str(self.target_id)})
        await self.db["conversations"].insert_one({"user_id": str(self.target_id), "deleted_at": None})
        await self.db["ai_usage_events"].insert_one({
            "user_id": str(self.target_id),
            "is_final": True,
            "event_kind": "logical_operation",
            "input_tokens": 10,
            "output_tokens": 5,
            "total_tokens": 15,
        })

    async def _list_users(self, **overrides):
        from app.routers.admin_users import list_admin_users

        params = {
            "page": 1,
            "page_size": 50,
            "search": None,
            "role": None,
            "status_filter": None,
            "created_from": None,
            "created_to": None,
            "last_login_from": None,
            "last_login_to": None,
            "sort_by": "created_at",
            "sort_order": "desc",
            "current_user": self.admin,
        }
        params.update(overrides)
        return await list_admin_users(**params)

    async def test_pagination(self):
        result = await self._list_users(page=2, page_size=5)
        self.assertEqual(result.page, 2)
        self.assertEqual(result.page_size, 5)
        self.assertEqual(len(result.items), 5)
        self.assertGreaterEqual(result.total, 12)

    async def test_search_email_and_name(self):
        by_email = await self._list_users(search="user3@example.com")
        self.assertEqual(by_email.total, 1)
        by_name = await self._list_users(search="User 4")
        self.assertEqual(by_name.total, 1)
        self.assertEqual(by_name.items[0].email, "user4@example.com")

    async def test_filter_role(self):
        lecturers = await self._list_users(role="lecturer", page_size=100)
        self.assertGreater(lecturers.total, 0)
        self.assertTrue(all(item.role == "lecturer" for item in lecturers.items))

    async def test_detail_counts_and_no_password_hash(self):
        from app.routers.admin_users import get_admin_user

        detail = await get_admin_user(str(self.target_id), current_user=self.admin)
        payload = detail.model_dump_json()
        self.assertEqual(detail.document_count, 1)
        self.assertEqual(detail.question_count, 1)
        self.assertEqual(detail.conversation_count, 1)
        self.assertEqual(detail.ai_request_count, 1)
        self.assertEqual(detail.token_usage.total_tokens, 15)
        self.assertNotIn("hashed_password", payload)
        self.assertNotIn("secret-hash", payload)

    async def test_lock_unlock(self):
        from app.routers.admin_users import AdminUserReasonRequest, lock_admin_user, unlock_admin_user

        locked = await lock_admin_user(str(self.target_id), AdminUserReasonRequest(reason="support investigation"), current_user=self.admin)
        self.assertEqual(locked.user.status, "locked")
        self.assertFalse(locked.user.is_active)
        self.assertEqual(locked.audit_event["event_type"], "admin_user_locked")

        unlocked = await unlock_admin_user(str(self.target_id), current_user=self.admin)
        self.assertEqual(unlocked.user.status, "active")
        self.assertTrue(unlocked.user.is_active)

    async def test_soft_delete_restore(self):
        from app.routers.admin_users import AdminUserReasonRequest, delete_admin_user, restore_admin_user

        deleted = await delete_admin_user(str(self.target_id), AdminUserReasonRequest(reason="duplicate account"), current_user=self.admin)
        self.assertEqual(deleted.user.status, "deleted")
        default_list = await self._list_users(page_size=100)
        self.assertNotIn(str(self.target_id), {item.id for item in default_list.items})
        deleted_list = await self._list_users(status_filter="deleted", page_size=100)
        self.assertIn(str(self.target_id), {item.id for item in deleted_list.items})

        restored = await restore_admin_user(str(self.target_id), current_user=self.admin)
        self.assertEqual(restored.user.status, "active")
        self.assertIsNone(restored.user.deleted_at)

    async def test_change_role(self):
        from app.routers.admin_users import AdminUserRoleUpdateRequest, change_admin_user_role

        changed = await change_admin_user_role(
            str(self.target_id),
                AdminUserRoleUpdateRequest(role="support", reason="team transfer"),
            current_user=self.admin,
        )
        self.assertEqual(changed.user.role, "support")
        self.assertEqual(changed.audit_event["metadata"]["new_role"], "support")

    async def test_admin_cannot_touch_super_admin(self):
        from app.routers.admin_users import (
            AdminUserReasonRequest,
            AdminUserRoleUpdateRequest,
            change_admin_user_role,
            delete_admin_user,
            lock_admin_user,
        )

        for call in (
            lambda: lock_admin_user(str(self.super_target_id), AdminUserReasonRequest(reason="security"), current_user=self.admin),
            lambda: delete_admin_user(str(self.super_target_id), AdminUserReasonRequest(reason="security"), current_user=self.admin),
            lambda: change_admin_user_role(
                str(self.super_target_id),
                AdminUserRoleUpdateRequest(role="admin", reason="downgrade"),
                current_user=self.admin,
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                await call()
            self.assertEqual(ctx.exception.status_code, 403)

    async def test_create_user_no_plain_password_and_duplicate_email(self):
        from app.routers.admin_users import AdminUserCreateRequest, create_admin_user

        created = await create_admin_user(
            AdminUserCreateRequest(
                email="new@example.com",
                full_name="New User",
                role="support",
                temporary_password="temporary123",
            ),
            current_user=self.admin,
        )
        stored = await self.db["users"].find_one({"_id": ObjectId(created.user.id)})
        self.assertNotEqual(stored["hashed_password"], "temporary123")
        self.assertNotIn("hashed_password", created.model_dump_json())

        with self.assertRaises(HTTPException) as ctx:
            await create_admin_user(
                AdminUserCreateRequest(email="NEW@example.com", full_name="Dup", role="user", temporary_password="temporary123"),
                current_user=self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_permission_guards(self):
        support = actor("support")
        analyst = actor("analyst")
        users_view = require_permission(Permission.USERS_VIEW)
        users_delete = require_permission(Permission.USERS_DELETE)

        self.assertEqual((await users_view(support)).role, "support")
        with self.assertRaises(HTTPException):
            await users_delete(support)
        with self.assertRaises(HTTPException):
            await users_view(analyst)


if __name__ == "__main__":
    unittest.main()
