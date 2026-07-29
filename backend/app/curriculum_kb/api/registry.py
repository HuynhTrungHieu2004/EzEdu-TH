from typing import Optional

from fastapi import APIRouter, Depends, Query
from app.schemas.auth import UserResponse

from app.database.mongodb import get_database
from app.curriculum_kb.api.deps import is_admin_actor, require_teacher_actor
from app.curriculum_kb.schemas.source import (
    CurriculumReviewStatus,
    CurriculumSourceCreate,
    CurriculumSourceListResponse,
    CurriculumSourceResponse,
    CurriculumSourceReviewRequest,
)
from app.curriculum_kb.services import ingestion_service, registry_service

router = APIRouter()


@router.post("/curriculum-kb/sources", response_model=CurriculumSourceResponse, status_code=201)
async def create_source(payload: CurriculumSourceCreate, current_user: UserResponse = Depends(require_teacher_actor)):
    db = get_database()
    return await registry_service.create_source(db, payload, owner_id=current_user.id)


@router.post("/curriculum-kb/sources/from-web-knowledge/{web_source_id}", response_model=CurriculumSourceResponse, status_code=201)
async def create_source_from_web_knowledge(web_source_id: str, current_user: UserResponse = Depends(require_teacher_actor)):
    db = get_database()
    return await registry_service.create_source_from_web_knowledge(
        db, web_source_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )


@router.get("/curriculum-kb/sources", response_model=CurriculumSourceListResponse)
async def list_my_sources(
    status_filter: Optional[CurriculumReviewStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(require_teacher_actor),
):
    db = get_database()
    owner_id = None if is_admin_actor(current_user) else current_user.id
    items, total = await registry_service.list_sources(db, owner_id=owner_id, review_status=status_filter, skip=skip, limit=limit)
    return {"items": items, "total": total}


@router.post("/curriculum-kb/sources/{source_id}/review", response_model=CurriculumSourceResponse)
async def review_source(
    source_id: str, payload: CurriculumSourceReviewRequest, current_user: UserResponse = Depends(require_teacher_actor)
):
    db = get_database()
    return await registry_service.review_source(
        db,
        source_id,
        version=payload.version,
        target_status=payload.target_status,
        actor_id=current_user.id,
        is_admin=is_admin_actor(current_user),
    )


@router.post("/curriculum-kb/sources/{source_id}/ingest", status_code=202)
async def ingest_source(source_id: str, current_user: UserResponse = Depends(require_teacher_actor)):
    db = get_database()
    await ingestion_service.enqueue_ingestion(db, source_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user))
    return {"status": "queued"}
