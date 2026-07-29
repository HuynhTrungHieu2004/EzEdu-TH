from typing import Optional

from fastapi import APIRouter, Depends, Query
from app.schemas.auth import UserResponse

from app.database.mongodb import get_database
from app.curriculum_kb.api.deps import require_curriculum_kb_actor
from app.curriculum_kb.schemas.source import (
    CurriculumSearchResponse,
    CurriculumSourceListResponse,
)
from app.curriculum_kb.services import ingestion_service, registry_service

router = APIRouter()


@router.get("/curriculum-kb/search", response_model=CurriculumSearchResponse)
async def search(
    query: str = Query(..., min_length=3, max_length=500),
    subject_id: Optional[str] = None,
    grade: Optional[int] = Query(None, ge=1, le=12),
    topic_id: Optional[str] = None,
    current_user: UserResponse = Depends(require_curriculum_kb_actor),
):
    db = get_database()
    results = await ingestion_service.search(db, query=query, subject_id=subject_id, grade=grade, topic_id=topic_id)
    return {"query": query, "results": results}


@router.get("/curriculum-kb/sources/published", response_model=CurriculumSourceListResponse)
async def list_published(
    subject_id: Optional[str] = None,
    grade: Optional[int] = Query(None, ge=1, le=12),
    topic_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(require_curriculum_kb_actor),
):
    db = get_database()
    items, total = await registry_service.list_published_sources(
        db, subject_id=subject_id, grade=grade, topic_id=topic_id, skip=skip, limit=limit
    )
    return {"items": items, "total": total}
