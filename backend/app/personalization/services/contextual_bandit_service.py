from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings
from app.personalization.algorithms.contextual_bandit import (
    SOURCE_TYPES,
    ThompsonSamplingConfig,
    build_bandit_context,
    compute_bandit_reward,
    primary_action,
    select_with_contextual_thompson_sampling,
    synthetic_bandit_simulation,
    update_linear_posterior,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.contextual_bandit import (
    BanditDecision,
    BanditRewardBreakdown,
    BanditSimulationResult,
    ContextualBanditPolicy,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def bandit_mode(app_settings=settings) -> str:
    if app_settings.BANDIT_KILL_SWITCH:
        return "disabled"
    if app_settings.BANDIT_ENABLED:
        return "active"
    if app_settings.BANDIT_SHADOW_MODE_ENABLED:
        return "shadow"
    return "disabled"


def _config(app_settings=settings) -> ThompsonSamplingConfig:
    return ThompsonSamplingConfig(
        policy_version=app_settings.BANDIT_POLICY_VERSION,
        context_schema_version=app_settings.BANDIT_CONTEXT_SCHEMA_VERSION,
        prior_precision=app_settings.BANDIT_PRIOR_PRECISION,
        prior_mean=app_settings.BANDIT_PRIOR_MEAN,
        exploration_rate=app_settings.BANDIT_EXPLORATION_RATE,
        max_exploration_rate=app_settings.BANDIT_MAX_EXPLORATION_RATE,
        random_state=app_settings.KMEANS_RANDOM_STATE,
    )


async def ensure_bandit_policy(
    *,
    repository: PersonalizationMongoRepository,
    mode: str,
    app_settings=settings,
) -> Optional[dict]:
    if mode == "disabled":
        return None
    existing = await repository.get_bandit_policy("candidate_source", app_settings.BANDIT_POLICY_VERSION)
    if existing:
        return existing
    status = "active" if mode == "active" else "shadow"
    policy = ContextualBanditPolicy(
        policy_type="candidate_source",
        version=app_settings.BANDIT_POLICY_VERSION,
        context_schema_version=app_settings.BANDIT_CONTEXT_SCHEMA_VERSION,
        feature_names=[],
        actions=list(SOURCE_TYPES),
        prior_parameters={
            "prior_precision": app_settings.BANDIT_PRIOR_PRECISION,
            "prior_mean": app_settings.BANDIT_PRIOR_MEAN,
            "exploration_rate": app_settings.BANDIT_EXPLORATION_RATE,
        },
        posterior_parameters={},
        status=status,
        activated_at=_now() if status == "active" else None,
    )
    return await repository.upsert_bandit_policy(policy)


async def evaluate_bandit_decision(
    ranked_entries: list[dict],
    *,
    twin,
    repository: PersonalizationMongoRepository,
    app_settings=settings,
) -> tuple[list[dict], BanditDecision, dict[str, dict]]:
    mode = bandit_mode(app_settings)
    config = _config(app_settings)
    if mode == "disabled":
        return ranked_entries, BanditDecision(
            policy_version=app_settings.BANDIT_POLICY_VERSION,
            context_schema_version=app_settings.BANDIT_CONTEXT_SCHEMA_VERSION,
            mode="disabled",
            reason="bandit_disabled_or_kill_switch",
        ), {}

    policy = await ensure_bandit_policy(repository=repository, mode=mode, app_settings=app_settings)
    if not policy:
        return ranked_entries, BanditDecision(
            policy_version=app_settings.BANDIT_POLICY_VERSION,
            context_schema_version=app_settings.BANDIT_CONTEXT_SCHEMA_VERSION,
            mode="fallback_ranker",
            reason="policy_unavailable",
        ), {}

    triples = [(entry["candidate"], entry["item"], entry["component_scores"]) for entry in ranked_entries]
    decision = select_with_contextual_thompson_sampling(
        triples,
        twin=twin,
        policy=policy,
        config=config,
        mode=mode,
        min_quality_score=app_settings.CANDIDATE_MIN_QUALITY_SCORE,
    )
    context_by_item_id = {}
    for entry in ranked_entries:
        candidate = entry["candidate"]
        context_vector = build_bandit_context(
            twin=twin,
            candidate=candidate,
            item=entry["item"],
            component_scores=entry["component_scores"],
            context_schema_version=app_settings.BANDIT_CONTEXT_SCHEMA_VERSION,
        )
        context_by_item_id[candidate.item_id] = {
            "context": context_vector.model_dump(),
            "action": primary_action(candidate),
        }

    if mode == "active" and decision.selected_item_id:
        selected = [entry for entry in ranked_entries if entry["candidate"].item_id == decision.selected_item_id]
        remaining = [entry for entry in ranked_entries if entry["candidate"].item_id != decision.selected_item_id]
        return [*selected, *remaining], decision, context_by_item_id
    return ranked_entries, decision, context_by_item_id


async def update_bandit_from_recommendation_feedback(
    *,
    user_id: str,
    recommendation_log: dict,
    feedback_type: str,
    duplicate_feedback: bool,
    repository: PersonalizationMongoRepository,
    app_settings=settings,
) -> Optional[BanditRewardBreakdown]:
    if duplicate_feedback or bandit_mode(app_settings) == "disabled":
        return None
    snapshot = recommendation_log.get("feature_snapshot") or {}
    context_payload = snapshot.get("bandit_context")
    action = snapshot.get("bandit_action")
    if not context_payload or not action:
        return None

    reward = compute_bandit_reward(
        feedback_type=feedback_type,
        immediate_weight=app_settings.BANDIT_REWARD_IMMEDIATE_WEIGHT,
        learning_weight=app_settings.BANDIT_REWARD_LEARNING_WEIGHT,
    )
    updated_log, duplicate_reward = await repository.record_bandit_reward(
        user_id=user_id,
        recommendation_log_id=recommendation_log["id"],
        reward_key=f"feedback_{feedback_type}",
        reward=reward.final_reward,
        reward_breakdown=reward.model_dump(),
        recorded_at=_now(),
    )
    if duplicate_reward or not updated_log:
        return None

    policy = await ensure_bandit_policy(repository=repository, mode=bandit_mode(app_settings), app_settings=app_settings)
    if not policy:
        return reward
    posterior = update_linear_posterior(
        policy,
        action=str(action),
        context_vector=context_payload_to_vector(context_payload),
        reward=reward.final_reward,
        prior_precision=app_settings.BANDIT_PRIOR_PRECISION,
        prior_mean=app_settings.BANDIT_PRIOR_MEAN,
    )
    await repository.update_bandit_policy_posterior(
        policy_type="candidate_source",
        version=app_settings.BANDIT_POLICY_VERSION,
        posterior_parameters=posterior,
        updated_at=_now(),
    )
    return reward


def context_payload_to_vector(payload: dict) -> object:
    from app.personalization.schemas.contextual_bandit import BanditContextVector

    return BanditContextVector(**payload)


def simulate_bandit_from_synthetic_data(interactions: list[dict], *, app_settings=settings) -> BanditSimulationResult:
    result = synthetic_bandit_simulation(interactions, policy_version=app_settings.BANDIT_POLICY_VERSION)
    return BanditSimulationResult(**result)
