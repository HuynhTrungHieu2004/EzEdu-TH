from typing import Optional

from fastapi import APIRouter, Depends, Query
from app.schemas.auth import UserResponse

from app.database.mongodb import get_database
from app.exam_bank.api.deps import is_admin_actor, require_exam_bank_actor
from app.exam_bank.schemas.question import (
    QuestionBankBulkActionRequest,
    QuestionBankCreate,
    QuestionBankImportRequest,
    QuestionBankListResponse,
    QuestionBankResponse,
    QuestionBankReviewRequest,
    QuestionBankUpdate,
)
from app.exam_bank.services import question_bank_service

router = APIRouter()


@router.post("/question-bank/questions", response_model=QuestionBankResponse, status_code=201)
async def create_question(
    payload: QuestionBankCreate,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await question_bank_service.create_question(db, payload, owner_id=current_user.id)


@router.post("/question-bank/questions/import", response_model=list[QuestionBankResponse], status_code=201)
async def import_questions(
    payload: QuestionBankImportRequest,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await question_bank_service.import_questions(db, payload.items, owner_id=current_user.id)


@router.get("/question-bank/questions", response_model=QuestionBankListResponse)
async def list_questions(
    subject_id: Optional[str] = Query(None),
    grade: Optional[int] = Query(None),
    chapter_id: Optional[str] = Query(None),
    topic_id: Optional[str] = Query(None),
    bloom_level: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    question_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    owner_id = None if is_admin_actor(current_user) else current_user.id
    items, total = await question_bank_service.list_questions(
        db,
        owner_id=owner_id,
        subject_id=subject_id,
        grade=grade,
        chapter_id=chapter_id,
        topic_id=topic_id,
        bloom_level=bloom_level,
        difficulty=difficulty,
        question_type=question_type,
        status_filter=status,
        tag=tag,
        skip=skip,
        limit=limit,
    )
    return QuestionBankListResponse(items=items, total=total, skip=skip, limit=limit)


@router.get("/question-bank/questions/{question_id}", response_model=QuestionBankResponse)
async def get_question(
    question_id: str,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await question_bank_service.get_question(
        db, question_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )


@router.patch("/question-bank/questions/{question_id}", response_model=QuestionBankResponse)
async def update_question(
    question_id: str,
    payload: QuestionBankUpdate,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await question_bank_service.update_question(
        db, question_id, payload, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )


@router.post("/question-bank/questions/{question_id}/review", response_model=QuestionBankResponse)
async def review_question(
    question_id: str,
    payload: QuestionBankReviewRequest,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await question_bank_service.review_question(
        db,
        question_id,
        target_status=payload.target_status,
        version=payload.version,
        actor_id=current_user.id,
        is_admin=is_admin_actor(current_user),
    )


@router.post("/question-bank/questions/bulk-approve")
async def bulk_approve_questions(
    payload: QuestionBankBulkActionRequest,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    changed = await question_bank_service.bulk_update_status(
        db,
        payload.question_ids,
        target_status="approved",
        actor_id=current_user.id,
        is_admin=is_admin_actor(current_user),
    )
    return {"updated_count": changed}


@router.post("/question-bank/questions/bulk-archive")
async def bulk_archive_questions(
    payload: QuestionBankBulkActionRequest,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    changed = await question_bank_service.bulk_update_status(
        db,
        payload.question_ids,
        target_status="archived",
        actor_id=current_user.id,
        is_admin=is_admin_actor(current_user),
    )
    return {"updated_count": changed}
