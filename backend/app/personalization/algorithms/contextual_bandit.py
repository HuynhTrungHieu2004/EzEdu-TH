from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

import numpy as np

from app.personalization.schemas.candidates import CandidateResponse
from app.personalization.schemas.contextual_bandit import (
    BanditActionScore,
    BanditContextVector,
    BanditDecision,
    BanditRewardBreakdown,
)


SOURCE_TYPES = (
    "weak_knowledge",
    "prerequisite_gap",
    "forgetting_review",
    "current_learning_goal",
    "similar_to_recent_error",
    "appropriate_difficulty",
    "learner_interest",
    "cluster_match",
    "exploration",
    "continue_current_path",
)

ITEM_TYPES = ("question", "lesson", "review", "other")


class BanditError(ValueError):
    pass


@dataclass(frozen=True)
class ThompsonSamplingConfig:
    policy_version: str
    context_schema_version: str
    prior_precision: float = 1.0
    prior_mean: float = 0.0
    exploration_rate: float = 0.05
    max_exploration_rate: float = 0.10
    random_state: int = 42


def build_bandit_context(
    *,
    twin: Any,
    candidate: CandidateResponse,
    item: Mapping[str, Any],
    component_scores: Mapping[str, float],
    context_schema_version: str,
) -> BanditContextVector:
    item_type = str(item.get("item_type") or "other")
    if item_type not in ITEM_TYPES:
        item_type = "other"
    duration = candidate_item_duration(candidate, item)
    feature_values: dict[str, float] = {
        "learner_global_ability": normalize_theta(getattr(twin, "global_ability", None)),
        "learner_mastery_related_skill": float(component_scores.get("weakness_match", 0.0)),
        "learner_recent_accuracy": safe_probability(getattr(twin.behavior_summary, "recent_accuracy", None)),
        "learner_response_time": normalize_response_time(getattr(twin.behavior_summary, "average_response_time_ms", None)),
        "learner_hint_rate": safe_probability(getattr(twin.behavior_summary, "hint_rate", None)),
        "learner_session_progress": normalize_count(getattr(twin.recent_progress, "recent_event_count", 0), 20),
        "learner_goal_match": safe_probability(component_scores.get("goal_match", 0.0)),
        "learner_interest_match": safe_probability(component_scores.get("interest_match", 0.0)),
        "item_difficulty": safe_probability(candidate.difficulty),
        "item_quality": safe_probability(candidate.quality_score if candidate.quality_score is not None else item.get("quality_score")),
        "item_estimated_duration": normalize_count(duration or 0, 3600),
        "item_novelty": 0.0 if candidate.recently_seen else 1.0,
        "item_knowledge_component_count": normalize_count(len(candidate.knowledge_component_ids), 8),
    }
    for value in ITEM_TYPES:
        feature_values[f"item_type_{value}"] = 1.0 if item_type == value else 0.0
    source_set = set(candidate.source_types)
    for source_type in SOURCE_TYPES:
        feature_values[f"source_{source_type}"] = 1.0 if source_type in source_set else 0.0

    names = list(feature_values)
    values = [feature_values[name] for name in names]
    if any(not np.isfinite(value) for value in values):
        raise BanditError("Context vector contains an invalid numeric value.")
    return BanditContextVector(schema_version=context_schema_version, feature_names=names, values=values)


def select_with_contextual_thompson_sampling(
    candidates: Sequence[tuple[CandidateResponse, Mapping[str, Any], Mapping[str, float]]],
    *,
    twin: Any,
    policy: Mapping[str, Any],
    config: ThompsonSamplingConfig,
    mode: str,
    min_quality_score: float = 0.0,
) -> BanditDecision:
    if not candidates:
        return BanditDecision(
            policy_version=config.policy_version,
            context_schema_version=config.context_schema_version,
            mode="fallback_ranker",
            reason="no_candidates",
        )
    if mode not in {"shadow", "active"}:
        return BanditDecision(
            policy_version=config.policy_version,
            context_schema_version=config.context_schema_version,
            mode="disabled",
            reason="bandit_disabled",
        )

    rng = np.random.default_rng(config.random_state)
    posterior = policy.get("posterior_parameters") or {}
    action_scores: list[BanditActionScore] = []
    best_score: tuple[float, str] | None = None
    best_mean: tuple[float, str] | None = None
    best_candidate: CandidateResponse | None = None

    exploration_rate = min(max(0.0, config.exploration_rate), config.max_exploration_rate)
    use_sampling = bool(rng.random() < exploration_rate)

    for candidate, item, component_scores in candidates:
        if not is_safe_for_bandit(candidate, item, min_quality_score=min_quality_score):
            continue
        context_vector = build_bandit_context(
            twin=twin,
            candidate=candidate,
            item=item,
            component_scores=component_scores,
            context_schema_version=config.context_schema_version,
        )
        action = primary_action(candidate)
        params = posterior_for_action(
            posterior,
            action,
            feature_count=len(context_vector.values),
            prior_precision=config.prior_precision,
            prior_mean=config.prior_mean,
        )
        values = np.asarray(context_vector.values, dtype=float)
        precision = np.asarray(params["precision_diag"], dtype=float)
        b_vector = np.asarray(params["b"], dtype=float)
        mean = b_vector / precision
        sampled_theta = rng.normal(mean, np.sqrt(1.0 / precision))
        sampled_score = float(np.dot(sampled_theta, values))
        mean_score = float(np.dot(mean, values))
        selected_score = sampled_score if use_sampling else mean_score
        action_scores.append(
            BanditActionScore(
                action=action,
                item_id=candidate.item_id,
                sampled_score=sampled_score,
                posterior_mean_score=mean_score,
                exploration=use_sampling,
            )
        )
        if best_score is None or selected_score > best_score[0]:
            best_score = (selected_score, candidate.item_id)
            best_candidate = candidate
        if best_mean is None or mean_score > best_mean[0]:
            best_mean = (mean_score, candidate.item_id)

    if best_candidate is None:
        return BanditDecision(
            policy_version=config.policy_version,
            context_schema_version=config.context_schema_version,
            mode="fallback_ranker",
            reason="no_safe_candidate_after_bandit_filter",
        )

    selected_action = primary_action(best_candidate)
    return BanditDecision(
        policy_version=config.policy_version,
        context_schema_version=config.context_schema_version,
        mode=mode,
        selected_item_id=best_candidate.item_id,
        selected_action=selected_action,
        reason="thompson_sample" if use_sampling else "posterior_mean_with_limited_exploration",
        action_scores=action_scores,
    )


def update_linear_posterior(
    policy: Mapping[str, Any],
    *,
    action: str,
    context_vector: BanditContextVector,
    reward: float,
    prior_precision: float,
    prior_mean: float,
) -> dict[str, Any]:
    if len(context_vector.values) == 0:
        raise BanditError("Cannot update bandit with an empty context.")
    reward_value = max(-1.0, min(1.0, float(reward)))
    posterior = dict(policy.get("posterior_parameters") or {})
    params = posterior_for_action(
        posterior,
        action,
        feature_count=len(context_vector.values),
        prior_precision=prior_precision,
        prior_mean=prior_mean,
    )
    values = np.asarray(context_vector.values, dtype=float)
    precision = np.asarray(params["precision_diag"], dtype=float) + values ** 2
    b_vector = np.asarray(params["b"], dtype=float) + values * reward_value
    posterior[action] = {
        "precision_diag": precision.tolist(),
        "b": b_vector.tolist(),
        "update_count": float(params.get("update_count", 0.0)) + 1.0,
    }
    return posterior


def compute_bandit_reward(
    *,
    feedback_type: str | None = None,
    correctness: float | None = None,
    mastery_gain: float | None = None,
    delayed_retention: float | None = None,
    reduced_response_time: float | None = None,
    reduced_hint_dependence: float | None = None,
    immediate_weight: float = 0.4,
    learning_weight: float = 0.6,
) -> BanditRewardBreakdown:
    immediate_map = {
        "clicked": 0.2,
        "started": 0.25,
        "completed": 0.55,
        "skipped": -0.15,
        "too_easy": -0.25,
        "too_hard": -0.25,
        "not_relevant": -0.45,
        "helpful": 0.35,
        "not_helpful": -0.35,
    }
    reward_components = {}
    if feedback_type:
        reward_components[f"feedback_{feedback_type}"] = immediate_map.get(feedback_type, 0.0)
    if correctness is not None:
        reward_components["correctness"] = max(0.0, min(1.0, correctness)) * 0.45
    if mastery_gain is not None:
        reward_components["mastery_gain"] = max(-1.0, min(1.0, mastery_gain)) * 0.7
    if delayed_retention is not None:
        reward_components["delayed_retention"] = max(0.0, min(1.0, delayed_retention)) * 0.5
    if reduced_response_time is not None:
        reward_components["reduced_response_time"] = max(-1.0, min(1.0, reduced_response_time)) * 0.2
    if reduced_hint_dependence is not None:
        reward_components["reduced_hint_dependence"] = max(-1.0, min(1.0, reduced_hint_dependence)) * 0.2

    immediate_reward = sum(value for key, value in reward_components.items() if key.startswith("feedback_"))
    learning_reward = sum(value for key, value in reward_components.items() if not key.startswith("feedback_"))
    total_weight = max(1e-9, immediate_weight + learning_weight)
    final_reward = (immediate_reward * immediate_weight + learning_reward * learning_weight) / total_weight
    return BanditRewardBreakdown(
        immediate_reward=max(-1.0, min(1.0, immediate_reward)),
        learning_reward=max(-1.0, min(1.0, learning_reward)),
        final_reward=max(-1.0, min(1.0, final_reward)),
        reward_components=reward_components,
    )


def posterior_for_action(
    posterior: Mapping[str, Any],
    action: str,
    *,
    feature_count: int,
    prior_precision: float,
    prior_mean: float,
) -> dict[str, Any]:
    raw = posterior.get(action) or {}
    precision = list(raw.get("precision_diag") or [])
    b_vector = list(raw.get("b") or [])
    if len(precision) != feature_count:
        precision = [float(prior_precision)] * feature_count
    if len(b_vector) != feature_count:
        b_vector = [float(prior_precision) * float(prior_mean)] * feature_count
    return {
        "precision_diag": precision,
        "b": b_vector,
        "update_count": float(raw.get("update_count") or 0.0),
    }


def primary_action(candidate: CandidateResponse) -> str:
    if not candidate.source_types:
        return "appropriate_difficulty"
    source_scores = candidate.source_scores or {}
    return max(candidate.source_types, key=lambda source: (float(source_scores.get(source, 0.0)), source))


def is_safe_for_bandit(
    candidate: CandidateResponse,
    item: Mapping[str, Any],
    *,
    min_quality_score: float = 0.0,
) -> bool:
    if not item:
        return False
    verification = str(item.get("verification_status") or candidate.verification_status)
    if verification in {"rejected", "failed", "verification_failed"}:
        return False
    if candidate.prerequisite_status == "severe_gap":
        return False
    quality_score = candidate.quality_score if candidate.quality_score is not None else item.get("quality_score")
    if quality_score is not None and float(quality_score) < min_quality_score:
        return False
    if candidate.difficulty is not None and not 0.0 <= float(candidate.difficulty) <= 1.0:
        return False
    return True


def normalize_theta(value: float | None) -> float:
    if value is None:
        return 0.5
    return max(0.0, min(1.0, (float(value) + 4.0) / 8.0))


def safe_probability(value: Any) -> float:
    if value is None:
        return 0.0
    return max(0.0, min(1.0, float(value)))


def normalize_response_time(value_ms: Any) -> float:
    if value_ms is None:
        return 0.0
    return max(0.0, min(1.0, float(value_ms) / 120000.0))


def normalize_count(value: Any, denominator: float) -> float:
    return max(0.0, min(1.0, float(value or 0.0) / denominator))


def candidate_item_duration(candidate: CandidateResponse, item: Mapping[str, Any]) -> float | None:
    return item.get("estimated_duration_seconds") or item.get("estimated_duration") or None


def synthetic_bandit_simulation(interactions: list[dict[str, Any]], *, policy_version: str) -> dict[str, Any]:
    if not interactions:
        return {
            "is_synthetic": True,
            "policy_version": policy_version,
            "interaction_count": 0,
            "cumulative_reward": 0.0,
            "regret": 0.0,
            "learning_gain_proxy": 0.0,
            "safety_violation_rate": 0.0,
            "coverage": 0.0,
            "exploration_distribution": {},
            "generated_at": datetime.now(timezone.utc),
        }
    rewards = [float(item.get("reward", 0.0)) for item in interactions]
    oracle = [float(item.get("oracle_reward", max(rewards))) for item in interactions]
    safety_violations = [1 for item in interactions if item.get("safety_violation")]
    selected_items = {item.get("item_id") for item in interactions if item.get("item_id")}
    catalog_size = max(1, int(max((item.get("catalog_size") or len(selected_items) or 1) for item in interactions)))
    exploration_distribution: dict[str, int] = {}
    for item in interactions:
        action = str(item.get("action") or "unknown")
        exploration_distribution[action] = exploration_distribution.get(action, 0) + 1
    return {
        "is_synthetic": True,
        "policy_version": policy_version,
        "interaction_count": len(interactions),
        "cumulative_reward": float(sum(rewards)),
        "regret": float(sum(oracle) - sum(rewards)),
        "learning_gain_proxy": float(np.mean([item.get("learning_gain_proxy", 0.0) for item in interactions])),
        "safety_violation_rate": len(safety_violations) / len(interactions),
        "coverage": len(selected_items) / catalog_size,
        "exploration_distribution": exploration_distribution,
        "generated_at": datetime.now(timezone.utc),
    }
