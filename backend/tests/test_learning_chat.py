import asyncio
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch, MagicMock
from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from fastapi import HTTPException

from app.database.mongodb import get_database
from app.routers import chat as chat_router
from app.services import learning_chat_service, rag_service
from app.schemas.chat import AdvancedChatAskRequest
from mongomock_motor import AsyncMongoMockClient

class LearningChatTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_db"]
        self.user_id = str(ObjectId())
        
        # Patch database
        self.db_patches = [
            patch("app.database.mongodb.get_database", return_value=self.db),
            patch("app.routers.chat.get_database", return_value=self.db),
            patch("app.services.learning_chat_service.get_database", return_value=self.db),
        ]
        for db_patch in self.db_patches:
            db_patch.start()
            self.addCleanup(db_patch.stop)

    async def test_rate_limiter(self):
        limiter = learning_chat_service.SlidingWindowLimiter(limit=2, window=1)
        # Call 1
        await limiter.check_rate_limit("user_1")
        # Call 2
        await limiter.check_rate_limit("user_1")
        # Call 3 should fail
        with self.assertRaises(HTTPException) as ctx:
            await limiter.check_rate_limit("user_1")
        self.assertEqual(ctx.exception.status_code, 429)

    @patch("app.services.learning_chat_service.search_user_chunks_advanced")
    async def test_retrieve_context_security_and_distance_filter(self, mock_search):
        doc_id_1 = str(ObjectId())
        mock_search.return_value = [
            {
                "id": "chunk_1",
                "text": "Nội dung 1",
                "distance": 0.1,  # relevance = 0.9 (above threshold)
                "metadata": {"document_id": doc_id_1}
            },
            {
                "id": "chunk_2",
                "text": "Nội dung 2",
                "distance": 0.8,  # relevance = 0.2 (below threshold - should be filtered)
                "metadata": {"document_id": doc_id_1}
            }
        ]
        
        # Setup document in DB to match title lookup
        await self.db["documents"].insert_one({
            "_id": ObjectId(doc_id_1),
            "original_filename": "Doc Title 1",
            "user_id": self.user_id
        })
        
        context, filtered = await learning_chat_service.retrieve_context(
            user_id=self.user_id,
            query="test query",
            document_ids=[doc_id_1]
        )
        
        # Verify filtered output count
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["id"], "chunk_1")
        self.assertIn("Nguồn: DOC_1", context)

    @patch("app.services.learning_chat_service.get_gemini_client")
    async def test_query_classification_fallback(self, mock_gemini):
        # Test rule-based triage
        mode = await learning_chat_service.classify_query(
            question="hỏi",
            history_messages=[],
            scope="web_only",
            use_web_search=True
        )
        self.assertEqual(mode, "web_only")

        mode_no_web = await learning_chat_service.classify_query(
            question="hỏi",
            history_messages=[],
            scope="document",
            use_web_search=False
        )
        self.assertEqual(mode_no_web, "internal_only")

    @patch("app.services.learning_chat_service.get_gemini_client")
    @patch("app.services.learning_chat_service.search_user_chunks_advanced")
    async def test_ask_advanced_question_success(self, mock_search, mock_gemini_client):
        doc_id = str(ObjectId())
        
        # Setup documents
        await self.db["documents"].insert_one({
            "_id": ObjectId(doc_id),
            "original_filename": "Doc 1",
            "user_id": self.user_id,
            "status": "indexed"
        })

        mock_search.return_value = [
            {
                "id": f"{doc_id}:0",
                "text": "ChromaDB is a vector database.",
                "distance": 0.1,
                "metadata": {"document_id": doc_id}
            }
        ]

        # Mock Gemini Client generate_content
        mock_response = MagicMock()
        mock_response.text = """
[SHORT_ANSWER] ChromaDB is a vector database. [/SHORT_ANSWER]
[EXPLANATION] Detail explaining ChromaDB [DOC_1]. [/EXPLANATION]
[KEY_POINTS]
- Point 1
[/KEY_POINTS]
[EXAMPLES]
[/EXAMPLES]
[CONFIDENCE] 0.95 [/CONFIDENCE]
[EVIDENCE_STATUS] well_supported [/EVIDENCE_STATUS]
[FOLLOW_UP]
[/FOLLOW_UP]
"""
        # Mock grounding metadata
        mock_candidate = MagicMock()
        mock_candidate.grounding_metadata = None
        mock_response.candidates = [mock_candidate]
        
        mock_client = MagicMock()
        mock_client.models.generate_content.return_value = mock_response
        mock_gemini_client.return_value = mock_client

        payload = AdvancedChatAskRequest(
            question="What is ChromaDB?",
            scope="document",
            document_ids=[doc_id],
            use_web_search=False,
            request_id=str(ObjectId())
        )

        res = await learning_chat_service.ask_advanced_question(
            user_id=self.user_id,
            payload=payload
        )

        self.assertIn("Detail explaining ChromaDB", res["answer"])
        self.assertEqual(res["evidence_status"], "well_supported")
        self.assertEqual(len(res["internal_citations"]), 1)
        self.assertEqual(res["internal_citations"][0]["document_title"], "Doc 1")

        # Verify message status is completed in db
        msg = await self.db["conversation_messages"].find_one({"request_id": payload.request_id})
        self.assertIsNotNone(msg)
        self.assertEqual(msg["status"], "completed")

    @patch("app.services.learning_chat_service.get_gemini_client")
    @patch("app.services.learning_chat_service.search_user_chunks_advanced")
    async def test_ask_advanced_question_ownership_check(self, mock_search, mock_gemini_client):
        # Try to query a document belonging to someone else
        other_doc_id = str(ObjectId())
        await self.db["documents"].insert_one({
            "_id": ObjectId(other_doc_id),
            "original_filename": "Other Doc",
            "user_id": "other_user_id",
            "status": "indexed"
        })

        payload = AdvancedChatAskRequest(
            question="unauthorized",
            scope="document",
            document_ids=[other_doc_id],
            use_web_search=False
        )

        with self.assertRaises(HTTPException) as ctx:
            await learning_chat_service.ask_advanced_question(
                user_id=self.user_id,
                payload=payload
            )
        self.assertEqual(ctx.exception.status_code, 403)
