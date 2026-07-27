from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings
from app.personalization.algorithms import (
    BKTParameters,
    IRTParameters,
    bkt_update,
    infer_learner_level,
    rasch_probability,
    uncertainty_from_attempts,
    update_beta,
    update_theta,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import LearnerKnowledgeState, LearnerProfile
from app.personalization.utils.knowledge_normalization import normalize_weights


def _bkt_params() -> BKTParameters:
    return BKTParameters(
        p_init=settings.BKT_DEFAULT_P_INIT,
        p_learn=settings.BKT_DEFAULT_P_LEARN,
        p_guess=settings.BKT_DEFAULT_P_GUESS,
        p_slip=settings.BKT_DEFAULT_P_SLIP,
        min_probability=settings.BKT_MIN_PROBABILITY,
        max_probability=settings.BKT_MAX_PROBABILITY,
    )


def _irt_params() -> IRTParameters:
    return IRTParameters(
        learning_rate=settings.IRT_LEARNING_RATE,
        min_theta=settings.IRT_MIN_THETA,
        max_theta=settings.IRT_MAX_THETA,
        min_beta=settings.IRT_MIN_BETA,
        max_beta=settings.IRT_MAX_BETA,
        min_attempts_reliable=settings.IRT_MIN_ATTEMPTS_RELIABLE,
    )


def _score_to_correctness(event: dict) -> float:
    if event.get("score") is not None:
        return max(0.0, min(1.0, float(event["score"])))
    return 1.0 if event.get("is_correct") else 0.0


def _difficulty_to_beta(difficulty: Optional[float]) -> float:
    if difficulty is None:
        return 0.0
    return max(settings.IRT_MIN_BETA, min(settings.IRT_MAX_BETA, (float(difficulty) - 0.5) * 4.0))


async def _resolve_q_matrix(event: dict, repo: PersonalizationMongoRepository) -> tuple[dict[str, float], Optional[dict], str]:
    item = await repo.get_learning_item_by_id(event["item_id"])
    if item and item.get("q_matrix_weights"):
        return normalize_weights({str(k): float(v) for k, v in item["q_matrix_weights"].items()}), item, "learning_item_q_matrix"

    event_kcs = event.get("knowledge_component_ids") or []
    if event_kcs:
        return normalize_weights({str(kc_id): 1.0 for kc_id in event_kcs}), item, "event_knowledge_components"

    return {}, item, "missing_q_matrix"


async def process_learning_event(
    event: str | dict,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> dict:
    repo = repository or PersonalizationMongoRepository()
    event_doc = await repo.get_learning_event_by_id(event) if isinstance(event, str) else dict(event)
    if not event_doc:
        return {"status": "missing_event"}
    if event_doc.get("event_type") != "question_answered":
        return {"status": "ignored", "reason": "event_type_not_supported"}

    event_id = event_doc.get("id")
    if settings.LEARNER_MODEL_VERSION in (event_doc.get("learner_model_processed_versions") or []):
        return {"status": "duplicate", "event_id": event_id}

    q_matrix, item, q_matrix_source = await _resolve_q_matrix(event_doc, repo)
    if not q_matrix:
        return {"status": "missing_q_matrix", "event_id": event_id, "q_matrix_source": q_matrix_source}

    now = datetime.now(timezone.utc)
    correctness = _score_to_correctness(event_doc)
    bkt_params = _bkt_params()
    irt_params = _irt_params()
    updated_states: list[dict] = []
    stale_kcs: list[str] = []
    prediction_probabilities: list[float] = []
    item_beta = (item or {}).get("irt_state", {}).get("beta")
    if item_beta is None:
        item_beta = _difficulty_to_beta((item or {}).get("difficulty"))
    item_beta = float(item_beta)

    for kc_id, weight in q_matrix.items():
        existing = await repo.get_knowledge_state(event_doc["user_id"], kc_id)
        if existing and existing.get("last_practiced_at") and event_doc.get("occurred_at"):
            if event_doc["occurred_at"] < existing["last_practiced_at"]:
                stale_kcs.append(kc_id)
                continue

        prior_mastery = float((existing or {}).get("mastery_probability") or bkt_params.p_init)
        previous_theta = float((existing or {}).get("ability_estimate") or 0.0)
        attempt_count = int((existing or {}).get("attempt_count") or 0) + 1
        correct_count = int((existing or {}).get("correct_count") or 0) + (1 if correctness >= 0.5 else 0)
        previous_accuracy = (existing or {}).get("recent_accuracy")
        if previous_accuracy is None:
            recent_accuracy = correctness
        else:
            recent_accuracy = 0.8 * float(previous_accuracy) + 0.2 * correctness

        mastery = bkt_update(prior_mastery, correctness, bkt_params, weight=weight)
        probability_before = rasch_probability(previous_theta, item_beta)
        prediction_probabilities.append(probability_before)
        theta = update_theta(previous_theta, item_beta, correctness, irt_params, weight=weight)
        item_beta = update_beta(item_beta, previous_theta, correctness, irt_params, weight=weight)
        uncertainty = uncertainty_from_attempts(attempt_count, irt_params.min_attempts_reliable)
        previous_avg_time = (existing or {}).get("average_response_time_ms")
        response_time = event_doc.get("response_time_ms")
        if response_time is None:
            average_response_time = previous_avg_time
        elif previous_avg_time is None:
            average_response_time = float(response_time)
        else:
            average_response_time = 0.8 * float(previous_avg_time) + 0.2 * float(response_time)
        hint_rate = max(0.0, min(1.0, event_doc.get("hint_count", 0) / max(1, attempt_count)))

        state = LearnerKnowledgeState(
            user_id=event_doc["user_id"],
            knowledge_component_id=kc_id,
            mastery_probability=mastery,
            uncertainty=uncertainty,
            ability_estimate=theta,
            attempt_count=attempt_count,
            correct_count=correct_count,
            recent_accuracy=recent_accuracy,
            average_response_time_ms=average_response_time,
            hint_rate=hint_rate,
            last_practiced_at=event_doc.get("occurred_at") or now,
            last_updated_at=now,
            bkt_state={
                "p_init": bkt_params.p_init,
                "p_learn": bkt_params.p_learn,
                "p_guess": bkt_params.p_guess,
                "p_slip": bkt_params.p_slip,
                "prior_mastery": prior_mastery,
                "q_matrix_weight": weight,
                "last_event_id": event_id,
            },
            irt_state={
                "theta": theta,
                "beta": item_beta,
                "probability_before": probability_before,
                "learning_rate": irt_params.learning_rate,
                "q_matrix_weight": weight,
                "min_attempts_reliable": irt_params.min_attempts_reliable,
                "reliable": attempt_count >= irt_params.min_attempts_reliable,
            },
            model_version=settings.LEARNER_MODEL_VERSION,
        )
        updated_states.append(await repo.upsert_knowledge_state(state))

    if item:
        await repo.set_learning_item_irt_state(
            event_doc["item_id"],
            {
                "beta": item_beta,
                "model_version": settings.LEARNER_MODEL_VERSION,
                "updated_at": now,
            },
            difficulty=max(0.0, min(1.0, (item_beta / 4.0) + 0.5)),
        )

    await update_learner_profile(event_doc["user_id"], repository=repo)
    if event_id:
        if prediction_probabilities:
            await repo.set_learning_event_model_prediction(
                event_id,
                {
                    "probability_before": sum(prediction_probabilities) / len(prediction_probabilities),
                    "actual": correctness,
                    "model_version": settings.LEARNER_MODEL_VERSION,
                    "q_matrix_source": q_matrix_source,
                },
            )
        await repo.mark_learning_event_processed(event_id, settings.LEARNER_MODEL_VERSION)
    return {
        "status": "processed",
        "event_id": event_id,
        "updated_state_count": len(updated_states),
        "stale_knowledge_component_ids": stale_kcs,
        "q_matrix_source": q_matrix_source,
        "model_version": settings.LEARNER_MODEL_VERSION,
    }


async def update_learner_profile(
    user_id: str,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> dict:
    repo = repository or PersonalizationMongoRepository()
    states = await repo.list_knowledge_states_for_user(user_id, limit=500)
    now = datetime.now(timezone.utc)
    if states:
        average_mastery = sum(float(item.get("mastery_probability") or 0.0) for item in states) / len(states)
        average_theta = sum(float(item.get("ability_estimate") or 0.0) for item in states) / len(states)
        average_uncertainty = sum(float(item.get("uncertainty") or 1.0) for item in states) / len(states)
        total_events = sum(int(item.get("attempt_count") or 0) for item in states)
    else:
        average_mastery = settings.BKT_DEFAULT_P_INIT
        average_theta = 0.0
        average_uncertainty = 1.0
        total_events = 0

    profile = LearnerProfile(
        user_id=user_id,
        global_ability=average_theta,
        current_level=infer_learner_level(average_theta, average_mastery),
        profile_confidence=max(0.0, min(1.0, 1.0 - average_uncertainty)),
        total_learning_events=total_events,
        cold_start_status="ready" if total_events >= settings.IRT_MIN_ATTEMPTS_RELIABLE else "collecting",
        last_active_at=now,
        updated_at=now,
        model_version=settings.LEARNER_MODEL_VERSION,
    )
    return await repo.upsert_learner_profile(profile)
