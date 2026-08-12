"""Khoá lại hành vi Thompson Sampling đã kiểm chứng bằng tay.

Khác các mô-đun cá nhân hoá khác, phần bandit **không thiếu mã** — vòng lặp đã
nối đủ hai đầu: `evaluate_bandit_decision` trong luồng xếp hạng và
`update_bandit_from_recommendation_feedback` trong luồng phản hồi. Nó chỉ bị
tắt bởi `BANDIT_KILL_SWITCH`.

Vì đường này chưa từng chạy trong sản phẩm, các test dưới đây chốt lại đúng
những gì đã kiểm chứng, để lần bật thật không phải dò lại từ đầu.
"""

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

import numpy as np
from mongomock_motor import AsyncMongoMockClient

from app.core.config import Settings
from app.personalization.algorithms.contextual_bandit import (
    build_bandit_context,
    compute_bandit_reward,
    update_linear_posterior,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.candidates import CandidateResponse
from app.personalization.schemas.recommendations import FeedbackType
from app.personalization.services.contextual_bandit_service import (
    bandit_mode,
    ensure_bandit_policy,
    evaluate_bandit_decision,
)

NOW = datetime(2026, 8, 1, tzinfo=timezone.utc)

COMPONENT_SCORES = {
    key: 0.5
    for key in (
        "weakness_match", "goal_match", "interest_match", "cluster_match",
        "forgetting_need", "difficulty_fit", "quality_score", "novelty_score",
        "continuity_score", "prerequisite_ready",
    )
}


def make_settings(**overrides) -> Settings:
    base = dict(
        BANDIT_KILL_SWITCH=True, BANDIT_ENABLED=False, BANDIT_SHADOW_MODE_ENABLED=False
    )
    base.update(overrides)
    return Settings(**base)


def make_twin():
    return SimpleNamespace(
        global_ability=0.3,
        behavior_summary=SimpleNamespace(
            recent_accuracy=0.6, average_response_time_ms=12000, hint_rate=0.1
        ),
        recent_progress=SimpleNamespace(recent_event_count=8),
    )


def make_entry(item_id: str, source: str, score: float) -> dict:
    candidate = CandidateResponse(
        item_id=item_id,
        item_type="question",
        source_types=[source],
        source_scores={source: score},
        knowledge_component_ids=["kc1"],
        difficulty=0.5,
        quality_score=0.8,
        recently_seen=False,
        prerequisite_status="satisfied",
        verification_status="verified",
        generated_at=NOW,
    )
    return {
        "candidate": candidate,
        "item": {"_id": item_id, "item_type": "question", "quality_score": 0.8},
        "component_scores": dict(COMPONENT_SCORES),
        "final_score": score,
    }


def make_entries() -> list[dict]:
    return [
        make_entry("i1", "weak_knowledge", 0.90),
        make_entry("i2", "exploration", 0.60),
        make_entry("i3", "forgetting_review", 0.40),
    ]


def make_repo():
    repo = PersonalizationMongoRepository.__new__(PersonalizationMongoRepository)
    repo.db = AsyncMongoMockClient()["test"]
    return repo


class BanditModeTests(unittest.TestCase):
    def test_kill_switch_wins_over_every_other_flag(self):
        """Công tắc ngắt phải thắng tuyệt đối — đây là đường thoát hiểm."""
        settings = make_settings(
            BANDIT_KILL_SWITCH=True, BANDIT_ENABLED=True, BANDIT_SHADOW_MODE_ENABLED=True
        )

        self.assertEqual(bandit_mode(settings), "disabled")

    def test_default_configuration_is_disabled(self):
        self.assertEqual(bandit_mode(make_settings()), "disabled")

    def test_shadow_and_active_resolve_correctly(self):
        shadow = make_settings(BANDIT_KILL_SWITCH=False, BANDIT_SHADOW_MODE_ENABLED=True)
        active = make_settings(BANDIT_KILL_SWITCH=False, BANDIT_ENABLED=True)

        self.assertEqual(bandit_mode(shadow), "shadow")
        self.assertEqual(bandit_mode(active), "active")


class EvaluateBanditDecisionTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_mode_leaves_the_ranking_untouched(self):
        entries = make_entries()

        result, decision, context = await evaluate_bandit_decision(
            entries, twin=make_twin(), repository=make_repo(), app_settings=make_settings()
        )

        self.assertEqual(decision.mode, "disabled")
        self.assertEqual([e["candidate"].item_id for e in result], ["i1", "i2", "i3"])
        self.assertEqual(context, {})

    async def test_shadow_mode_decides_but_never_reorders(self):
        """Đây là điểm mấu chốt của chế độ shadow: quan sát mà không ảnh hưởng."""
        entries = make_entries()
        settings = make_settings(BANDIT_KILL_SWITCH=False, BANDIT_SHADOW_MODE_ENABLED=True)

        result, decision, context = await evaluate_bandit_decision(
            entries, twin=make_twin(), repository=make_repo(), app_settings=settings
        )

        self.assertEqual(decision.mode, "shadow")
        self.assertIsNotNone(decision.selected_item_id)
        self.assertEqual([e["candidate"].item_id for e in result], ["i1", "i2", "i3"])
        self.assertEqual(len(context), 3)

    async def test_active_mode_promotes_the_selected_item(self):
        entries = make_entries()
        settings = make_settings(BANDIT_KILL_SWITCH=False, BANDIT_ENABLED=True)

        result, decision, _ = await evaluate_bandit_decision(
            entries, twin=make_twin(), repository=make_repo(), app_settings=settings
        )

        self.assertEqual(decision.mode, "active")
        self.assertEqual(result[0]["candidate"].item_id, decision.selected_item_id)

    async def test_every_candidate_gets_a_context_vector_for_later_learning(self):
        """Không có context lưu lại thì phản hồi về sau không cập nhật được gì."""
        settings = make_settings(BANDIT_KILL_SWITCH=False, BANDIT_SHADOW_MODE_ENABLED=True)

        _, _, context = await evaluate_bandit_decision(
            make_entries(), twin=make_twin(), repository=make_repo(), app_settings=settings
        )

        for payload in context.values():
            self.assertIn("context", payload)
            self.assertIn("action", payload)
            self.assertTrue(payload["context"]["values"])


class BanditRewardTests(unittest.TestCase):
    def test_every_feedback_type_the_api_accepts_carries_a_signal(self):
        """Loại phản hồi bị chấm 0 sẽ tiêu tốn một lượt cập nhật mà không dạy
        được gì cho mô hình — phải chắc không loại nào rơi vào đó."""
        settings = make_settings()

        for feedback_type in FeedbackType.__args__:
            reward = compute_bandit_reward(
                feedback_type=feedback_type,
                immediate_weight=settings.BANDIT_REWARD_IMMEDIATE_WEIGHT,
                learning_weight=settings.BANDIT_REWARD_LEARNING_WEIGHT,
            )
            self.assertNotAlmostEqual(
                reward.final_reward, 0.0, places=6,
                msg=f"'{feedback_type}' không tạo tín hiệu học nào",
            )

    def test_positive_and_negative_feedback_have_opposite_signs(self):
        settings = make_settings()

        def reward_of(feedback_type: str) -> float:
            return compute_bandit_reward(
                feedback_type=feedback_type,
                immediate_weight=settings.BANDIT_REWARD_IMMEDIATE_WEIGHT,
                learning_weight=settings.BANDIT_REWARD_LEARNING_WEIGHT,
            ).final_reward

        self.assertGreater(reward_of("completed"), 0)
        self.assertGreater(reward_of("helpful"), 0)
        self.assertLess(reward_of("not_relevant"), 0)
        self.assertLess(reward_of("not_helpful"), 0)


class PosteriorLearningTests(unittest.TestCase):
    def _context(self):
        entry = make_entry("i1", "weak_knowledge", 0.9)
        return build_bandit_context(
            twin=make_twin(),
            candidate=entry["candidate"],
            item=entry["item"],
            component_scores=entry["component_scores"],
            context_schema_version="bandit-context-v1",
        )

    def _implied_mean(self, posterior: dict, action: str) -> np.ndarray:
        params = posterior.get(action, {})
        precision = np.asarray(params.get("precision_diag") or [], dtype=float)
        b_vector = np.asarray(params.get("b") or [], dtype=float)
        return b_vector / precision if precision.size else np.array([])

    def test_repeated_positive_feedback_raises_the_estimate(self):
        context = self._context()
        posterior: dict = {}
        means = []
        for _ in range(3):
            posterior = update_linear_posterior(
                {"posterior_parameters": posterior},
                action="weak_knowledge", context_vector=context, reward=1.0,
                prior_precision=1.0, prior_mean=0.0,
            )
            means.append(float(self._implied_mean(posterior, "weak_knowledge")[0]))

        self.assertEqual(means, sorted(means), "ước lượng phải tăng dần")
        self.assertGreater(means[-1], means[0])

    def test_negative_feedback_pulls_the_estimate_back_down(self):
        context = self._context()
        posterior: dict = {}
        for _ in range(3):
            posterior = update_linear_posterior(
                {"posterior_parameters": posterior},
                action="weak_knowledge", context_vector=context, reward=1.0,
                prior_precision=1.0, prior_mean=0.0,
            )
        peak = float(self._implied_mean(posterior, "weak_knowledge")[0])

        for _ in range(3):
            posterior = update_linear_posterior(
                {"posterior_parameters": posterior},
                action="weak_knowledge", context_vector=context, reward=-1.0,
                prior_precision=1.0, prior_mean=0.0,
            )
        after = float(self._implied_mean(posterior, "weak_knowledge")[0])

        self.assertLess(after, peak)

    def test_update_count_tracks_how_much_evidence_was_seen(self):
        context = self._context()
        posterior: dict = {}
        for _ in range(4):
            posterior = update_linear_posterior(
                {"posterior_parameters": posterior},
                action="weak_knowledge", context_vector=context, reward=0.5,
                prior_precision=1.0, prior_mean=0.0,
            )

        self.assertEqual(posterior["weak_knowledge"]["update_count"], 4.0)


class EnsureBanditPolicyTests(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_mode_creates_no_policy(self):
        policy = await ensure_bandit_policy(
            repository=make_repo(), mode="disabled", app_settings=make_settings()
        )

        self.assertIsNone(policy)

    async def test_policy_is_created_once_and_reused(self):
        repo = make_repo()
        settings = make_settings(BANDIT_KILL_SWITCH=False, BANDIT_ENABLED=True)

        first = await ensure_bandit_policy(repository=repo, mode="active", app_settings=settings)
        second = await ensure_bandit_policy(repository=repo, mode="active", app_settings=settings)

        self.assertEqual(first["version"], second["version"])
        self.assertEqual(await repo.db["bandit_policies"].count_documents({}), 1)


if __name__ == "__main__":
    unittest.main()
