import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError

from app.core.config import Settings
from app.personalization.algorithms.contextual_bandit import (
    ThompsonSamplingConfig,
    compute_bandit_reward,
    is_safe_for_bandit,
    select_with_contextual_thompson_sampling,
)
from app.personalization.constants.collections import BANDIT_POLICIES
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.candidates import CandidateResponse
from app.personalization.schemas.contextual_bandit import BanditContextVector, ContextualBanditPolicy
from app.personalization.schemas.data_models import RecommendationLog
from app.personalization.services.contextual_bandit_service import (
    bandit_mode,
    evaluate_bandit_decision,
    simulate_bandit_from_synthetic_data,
    update_bandit_from_recommendation_feedback,
)


def now():
    return datetime.now(timezone.utc)


def build_settings(**overrides):
    defaults = {
        "_env_file": None,
        "MONGODB_URI": "mongodb://localhost:27017/test_bandit",
        "BANDIT_POLICY_VERSION": "bandit-test-v1",
        "BANDIT_CONTEXT_SCHEMA_VERSION": "bandit-context-test-v1",
        "BANDIT_KILL_SWITCH": False,
        "BANDIT_ENABLED": False,
        "BANDIT_SHADOW_MODE_ENABLED": True,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def twin():
    return SimpleNamespace(
        global_ability=0.2,
        behavior_summary=SimpleNamespace(recent_accuracy=0.6, average_response_time_ms=30000, hint_rate=0.1),
        recent_progress=SimpleNamespace(recent_event_count=4),
    )


def candidate(item_id="item-1", **overrides):
    payload = {
        "item_id": item_id,
        "source_types": ["weak_knowledge"],
        "source_scores": {"weak_knowledge": 0.8},
        "knowledge_component_ids": ["kc-1"],
        "difficulty": 0.5,
        "quality_score": 0.8,
        "verification_status": "verified",
        "prerequisite_status": "satisfied",
        "recently_seen": False,
        "generated_at": now(),
    }
    payload.update(overrides)
    return CandidateResponse(**payload)


def item(**overrides):
    payload = {
        "item_type": "question",
        "verification_status": "verified",
        "quality_score": 0.8,
        "estimated_duration_seconds": 300,
    }
    payload.update(overrides)
    return payload


class ContextualBanditTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["contextual_bandit"]
        self.repo = PersonalizationMongoRepository(self.db)

    async def test_context_rejects_identifier_feature(self):
        with self.assertRaises(ValidationError):
            BanditContextVector(schema_version="v1", feature_names=["user_id"], values=[1.0])

    async def test_context_rejects_missing_feature_dimension(self):
        with self.assertRaises(ValidationError):
            BanditContextVector(schema_version="v1", feature_names=["difficulty", "quality"], values=[0.5])

    async def test_safety_filter_rejects_invalid_candidates(self):
        self.assertFalse(is_safe_for_bandit(candidate(prerequisite_status="severe_gap"), item()))
        self.assertFalse(is_safe_for_bandit(candidate(verification_status="failed"), item(verification_status="failed")))
        self.assertFalse(is_safe_for_bandit(candidate(quality_score=0.2), item(), min_quality_score=0.5))
        self.assertFalse(is_safe_for_bandit(candidate(), {}))

    async def test_shadow_mode_logs_decision_without_reordering(self):
        settings = build_settings()
        ranked = [
            {"candidate": candidate("ranker-first"), "item": item(), "component_scores": {"weakness_match": 0.6}},
            {"candidate": candidate("ranker-second", source_types=["learner_interest"], source_scores={"learner_interest": 0.7}), "item": item(), "component_scores": {"interest_match": 0.7}},
        ]

        updated, decision, context_by_item = await evaluate_bandit_decision(
            ranked,
            twin=twin(),
            repository=self.repo,
            app_settings=settings,
        )

        self.assertEqual([entry["candidate"].item_id for entry in updated], ["ranker-first", "ranker-second"])
        self.assertEqual(decision.mode, "shadow")
        self.assertIn("ranker-first", context_by_item)
        self.assertEqual(await self.db[BANDIT_POLICIES].count_documents({}), 1)

    async def test_kill_switch_falls_back_to_ranker(self):
        settings = build_settings(BANDIT_KILL_SWITCH=True, BANDIT_ENABLED=True, BANDIT_SHADOW_MODE_ENABLED=True)
        self.assertEqual(bandit_mode(settings), "disabled")

        updated, decision, _ = await evaluate_bandit_decision(
            [{"candidate": candidate("safe"), "item": item(), "component_scores": {}}],
            twin=twin(),
            repository=self.repo,
            app_settings=settings,
        )

        self.assertEqual(updated[0]["candidate"].item_id, "safe")
        self.assertEqual(decision.mode, "disabled")

    async def test_exploration_limit_can_disable_sampling(self):
        decision = select_with_contextual_thompson_sampling(
            [(candidate("safe"), item(), {"weakness_match": 0.3})],
            twin=twin(),
            policy={"posterior_parameters": {}},
            config=ThompsonSamplingConfig(
                policy_version="v1",
                context_schema_version="ctx-v1",
                exploration_rate=1.0,
                max_exploration_rate=0.0,
                random_state=1,
            ),
            mode="shadow",
        )

        self.assertEqual(decision.mode, "shadow")
        self.assertFalse(decision.action_scores[0].exploration)

    async def test_reward_duplicate_does_not_update_policy_twice(self):
        settings = build_settings(BANDIT_SHADOW_MODE_ENABLED=True)
        await self.repo.upsert_bandit_policy(ContextualBanditPolicy(
            policy_type="candidate_source",
            version=settings.BANDIT_POLICY_VERSION,
            context_schema_version=settings.BANDIT_CONTEXT_SCHEMA_VERSION,
            actions=["weak_knowledge"],
            status="shadow",
        ))
        context = BanditContextVector(
            schema_version=settings.BANDIT_CONTEXT_SCHEMA_VERSION,
            feature_names=["difficulty", "quality"],
            values=[0.5, 0.8],
        )
        log = await self.repo.create_recommendation_log(RecommendationLog(
            user_id="u1",
            item_id="item-1",
            candidate_sources=["weak_knowledge"],
            feature_snapshot={"bandit_context": context.model_dump(), "bandit_action": "weak_knowledge"},
            component_scores={},
            final_score=0.8,
            rank_position=1,
            generated_at=now(),
            learner_model_version="learner-v1",
            ranking_model_version="ranker-v1",
            bandit_policy_version=settings.BANDIT_POLICY_VERSION,
        ))

        first = await update_bandit_from_recommendation_feedback(
            user_id="u1",
            recommendation_log=log,
            feedback_type="clicked",
            duplicate_feedback=False,
            repository=self.repo,
            app_settings=settings,
        )
        second = await update_bandit_from_recommendation_feedback(
            user_id="u1",
            recommendation_log=log,
            feedback_type="clicked",
            duplicate_feedback=False,
            repository=self.repo,
            app_settings=settings,
        )
        policy = await self.repo.get_bandit_policy("candidate_source", settings.BANDIT_POLICY_VERSION)

        self.assertIsNotNone(first)
        self.assertIsNone(second)
        self.assertEqual(policy["update_count"], 1)

    async def test_rollback_marks_active_policy(self):
        timestamp = now()
        await self.repo.upsert_bandit_policy(ContextualBanditPolicy(
            policy_type="candidate_source",
            version="old",
            context_schema_version="ctx",
            status="draft",
        ))
        await self.repo.upsert_bandit_policy(ContextualBanditPolicy(
            policy_type="candidate_source",
            version="new",
            context_schema_version="ctx",
            status="active",
        ))

        rolled = await self.repo.rollback_bandit_policy("candidate_source", "old", timestamp)
        active = await self.repo.get_active_bandit_policy("candidate_source")

        self.assertEqual(rolled["version"], "old")
        self.assertEqual(active["version"], "old")

    async def test_reward_uses_learning_signal_not_click_only(self):
        reward = compute_bandit_reward(feedback_type="clicked", mastery_gain=0.2, correctness=1.0)

        self.assertGreater(reward.learning_reward, reward.immediate_reward)
        self.assertGreater(reward.final_reward, 0)

    async def test_synthetic_simulation_is_marked(self):
        result = simulate_bandit_from_synthetic_data([
            {"item_id": "i1", "action": "weak_knowledge", "reward": 0.2, "oracle_reward": 0.4, "catalog_size": 2},
            {"item_id": "i2", "action": "exploration", "reward": -0.1, "oracle_reward": 0.3, "catalog_size": 2},
        ], app_settings=build_settings())

        self.assertTrue(result.is_synthetic)
        self.assertEqual(result.interaction_count, 2)
        self.assertGreater(result.regret, 0)


if __name__ == "__main__":
    unittest.main()
