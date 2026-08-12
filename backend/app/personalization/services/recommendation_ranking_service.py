from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.cbf_kmeans_hybrid_service import (
    ensure_cluster_exploration_for_entries,
    touched_clusters,
)
from app.personalization.schemas.candidates import CandidateResponse
from app.personalization.schemas.data_models import RecommendationLog
from app.personalization.schemas.recommendations import (
    RecommendationItemResponse,
    RecommendationResponse,
    ReasonCode,
)
from app.personalization.services.candidate_generator_service import generate_candidates_for_user
from app.personalization.services.contextual_bandit_service import evaluate_bandit_decision
from app.personalization.services.digital_twin_service import get_current_user_digital_twin


COMPONENT_SCORE_KEYS = (
    "weakness_match",
    "difficulty_fit",
    "prerequisite_readiness",
    "forgetting_need",
    "goal_match",
    "interest_match",
    "cluster_match",
    "quality_score",
    "novelty_score",
    "continuity_score",
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def ranker_weights() -> dict[str, float]:
    return {
        "weakness_match": settings.RANKER_WEIGHT_WEAKNESS_MATCH,
        "difficulty_fit": settings.RANKER_WEIGHT_DIFFICULTY_FIT,
        "prerequisite_readiness": settings.RANKER_WEIGHT_PREREQUISITE_READINESS,
        "forgetting_need": settings.RANKER_WEIGHT_FORGETTING_NEED,
        "goal_match": settings.RANKER_WEIGHT_GOAL_MATCH,
        "interest_match": settings.RANKER_WEIGHT_INTEREST_MATCH,
        "cluster_match": settings.RANKER_WEIGHT_CLUSTER_MATCH,
        "quality_score": settings.RANKER_WEIGHT_QUALITY_SCORE,
        "novelty_score": settings.RANKER_WEIGHT_NOVELTY_SCORE,
        "continuity_score": settings.RANKER_WEIGHT_CONTINUITY_SCORE,
    }


def validate_ranker_weights(weights: dict[str, float]) -> None:
    missing = set(COMPONENT_SCORE_KEYS) - set(weights)
    if missing:
        raise ValueError(f"Missing ranker weights: {sorted(missing)}")
    for key in COMPONENT_SCORE_KEYS:
        if not 0 <= float(weights[key]) <= 1:
            raise ValueError(f"Ranker weight {key} must be between 0 and 1.")
    if abs(sum(float(weights[key]) for key in COMPONENT_SCORE_KEYS) - 1.0) > 0.000001:
        raise ValueError("Ranker weights must sum to 1.0.")


def _model_versions() -> dict[str, str]:
    return {
        "feature_schema_version": settings.FEATURE_SCHEMA_VERSION,
        "knowledge_model_version": settings.KNOWLEDGE_MODEL_VERSION,
        "learner_model_version": settings.LEARNER_MODEL_VERSION,
        "clustering_model_version": settings.CLUSTERING_MODEL_VERSION,
        "ranking_model_version": settings.RANKING_MODEL_VERSION,
        "bandit_policy_version": settings.BANDIT_POLICY_VERSION,
    }


async def recommend_for_user(
    user_id: str,
    *,
    limit: int = 10,
    context: Optional[dict] = None,
    repository: Optional[PersonalizationMongoRepository] = None,
    candidates: Optional[list[CandidateResponse]] = None,
    log_recommendations: bool = True,
) -> RecommendationResponse:
    repo = repository or PersonalizationMongoRepository()
    generated_at = _now()
    weights = ranker_weights()
    validate_ranker_weights(weights)
    twin = await get_current_user_digital_twin(user_id, repository=repo, use_cache=False)
    if candidates is None:
        candidate_response = await generate_candidates_for_user(
            user_id,
            repository=repo,
            total_limit=max(limit * 4, settings.CANDIDATE_TOTAL_LIMIT),
        )
        candidates = candidate_response.candidates

    accessible_items = await repo.list_accessible_learning_items_for_user(user_id, limit=1000)
    item_by_id = {str(item.get("item_id") or item.get("id")): item for item in accessible_items}
    ranked: list[dict] = []
    filtered_count = 0
    seen_item_ids: set[str] = set()

    for candidate in candidates:
        if candidate.item_id in seen_item_ids:
            filtered_count += 1
            continue
        seen_item_ids.add(candidate.item_id)
        item = item_by_id.get(candidate.item_id)
        if not _passes_hard_constraints(candidate, item, twin):
            filtered_count += 1
            continue
        component_scores = _component_scores(candidate, item, twin)
        final_score = _weighted_score(component_scores, weights)
        ranked.append(
            {
                "candidate": candidate,
                "item": item,
                "component_scores": component_scores,
                "final_score": final_score,
            }
        )

    ranked.sort(
        key=lambda entry: (
            entry["final_score"],
            entry["component_scores"]["quality_score"],
            entry["candidate"].item_id,
        ),
        reverse=True,
    )
    for index, entry in enumerate(ranked, start=1):
        entry["rank_before_rerank"] = index

    ranked, bandit_decision, bandit_context_by_item_id = await evaluate_bandit_decision(
        ranked,
        twin=twin,
        repository=repo,
    )
    log_context = dict(context or {})
    log_context["bandit_decision"] = bandit_decision.model_dump()
    log_context["bandit_context_by_item_id"] = bandit_context_by_item_id

    reranked = _rerank(ranked, limit=limit)

    # Chống bong bóng lọc của CBF: nếu cả top-N đều thuộc các cụm người học đã
    # quen, đề một item thuộc cụm chưa chạm lên. Cơ chế rerank ở trên chỉ chặn
    # item LIÊN TIẾP cùng cụm (giãn cách), không đảm bảo có vùng nội dung mới.
    learner_events = await repo.list_learning_events_for_user(user_id, limit=100)
    reranked = ensure_cluster_exploration_for_entries(
        reranked,
        touched=touched_clusters(learner_events, item_by_id),
        top_n=limit,
    )
    recommendations: list[RecommendationItemResponse] = []
    for index, entry in enumerate(reranked, start=1):
        candidate = entry["candidate"]
        recommendation = RecommendationItemResponse(
            item_id=candidate.item_id,
            source_types=candidate.source_types,
            component_scores=entry["component_scores"],
            final_score=entry["final_score"],
            rank_before_rerank=entry["rank_before_rerank"],
            rank_after_rerank=index,
            reason_codes=_reason_codes(candidate, entry["component_scores"]),
            knowledge_component_ids=candidate.knowledge_component_ids,
            difficulty=candidate.difficulty,
            quality_score=candidate.quality_score,
            prerequisite_status=candidate.prerequisite_status,
            generated_at=generated_at,
        )
        recommendations.append(recommendation)
        if log_recommendations:
            log = await _log_recommendation(repo, user_id, recommendation, context=log_context)
            recommendation.recommendation_log_id = log.get("id")

    return RecommendationResponse(
        user_id=user_id,
        recommendations=recommendations,
        candidate_count=len(candidates),
        filtered_count=filtered_count,
        generated_at=generated_at,
        model_versions=_model_versions(),
    )


def _passes_hard_constraints(candidate: CandidateResponse, item: Optional[dict], twin) -> bool:
    if not item:
        return False
    if str(item.get("verification_status") or candidate.verification_status) in {"rejected", "failed", "verification_failed"}:
        return False
    if item.get("locked") or str(item.get("status") or "").lower() in {"locked", "archived", "deleted"}:
        return False
    if candidate.prerequisite_status == "severe_gap":
        return False
    quality = candidate.quality_score if candidate.quality_score is not None else item.get("quality_score")
    if quality is not None and float(quality) < settings.CANDIDATE_MIN_QUALITY_SCORE:
        return False
    difficulty = candidate.difficulty if candidate.difficulty is not None else item.get("difficulty")
    if difficulty is not None:
        low = max(
            0.0,
            twin.recommended_difficulty_range.min_difficulty - settings.RANKER_SAFE_DIFFICULTY_MARGIN,
        )
        high = min(
            1.0,
            twin.recommended_difficulty_range.max_difficulty + settings.RANKER_SAFE_DIFFICULTY_MARGIN,
        )
        if not low <= float(difficulty) <= high:
            return False
    return True


def _component_scores(candidate: CandidateResponse, item: dict, twin) -> dict[str, float]:
    weakness_by_kc = {
        signal.knowledge_component_id: signal
        for signal in twin.weaknesses
    }
    at_risk_by_kc = {
        signal.knowledge_component_id: signal
        for signal in twin.at_risk_knowledge
    }
    weakness_match = max(
        [
            (1.0 - float(weakness_by_kc[kc_id].mastery_probability or 0.0)) * weakness_by_kc[kc_id].confidence
            for kc_id in candidate.knowledge_component_ids
            if kc_id in weakness_by_kc
        ]
        or [candidate.source_scores.get("weak_knowledge", 0.0)]
    )
    forgetting_need = max(
        [
            float(at_risk_by_kc[kc_id].forgetting_risk or 0.0)
            for kc_id in candidate.knowledge_component_ids
            if kc_id in at_risk_by_kc
        ]
        or [candidate.source_scores.get("forgetting_review", 0.0)]
    )
    return {
        "weakness_match": _clamp(weakness_match),
        "difficulty_fit": _difficulty_fit(candidate, twin),
        "prerequisite_readiness": _prerequisite_readiness(candidate),
        "forgetting_need": _clamp(forgetting_need),
        "goal_match": _clamp(candidate.source_scores.get("current_learning_goal", 0.0)),
        "interest_match": _clamp(candidate.source_scores.get("learner_interest", 0.0)),
        "cluster_match": _clamp(candidate.source_scores.get("cluster_match", 0.0)),
        "quality_score": _clamp(_candidate_quality(candidate, item)),
        "novelty_score": 0.0 if candidate.recently_seen else 1.0,
        "continuity_score": _clamp(candidate.source_scores.get("continue_current_path", 0.0)),
    }


def _difficulty_fit(candidate: CandidateResponse, twin) -> float:
    if candidate.difficulty is None:
        return 0.5
    low = twin.recommended_difficulty_range.min_difficulty
    high = twin.recommended_difficulty_range.max_difficulty
    difficulty = float(candidate.difficulty)
    if low <= difficulty <= high:
        return 1.0
    distance = min(abs(difficulty - low), abs(difficulty - high))
    return _clamp(1.0 - distance / max(0.01, settings.RANKER_SAFE_DIFFICULTY_MARGIN))


def _candidate_quality(candidate: CandidateResponse, item: dict) -> float:
    if candidate.quality_score is not None:
        return float(candidate.quality_score)
    item_quality = item.get("quality_score")
    if item_quality is not None:
        return float(item_quality)
    return settings.CANDIDATE_MIN_QUALITY_SCORE


def _prerequisite_readiness(candidate: CandidateResponse) -> float:
    if candidate.prerequisite_status == "satisfied":
        return 1.0
    if candidate.prerequisite_status == "minor_gap":
        return 0.6
    if candidate.prerequisite_status == "unknown":
        return 0.5
    return 0.0


def _weighted_score(component_scores: dict[str, float], weights: dict[str, float]) -> float:
    return _clamp(sum(component_scores[key] * weights[key] for key in COMPONENT_SCORE_KEYS))


def _rerank(ranked: list[dict], *, limit: int) -> list[dict]:
    remaining = list(ranked)
    selected: list[dict] = []
    while remaining and len(selected) < limit:
        pick_index = 0
        for index, entry in enumerate(remaining):
            if not _would_violate_diversity(selected, entry):
                pick_index = index
                break
        selected.append(remaining.pop(pick_index))
    return selected


def _would_violate_diversity(selected: list[dict], entry: dict) -> bool:
    if not selected:
        return False
    candidate = entry["candidate"]
    item = entry["item"]
    recent_kc_count = 0
    for previous in reversed(selected):
        if set(previous["candidate"].knowledge_component_ids) & set(candidate.knowledge_component_ids):
            recent_kc_count += 1
        else:
            break
    if recent_kc_count >= settings.RERANK_MAX_SAME_KNOWLEDGE_COMPONENT:
        return True

    cluster_id = item.get("question_cluster_id") or item.get("content_cluster_id")
    if cluster_id:
        recent_cluster_count = 0
        for previous in reversed(selected):
            previous_cluster_id = previous["item"].get("question_cluster_id") or previous["item"].get("content_cluster_id")
            if previous_cluster_id == cluster_id:
                recent_cluster_count += 1
            else:
                break
        if recent_cluster_count >= settings.RERANK_MAX_SAME_QUESTION_CLUSTER:
            return True

    item_type = item.get("item_type")
    if item_type:
        recent_type_count = 0
        for previous in reversed(selected):
            if previous["item"].get("item_type") == item_type:
                recent_type_count += 1
            else:
                break
        if recent_type_count >= settings.RERANK_MAX_SAME_ITEM_TYPE:
            return True
    return False


def _reason_codes(candidate: CandidateResponse, component_scores: dict[str, float]) -> list[ReasonCode]:
    reason_codes: list[ReasonCode] = []
    if component_scores["weakness_match"] > 0:
        reason_codes.append("IMPROVE_WEAK_SKILL")
    if component_scores["forgetting_need"] > 0:
        reason_codes.append("REVIEW_BEFORE_FORGETTING")
    if "prerequisite_gap" in candidate.source_types:
        reason_codes.append("FILL_PREREQUISITE_GAP")
    if component_scores["goal_match"] > 0:
        reason_codes.append("MATCH_LEARNING_GOAL")
    if component_scores["difficulty_fit"] >= 0.75:
        reason_codes.append("SUITABLE_DIFFICULTY")
    if component_scores["continuity_score"] > 0:
        reason_codes.append("CONTINUE_LEARNING_PATH")
    if "exploration" in candidate.source_types or "cluster_match" in candidate.source_types:
        reason_codes.append("EXPLORE_RELATED_TOPIC")
    return list(dict.fromkeys(reason_codes))


async def _log_recommendation(
    repo: PersonalizationMongoRepository,
    user_id: str,
    recommendation: RecommendationItemResponse,
    *,
    context: Optional[dict],
) -> dict:
    return await repo.create_recommendation_log(
        RecommendationLog(
            user_id=user_id,
            session_id=(context or {}).get("session_id"),
            item_id=recommendation.item_id,
            candidate_sources=list(recommendation.source_types),
            feature_snapshot={
                "rank_before_rerank": recommendation.rank_before_rerank,
                "rank_after_rerank": recommendation.rank_after_rerank,
                "difficulty": recommendation.difficulty,
                "quality_score": recommendation.quality_score,
                "prerequisite_status": recommendation.prerequisite_status,
                "context_keys": sorted((context or {}).keys()),
                "bandit_decision": (context or {}).get("bandit_decision"),
                "bandit_context": ((context or {}).get("bandit_context_by_item_id") or {}).get(recommendation.item_id, {}).get("context"),
                "bandit_action": ((context or {}).get("bandit_context_by_item_id") or {}).get(recommendation.item_id, {}).get("action"),
            },
            component_scores=recommendation.component_scores,
            final_score=recommendation.final_score,
            rank_position=recommendation.rank_after_rerank,
            reason_codes=list(recommendation.reason_codes),
            shown=False,
            clicked=False,
            completed=False,
            generated_at=recommendation.generated_at,
            learner_model_version=settings.LEARNER_MODEL_VERSION,
            ranking_model_version=settings.RANKING_MODEL_VERSION,
            bandit_policy_version=settings.BANDIT_POLICY_VERSION,
        )
    )
