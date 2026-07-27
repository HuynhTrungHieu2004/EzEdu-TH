from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.personalization.schemas.learner_state import (
    LearnerKnowledgeStateResponse,
    LearnerProfileResponse,
    LearnerSummaryResponse,
)
from app.personalization.services.learner_state_query_service import get_learner_summary

router = APIRouter()


def ensure_learner_model_enabled() -> None:
    if not settings.PERSONALIZATION_ENABLED or not settings.LEARNER_MODEL_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personalization learner model is disabled.",
        )


@router.get("/learner/profile", response_model=LearnerProfileResponse | None)
async def get_current_learner_profile(current_user: UserResponse = Depends(get_current_user)):
    ensure_learner_model_enabled()
    return (await get_learner_summary(current_user.id)).profile


@router.get("/learner/mastery", response_model=list[LearnerKnowledgeStateResponse])
async def get_current_learner_mastery(current_user: UserResponse = Depends(get_current_user)):
    ensure_learner_model_enabled()
    return (await get_learner_summary(current_user.id)).mastery


@router.get("/learner/summary", response_model=LearnerSummaryResponse)
async def get_current_learner_summary(current_user: UserResponse = Depends(get_current_user)):
    ensure_learner_model_enabled()
    return await get_learner_summary(current_user.id)


@router.get("/learner/strengths", response_model=list[LearnerKnowledgeStateResponse])
async def get_current_learner_strengths(current_user: UserResponse = Depends(get_current_user)):
    ensure_learner_model_enabled()
    return (await get_learner_summary(current_user.id)).strengths


@router.get("/learner/weaknesses", response_model=list[LearnerKnowledgeStateResponse])
async def get_current_learner_weaknesses(current_user: UserResponse = Depends(get_current_user)):
    ensure_learner_model_enabled()
    return (await get_learner_summary(current_user.id)).weaknesses
