import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.routers.auth import facebook_login
from app.schemas.auth import FacebookLoginRequest
from app.services.facebook_auth_service import FacebookAuthError, FacebookIdentity


IDENTITY = FacebookIdentity(
    user_id="facebook-user-1",
    email="facebook@example.com",
    full_name="Facebook Demo",
    avatar_url=None,
)


class FacebookLoginEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from app.services.system_settings_service import invalidate_runtime_config_cache

        invalidate_runtime_config_cache()
        self.addCleanup(invalidate_runtime_config_cache)
        self.db = AsyncMongoMockClient()["facebook_endpoint"]
        for target in (
            "app.routers.auth.get_database",
            "app.services.activity_log_service.get_database",
            "app.services.system_settings_service.get_database",
        ):
            patcher = patch(target, return_value=self.db)
            patcher.start()
            self.addCleanup(patcher.stop)
        verifier = patch(
            "app.routers.auth.verify_facebook_access_token",
            new=AsyncMock(return_value=IDENTITY),
        )
        verifier.start()
        self.addCleanup(verifier.stop)

    async def call(self, role=None):
        return await facebook_login(
            FacebookLoginRequest(access_token="facebook-token", role=role), request=None
        )

    async def test_new_user_requires_role_before_creation(self):
        result = await self.call()
        self.assertTrue(result.needs_role)
        self.assertEqual(await self.db["users"].count_documents({}), 0)

    async def test_role_creates_account_and_returns_ezedu_token(self):
        result = await self.call("student")
        self.assertTrue(result.access_token)
        user = await self.db["users"].find_one({"email": IDENTITY.email})
        self.assertEqual(user["facebook_id"], IDENTITY.user_id)

    async def test_locked_existing_account_is_rejected(self):
        await self.db["users"].insert_one({
            "_id": ObjectId(), "email": IDENTITY.email, "full_name": "Blocked",
            "role": "student", "facebook_id": IDENTITY.user_id, "status": "locked",
            "is_active": False, "deleted_at": None, "created_at": datetime.now(timezone.utc),
        })
        with self.assertRaises(HTTPException) as context:
            await self.call()
        self.assertEqual(context.exception.status_code, 403)

    async def test_provider_rejection_is_translated_and_logged(self):
        with patch(
            "app.routers.auth.verify_facebook_access_token",
            new=AsyncMock(side_effect=FacebookAuthError(401, "bad token")),
        ):
            with self.assertRaises(HTTPException) as context:
                await self.call()
        self.assertEqual(context.exception.status_code, 401)
        log = await self.db["user_activity_logs"].find_one({"error_code": "FACEBOOK_TOKEN_REJECTED"})
        self.assertIsNotNone(log)


if __name__ == "__main__":
    unittest.main()
