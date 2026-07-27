import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi import HTTPException
from mongomock_motor import AsyncMongoMockClient

from app.core.config import settings
from app.personalization.api.recommendations import ensure_recommendation_enabled
from app.personalization.constants.collections import LEARNING_ITEMS, RECOMMENDATION_LOGS
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.recommendations import (
    RecommendationFeedbackRequest,
    RecommendationItemResponse,
    RecommendationResponse,
)
from app.personalization.services.recommendation_api_service import (
    get_recommendation_history_for_current_user,
    get_recommendations_for_current_user,
    record_recommendation_feedback,
)


def now():
    return datetime.now(timezone.utc)


class RecommendationAPIExplanationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["recommendation_api"]
        self.repo = PersonalizationMongoRepository(self.db)
        self.user_id = "student-1"
        self.other_user_id = "student-2"
        self.document_id = "doc-1"
        await self.db["documents"].insert_one({
            "_id": self.document_id,
            "user_id": self.user_id,
            "original_filename": "biology.pdf",
        })
        await self.db[LEARNING_ITEMS].insert_one({
            "_id": "item-1",
            "item_type": "question",
            "document_id": self.document_id,
            "title": "Photosynthesis practice",
            "preview": "Practice light reaction concepts",
            "knowledge_component_ids": ["kc-1"],
            "difficulty": 0.45,
            "quality_score": 0.9,
            "verification_status": "verified",
            "estimated_duration_seconds": 120,
            "created_at": now(),
            "updated_at": now(),
            "model_version": "knowledge-v1",
        })
        await self.db["knowledge_components"].insert_one({
            "_id": "kc-1",
            "name": "Photosynthesis",
            "normalized_name": "photosynthesis",
            "created_by": self.user_id,
            "status": "active",
            "updated_at": now(),
        })

    def _ranking_response(self, item_id="item-1"):
        recommendation = RecommendationItemResponse(
            recommendation_log_id="log-1",
            item_id=item_id,
            source_types=["appropriate_difficulty"],
            component_scores={"difficulty_fit": 1.0, "quality_score": 0.9},
            final_score=0.8,
            rank_before_rerank=1,
            rank_after_rerank=1,
            reason_codes=["SUITABLE_DIFFICULTY"],
            knowledge_component_ids=["kc-1"],
            difficulty=0.45,
            quality_score=0.9,
            prerequisite_status="satisfied",
            generated_at=now(),
        )
        return RecommendationResponse(
            user_id=self.user_id,
            recommendations=[recommendation],
            candidate_count=1,
            filtered_count=0,
            generated_at=now(),
            model_versions={},
        )

    async def test_ai_explanation_success_after_item_selected(self):
        def ai_json(_prompt):
            return json.dumps({
                "short_reason": "Phù hợp với mức học hiện tại",
                "learning_objective": "Luyện phản ứng sáng",
                "expected_benefit": "Củng cố kiến thức đang học",
                "suggested_action": "Làm bài rồi xem giải thích",
                "confidence": 0.7,
            }, ensure_ascii=False)

        with (
            patch.object(settings, "AI_RECOMMENDATION_EXPLANATION_ENABLED", True),
            patch(
                "app.personalization.services.recommendation_api_service.recommend_for_user",
                return_value=self._ranking_response(),
            ),
        ):
            response = await get_recommendations_for_current_user(
                self.user_id,
                repository=self.repo,
                ai_json_generator=ai_json,
                use_cache=False,
            )

        self.assertEqual(response.items[0].item_id, "item-1")
        self.assertEqual(response.items[0].explanation.short_reason, "Phù hợp với mức học hiện tại")
        self.assertEqual(response.items[0].source_document["title"], "biology.pdf")

    async def test_ai_timeout_uses_fallback_explanation(self):
        def ai_timeout(_prompt):
            raise TimeoutError("timeout")

        with (
            patch.object(settings, "AI_RECOMMENDATION_EXPLANATION_ENABLED", True),
            patch(
                "app.personalization.services.recommendation_api_service.recommend_for_user",
                return_value=self._ranking_response(),
            ),
        ):
            response = await get_recommendations_for_current_user(
                self.user_id,
                repository=self.repo,
                ai_json_generator=ai_timeout,
                use_cache=False,
            )

        self.assertIn("độ khó phù hợp", response.items[0].explanation.short_reason)

    async def test_ai_invalid_json_uses_fallback_explanation(self):
        with (
            patch.object(settings, "AI_RECOMMENDATION_EXPLANATION_ENABLED", True),
            patch(
                "app.personalization.services.recommendation_api_service.recommend_for_user",
                return_value=self._ranking_response(),
            ),
        ):
            response = await get_recommendations_for_current_user(
                self.user_id,
                repository=self.repo,
                ai_json_generator=lambda _prompt: "not-json",
                use_cache=False,
            )

        self.assertIn("độ khó phù hợp", response.items[0].explanation.short_reason)

    async def test_ai_fabricated_numbers_are_rejected(self):
        def ai_with_numbers(_prompt):
            return json.dumps({
                "short_reason": "Bạn đã đạt 92 phần trăm nên nên học bài này",
                "learning_objective": "Luyện tập",
                "expected_benefit": "Củng cố",
                "suggested_action": "Làm bài",
                "confidence": 0.7,
            }, ensure_ascii=False)

        with (
            patch.object(settings, "AI_RECOMMENDATION_EXPLANATION_ENABLED", True),
            patch(
                "app.personalization.services.recommendation_api_service.recommend_for_user",
                return_value=self._ranking_response(),
            ),
        ):
            response = await get_recommendations_for_current_user(
                self.user_id,
                repository=self.repo,
                ai_json_generator=ai_with_numbers,
                use_cache=False,
            )

        self.assertIn("độ khó phù hợp", response.items[0].explanation.short_reason)

    async def test_unauthorized_history_only_returns_current_user_logs(self):
        await self.db[RECOMMENDATION_LOGS].insert_many([
            {
                "_id": "log-user",
                "user_id": self.user_id,
                "item_id": "item-1",
                "candidate_sources": ["appropriate_difficulty"],
                "component_scores": {"difficulty_fit": 1.0},
                "final_score": 0.8,
                "rank_position": 1,
                "reason_codes": ["SUITABLE_DIFFICULTY"],
                "generated_at": now(),
                "learner_model_version": "v0",
                "ranking_model_version": "v0",
                "bandit_policy_version": "v0",
            },
            {
                "_id": "log-other",
                "user_id": self.other_user_id,
                "item_id": "item-other",
                "candidate_sources": [],
                "component_scores": {},
                "final_score": 0.1,
                "rank_position": 1,
                "reason_codes": [],
                "generated_at": now(),
                "learner_model_version": "v0",
                "ranking_model_version": "v0",
                "bandit_policy_version": "v0",
            },
        ])

        history = await get_recommendation_history_for_current_user(self.user_id, repository=self.repo)

        self.assertEqual([item.recommendation_log_id for item in history.items], ["log-user"])

    async def test_feedback_wrong_item_is_rejected(self):
        await self.db[RECOMMENDATION_LOGS].insert_one({
            "_id": "log-1",
            "user_id": self.user_id,
            "item_id": "item-1",
            "candidate_sources": [],
            "component_scores": {},
            "final_score": 0.8,
            "rank_position": 1,
            "reason_codes": [],
            "generated_at": now(),
            "learner_model_version": "v0",
            "ranking_model_version": "v0",
            "bandit_policy_version": "v0",
        })
        payload = RecommendationFeedbackRequest(
            recommendation_log_id="log-1",
            item_id="wrong-item",
            feedback_type="clicked",
        )

        with self.assertRaises(HTTPException):
            await record_recommendation_feedback(self.user_id, payload, repository=self.repo)

    async def test_feedback_duplicate_type_is_idempotent(self):
        await self.db[RECOMMENDATION_LOGS].insert_one({
            "_id": "log-1",
            "user_id": self.user_id,
            "item_id": "item-1",
            "candidate_sources": [],
            "component_scores": {},
            "final_score": 0.8,
            "rank_position": 1,
            "reason_codes": [],
            "generated_at": now(),
            "learner_model_version": "v0",
            "ranking_model_version": "v0",
            "bandit_policy_version": "v0",
        })
        payload = RecommendationFeedbackRequest(
            recommendation_log_id="log-1",
            item_id="item-1",
            feedback_type="clicked",
        )

        first = await record_recommendation_feedback(self.user_id, payload, repository=self.repo)
        second = await record_recommendation_feedback(self.user_id, payload, repository=self.repo)

        self.assertFalse(first.duplicate)
        self.assertTrue(second.duplicate)

    async def test_recommendation_disabled(self):
        with (
            patch.object(settings, "PERSONALIZATION_ENABLED", True),
            patch.object(settings, "RECOMMENDATION_ENABLED", False),
            self.assertRaises(HTTPException),
        ):
            ensure_recommendation_enabled()

    async def test_no_candidate_returns_empty_items(self):
        with patch(
            "app.personalization.services.recommendation_api_service.recommend_for_user",
            return_value=RecommendationResponse(
                user_id=self.user_id,
                recommendations=[],
                candidate_count=0,
                filtered_count=0,
                generated_at=now(),
                model_versions={},
            ),
        ):
            response = await get_recommendations_for_current_user(
                self.user_id,
                repository=self.repo,
                use_cache=False,
            )

        self.assertEqual(response.items, [])

    async def test_missing_source_item_is_skipped(self):
        with patch(
            "app.personalization.services.recommendation_api_service.recommend_for_user",
            return_value=self._ranking_response(item_id="missing-item"),
        ):
            response = await get_recommendations_for_current_user(
                self.user_id,
                repository=self.repo,
                use_cache=False,
            )

        self.assertEqual(response.items, [])


if __name__ == "__main__":
    unittest.main()
