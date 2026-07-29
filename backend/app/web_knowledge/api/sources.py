from typing import Optional

from fastapi import APIRouter, Depends, Query
from app.schemas.auth import UserResponse

from app.database.mongodb import get_database
from app.web_knowledge.api.deps import is_admin_actor, require_teacher_actor
from app.web_knowledge.schemas.source import (
    SaveSourceRequest,
    SourceListResponse,
    SourceResponse,
    SourceReviewRequest,
    WebKnowledgeSourceStatus,
)
from app.web_knowledge.services import source_service

router = APIRouter()


@router.post("/web-knowledge/sources", response_model=SourceResponse, status_code=201)
async def save_source(payload: SaveSourceRequest, current_user: UserResponse = Depends(require_teacher_actor)):
    db = get_database()
    return await source_service.save_source(db, payload, owner_id=current_user.id)


@router.get("/web-knowledge/sources", response_model=SourceListResponse)
async def list_sources(
    status_filter: Optional[WebKnowledgeSourceStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(require_teacher_actor),
):
    db = get_database()
    owner_id = None if is_admin_actor(current_user) else current_user.id
    items, total = await source_service.list_sources(
        db, owner_id=owner_id, status_filter=status_filter, skip=skip, limit=limit
    )
    return {"items": items, "total": total}


@router.post("/web-knowledge/sources/{source_id}/review", response_model=SourceResponse)
async def review_source(
    source_id: str, payload: SourceReviewRequest, current_user: UserResponse = Depends(require_teacher_actor)
):
    db = get_database()
    return await source_service.review_source(
        db,
        source_id,
        version=payload.version,
        target_status=payload.target_status,
        actor_id=current_user.id,
        is_admin=is_admin_actor(current_user),
    )
