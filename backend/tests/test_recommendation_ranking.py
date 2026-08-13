import unittest
from datetime import datetime, timezone

from mongomock_motor import AsyncMongoMockClient

from app.personalization.constants.collections import LEARNING_ITEMS, RECOMMENDATION_LOGS
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.candidates import CandidateResponse
from app.personalization.services.recommendation_ranking_service import (
    ranker_weights,
    recommend_for_user,
    validate_ranker_weights,
)


def now():
    return datetime.now(timezone.utc)


class RecommendationRankingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["recommendation_ranking"]
        self.repo = PersonalizationMongoRepository(self.db)
        self.user_id = "student-1"
        self.other_user_id = "student-2"
        self.document_id = "doc-1"
        self.other_document_id = "doc-2"
        await self.db["documents"].insert_one({"_id": self.document_id, "user_id": self.user_id})
        await self.db["documents"].insert_one({"_id": self.other_document_id, "user_id": self.other_user_id})

    async def _insert_item(self, item_id: str, kc_ids=None, **overrides):
        kc_ids = kc_ids or ["kc-1"]
        item = {
            "_id": item_id,
            "item_type": "question",
            "document_id": self.document_id,
            "knowledge_component_ids": kc_ids,
            "primary_knowledge_component_id": kc_ids[0],
            "q_matrix_weights": {kc_id: 1 / len(kc_ids) for kc_id in kc_ids},
            "difficulty": 0.45,
            "quality_score": 0.8,
            "verification_status": "verified",
            "content_cluster_id": "cluster-1",
            "created_at": now(),
            "updated_at": now(),
            "model_version": "knowledge-v1",
        }
        item.update(overrides)
        await self.db[LEARNING_ITEMS].insert_one(item)

    def _candidate(self, item_id: str, **overrides):
        payload = {
            "item_id": item_id,
            "source_types": ["appropriate_difficulty"],
            "source_scores": {"appropriate_difficulty": 0.8},
            "knowledge_component_ids": ["kc-1"],
            "difficulty": 0.45,
            "quality_score": 0.8,
            "verification_status": "verified",
            "prerequisite_status": "satisfied",
            "recently_seen": False,
            "generated_at": now(),
        }
        payload.update(overrides)
        return CandidateResponse(**payload)

    async def test_default_weights_are_valid(self):
        """Trọng số mặc định phải tự nó hợp lệ — nếu không thì mọi lần xếp hạng
        thật đều chạy trên một cấu hình mà chính hệ thống từ chối."""
        validate_ranker_weights(ranker_weights())

    async def test_cluster_match_carries_weight(self):
        """Nhãn cụm K-Means được tính, được gán, rồi chấm thành `cluster_match`.
        Để trọng số bằng 0 nghĩa là tính xong rồi vứt: công sức phân cụm không
        ảnh hưởng gì tới thứ tự người học nhìn thấy."""
        self.assertGreater(ranker_weights()["cluster_match"], 0)

    async def test_ranker_weights_must_sum_to_one(self):
        with self.assertRaises(ValueError):
            validate_ranker_weights({
                "weakness_match": 0.5,
                "difficulty_fit": 0.2,
                "prerequisite_readiness": 0.1,
                "forgetting_need": 0.1,
                "goal_match": 0.1,
                "interest_match": 0.1,
                "cluster_match": 0.0,
                "quality_score": 0.0,
                "novelty_score": 0.0,
                "continuity_score": 0.0,
            })

    async def test_hard_constraints_filter_invalid_items(self):
        await self._insert_item("ok")
        await self._insert_item("rejected", verification_status="rejected")
        await self._insert_item("locked", locked=True)
        await self._insert_item("too-hard", difficulty=0.95)
        candidates = [
            self._candidate("ok"),
            self._candidate("missing"),
            self._candidate("rejected", verification_status="rejected"),
            self._candidate("locked"),
            self._candidate("too-hard", difficulty=0.95),
            self._candidate("severe", prerequisite_status="severe_gap"),
        ]

        result = await recommend_for_user(
            self.user_id,
            limit=10,
            repository=self.repo,
            candidates=candidates,
            log_recommendations=False,
        )

        self.assertEqual([item.item_id for item in result.recommendations], ["ok"])
        self.assertEqual(result.filtered_count, 5)

    async def test_tie_score_is_deterministic(self):
        await self._insert_item("item-a")
        await self._insert_item("item-b")
        candidates = [self._candidate("item-a"), self._candidate("item-b")]

        first = await recommend_for_user(self.user_id, repository=self.repo, candidates=candidates, log_recommendations=False)
        second = await recommend_for_user(self.user_id, repository=self.repo, candidates=candidates, log_recommendations=False)

        self.assertEqual(
            [item.item_id for item in first.recommendations],
            [item.item_id for item in second.recommendations],
        )

    async def test_reranker_inserts_diverse_item(self):
        await self._insert_item("same-1", ["kc-same"], content_cluster_id="cluster-same")
        await self._insert_item("same-2", ["kc-same"], content_cluster_id="cluster-same")
        await self._insert_item("same-3", ["kc-same"], content_cluster_id="cluster-same")
        await self._insert_item("different", ["kc-diff"], content_cluster_id="cluster-diff", item_type="lesson")
        candidates = [
            self._candidate("same-1", knowledge_component_ids=["kc-same"], source_scores={"weak_knowledge": 0.9}, source_types=["weak_knowledge"]),
            self._candidate("same-2", knowledge_component_ids=["kc-same"], source_scores={"weak_knowledge": 0.85}, source_types=["weak_knowledge"]),
            self._candidate("same-3", knowledge_component_ids=["kc-same"], source_scores={"weak_knowledge": 0.8}, source_types=["weak_knowledge"]),
            self._candidate("different", knowledge_component_ids=["kc-diff"], source_scores={"appropriate_difficulty": 0.7}, source_types=["appropriate_difficulty"]),
        ]

        result = await recommend_for_user(
            self.user_id,
            limit=4,
            repository=self.repo,
            candidates=candidates,
            log_recommendations=False,
        )

        self.assertEqual(result.recommendations[2].item_id, "different")
        self.assertGreater(result.recommendations[2].rank_before_rerank, 3)

    async def test_duplicate_candidate_is_filtered(self):
        await self._insert_item("dup")
        candidates = [self._candidate("dup"), self._candidate("dup")]

        result = await recommend_for_user(self.user_id, repository=self.repo, candidates=candidates, log_recommendations=False)

        self.assertEqual(len(result.recommendations), 1)
        self.assertEqual(result.filtered_count, 1)

    async def test_new_user_can_receive_safe_recommendation(self):
        await self._insert_item("safe", difficulty=0.45, quality_score=0.9)

        result = await recommend_for_user(
            self.user_id,
            repository=self.repo,
            candidates=[self._candidate("safe", difficulty=0.45, quality_score=0.9)],
            log_recommendations=False,
        )

        self.assertEqual(result.recommendations[0].item_id, "safe")
        self.assertIn("SUITABLE_DIFFICULTY", result.recommendations[0].reason_codes)

    async def test_not_enough_candidate_returns_available_only(self):
        await self._insert_item("only")

        result = await recommend_for_user(
            self.user_id,
            limit=5,
            repository=self.repo,
            candidates=[self._candidate("only")],
            log_recommendations=False,
        )

        self.assertEqual(len(result.recommendations), 1)

    async def test_recommendation_log_is_written(self):
        await self._insert_item("logged")

        result = await recommend_for_user(
            self.user_id,
            limit=1,
            context={"session_id": "session-1"},
            repository=self.repo,
            candidates=[self._candidate("logged", source_types=["current_learning_goal"], source_scores={"current_learning_goal": 0.9})],
            log_recommendations=True,
        )

        log = await self.db[RECOMMENDATION_LOGS].find_one({"item_id": "logged"})
        self.assertEqual(len(result.recommendations), 1)
        self.assertIsNotNone(log)
        self.assertEqual(log["rank_position"], 1)
        self.assertEqual(log["feature_snapshot"]["rank_before_rerank"], 1)
        self.assertIn("MATCH_LEARNING_GOAL", log["reason_codes"])


if __name__ == "__main__":
    unittest.main()
