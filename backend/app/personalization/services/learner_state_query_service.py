from typing import Optional

from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.learner_state import (
    LearnerKnowledgeStateResponse,
    LearnerProfileResponse,
    LearnerSummaryResponse,
)


def _state_reason(state: dict) -> str:
    attempts = int(state.get("attempt_count") or 0)
    correct = int(state.get("correct_count") or 0)
    mastery = state.get("mastery_probability")
    uncertainty = float(state.get("uncertainty") or 1.0)
    if attempts == 0:
        return "No answered question has updated this knowledge component yet."
    if mastery is not None and mastery >= 0.75:
        return f"High mastery estimate from {correct}/{attempts} correct answers with uncertainty {uncertainty:.2f}."
    if mastery is not None and mastery <= 0.45:
        return f"Lower mastery estimate from {correct}/{attempts} correct answers with uncertainty {uncertainty:.2f}."
    return f"Developing mastery estimate from {correct}/{attempts} correct answers with uncertainty {uncertainty:.2f}."


def _state_response(state: dict) -> LearnerKnowledgeStateResponse:
    uncertainty = float(state.get("uncertainty") or 1.0)
    return LearnerKnowledgeStateResponse(
        knowledge_component_id=state["knowledge_component_id"],
        mastery_probability=state.get("mastery_probability"),
        uncertainty=state.get("uncertainty"),
        ability_estimate=state.get("ability_estimate"),
        attempt_count=int(state.get("attempt_count") or 0),
        correct_count=int(state.get("correct_count") or 0),
        recent_accuracy=state.get("recent_accuracy"),
        average_response_time_ms=state.get("average_response_time_ms"),
        hint_rate=state.get("hint_rate"),
        last_practiced_at=state.get("last_practiced_at"),
        model_version=state["model_version"],
        confidence=max(0.0, min(1.0, 1.0 - uncertainty)),
        reason=_state_reason(state),
    )


def _profile_response(profile: Optional[dict]) -> Optional[LearnerProfileResponse]:
    if not profile:
        return None
    return LearnerProfileResponse(
        user_id=profile["user_id"],
        global_ability=profile.get("global_ability"),
        current_level=profile.get("current_level"),
        profile_confidence=profile.get("profile_confidence"),
        total_learning_events=int(profile.get("total_learning_events") or 0),
        cold_start_status=profile.get("cold_start_status", "new"),
        updated_at=profile["updated_at"],
        model_version=profile["model_version"],
    )


async def get_learner_summary(
    user_id: str,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> LearnerSummaryResponse:
    repo = repository or PersonalizationMongoRepository()
    profile = await repo.get_learner_profile(user_id)
    states = [_state_response(item) for item in await repo.list_knowledge_states_for_user(user_id, limit=500)]
    strengths = sorted(
        [item for item in states if (item.mastery_probability or 0.0) >= 0.7],
        key=lambda item: (item.mastery_probability or 0.0, item.confidence),
        reverse=True,
    )[:5]
    weaknesses = sorted(
        [item for item in states if (item.mastery_probability or 1.0) <= 0.5],
        key=lambda item: (item.mastery_probability or 1.0, -item.confidence),
    )[:5]
    confidence = float(profile.get("profile_confidence") or 0.0) if profile else 0.0
    reasons = [
        f"{len(states)} knowledge components have learner-state estimates.",
        "Confidence is based on uncertainty from observed attempts, not AI judgment.",
    ]
    return LearnerSummaryResponse(
        profile=_profile_response(profile),
        mastery=states,
        strengths=strengths,
        weaknesses=weaknesses,
        confidence=confidence,
        reasons=reasons,
    )
