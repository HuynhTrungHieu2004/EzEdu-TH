from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import settings
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.content_based_filtering_service import (
    build_learner_profile_vector,
    score_item_similarity,
)
from app.personalization.schemas.candidates import (
    CandidateGenerationResponse,
    CandidateResponse,
    CandidateSourceType,
    PrerequisiteStatus,
)
from app.personalization.services.digital_twin_service import get_current_user_digital_twin


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))


def _item_id(item: dict) -> str:
    return str(item.get("item_id") or item.get("id"))


def _item_kcs(item: dict) -> list[str]:
    return [str(value) for value in item.get("knowledge_component_ids", [])]


def _quality(item: dict) -> Optional[float]:
    value = item.get("quality_score")
    return None if value is None else float(value)


def _difficulty(item: dict) -> Optional[float]:
    value = item.get("difficulty")
    return None if value is None else float(value)


def _model_versions() -> dict[str, str]:
    return {
        "feature_schema_version": settings.FEATURE_SCHEMA_VERSION,
        "knowledge_model_version": settings.KNOWLEDGE_MODEL_VERSION,
        "learner_model_version": settings.LEARNER_MODEL_VERSION,
        "clustering_model_version": settings.CLUSTERING_MODEL_VERSION,
        "ranking_model_version": settings.RANKING_MODEL_VERSION,
        "bandit_policy_version": settings.BANDIT_POLICY_VERSION,
    }


class _Accumulator:
    def __init__(self, generated_at: datetime):
        self.generated_at = generated_at
        self.items: dict[str, dict] = {}

    def add(self, item: dict, source_type: CandidateSourceType, score: float) -> None:
        if not item or not source_type:
            return
        item_id = _item_id(item)
        if not item_id:
            return
        entry = self.items.setdefault(
            item_id,
            {
                "item": item,
                "source_types": [],
                "source_scores": {},
            },
        )
        if source_type not in entry["source_types"]:
            entry["source_types"].append(source_type)
        entry["source_scores"][source_type] = max(
            float(entry["source_scores"].get(source_type, 0.0)),
            _clamp(score),
        )


async def generate_candidates_for_user(
    user_id: str,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
    total_limit: Optional[int] = None,
    per_source_limit: Optional[int] = None,
) -> CandidateGenerationResponse:
    repo = repository or PersonalizationMongoRepository()
    generated_at = _now()
    total_limit = total_limit or settings.CANDIDATE_TOTAL_LIMIT
    per_source_limit = per_source_limit or settings.CANDIDATE_PER_SOURCE_LIMIT

    twin = await get_current_user_digital_twin(user_id, repository=repo, use_cache=False)
    all_items = await repo.list_accessible_learning_items_for_user(user_id, limit=1000)
    recent_events = await repo.list_learning_events_for_user(user_id, limit=100)

    # Hồ sơ nội dung của người học, dựng từ chính nội dung họ đã tương tác.
    # Rỗng khi chưa đủ lịch sử — nguồn `learner_interest` tự lùi về cách cũ.
    learner_profile_vector = build_learner_profile_vector(
        recent_events, {str(item.get("id") or item.get("_id")): item for item in all_items}
    )
    states = await repo.list_knowledge_states_for_user(user_id, limit=500)
    components = await repo.list_knowledge_components_for_user(user_id, limit=500)

    pool_by_id = {_item_id(item): item for item in all_items if _item_id(item)}
    if not pool_by_id:
        return CandidateGenerationResponse(
            user_id=user_id,
            candidates=[],
            source_counts={},
            fallback_sources=[],
            generated_at=generated_at,
            model_versions=_model_versions(),
        )

    component_by_id = {str(component["id"]): component for component in components}
    state_by_kc = {str(state["knowledge_component_id"]): state for state in states}
    recent_item_ids = _recent_item_ids(recent_events, generated_at)
    recent_error_events = [
        event
        for event in recent_events
        if event.get("event_type") == "question_answered" and event.get("is_correct") is False
    ]

    prerequisite_edges = await repo.list_prerequisite_edges_for_user(
        user_id,
        knowledge_component_ids=sorted({kc for item in pool_by_id.values() for kc in _item_kcs(item)}),
        limit=1000,
    )
    prereq_by_target: dict[str, list[str]] = {}
    for edge in prerequisite_edges:
        prereq_by_target.setdefault(str(edge.get("target_knowledge_component_id")), []).append(
            str(edge.get("source_knowledge_component_id"))
        )

    accumulator = _Accumulator(generated_at)
    fallback_sources: list[CandidateSourceType] = []

    await _collect_weak_knowledge(accumulator, repo, user_id, twin, component_by_id, per_source_limit)
    await _collect_prerequisite_gaps(accumulator, repo, user_id, twin, per_source_limit)
    await _collect_forgetting_review(accumulator, repo, user_id, twin, per_source_limit)
    await _collect_current_learning_goal(accumulator, repo, user_id, twin, component_by_id, per_source_limit)
    _collect_similar_to_recent_error(accumulator, pool_by_id, recent_error_events, per_source_limit)
    _collect_appropriate_difficulty(accumulator, pool_by_id, twin, per_source_limit)
    _collect_learner_interest(
        accumulator, pool_by_id, twin, component_by_id, per_source_limit, learner_profile_vector
    )
    _collect_cluster_match(accumulator, pool_by_id, recent_events, per_source_limit)
    _collect_continue_current_path(accumulator, pool_by_id, recent_events, per_source_limit)

    if len(accumulator.items) < total_limit:
        fallback_sources.append("appropriate_difficulty")
        _collect_appropriate_difficulty(accumulator, pool_by_id, twin, total_limit)
    if len(accumulator.items) < total_limit:
        fallback_sources.append("exploration")
        _collect_exploration(accumulator, pool_by_id, twin, max(1, int(total_limit * settings.CANDIDATE_EXPLORATION_RATIO)))

    candidates = _finalize_candidates(
        accumulator,
        recent_item_ids=recent_item_ids,
        prereq_by_target=prereq_by_target,
        state_by_kc=state_by_kc,
        total_limit=total_limit,
    )
    source_counts: dict[CandidateSourceType, int] = {}
    for candidate in candidates:
        for source_type in candidate.source_types:
            source_counts[source_type] = source_counts.get(source_type, 0) + 1

    return CandidateGenerationResponse(
        user_id=user_id,
        candidates=candidates,
        source_counts=source_counts,
        fallback_sources=list(dict.fromkeys(fallback_sources)),
        generated_at=generated_at,
        model_versions=_model_versions(),
    )


def _recent_item_ids(events: list[dict], generated_at: datetime) -> set[str]:
    if settings.CANDIDATE_RECENT_WINDOW_HOURS <= 0:
        return set()
    threshold = generated_at - timedelta(hours=settings.CANDIDATE_RECENT_WINDOW_HOURS)
    return {
        str(event["item_id"])
        for event in events
        if event.get("item_id") and (_as_aware(event.get("occurred_at")) or generated_at) >= threshold
    }


def _matches_goal(component: dict, goals: list[str], preferred_subjects: list[str]) -> bool:
    haystack = " ".join(
        str(component.get(field) or "")
        for field in ("name", "normalized_name", "description", "subject", "topic")
    ).lower()
    terms = [term.lower() for term in [*goals, *preferred_subjects] if term]
    return bool(terms and any(term in haystack for term in terms))


async def _collect_weak_knowledge(
    accumulator: _Accumulator,
    repo: PersonalizationMongoRepository,
    user_id: str,
    twin,
    component_by_id: dict[str, dict],
    per_source_limit: int,
) -> None:
    weak_signals = [
        signal
        for signal in twin.weaknesses
        if signal.attempt_count >= settings.DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED
        and signal.confidence >= 0.2
    ][:per_source_limit]
    for signal in weak_signals:
        items = await repo.list_accessible_learning_items_by_knowledge_components(
            user_id,
            [signal.knowledge_component_id],
            limit=per_source_limit,
        )
        component = component_by_id.get(signal.knowledge_component_id, {})
        goal_boost = 0.15 if _matches_goal(
            component,
            twin.learning_goals,
            twin.content_preferences.preferred_subjects,
        ) else 0.0
        for item in items:
            mastery_gap = 1.0 - float(signal.mastery_probability or 0.0)
            accumulator.add(item, "weak_knowledge", mastery_gap * signal.confidence + goal_boost)


async def _collect_prerequisite_gaps(
    accumulator: _Accumulator,
    repo: PersonalizationMongoRepository,
    user_id: str,
    twin,
    per_source_limit: int,
) -> None:
    for signal in twin.prerequisite_gaps[:per_source_limit]:
        items = await repo.list_accessible_learning_items_by_knowledge_components(
            user_id,
            [signal.knowledge_component_id],
            limit=per_source_limit,
        )
        for item in items:
            accumulator.add(item, "prerequisite_gap", max(0.35, signal.confidence))


async def _collect_forgetting_review(
    accumulator: _Accumulator,
    repo: PersonalizationMongoRepository,
    user_id: str,
    twin,
    per_source_limit: int,
) -> None:
    eligible = [
        signal
        for signal in twin.at_risk_knowledge
        if (signal.mastery_probability or 0.0) >= settings.CANDIDATE_FORGETTING_MIN_MASTERY
        and signal.attempt_count > 0
    ][:per_source_limit]
    for signal in eligible:
        items = await repo.list_accessible_learning_items_by_knowledge_components(
            user_id,
            [signal.knowledge_component_id],
            limit=per_source_limit,
        )
        for item in items:
            accumulator.add(item, "forgetting_review", signal.forgetting_risk or 0.0)


async def _collect_current_learning_goal(
    accumulator: _Accumulator,
    repo: PersonalizationMongoRepository,
    user_id: str,
    twin,
    component_by_id: dict[str, dict],
    per_source_limit: int,
) -> None:
    matched_kcs = [
        component_id
        for component_id, component in component_by_id.items()
        if _matches_goal(component, twin.learning_goals, twin.content_preferences.preferred_subjects)
    ][: per_source_limit * 2]
    if not matched_kcs:
        return
    items = await repo.list_accessible_learning_items_by_knowledge_components(
        user_id,
        matched_kcs,
        limit=per_source_limit,
    )
    for item in items:
        accumulator.add(item, "current_learning_goal", 0.55 + (_quality(item) or 0.0) * 0.25)


def _collect_similar_to_recent_error(
    accumulator: _Accumulator,
    pool_by_id: dict[str, dict],
    recent_error_events: list[dict],
    per_source_limit: int,
) -> None:
    if not recent_error_events:
        return
    error_item_ids = {str(event["item_id"]) for event in recent_error_events if event.get("item_id")}
    error_kcs = {str(kc) for event in recent_error_events for kc in event.get("knowledge_component_ids", [])}
    error_clusters = {
        pool_by_id[item_id].get("content_cluster_id")
        for item_id in error_item_ids
        if item_id in pool_by_id and pool_by_id[item_id].get("content_cluster_id")
    }
    added = 0
    for item_id, item in pool_by_id.items():
        if item_id in error_item_ids:
            continue
        overlap = len(error_kcs & set(_item_kcs(item)))
        cluster_match = item.get("content_cluster_id") in error_clusters if error_clusters else False
        if overlap or cluster_match:
            accumulator.add(item, "similar_to_recent_error", min(1.0, 0.45 + overlap * 0.25 + (0.2 if cluster_match else 0.0)))
            added += 1
        if added >= per_source_limit:
            break


def _collect_appropriate_difficulty(
    accumulator: _Accumulator,
    pool_by_id: dict[str, dict],
    twin,
    per_source_limit: int,
) -> None:
    low = max(0.0, twin.recommended_difficulty_range.min_difficulty - settings.CANDIDATE_APPROPRIATE_DIFFICULTY_MARGIN)
    high = min(1.0, twin.recommended_difficulty_range.max_difficulty + settings.CANDIDATE_APPROPRIATE_DIFFICULTY_MARGIN)
    matched = [
        item
        for item in pool_by_id.values()
        if _difficulty(item) is not None and low <= _difficulty(item) <= high
    ]
    matched.sort(key=lambda item: (_quality(item) if _quality(item) is not None else 0.5), reverse=True)
    for item in matched[:per_source_limit]:
        difficulty = _difficulty(item) or 0.5
        center = (low + high) / 2
        width = max(0.01, high - low)
        accumulator.add(item, "appropriate_difficulty", 1.0 - min(1.0, abs(difficulty - center) / width))


def _collect_learner_interest(
    accumulator: _Accumulator,
    pool_by_id: dict[str, dict],
    twin,
    component_by_id: dict[str, dict],
    per_source_limit: int,
    profile_vector: list[float] | None = None,
) -> None:
    """Nguồn ứng viên theo sở thích nội dung.

    Có hồ sơ nội dung (dựng từ lịch sử tương tác) thì chấm bằng độ tương đồng
    cosine — mỗi item một điểm khác nhau, đúng nghĩa lọc theo nội dung. Chưa đủ
    lịch sử để dựng hồ sơ thì lùi về cách khớp nhãn cũ, vì lúc đó không có gì
    để so nội dung với nhau.
    """
    preferred_types = set(twin.content_preferences.preferred_content_types)

    scored: list[tuple[float, dict]] = []
    for item in pool_by_id.values():
        type_match = not preferred_types or item.get("item_type") in preferred_types
        subject_match = any(
            _matches_goal(component_by_id.get(kc_id, {}), [], twin.content_preferences.preferred_subjects)
            for kc_id in _item_kcs(item)
        )
        if not (type_match and subject_match):
            continue
        if profile_vector:
            # Trọng số 0.75 cho độ tương đồng nội dung, 0.25 cho chất lượng
            # item — nội dung hợp gu là tiêu chí chính, chất lượng là phụ.
            similarity = score_item_similarity(profile_vector, item)
            score = 0.75 * similarity + 0.25 * (_quality(item) or 0.0)
        else:
            score = 0.5 + (_quality(item) or 0.0) * 0.25
        scored.append((score, item))

    # Chấm điểm hết rồi mới cắt. Cắt trong lúc duyệt thì item được chọn là item
    # gặp trước chứ không phải item hợp gu nhất — nghĩa là tính xong độ tương
    # đồng CBF rồi vứt đi, đúng phần việc mà nguồn này sinh ra để làm.
    scored.sort(key=lambda pair: pair[0], reverse=True)
    for score, item in scored[:per_source_limit]:
        accumulator.add(item, "learner_interest", score)


def _collect_cluster_match(
    accumulator: _Accumulator,
    pool_by_id: dict[str, dict],
    recent_events: list[dict],
    per_source_limit: int,
) -> None:
    recent_clusters = {
        pool_by_id[str(event["item_id"])].get("content_cluster_id")
        for event in recent_events
        if event.get("item_id") and str(event["item_id"]) in pool_by_id
    }
    recent_clusters.discard(None)
    if not recent_clusters:
        return
    added = 0
    for item in pool_by_id.values():
        if item.get("content_cluster_id") in recent_clusters:
            accumulator.add(item, "cluster_match", 0.55 + (_quality(item) or 0.0) * 0.2)
            added += 1
        if added >= per_source_limit:
            break


def _collect_continue_current_path(
    accumulator: _Accumulator,
    pool_by_id: dict[str, dict],
    recent_events: list[dict],
    per_source_limit: int,
) -> None:
    recent_document_ids = [
        event.get("document_id")
        for event in recent_events
        if event.get("document_id")
    ]
    if not recent_document_ids:
        return
    current_document_id = recent_document_ids[0]
    recent_item_ids = {str(event["item_id"]) for event in recent_events if event.get("item_id")}
    matched = [
        item
        for item in pool_by_id.values()
        if item.get("document_id") == current_document_id and _item_id(item) not in recent_item_ids
    ]
    matched.sort(key=lambda item: str(item.get("created_at") or item.get("updated_at") or ""))
    for item in matched[:per_source_limit]:
        accumulator.add(item, "continue_current_path", 0.45 + (_quality(item) or 0.0) * 0.2)


def _collect_exploration(
    accumulator: _Accumulator,
    pool_by_id: dict[str, dict],
    twin,
    limit: int,
) -> None:
    low = max(0.0, twin.recommended_difficulty_range.min_difficulty - settings.CANDIDATE_APPROPRIATE_DIFFICULTY_MARGIN)
    high = min(1.0, twin.recommended_difficulty_range.max_difficulty + settings.CANDIDATE_APPROPRIATE_DIFFICULTY_MARGIN)
    matched = [
        item
        for item in pool_by_id.values()
        if (_quality(item) is None or _quality(item) >= settings.CANDIDATE_MIN_QUALITY_SCORE)
        and (_difficulty(item) is None or low <= _difficulty(item) <= high)
    ]
    matched.sort(
        key=lambda item: (
            _quality(item) if _quality(item) is not None else settings.CANDIDATE_MIN_QUALITY_SCORE,
            str(item.get("updated_at") or ""),
        ),
        reverse=True,
    )
    for item in matched[:limit]:
        accumulator.add(item, "exploration", 0.25 + (_quality(item) or 0.0) * 0.2)


def _prerequisite_status(item: dict, prereq_by_target: dict[str, list[str]], state_by_kc: dict[str, dict]) -> PrerequisiteStatus:
    required_prereqs = {
        prereq_id
        for kc_id in _item_kcs(item)
        for prereq_id in prereq_by_target.get(kc_id, [])
    }
    if not required_prereqs:
        return "satisfied"
    severe = False
    minor = False
    for prereq_id in required_prereqs:
        state = state_by_kc.get(prereq_id)
        if not state or int(state.get("attempt_count", 0)) < settings.DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED:
            severe = True
            continue
        mastery = state.get("mastery_probability")
        uncertainty = state.get("uncertainty")
        if mastery is None or float(mastery) <= settings.DIGITAL_TWIN_WEAK_MASTERY_THRESHOLD:
            severe = True
        elif uncertainty is not None and float(uncertainty) >= settings.DIGITAL_TWIN_UNCERTAINTY_THRESHOLD:
            minor = True
        elif float(mastery) < settings.DIGITAL_TWIN_STRENGTH_MASTERY_THRESHOLD:
            minor = True
    if severe:
        return "severe_gap"
    if minor:
        return "minor_gap"
    return "satisfied"


def _verification_ok(item: dict) -> bool:
    status = str(item.get("verification_status") or "unverified")
    return status not in {"rejected", "failed", "verification_failed"}


def _finalize_candidates(
    accumulator: _Accumulator,
    *,
    recent_item_ids: set[str],
    prereq_by_target: dict[str, list[str]],
    state_by_kc: dict[str, dict],
    total_limit: int,
) -> list[CandidateResponse]:
    finalized: list[CandidateResponse] = []
    for item_id, entry in accumulator.items.items():
        item = entry["item"]
        source_types = list(entry["source_types"])
        if not source_types:
            continue
        if not _verification_ok(item):
            continue
        quality = _quality(item)
        if quality is not None and quality < settings.CANDIDATE_MIN_QUALITY_SCORE:
            continue
        recently_seen = item_id in recent_item_ids
        if recently_seen and "forgetting_review" not in source_types:
            continue
        prereq_status = _prerequisite_status(item, prereq_by_target, state_by_kc)
        if prereq_status == "severe_gap" and "prerequisite_gap" not in source_types:
            continue
        finalized.append(
            CandidateResponse(
                item_id=item_id,
                source_types=source_types,
                source_scores=entry["source_scores"],
                knowledge_component_ids=_item_kcs(item),
                difficulty=_difficulty(item),
                quality_score=quality,
                verification_status=str(item.get("verification_status") or "unverified"),
                prerequisite_status=prereq_status,
                recently_seen=recently_seen,
                generated_at=accumulator.generated_at,
            )
        )

    finalized.sort(
        key=lambda candidate: (
            max(candidate.source_scores.values()) if candidate.source_scores else 0.0,
            len(candidate.source_types),
            candidate.quality_score if candidate.quality_score is not None else settings.CANDIDATE_MIN_QUALITY_SCORE,
        ),
        reverse=True,
    )
    return finalized[:total_limit]
