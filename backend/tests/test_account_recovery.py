import hashlib
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.security import get_password_hash, verify_password
from app.routers.auth import forgot_password, resend_verification, reset_password, verify_email
from app.schemas.auth import AccountEmailRequest, EmailVerificationRequest, PasswordResetRequest
from app.schemas.auth import UserResponse
from app.services.account_token_service import consume_account_token, issue_account_token


class AccountTokenLifecycleTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["account_recovery"]

    async def test_only_token_hash_is_stored(self):
        raw = await issue_account_token(self.db, user_id="user-1", purpose="password_reset")

        stored = await self.db["account_tokens"].find_one({})
        self.assertNotIn("token", stored)
        self.assertNotEqual(raw, stored["token_hash"])
        self.assertEqual(hashlib.sha256(raw.encode()).hexdigest(), stored["token_hash"])

    async def test_token_can_be_consumed_only_once(self):
        raw = await issue_account_token(self.db, user_id="user-1", purpose="password_reset")

        first = await consume_account_token(self.db, raw_token=raw, purpose="password_reset")
        second = await consume_account_token(self.db, raw_token=raw, purpose="password_reset")

        self.assertEqual(first, "user-1")
        self.assertIsNone(second)

    async def test_expired_token_is_rejected(self):
        raw = await issue_account_token(self.db, user_id="user-1", purpose="email_verification")
        await self.db["account_tokens"].update_one(
            {}, {"$set": {"expires_at": datetime.now(timezone.utc) - timedelta(seconds=1)}}
        )

        result = await consume_account_token(self.db, raw_token=raw, purpose="email_verification")

        self.assertIsNone(result)

    async def test_new_token_invalidates_previous_token_for_same_purpose(self):
        first = await issue_account_token(self.db, user_id="user-1", purpose="password_reset")
        second = await issue_account_token(self.db, user_id="user-1", purpose="password_reset")

        self.assertIsNone(await consume_account_token(self.db, raw_token=first, purpose="password_reset"))
        self.assertEqual(await consume_account_token(self.db, raw_token=second, purpose="password_reset"), "user-1")


class AccountRecoveryEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["account_recovery_routes"]
        self.user_id = ObjectId()
        await self.db["users"].insert_one({
            "_id": self.user_id,
            "email": "known@example.com",
            "full_name": "Known User",
            "hashed_password": get_password_hash("old-password"),
            "email_verified": False,
            "status": "active",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
        })
        patcher = patch("app.routers.auth.get_database", return_value=self.db)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def test_known_and_unknown_email_receive_same_forgot_response(self):
        sender = AsyncMock()
        with patch("app.routers.auth.is_email_configured", return_value=True), patch(
            "app.routers.auth.send_account_email", sender
        ):
            known = await forgot_password(AccountEmailRequest(email="known@example.com"))
            unknown = await forgot_password(AccountEmailRequest(email="missing@example.com"))

        self.assertEqual(known, unknown)
        self.assertEqual(sender.await_count, 1)

    async def test_reset_changes_password_and_token_cannot_be_reused(self):
        raw = await issue_account_token(self.db, user_id=str(self.user_id), purpose="password_reset")

        await reset_password(PasswordResetRequest(token=raw, new_password="new-password"))
        updated = await self.db["users"].find_one({"_id": self.user_id})
        self.assertTrue(verify_password("new-password", updated["hashed_password"]))

        with self.assertRaises(HTTPException) as ctx:
            await reset_password(PasswordResetRequest(token=raw, new_password="another-password"))
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_verify_email_marks_account_and_consumes_token(self):
        raw = await issue_account_token(self.db, user_id=str(self.user_id), purpose="email_verification")

        await verify_email(EmailVerificationRequest(token=raw))
        updated = await self.db["users"].find_one({"_id": self.user_id})
        self.assertTrue(updated["email_verified"])

        with self.assertRaises(HTTPException):
            await verify_email(EmailVerificationRequest(token=raw))

    async def test_authenticated_user_can_resend_email_verification(self):
        current_user = UserResponse(
            id=str(self.user_id), email="known@example.com", full_name="Known User",
            role="student", status="active", is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        sender = AsyncMock()
        with patch("app.routers.auth.is_email_configured", return_value=True), patch(
            "app.routers.auth.send_account_email", sender
        ):
            response = await resend_verification(current_user)

        self.assertEqual(response.message, "Đã gửi liên kết xác thực email.")
        sender.assert_awaited_once()
        self.assertIsNotNone(await self.db["account_tokens"].find_one({"purpose": "email_verification"}))


if __name__ == "__main__":
    unittest.main()
