import asyncio
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.database.mongodb import get_database
from app.schemas.feedback import FeedbackRequest, ReasonCode
from app.services.feedback_service import (
    submit_or_update_feedback,
    hydrate_messages_with_feedback,
    verify_message_ownership_or_raise
)

class FeedbackTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_db"]
        self.user_id = str(ObjectId())

        self.db_patches = [
            patch("app.database.mongodb.get_database", return_value=self.db),
            patch("app.services.feedback_service.get_database", return_value=self.db),
            patch("app.routers.chat.get_database", return_value=self.db)
        ]
        for db_patch in self.db_patches:
            db_patch.start()
            self.addCleanup(db_patch.stop)

    async def _setup_fixtures(self):
        # 1. Create a conversation owned by self.user_id
        self.conversation_id = ObjectId()
        await self.db["conversations"].insert_one({
            "_id": self.conversation_id,
            "user_id": self.user_id,
            "title": "Hội thoại mẫu",
            "scope": "general",
            "document_ids": [],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        })

        # 2. Create an assistant message in the conversation
        self.message_id = ObjectId()
        await self.db["conversation_messages"].insert_one({
            "_id": self.message_id,
            "conversation_id": self.conversation_id,
            "user_id": self.user_id,
            "role": "assistant",
            "content": "Đây là câu trả lời của AI.",
            "status": "completed",
            "created_at": datetime.now(timezone.utc),
            "internal_citations": [
                {
                    "source_id": "DOC_1",
                    "document_id": "doc_a",
                    "chunk_id": "chunk_a1",
                    "document_title": "Tài liệu A",
                    "excerpt": "Trích dẫn tài liệu A"
                }
            ],
            "web_citations": [
                {
                    "source_id": "WEB_1",
                    "title": "Nguồn Internet",
                    "url": "https://example.com/source",
                    "supporting_excerpt": "Trích dẫn web"
                }
            ],
            "retrieval_mode": "hybrid",
            "evidence_status": "well_supported",
            "model_name": "gemini-2.5-flash",
            "confidence": 0.95
        })

    async def test_validation_schema_helpful(self):
        # helpful clears reasons/comments/citations
        req = FeedbackRequest(
            rating="helpful",
            reason_codes=[ReasonCode.INCORRECT_INFORMATION],
            comment="Nội dung tốt nhưng tôi ghi bừa",
            reported_citation_ids=["DOC_1"]
        )
        self.assertEqual(req.rating, "helpful")
        self.assertEqual(req.reason_codes, [])
        self.assertIsNone(req.comment)
        self.assertEqual(req.reported_citation_ids, [])

    async def test_validation_schema_not_helpful_validation(self):
        # not_helpful requires reasons or comment
        with self.assertRaises(ValueError):
            FeedbackRequest(rating="not_helpful", reason_codes=[], comment=None)

    async def test_validation_schema_other_requires_comment(self):
        # ReasonCode.OTHER requires comment
        with self.assertRaises(ValueError):
            FeedbackRequest(rating="not_helpful", reason_codes=[ReasonCode.OTHER], comment=None)

    async def test_validation_schema_limits(self):
        # > 5 reasons should fail
        with self.assertRaises(ValueError):
            FeedbackRequest(
                rating="not_helpful",
                reason_codes=[
                    ReasonCode.INCORRECT_INFORMATION,
                    ReasonCode.OFF_TOPIC,
                    ReasonCode.INCOMPLETE,
                    ReasonCode.HARD_TO_UNDERSTAND,
                    ReasonCode.UNSUPPORTED_CITATION,
                    ReasonCode.OTHER
                ],
                comment="Lỗi nhiều quá"
            )

    async def test_validation_schema_citation_format(self):
        # Invalid citation format regex match
        with self.assertRaises(ValueError):
            FeedbackRequest(
                rating="not_helpful",
                reason_codes=[ReasonCode.UNSUPPORTED_CITATION],
                reported_citation_ids=["DOC_01"] # DOC_01 has leading zero, invalid
            )
        with self.assertRaises(ValueError):
            FeedbackRequest(
                rating="not_helpful",
                reason_codes=[ReasonCode.UNSUPPORTED_CITATION],
                reported_citation_ids=["CITE_1"] # Not starting with DOC or WEB
            )

    async def test_verify_ownership_success(self):
        await self._setup_fixtures()
        msg = await verify_message_ownership_or_raise(str(self.message_id), self.user_id)
        self.assertEqual(msg["_id"], self.message_id)

    async def test_verify_ownership_non_existent_message(self):
        await self._setup_fixtures()
        random_id = str(ObjectId())
        with self.assertRaises(HTTPException) as ctx:
            await verify_message_ownership_or_raise(random_id, self.user_id)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_verify_ownership_wrong_user(self):
        await self._setup_fixtures()
        wrong_user = str(ObjectId())
        with self.assertRaises(HTTPException) as ctx:
            await verify_message_ownership_or_raise(str(self.message_id), wrong_user)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_verify_ownership_user_message_rejected(self):
        await self._setup_fixtures()
        # Insert a user message
        user_msg_id = ObjectId()
        await self.db["conversation_messages"].insert_one({
            "_id": user_msg_id,
            "conversation_id": self.conversation_id,
            "user_id": self.user_id,
            "role": "user",
            "content": "Tôi hỏi một câu.",
            "status": "completed",
            "created_at": datetime.now(timezone.utc)
        })
        with self.assertRaises(HTTPException) as ctx:
            await verify_message_ownership_or_raise(str(user_msg_id), self.user_id)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_submit_feedback_not_helpful_success(self):
        await self._setup_fixtures()
        payload = FeedbackRequest(
            rating="not_helpful",
            reason_codes=[ReasonCode.INCORRECT_INFORMATION, ReasonCode.UNSUPPORTED_CITATION],
            comment="Thông tin sai hoàn toàn",
            reported_citation_ids=["DOC_1", "WEB_1"]
        )
        fb = await submit_or_update_feedback(str(self.message_id), self.user_id, payload)
        self.assertEqual(fb["rating"], "not_helpful")
        self.assertIn(ReasonCode.INCORRECT_INFORMATION, fb["reason_codes"])
        self.assertEqual(fb["comment"], "Thông tin sai hoàn toàn")
        self.assertEqual(fb["reported_citation_ids"], ["DOC_1", "WEB_1"])

        # Check citation snapshots are stored securely
        reported_citations = fb.get("reported_citations", [])
        self.assertEqual(len(reported_citations), 2)
        
        # Doc 1 snap
        doc_snap = next(c for c in reported_citations if c["source_id"] == "DOC_1")
        self.assertEqual(doc_snap["source_type"], "internal")
        self.assertEqual(doc_snap["document_id"], "doc_a")
        self.assertEqual(doc_snap["chunk_id"], "chunk_a1")

        # Web 1 snap
        web_snap = next(c for c in reported_citations if c["source_id"] == "WEB_1")
        self.assertEqual(web_snap["source_type"], "web")
        self.assertEqual(web_snap["url"], "https://example.com/source")
        self.assertEqual(web_snap["domain"], "example.com")

    async def test_submit_feedback_invalid_web_url(self):
        await self._setup_fixtures()
        # Mutate the web citations to contain an invalid URL scheme (e.g. ftp)
        await self.db["conversation_messages"].update_one(
            {"_id": self.message_id},
            {"$set": {"web_citations.0.url": "ftp://example.com/ftp-source"}}
        )
        payload = FeedbackRequest(
            rating="not_helpful",
            reason_codes=[ReasonCode.UNSUPPORTED_CITATION],
            reported_citation_ids=["WEB_1"]
        )
        with self.assertRaises(HTTPException) as ctx:
            await submit_or_update_feedback(str(self.message_id), self.user_id, payload)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_submit_feedback_missing_citation(self):
        await self._setup_fixtures()
        payload = FeedbackRequest(
            rating="not_helpful",
            reason_codes=[ReasonCode.UNSUPPORTED_CITATION],
            reported_citation_ids=["DOC_2"] # DOC_2 does not exist in message citations
        )
        with self.assertRaises(HTTPException) as ctx:
            await submit_or_update_feedback(str(self.message_id), self.user_id, payload)
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_submit_feedback_atomic_upsert(self):
        await self._setup_fixtures()
        payload1 = FeedbackRequest(
            rating="not_helpful",
            reason_codes=[ReasonCode.INCORRECT_INFORMATION],
            comment="Lần 1"
        )
        fb1 = await submit_or_update_feedback(str(self.message_id), self.user_id, payload1)
        self.assertEqual(fb1["comment"], "Lần 1")

        payload2 = FeedbackRequest(
            rating="helpful"
        )
        fb2 = await submit_or_update_feedback(str(self.message_id), self.user_id, payload2)
        # Verify it updated the same document instead of creating a new one
        self.assertEqual(fb2["id"], fb1["id"])
        self.assertEqual(fb2["rating"], "helpful")
        self.assertIsNone(fb2["comment"])

    async def test_hydrate_messages_success(self):
        await self._setup_fixtures()
        # Submit a feedback
        payload = FeedbackRequest(rating="helpful")
        await submit_or_update_feedback(str(self.message_id), self.user_id, payload)

        messages_list = [
            {
                "id": str(self.message_id),
                "role": "assistant",
                "content": "Đây là câu trả lời của AI."
            },
            {
                "id": str(ObjectId()),
                "role": "assistant",
                "content": "Đây là tin nhắn chưa đánh giá."
            }
        ]

        hydrated = await hydrate_messages_with_feedback(self.user_id, messages_list)
        self.assertIsNotNone(hydrated[0]["user_feedback"])
        self.assertEqual(hydrated[0]["user_feedback"]["rating"], "helpful")
        self.assertIsNone(hydrated[1]["user_feedback"])

    async def test_feedback_blocked_on_deleted_conversation(self):
        """Security gate: soft-deleted conversation blocks feedback (Phase 4, Gate 3)."""
        await self._setup_fixtures()
        # Soft-delete the conversation
        from datetime import datetime, timezone
        await self.db["conversations"].update_one(
            {"_id": self.conversation_id},
            {"$set": {"deleted_at": datetime.now(timezone.utc)}}
        )
        payload = FeedbackRequest(rating="helpful")
        with self.assertRaises(Exception) as ctx:
            await submit_or_update_feedback(str(self.message_id), self.user_id, payload)
        # Should raise HTTPException 404 (not leak existence by returning 403)
        from fastapi import HTTPException
        self.assertIsInstance(ctx.exception, HTTPException)
        self.assertEqual(ctx.exception.status_code, 404)
