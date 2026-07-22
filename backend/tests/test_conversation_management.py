import asyncio
import unittest
import hashlib
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.database.mongodb import get_database
from app.schemas.chat import ConversationUpdateRequest
from app.services.learning_chat_service import (
    list_conversations,
    get_conversation_history,
    acquire_lock,
    release_lock,
    ask_advanced_question
)
from app.utils.cursor import serialize_cursor

class ConversationManagementTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_db"]
        self.user_id = "user123"

        await self.db["chat_locks"].create_index([("conversation_id", 1)], unique=True)

        self.db_patches = [
            patch("app.database.mongodb.get_database", return_value=self.db),
            patch("app.services.learning_chat_service.get_database", return_value=self.db),
            patch("app.routers.chat.get_database", return_value=self.db),
            patch("app.services.learning_chat_service.rate_limiter.check_rate_limit", return_value=None),
        ]
        for db_patch in self.db_patches:
            db_patch.start()
            self.addCleanup(db_patch.stop)

    async def test_legacy_documents_handling(self):
        # Insert a legacy conversation missing is_pinned, pinned_at, deleted_at, normalized_title
        conv_id = ObjectId()
        await self.db["conversations"].insert_one({
            "_id": conv_id,
            "user_id": self.user_id,
            "title": "Legacy Đàn Ông",
            "scope": "general",
            "document_ids": [],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })

        convs, next_cursor, has_more = await list_conversations(user_id=self.user_id)
        self.assertEqual(len(convs), 1)
        self.assertFalse(convs[0]["is_pinned"])
        self.assertIsNone(convs[0]["pinned_at"])

    async def test_normalization_and_contains_search(self):
        # Create a few conversations
        await self.db["conversations"].insert_many([
            {
                "user_id": self.user_id,
                "title": "Học liệu Tiếng Việt đ",
                "normalized_title": "hoc lieu tieng viet d",
                "deleted_at": None,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            },
            {
                "user_id": self.user_id,
                "title": "Đại học quốc gia",
                "normalized_title": "dai hoc quoc gia",
                "deleted_at": None,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
        ])

        # Search matching accents
        convs, _, _ = await list_conversations(user_id=self.user_id, search="học liệu")
        self.assertEqual(len(convs), 1)
        self.assertEqual(convs[0]["title"], "Học liệu Tiếng Việt đ")

        # Search without accents
        convs2, _, _ = await list_conversations(user_id=self.user_id, search="hoc lieu")
        self.assertEqual(len(convs2), 1)

        # Search with regex metacharacters
        convs3, _, _ = await list_conversations(user_id=self.user_id, search=".*")
        self.assertEqual(len(convs3), 0) # Regex is escaped, so it matches exact characters

    async def test_pin_idempotency_and_order(self):
        # Insert conversation
        conv_id = ObjectId()
        await self.db["conversations"].insert_one({
            "_id": conv_id,
            "user_id": self.user_id,
            "title": "Convo",
            "is_pinned": False,
            "pinned_at": None,
            "deleted_at": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })

        # Pin false -> true
        # Update using raw query mimicking PATCH
        pinned_at_1 = datetime.now(timezone.utc)
        await self.db["conversations"].update_one(
            {"_id": conv_id},
            {"$set": {"is_pinned": True, "pinned_at": pinned_at_1}}
        )

        conv = await self.db["conversations"].find_one({"_id": conv_id})
        self.assertTrue(conv["is_pinned"])
        self.assertAlmostEqual(conv["pinned_at"].replace(tzinfo=timezone.utc).timestamp(), pinned_at_1.timestamp(), places=1)

        # Pin true -> true (idempotent, keeps old pinned_at)
        old_pinned = conv.get("is_pinned", False)
        update_fields = {"is_pinned": True}
        if not old_pinned:
            update_fields["pinned_at"] = datetime.now(timezone.utc)

        await self.db["conversations"].update_one(
            {"_id": conv_id},
            {"$set": update_fields}
        )

        conv_again = await self.db["conversations"].find_one({"_id": conv_id})
        self.assertAlmostEqual(conv_again["pinned_at"].replace(tzinfo=timezone.utc).timestamp(), pinned_at_1.timestamp(), places=1)

    async def test_stable_tie_breaker_sorting(self):
        # Insert 3 conversations with same updated_at
        same_time = datetime.now(timezone.utc)
        conv1 = ObjectId()
        conv2 = ObjectId()
        conv3 = ObjectId()
        
        await self.db["conversations"].insert_many([
            {"_id": conv1, "user_id": self.user_id, "title": "C1", "is_pinned": False, "deleted_at": None, "updated_at": same_time, "created_at": same_time},
            {"_id": conv2, "user_id": self.user_id, "title": "C2", "is_pinned": False, "deleted_at": None, "updated_at": same_time, "created_at": same_time},
            {"_id": conv3, "user_id": self.user_id, "title": "C3", "is_pinned": False, "deleted_at": None, "updated_at": same_time, "created_at": same_time}
        ])

        # Query page 1 (limit 2)
        convs, next_cursor, has_more = await list_conversations(user_id=self.user_id, limit=2)
        self.assertEqual(len(convs), 2)
        self.assertTrue(has_more)

        # Query page 2 using the next_cursor
        convs2, _, has_more2 = await list_conversations(user_id=self.user_id, cursor=next_cursor, limit=2)
        self.assertEqual(len(convs2), 1)
        self.assertFalse(has_more2)

        # Ensure no duplicates: convs ids + convs2 ids should be unique
        all_ids = [c["id"] for c in convs] + [c["id"] for c in convs2]
        self.assertEqual(len(all_ids), 3)
        self.assertEqual(len(set(all_ids)), 3)

    async def test_ask_delete_race_condition(self):
        # 1. Ask checks deleted_at before locking, but delete soft deletes and updates conversation
        conv_id = ObjectId()
        await self.db["conversations"].insert_one({
            "_id": conv_id,
            "user_id": self.user_id,
            "title": "Convo",
            "is_pinned": False,
            "pinned_at": None,
            "deleted_at": None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })

        # 2. Acquire delete lock first
        lock_token = await acquire_lock(conv_id, "delete", lease_seconds=10)
        self.assertIsNotNone(lock_token)

        # 3. Ask attempts to acquire lock on the same conversation and should fail with 409
        from app.schemas.chat import AdvancedChatAskRequest
        payload = AdvancedChatAskRequest(question="Help?", conversation_id=str(conv_id))
        
        with self.assertRaises(HTTPException) as ctx:
            await ask_advanced_question(user_id=self.user_id, payload=payload)
        self.assertEqual(ctx.exception.status_code, 409)

        # 4. Release delete lock
        await release_lock(conv_id, lock_token)

        # 5. Perform delete operation (soft delete)
        await self.db["conversations"].update_one(
            {"_id": conv_id},
            {"$set": {"deleted_at": datetime.now(timezone.utc)}}
        )

        # 6. Ask now should return 404 since conversation is deleted
        with self.assertRaises(HTTPException) as ctx:
            await ask_advanced_question(user_id=self.user_id, payload=payload)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_migration_script(self):
        # Set up a legacy document
        conv_id = ObjectId()
        await self.db["conversations"].insert_one({
            "_id": conv_id,
            "user_id": self.user_id,
            "title": "Chuyên Đề Việt",
            "scope": "general",
            "document_ids": [],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })

        from scripts.migrate_conversations import run_migration
        
        # Test dry-run first
        await run_migration(dry_run=True, batch_size=100, force_production=True)
        conv_dry = await self.db["conversations"].find_one({"_id": conv_id})
        self.assertNotIn("is_pinned", conv_dry)

        # Run real migration
        await run_migration(dry_run=False, batch_size=100, force_production=True)
        conv_migrated = await self.db["conversations"].find_one({"_id": conv_id})
        self.assertIn("is_pinned", conv_migrated)
        self.assertEqual(conv_migrated["is_pinned"], False)
        self.assertEqual(conv_migrated["normalized_title"], "chuyen de viet")
        self.assertIsNone(conv_migrated["deleted_at"])
