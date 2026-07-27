from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import settings
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.personalization.schemas.candidates import CandidateGenerationResponse
from app.personalization.services.candidate_generator_service import generate_candidates_for_user

router = APIRouter()


def ensure_candidate_generation_enabled() -> None:
    if not settings.PERSONALIZATION_ENABLED or not settings.RECOMMENDATION_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personalization recommendation candidates are disabled.",
        )


@router.get("/recommendations/candidates", response_model=CandidateGenerationResponse)
async def get_my_recommendation_candidates(
    limit: int = Query(default=settings.CANDIDATE_TOTAL_LIMIT, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_candidate_generation_enabled()
    return await generate_candidates_for_user(current_user.id, total_limit=limit)
