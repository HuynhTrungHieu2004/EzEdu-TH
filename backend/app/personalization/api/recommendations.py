from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import settings
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.personalization.schemas.recommendations import (
    RecommendationAPIResponse,
    RecommendationFeedbackRequest,
    RecommendationFeedbackResponse,
    RecommendationHistoryResponse,
    RecommendationResponse,
)
from app.personalization.services.recommendation_api_service import (
    get_recommendation_history_for_current_user,
    get_recommendations_for_current_user,
    record_recommendation_feedback,
)
from app.personalization.services.recommendation_ranking_service import recommend_for_user

router = APIRouter()


def ensure_recommendation_enabled() -> None:
    if not settings.PERSONALIZATION_ENABLED or not settings.RECOMMENDATION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personalization recommendations are disabled.",
        )


@router.get("/recommendations", response_model=RecommendationResponse)
async def get_my_recommendations(
    limit: int = Query(default=10, ge=1, le=50),
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_recommendation_enabled()
    return await recommend_for_user(current_user.id, limit=limit)


@router.get("/recommendations/me", response_model=RecommendationAPIResponse)
async def get_my_recommendation_feed(
    limit: int = Query(default=10, ge=1, le=50),
    language: str = Query(default="vi", min_length=2, max_length=16),
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_recommendation_enabled()
    return await get_recommendations_for_current_user(
        current_user.id,
        limit=limit,
        language=language,
    )


@router.post("/recommendations/me/feedback", response_model=RecommendationFeedbackResponse)
async def submit_my_recommendation_feedback(
    payload: RecommendationFeedbackRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_recommendation_enabled()
    return await record_recommendation_feedback(current_user.id, payload)


@router.get("/recommendations/me/history", response_model=RecommendationHistoryResponse)
async def get_my_recommendation_history(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_recommendation_enabled()
    return await get_recommendation_history_for_current_user(current_user.id, limit=limit)
