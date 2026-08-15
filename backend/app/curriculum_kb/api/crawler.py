from typing import Optional

from fastapi import APIRouter, Depends, Query, status

from app.curriculum_kb.api.deps import is_admin_actor, require_teacher_actor
from app.curriculum_kb.schemas.crawl import (
    CrawlBatchCreate,
    CrawlBatchResponse,
    CrawlItemListResponse,
    CrawlItemResponse,
    CrawlItemReviewRequest,
    CrawlReviewStatus,
)
from app.curriculum_kb.schemas.source import CurriculumSourceResponse
from app.curriculum_kb.services import crawler_service
from app.database.mongodb import get_database
from app.schemas.auth import UserResponse

router = APIRouter()


@router.post(
    "/curriculum-kb/crawl-batches",
    response_model=CrawlBatchResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_crawl_batch(
    payload: CrawlBatchCreate,
    current_user: UserResponse = Depends(require_teacher_actor),
):
    return await crawler_service.enqueue_crawl_batch(
        get_database(), payload, actor_id=current_user.id
    )


@router.get("/curriculum-kb/crawl-items", response_model=CrawlItemListResponse)
async def list_crawl_items(
    review_status: Optional[CrawlReviewStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(require_teacher_actor),
):
    items, total = await crawler_service.list_crawl_items(
        get_database(), actor_id=current_user.id,
        is_admin=is_admin_actor(current_user), review_status=review_status,
        skip=skip, limit=limit,
    )
    return {"items": items, "total": total}


@router.post("/curriculum-kb/crawl-items/{item_id}/review", response_model=CrawlItemResponse)
async def review_crawl_item(
    item_id: str,
    payload: CrawlItemReviewRequest,
    current_user: UserResponse = Depends(require_teacher_actor),
):
    doc = await crawler_service.review_crawl_item(
        get_database(), item_id, target_status=payload.target_status,
        actor_id=current_user.id, is_admin=is_admin_actor(current_user),
    )
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


@router.post(
    "/curriculum-kb/crawl-items/{item_id}/promote",
    response_model=CurriculumSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def promote_crawl_item(
    item_id: str,
    current_user: UserResponse = Depends(require_teacher_actor),
):
    return await crawler_service.promote_crawl_item(
        get_database(), item_id, actor_id=current_user.id,
        is_admin=is_admin_actor(current_user),
    )
