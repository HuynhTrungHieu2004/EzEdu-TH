from fastapi import APIRouter, Depends
from app.schemas.auth import UserResponse

from app.database.mongodb import get_database
from app.web_knowledge.api.deps import require_web_knowledge_actor
from app.web_knowledge.schemas.source import ExploreRequest, ExploreResponse
from app.web_knowledge.services import web_knowledge_service

router = APIRouter()


@router.post("/web-knowledge/explore", response_model=ExploreResponse)
async def explore(payload: ExploreRequest, current_user: UserResponse = Depends(require_web_knowledge_actor)):
    db = get_database()
    return await web_knowledge_service.explore(db, user_id=current_user.id, query=payload.query)
