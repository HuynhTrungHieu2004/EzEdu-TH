import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

from bson import ObjectId
from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.config import settings
from app.services.llm_service import ClaudeResult
from app.schemas.auth import UserResponse
from app.web_knowledge.api.deps import (
    is_admin_actor,
    require_teacher_actor,
    require_web_knowledge_actor,
)
from app.web_knowledge.repositories.indexes import ensure_web_knowledge_indexes
from app.web_knowledge.schemas.source import SaveSourceRequest
from app.web_knowledge.services import source_service, web_knowledge_service
from app.web_knowledge.services.web_knowledge_service import get_domain_score, redact_text


def _actor(role: str) -> UserResponse:
    return UserResponse(
        id=str(ObjectId()), email=f"{role}@example.com", full_name=role, role=role, created_at=datetime.now(timezone.utc)
    )


def _fake_claude_response(text: str, citations=()):
    return ClaudeResult(
        text=text,
        model="claude-sonnet-test",
        citations=[
            {"url": uri, "title": title, "cited_text": excerpt}
            for uri, title, excerpt in citations
        ],
    )


class DomainScoreAndRedactionTests(unittest.TestCase):
    def test_gov_scores_highest(self):
        self.assertEqual(get_domain_score("https://moet.gov.vn/tin-tuc"), 100)

    def test_edu_scores_high(self):
        self.assertEqual(get_domain_score("https://mit.edu/course"), 90)

    def test_known_reference_domain_scores_above_generic_org(self):
        self.assertEqual(get_domain_score("https://en.wikipedia.org/wiki/Vietnam"), 30)
        self.assertEqual(get_domain_score("https://random.org"), 20)

    def test_unknown_domain_scores_lowest(self):
        self.assertEqual(get_domain_score("https://example.com"), 10)

    def test_redacts_email_and_phone(self):
        text = "Liên hệ giáo viên qua email teacher@school.edu.vn hoặc 0912-345-678."
        redacted = redact_text(text)
        self.assertNotIn("teacher@school.edu.vn", redacted)
        self.assertNotIn("0912-345-678", redacted)
        self.assertIn("[email đã ẩn]", redacted)


class ExploreServiceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_web_knowledge_explore"]
        await ensure_web_knowledge_indexes(self.db)
        self.user_id = "student-1"

    async def test_explore_calls_claude_and_extracts_citations(self):
        fake_response = _fake_claude_response(
            "[ANSWER] Việt Nam nằm ở Đông Nam Á. [/ANSWER]"
            "[EVIDENCE_STATUS] well_supported [/EVIDENCE_STATUS]"
            "[CONFIDENCE] 0.9 [/CONFIDENCE]",
            citations=[("https://moet.gov.vn/vn", "Bộ GD&ĐT", "Việt Nam thông tin chính thức")],
        )
        with patch("app.web_knowledge.services.web_knowledge_service.claude_web_search", return_value=fake_response) as claude:
            result = await web_knowledge_service.explore(self.db, user_id=self.user_id, query="Việt Nam ở đâu?")

        self.assertFalse(result.from_cache)
        self.assertEqual(result.evidence_status, "well_supported")
        self.assertAlmostEqual(result.confidence, 0.9)
        self.assertEqual(len(result.citations), 1)
        self.assertEqual(result.citations[0].url, "https://moet.gov.vn/vn")
        self.assertEqual(result.citations[0].relevance_score, 1.0)
        claude.assert_called_once()

    async def test_second_identical_query_hits_cache_not_gemini(self):
        fake_response = _fake_claude_response(
            "[ANSWER] A. [/ANSWER][EVIDENCE_STATUS] well_supported [/EVIDENCE_STATUS][CONFIDENCE] 0.8 [/CONFIDENCE]"
        )
        with patch("app.web_knowledge.services.web_knowledge_service.claude_web_search", return_value=fake_response) as claude:
            first = await web_knowledge_service.explore(self.db, user_id=self.user_id, query="Câu hỏi ABC")
            second = await web_knowledge_service.explore(self.db, user_id=self.user_id, query="  câu hỏi   abc  ")

        self.assertFalse(first.from_cache)
        self.assertTrue(second.from_cache)
        claude.assert_called_once()

    async def test_daily_quota_blocks_after_limit(self):
        fake_response = _fake_claude_response(
            "[ANSWER] A. [/ANSWER][EVIDENCE_STATUS] unverified [/EVIDENCE_STATUS][CONFIDENCE] 0.3 [/CONFIDENCE]"
        )
        with patch("app.web_knowledge.services.web_knowledge_service.claude_web_search", return_value=fake_response), patch.object(
            settings, "WEB_KNOWLEDGE_DAILY_QUOTA", 2
        ):
            await web_knowledge_service.explore(self.db, user_id=self.user_id, query="câu hỏi 1")
            await web_knowledge_service.explore(self.db, user_id=self.user_id, query="câu hỏi 2")
            with self.assertRaises(HTTPException) as ctx:
                await web_knowledge_service.explore(self.db, user_id=self.user_id, query="câu hỏi 3")
        self.assertEqual(ctx.exception.status_code, 429)

    async def test_claude_failure_returns_clean_502_not_raw_exception(self):
        with patch("app.web_knowledge.services.web_knowledge_service.claude_web_search", side_effect=RuntimeError("429 rate limit")):
            with self.assertRaises(HTTPException) as ctx:
                await web_knowledge_service.explore(self.db, user_id=self.user_id, query="câu hỏi lỗi claude")
        self.assertEqual(ctx.exception.status_code, 502)

    async def test_quota_is_per_user(self):
        fake_response = _fake_claude_response(
            "[ANSWER] A. [/ANSWER][EVIDENCE_STATUS] unverified [/EVIDENCE_STATUS][CONFIDENCE] 0.3 [/CONFIDENCE]"
        )
        with patch("app.web_knowledge.services.web_knowledge_service.claude_web_search", return_value=fake_response), patch.object(
            settings, "WEB_KNOWLEDGE_DAILY_QUOTA", 1
        ):
            await web_knowledge_service.explore(self.db, user_id="user-a", query="câu hỏi riêng a")
            # user khác vẫn dùng được dù user-a đã hết quota hôm nay
            result = await web_knowledge_service.explore(self.db, user_id="user-b", query="câu hỏi riêng b")
        self.assertFalse(result.from_cache)


class SourceReviewWorkflowTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_web_knowledge_source"]
        self.teacher_id = "teacher-1"

    async def test_save_creates_draft(self):
        created = await source_service.save_source(
            self.db,
            SaveSourceRequest(query="Định lý Pythagoras", answer="a^2+b^2=c^2", citations=[]),
            owner_id=self.teacher_id,
        )
        self.assertEqual(created.status, "draft")
        self.assertEqual(created.version, 1)

    async def test_full_review_lifecycle(self):
        created = await source_service.save_source(
            self.db, SaveSourceRequest(query="Q dai", answer="A", citations=[]), owner_id=self.teacher_id
        )
        reviewing = await source_service.review_source(
            self.db, created.id, version=created.version, target_status="reviewing",
            actor_id=self.teacher_id, is_admin=False,
        )
        approved = await source_service.review_source(
            self.db, created.id, version=reviewing.version, target_status="approved",
            actor_id=self.teacher_id, is_admin=False,
        )
        published = await source_service.review_source(
            self.db, created.id, version=approved.version, target_status="published",
            actor_id=self.teacher_id, is_admin=False,
        )
        self.assertEqual(published.status, "published")

    async def test_invalid_transition_rejected(self):
        created = await source_service.save_source(
            self.db, SaveSourceRequest(query="Q dai", answer="A", citations=[]), owner_id=self.teacher_id
        )
        with self.assertRaises(HTTPException) as ctx:
            await source_service.review_source(
                self.db, created.id, version=created.version, target_status="published",
                actor_id=self.teacher_id, is_admin=False,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_review_rejects_non_owner(self):
        created = await source_service.save_source(
            self.db, SaveSourceRequest(query="Q dai", answer="A", citations=[]), owner_id=self.teacher_id
        )
        with self.assertRaises(HTTPException) as ctx:
            await source_service.review_source(
                self.db, created.id, version=created.version, target_status="reviewing",
                actor_id="someone-else", is_admin=False,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_list_sources_scoped_to_owner(self):
        await source_service.save_source(
            self.db, SaveSourceRequest(query="Q1 dai", answer="A1", citations=[]), owner_id=self.teacher_id
        )
        await source_service.save_source(
            self.db, SaveSourceRequest(query="Q2 dai", answer="A2", citations=[]), owner_id="other-teacher"
        )
        items, total = await source_service.list_sources(self.db, owner_id=self.teacher_id, status_filter=None)
        self.assertEqual(total, 1)
        self.assertEqual(items[0].query, "Q1 dai")


class RoleGuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_feature_flag_off_blocks_everyone(self):
        with patch.object(settings, "ENABLE_WEB_KNOWLEDGE", False):
            with self.assertRaises(HTTPException) as ctx:
                await require_web_knowledge_actor(_actor("student"))
            self.assertEqual(ctx.exception.status_code, 403)

    async def test_student_can_explore_when_enabled(self):
        with patch.object(settings, "ENABLE_WEB_KNOWLEDGE", True):
            result = await require_web_knowledge_actor(_actor("student"))
        self.assertEqual(result.role, "student")

    async def test_student_cannot_save_or_review(self):
        with patch.object(settings, "ENABLE_WEB_KNOWLEDGE", True):
            with self.assertRaises(HTTPException) as ctx:
                await require_teacher_actor(_actor("student"))
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_lecturer_can_save_and_review(self):
        with patch.object(settings, "ENABLE_WEB_KNOWLEDGE", True):
            result = await require_teacher_actor(_actor("lecturer"))
        self.assertEqual(result.role, "lecturer")

    def test_is_admin_actor(self):
        self.assertTrue(is_admin_actor(_actor("admin")))
        self.assertFalse(is_admin_actor(_actor("lecturer")))


if __name__ == "__main__":
    unittest.main()
