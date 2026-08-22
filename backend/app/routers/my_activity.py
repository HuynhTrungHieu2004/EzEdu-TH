from fastapi import APIRouter, Depends, Query

from app.routers.auth import get_current_user
from app.schemas.activity_logs import UserActivityLogListResponse, UserActivityLogStatisticsResponse
from app.schemas.auth import UserResponse
from app.services.activity_log_service import activity_statistics, list_activity_logs


router = APIRouter(prefix="/activity", tags=["Activity"])


@router.get("", response_model=UserActivityLogListResponse)
async def list_my_activity(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user),
):
    return await list_activity_logs(page=page, page_size=page_size, user_id=current_user.id)


@router.get("/statistics", response_model=UserActivityLogStatisticsResponse)
async def my_activity_statistics(current_user: UserResponse = Depends(get_current_user)):
    return await activity_statistics(user_id=current_user.id)
