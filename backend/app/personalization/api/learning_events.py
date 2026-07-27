from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import settings
from app.routers.auth import get_current_user, require_admin
from app.schemas.auth import UserResponse
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.learning_events import (
    LearningEventCreateRequest,
    LearningEventResponse,
)
from app.personalization.services.learning_event_service import (
    list_my_learning_events,
    record_learning_event,
)

router = APIRouter()


def ensure_learning_events_enabled() -> None:
    if not settings.PERSONALIZATION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personalization learning events are disabled.",
        )


@router.post("/events", response_model=LearningEventResponse, status_code=status.HTTP_201_CREATED)
async def create_learning_event(
    payload: LearningEventCreateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_learning_events_enabled()
    return await record_learning_event(
        payload,
        user_id=current_user.id,
        user_role=current_user.role,
    )


@router.get("/events/my", response_model=list[LearningEventResponse])
async def list_current_user_learning_events(
    limit: int = Query(50, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_learning_events_enabled()
    return await list_my_learning_events(user_id=current_user.id, limit=limit)


@router.get("/events/admin/users/{user_id}", response_model=list[LearningEventResponse])
async def admin_list_user_learning_events(
    user_id: str,
    limit: int = Query(50, ge=1, le=100),
    current_user: UserResponse = Depends(require_admin),
):
    ensure_learning_events_enabled()
    return await list_my_learning_events(
        user_id=user_id,
        limit=limit,
        repository=PersonalizationMongoRepository(),
    )
