from __future__ import annotations

from datetime import datetime, timezone
import math
from typing import Optional

from app.core.config import settings
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import ClusterType
from app.personalization.schemas.digital_twin import (
    BehaviorSummaryResponse,
    ClusterMembershipResponse,
    ContentPreferencesResponse,
    DataQualityResponse,
    DigitalTwinResponse,
    KnowledgeSignalResponse,
    LearningGoalsUpdateRequest,
    RecentProgressResponse,
    RecommendedDifficultyRangeResponse,
)
from app.personalization.schemas.onboarding import (
    StudentOnboardingRequest,
    StudentOnboardingResponse,
    VN_EXAM_COMBINATIONS,
    VN_SUBJECTS,
)


_DIGITAL_TWIN_CACHE: dict[str, tuple[datetime, DigitalTwinResponse]] = {}


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


def _cache_key(user_id: str) -> str:
    return str(user_id)


def invalidate_digital_twin_cache(user_id: str) -> None:
    _DIGITAL_TWIN_CACHE.pop(_cache_key(user_id), None)


def _model_versions() -> dict[str, str]:
    return {
        "feature_schema_version": settings.FEATURE_SCHEMA_VERSION,
        "knowledge_model_version": settings.KNOWLEDGE_MODEL_VERSION,
        "learner_model_version": settings.LEARNER_MODEL_VERSION,
        "clustering_model_version": settings.CLUSTERING_MODEL_VERSION,
        "ranking_model_version": settings.RANKING_MODEL_VERSION,
        "bandit_policy_version": settings.BANDIT_POLICY_VERSION,
    }


def _forgetting_risk(state: dict, generated_at: datetime) -> float:
    mastery = state.get("mastery_probability")
    mastery_value = 0.0 if mastery is None else float(mastery)
    attempts = int(state.get("attempt_count", 0))
    recent_accuracy = state.get("recent_accuracy")
    uncertainty = state.get("uncertainty")
    last_practiced_at = _as_aware(state.get("last_practiced_at"))

    if not last_practiced_at:
        return _clamp(0.45 + (1.0 - mastery_value) * 0.35)

    elapsed_days = max(0.0, (generated_at - last_practiced_at).total_seconds() / 86400)
    time_factor = _clamp(elapsed_days / settings.DIGITAL_TWIN_FORGETTING_RISK_DAYS)
    mastery_factor = 1.0 - mastery_value
    practice_stability = 1.0 / max(1.0, math.sqrt(max(1, attempts)))
    performance_instability = (
        1.0 - float(recent_accuracy)
        if recent_accuracy is not None
        else float(uncertainty or 0.5)
    )
    return _clamp(
        0.40 * time_factor
        + 0.25 * mastery_factor
        + 0.20 * practice_stability
        + 0.15 * performance_instability
    )


def _signal_from_state(state: dict, generated_at: datetime) -> KnowledgeSignalResponse:
    attempts = int(state.get("attempt_count", 0))
    mastery = state.get("mastery_probability")
    mastery_value = None if mastery is None else float(mastery)
    uncertainty = state.get("uncertainty")
    uncertainty_value = float(uncertainty) if uncertainty is not None else 1.0
    risk = _forgetting_risk(state, generated_at)
    reason_codes: list[str] = []

    if attempts <= 0 or mastery_value is None:
        status = "unassessed"
        reason_codes.append("no_assessment")
        confidence = 0.0
    elif attempts < settings.DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED:
        status = "uncertain"
        reason_codes.append("insufficient_attempts")
        confidence = _clamp(attempts / settings.DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED * 0.5)
    elif uncertainty_value >= settings.DIGITAL_TWIN_UNCERTAINTY_THRESHOLD:
        status = "uncertain"
        reason_codes.append("high_uncertainty")
        confidence = _clamp(1.0 - uncertainty_value)
    elif (
        risk >= settings.DIGITAL_TWIN_FORGETTING_RISK_THRESHOLD
        and mastery_value >= settings.DIGITAL_TWIN_WEAK_MASTERY_THRESHOLD
    ):
        status = "at_risk_of_forgetting"
        reason_codes.append("stale_practice")
        confidence = _clamp((1.0 - uncertainty_value) * min(1.0, attempts / 8))
    elif mastery_value >= settings.DIGITAL_TWIN_STRENGTH_MASTERY_THRESHOLD:
        status = "mastered"
        reason_codes.append("high_mastery")
        confidence = _clamp((1.0 - uncertainty_value) * min(1.0, attempts / 8))
    elif mastery_value <= settings.DIGITAL_TWIN_WEAK_MASTERY_THRESHOLD:
        status = "weak"
        reason_codes.append("low_mastery")
        confidence = _clamp((1.0 - uncertainty_value) * min(1.0, attempts / 8))
    else:
        status = "uncertain"
        reason_codes.append("mixed_signals")
        confidence = _clamp((1.0 - uncertainty_value) * min(1.0, attempts / 8))

    if state.get("recent_accuracy") is not None and state["recent_accuracy"] < 0.5:
        reason_codes.append("low_recent_accuracy")
    if state.get("hint_rate") is not None and state["hint_rate"] > 0.5:
        reason_codes.append("high_hint_rate")
    if risk >= settings.DIGITAL_TWIN_FORGETTING_RISK_THRESHOLD:
        reason_codes.append("forgetting_risk")

    return KnowledgeSignalResponse(
        knowledge_component_id=str(state["knowledge_component_id"]),
        status=status,
        mastery_probability=mastery_value,
        uncertainty=uncertainty_value,
        attempt_count=attempts,
        recent_accuracy=state.get("recent_accuracy"),
        average_response_time_ms=state.get("average_response_time_ms"),
        hint_rate=state.get("hint_rate"),
        forgetting_risk=risk,
        confidence=confidence,
        reason_codes=sorted(set(reason_codes)),
        reason=_reason_text(status, reason_codes),
    )


def _unassessed_signal(component_id: str) -> KnowledgeSignalResponse:
    return KnowledgeSignalResponse(
        knowledge_component_id=component_id,
        status="unassessed",
        mastery_probability=None,
        uncertainty=1.0,
        attempt_count=0,
        forgetting_risk=None,
        confidence=0.0,
        reason_codes=["no_assessment"],
        reason="No learner evidence has been recorded for this knowledge component.",
    )


def _reason_text(status: str, reason_codes: list[str]) -> str:
    if status == "mastered":
        return "Mastery is high enough with sufficient learner evidence."
    if status == "weak":
        return "Mastery is low with enough attempts to treat it as an actionable weakness."
    if status == "at_risk_of_forgetting":
        return "Practice is stale enough that the heuristic forgetting risk is elevated."
    if "insufficient_attempts" in reason_codes:
        return "There is too little evidence to label this as a strength or weakness."
    if "high_uncertainty" in reason_codes:
        return "The learner model uncertainty is still high."
    return "Signals are mixed or incomplete."


def _behavior_summary(events: list[dict]) -> BehaviorSummaryResponse:
    answered = [event for event in events if event.get("event_type") == "question_answered"]
    response_times = [event.get("response_time_ms") for event in answered if event.get("response_time_ms") is not None]
    correct = [event for event in answered if event.get("is_correct") is not None]
    sessions = {event.get("session_id") for event in events if event.get("session_id")}
    event_count = len(events)
    answered_count = len(answered)
    completed_count = sum(1 for event in events if event.get("completed"))

    return BehaviorSummaryResponse(
        recent_event_count=event_count,
        question_answered_count=answered_count,
        recent_accuracy=(
            sum(1 for event in correct if event.get("is_correct")) / len(correct)
            if correct
            else None
        ),
        average_response_time_ms=(sum(response_times) / len(response_times) if response_times else None),
        hint_rate=(
            _clamp(sum(int(event.get("hint_count", 0)) for event in answered) / answered_count)
            if answered_count
            else None
        ),
        answer_change_rate=(
            sum(int(event.get("answer_change_count", 0)) for event in answered) / answered_count
            if answered_count
            else None
        ),
        skip_rate=(sum(1 for event in events if event.get("skipped")) / event_count if event_count else None),
        completion_rate=(completed_count / event_count if event_count else None),
        active_session_count=len(sessions),
    )


def _recent_progress(profile: Optional[dict], events: list[dict], behavior: BehaviorSummaryResponse) -> RecentProgressResponse:
    last_event_at = max((_as_aware(event.get("occurred_at")) for event in events if event.get("occurred_at")), default=None)
    profile_last_active = _as_aware(profile.get("last_active_at")) if profile else None
    last_active_at = max([value for value in [last_event_at, profile_last_active] if value], default=None)
    return RecentProgressResponse(
        recent_event_count=behavior.recent_event_count,
        question_answered_count=behavior.question_answered_count,
        recent_accuracy=behavior.recent_accuracy,
        completed_count=sum(1 for event in events if event.get("completed")),
        last_active_at=last_active_at,
    )


def _recommended_difficulty_range(theta: Optional[float]) -> RecommendedDifficultyRangeResponse:
    theta_value = 0.0 if theta is None else float(theta)
    min_probability = settings.DIGITAL_TWIN_TARGET_PROBABILITY_MIN
    max_probability = settings.DIGITAL_TWIN_TARGET_PROBABILITY_MAX

    def beta_for_probability(probability: float) -> float:
        probability = _clamp(probability, 0.001, 0.999)
        return theta_value - math.log(probability / (1.0 - probability))

    beta_easy = beta_for_probability(max_probability)
    beta_hard = beta_for_probability(min_probability)

    def beta_to_difficulty(beta: float) -> float:
        return _clamp((beta - settings.IRT_MIN_BETA) / (settings.IRT_MAX_BETA - settings.IRT_MIN_BETA))

    return RecommendedDifficultyRangeResponse(
        min_difficulty=beta_to_difficulty(beta_easy),
        max_difficulty=beta_to_difficulty(beta_hard),
        target_probability_min=min_probability,
        target_probability_max=max_probability,
        basis="rasch_1pl_target_probability",
    )


async def _cluster_memberships(profile: Optional[dict], repo: PersonalizationMongoRepository) -> tuple[list[ClusterMembershipResponse], dict[str, Optional[float]]]:
    if not profile:
        return [], {}

    cluster_fields: list[tuple[ClusterType, str]] = [
        ("learner_ability", "ability_cluster_id"),
        ("learner_behavior", "behavior_cluster_id"),
        ("learner_interest", "interest_cluster_id"),
    ]
    profile_confidence = float(profile.get("profile_confidence") or 0.0)
    provisional = profile.get("cold_start_status") != "ready"
    memberships: list[ClusterMembershipResponse] = []
    distances = profile.get("cluster_distances") if isinstance(profile.get("cluster_distances"), dict) else {}

    for cluster_type, field_name in cluster_fields:
        cluster_id = profile.get(field_name)
        active_model = await repo.get_active_cluster_model(cluster_type)
        if cluster_id is None and not active_model:
            continue
        memberships.append(
            ClusterMembershipResponse(
                cluster_type=cluster_type,
                cluster_id=str(cluster_id) if cluster_id is not None else None,
                confidence=profile_confidence if cluster_id is not None else 0.0,
                model_version=(active_model or {}).get("version"),
                provisional=provisional,
                outlier=bool((distances or {}).get(f"{cluster_type}_outlier", False)),
            )
        )

    return memberships, {str(key): value for key, value in (distances or {}).items() if isinstance(value, (int, float)) or value is None}


def _data_quality(profile: Optional[dict], states: list[dict], components: list[dict], events: list[dict], signals: list[KnowledgeSignalResponse]) -> DataQualityResponse:
    assessed_count = sum(1 for signal in signals if signal.attempt_count >= settings.DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED)
    unassessed_count = sum(1 for signal in signals if signal.status == "unassessed")
    event_count = int((profile or {}).get("total_learning_events") or len(events))
    profile_confidence = float((profile or {}).get("profile_confidence") or 0.0)
    event_factor = min(1.0, event_count / 20)
    state_factor = min(1.0, assessed_count / 10)
    confidence = _clamp((profile_confidence + event_factor + state_factor) / 3)
    issues: list[str] = []
    if event_count == 0:
        issues.append("no_learning_events")
    if not states:
        issues.append("no_learner_knowledge_states")
    if components and unassessed_count:
        issues.append("some_knowledge_unassessed")
    if profile and profile.get("cold_start_status") != "ready":
        issues.append("cold_start")
    if not profile:
        issues.append("missing_learner_profile")

    return DataQualityResponse(
        event_count=event_count,
        assessed_knowledge_count=assessed_count,
        unassessed_knowledge_count=unassessed_count,
        recent_event_count=len(events),
        confidence=confidence,
        issues=issues,
    )


async def get_current_user_digital_twin(
    user_id: str,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
    use_cache: bool = True,
) -> DigitalTwinResponse:
    repo = repository or PersonalizationMongoRepository()
    generated_at = _now()
    key = _cache_key(user_id)
    ttl = settings.DIGITAL_TWIN_CACHE_TTL_SECONDS
    if use_cache and ttl > 0 and key in _DIGITAL_TWIN_CACHE:
        cached_at, cached = _DIGITAL_TWIN_CACHE[key]
        if (generated_at - cached_at).total_seconds() <= ttl:
            return cached

    profile = await repo.get_learner_profile(user_id)
    states = await repo.list_knowledge_states_for_user(user_id, limit=500)
    components = await repo.list_knowledge_components_for_user(user_id, limit=500)
    events = await repo.list_learning_events_for_user(user_id, limit=100)

    signals_by_kc = {
        str(state["knowledge_component_id"]): _signal_from_state(state, generated_at)
        for state in states
    }
    for component in components:
        component_id = str(component["id"])
        signals_by_kc.setdefault(component_id, _unassessed_signal(component_id))
    signals = list(signals_by_kc.values())

    strengths = [signal for signal in signals if signal.status == "mastered"]
    weaknesses = [signal for signal in signals if signal.status == "weak"]
    at_risk = [signal for signal in signals if signal.status == "at_risk_of_forgetting"]
    prerequisite_gaps = await _prerequisite_gaps(repo, user_id, signals_by_kc)
    behavior = _behavior_summary(events)
    progress = _recent_progress(profile, events, behavior)
    memberships, cluster_distances = await _cluster_memberships(profile, repo)
    data_quality = _data_quality(profile, states, components, events, signals)

    twin = DigitalTwinResponse(
        user_id=user_id,
        current_level=(profile or {}).get("current_level"),
        grade_level=(profile or {}).get("grade_level"),
        strong_subjects=list((profile or {}).get("strong_subjects") or []),
        weak_subjects=list((profile or {}).get("weak_subjects") or []),
        target_exam_combinations=list((profile or {}).get("target_exam_combinations") or []),
        onboarding_completed=bool((profile or {}).get("onboarding_completed")),
        global_ability=(profile or {}).get("global_ability"),
        profile_confidence=float((profile or {}).get("profile_confidence") or 0.0),
        strengths=sorted(strengths, key=lambda item: item.confidence, reverse=True),
        weaknesses=sorted(weaknesses, key=lambda item: item.confidence, reverse=True),
        prerequisite_gaps=prerequisite_gaps,
        at_risk_knowledge=sorted(at_risk, key=lambda item: item.forgetting_risk or 0.0, reverse=True),
        learning_goals=list((profile or {}).get("learning_goals") or []),
        content_preferences=ContentPreferencesResponse(
            preferred_subjects=list((profile or {}).get("preferred_subjects") or []),
            preferred_content_types=list((profile or {}).get("preferred_content_types") or []),
            preferred_explanation_style=(profile or {}).get("preferred_explanation_style"),
            preferred_session_minutes=(profile or {}).get("preferred_session_minutes"),
        ),
        behavior_summary=behavior,
        cluster_memberships=memberships,
        cluster_distances=cluster_distances,
        recent_progress=progress,
        recommended_difficulty_range=_recommended_difficulty_range((profile or {}).get("global_ability")),
        data_quality=data_quality,
        model_versions=_model_versions(),
        generated_at=generated_at,
    )

    if use_cache and ttl > 0:
        _DIGITAL_TWIN_CACHE[key] = (generated_at, twin)
    return twin


async def update_current_user_learning_preferences(
    user_id: str,
    payload: LearningGoalsUpdateRequest,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> DigitalTwinResponse:
    repo = repository or PersonalizationMongoRepository()
    now = _now()
    updates = {
        "learning_goals": payload.learning_goals,
        "preferred_subjects": payload.preferred_subjects,
        "preferred_content_types": payload.preferred_content_types,
        "preferred_explanation_style": payload.preferred_explanation_style,
        "preferred_session_minutes": payload.preferred_session_minutes,
        "updated_at": now,
        "model_version": settings.LEARNER_MODEL_VERSION,
    }
    set_on_insert = {
        "user_id": user_id,
        "profile_confidence": 0.0,
        "total_learning_events": 0,
        "cold_start_status": "new",
    }
    await repo.update_learner_preferences(user_id, updates, set_on_insert)
    invalidate_digital_twin_cache(user_id)
    return await get_current_user_digital_twin(user_id, repository=repo, use_cache=False)


def _subject_labels(subject_ids: list[str]) -> list[str]:
    return [VN_SUBJECTS[subject_id] for subject_id in subject_ids if subject_id in VN_SUBJECTS]


def _subjects_from_combinations(combination_codes: list[str]) -> list[str]:
    subjects: list[str] = []
    seen: set[str] = set()
    for code in combination_codes:
        for subject in VN_EXAM_COMBINATIONS.get(code, ()):
            key = subject.casefold()
            if key in seen:
                continue
            seen.add(key)
            subjects.append(subject)
    return subjects


def _combination_goal_label(code: str) -> str:
    return f"tổ hợp mới {code[1:]}" if code.startswith("N") else f"tổ hợp {code}"


def _student_onboarding_response(user_id: str, profile: dict | None) -> StudentOnboardingResponse | None:
    if not profile or not profile.get("onboarding_completed"):
        return None
    return StudentOnboardingResponse(
        user_id=user_id,
        grade_level=profile.get("grade_level"),
        strong_subjects=list(profile.get("strong_subjects") or []),
        weak_subjects=list(profile.get("weak_subjects") or []),
        target_exam_combinations=list(profile.get("target_exam_combinations") or []),
        onboarding_completed=bool(profile.get("onboarding_completed")),
        onboarding_completed_at=profile.get("onboarding_completed_at"),
        updated_at=profile.get("updated_at"),
    )


async def get_current_user_student_onboarding(
    user_id: str,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> StudentOnboardingResponse | None:
    repo = repository or PersonalizationMongoRepository()
    profile = await repo.get_learner_profile(user_id)
    return _student_onboarding_response(user_id, profile)


async def update_current_user_student_onboarding(
    user_id: str,
    payload: StudentOnboardingRequest,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> StudentOnboardingResponse:
    repo = repository or PersonalizationMongoRepository()
    now = _now()
    strong_subject_labels = _subject_labels(payload.strong_subjects)
    weak_subject_labels = _subject_labels(payload.weak_subjects)
    combination_subjects = _subjects_from_combinations(payload.target_exam_combinations)
    preferred_subjects = list(dict.fromkeys([*combination_subjects, *strong_subject_labels, *weak_subject_labels]))
    learning_goals = [
        f"Ôn tập phù hợp với học sinh lớp {payload.grade_level}",
        *[f"Củng cố môn {subject}" for subject in weak_subject_labels],
        *[f"Phát huy thế mạnh môn {subject}" for subject in strong_subject_labels],
        *[f"Ôn {_combination_goal_label(code)}" for code in payload.target_exam_combinations],
    ]
    updates = {
        "grade_level": payload.grade_level,
        "strong_subjects": payload.strong_subjects,
        "weak_subjects": payload.weak_subjects,
        "target_exam_combinations": payload.target_exam_combinations,
        "onboarding_completed": True,
        "onboarding_completed_at": now,
        "education_system": "vn_gdpt_2018",
        "current_level": f"Lớp {payload.grade_level}",
        "learning_goals": learning_goals,
        "preferred_subjects": preferred_subjects,
        "preferred_content_types": ["question", "review_chunk", "lesson"],
        "preferred_explanation_style": "beginner",
        "updated_at": now,
        "last_active_at": now,
        "model_version": settings.LEARNER_MODEL_VERSION,
    }
    set_on_insert = {
        "user_id": user_id,
        "profile_confidence": 0.15,
        "total_learning_events": 0,
        "cold_start_status": "collecting",
    }
    profile = await repo.update_learner_preferences(user_id, updates, set_on_insert)
    invalidate_digital_twin_cache(user_id)
    response = _student_onboarding_response(user_id, profile)
    if response is None:
        raise ValueError("Student onboarding profile was not persisted.")
    return response


async def _prerequisite_gaps(
    repo: PersonalizationMongoRepository,
    user_id: str,
    signals_by_kc: dict[str, KnowledgeSignalResponse],
) -> list[KnowledgeSignalResponse]:
    target_ids = [
        knowledge_component_id
        for knowledge_component_id, signal in signals_by_kc.items()
        if signal.attempt_count > 0 or signal.status in {"mastered", "weak", "at_risk_of_forgetting"}
    ]
    if not target_ids:
        return []

    edges = await repo.list_prerequisite_edges_for_user(
        user_id,
        knowledge_component_ids=target_ids,
        limit=500,
    )
    gaps: dict[str, KnowledgeSignalResponse] = {}
    for edge in edges:
        source_id = str(edge.get("source_knowledge_component_id"))
        signal = signals_by_kc.get(source_id) or _unassessed_signal(source_id)
        if signal.status in {"weak", "uncertain", "unassessed", "at_risk_of_forgetting"}:
            reason_codes = sorted(set([*signal.reason_codes, "prerequisite_gap"]))
            gaps[source_id] = signal.model_copy(
                update={
                    "reason_codes": reason_codes,
                    "reason": "This prerequisite is weak, uncertain, unassessed, or at risk for an assessed component.",
                }
            )
    return sorted(gaps.values(), key=lambda item: (item.status != "weak", -(item.confidence or 0.0)))
