from fastapi import APIRouter, Depends, status

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.favorites import FavoriteCreate, FavoriteRead
from app.services import favorite_service


router = APIRouter(prefix="/favorites", tags=["Favorites"])


@router.get("", response_model=list[FavoriteRead])
async def list_favorites_route(current_user: UserResponse = Depends(get_current_user)):
    return await favorite_service.list_favorites(get_database(), current_user.id)


@router.post("", response_model=FavoriteRead, status_code=status.HTTP_201_CREATED)
async def create_favorite_route(payload: FavoriteCreate, current_user: UserResponse = Depends(get_current_user)):
    return await favorite_service.create_favorite(get_database(), current_user.id, payload)


@router.delete("/{favorite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_favorite_route(favorite_id: str, current_user: UserResponse = Depends(get_current_user)):
    await favorite_service.delete_favorite(get_database(), favorite_id, current_user.id)
