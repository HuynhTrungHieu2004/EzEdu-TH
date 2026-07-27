from datetime import datetime, timezone
import logging
from typing import Optional

from fastapi import HTTPException, status

from app.core.config import settings
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import LearningEvent, LearningSession
from app.personalization.schemas.learning_events import (
    LearningEventCreateRequest,
    LearningEventResponse,
)

logger = logging.getLogger(__name__)


def _trim_metadata(metadata: dict) -> dict:
    safe = {}
    for key, value in metadata.items():
        if not isinstance(key, str) or len(key) > 80:
            continue
        if key in {"answer", "raw_answer", "correct_answer", "password", "token"}:
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            safe[key] = value
        elif isinstance(value, list):
            safe[key] = value[:20]
        elif isinstance(value, dict):
            safe[key] = {str(k)[:80]: v for k, v in list(value.items())[:20]}
    return safe


def _event_response(event: dict, *, duplicate: bool = False) -> LearningEventResponse:
    return LearningEventResponse(
        id=event["id"],
        user_id=event["user_id"],
        session_id=event.get("session_id"),
        item_id=event["item_id"],
        document_id=event.get("document_id"),
        event_type=event["event_type"],
        knowledge_component_ids=event.get("knowledge_component_ids", []),
        is_correct=event.get("is_correct"),
        score=event.get("score"),
        response_time_ms=event.get("response_time_ms"),
        hint_count=event.get("hint_count", 0),
        answer_change_count=event.get("answer_change_count", 0),
        attempt_number=event.get("attempt_number", 1),
        skipped=event.get("skipped", False),
        completed=event.get("completed", False),
        idempotency_key=event.get("idempotency_key"),
        occurred_at=event["occurred_at"],
        schema_version=event["schema_version"],
        duplicate=duplicate,
    )


async def record_learning_event(
    payload: LearningEventCreateRequest,
    *,
    user_id: str,
    user_role: str,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> LearningEventResponse:
    repo = repository or PersonalizationMongoRepository()
    item = await repo.resolve_accessible_learning_item(
        item_id=payload.item_id,
        user_id=user_id,
        user_role=user_role,
        document_id=payload.document_id,
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Learning item not found.")

    now = datetime.now(timezone.utc)
    resolved_document_id = payload.document_id or item.get("document_id")
    knowledge_component_ids = payload.knowledge_component_ids or item.get("knowledge_component_ids", [])

    if payload.session_id:
        session = LearningSession(
            user_id=user_id,
            session_id=payload.session_id,
            document_id=resolved_document_id,
            started_at=now,
            last_activity_at=now,
            metadata=_trim_metadata({"item_type": item.get("item_type"), **payload.metadata}),
            schema_version=settings.FEATURE_SCHEMA_VERSION,
        )
        await repo.upsert_learning_session(session)

    event = LearningEvent(
        user_id=user_id,
        session_id=payload.session_id,
        item_id=payload.item_id,
        document_id=resolved_document_id,
        event_type=payload.event_type,
        knowledge_component_ids=knowledge_component_ids,
        is_correct=payload.is_correct,
        score=payload.score,
        response_time_ms=payload.response_time_ms,
        hint_count=payload.hint_count,
        answer_change_count=payload.answer_change_count,
        attempt_number=payload.attempt_number,
        skipped=payload.skipped,
        completed=payload.completed,
        device_context=payload.device_context,
        idempotency_key=payload.idempotency_key,
        occurred_at=now,
        metadata=_trim_metadata(payload.metadata),
        schema_version=settings.FEATURE_SCHEMA_VERSION,
    )
    created, duplicate = await repo.create_learning_event_idempotent(event)
    if not duplicate:
        try:
            from app.personalization.services.digital_twin_service import invalidate_digital_twin_cache
            from app.personalization.services.recommendation_api_service import invalidate_recommendation_cache

            invalidate_digital_twin_cache(user_id)
            invalidate_recommendation_cache(user_id)
        except Exception:
            logger.warning("Personalization cache invalidation failed for user.")
    if (
        not duplicate
        and settings.LEARNER_MODEL_ENABLED
        and created.get("event_type") == "question_answered"
    ):
        try:
            from app.personalization.services.learner_model_service import process_learning_event

            await process_learning_event(created, repository=repo)
        except Exception as exc:
            logger.warning("Learner model update failed for learning event: %s", type(exc).__name__)
    return _event_response(created, duplicate=duplicate)


async def list_my_learning_events(
    *,
    user_id: str,
    limit: int = 50,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> list[LearningEventResponse]:
    repo = repository or PersonalizationMongoRepository()
    events = await repo.list_learning_events_for_user(user_id, limit=limit)
    return [_event_response(event) for event in events]
