from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from app.schemas.auth import UserResponse

from app.core.idempotency import require_idempotency_key, run_idempotent, IdempotencyConflict
from app.database.mongodb import get_database
from app.exam_bank.api.deps import is_admin_actor, require_exam_bank_actor
from app.exam_bank.schemas.exam import (
    ExamGenerateRequest,
    ExamGenerateResponse,
    ExamPreviewResponse,
    ExamPublishRequest,
    ExamRegenerateSectionRequest,
    ExamResponse,
)
from app.exam_bank.services import exam_service
from app.exam_bank.services.exam_service import BlueprintInfeasibleError

router = APIRouter()


def _infeasible_to_http(exc: BlueprintInfeasibleError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"message": exc.message, "missing": exc.missing},
    )


@router.post("/exams/generate", response_model=ExamGenerateResponse, status_code=201)
async def generate_exams(
    payload: ExamGenerateRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    key = await require_idempotency_key(idempotency_key)

    async def _do_generate():
        try:
            solver_status, exams = await exam_service.generate_exams(
                db,
                blueprint_id=payload.blueprint_id,
                code_count=payload.code_count,
                seed=payload.seed,
                actor_id=current_user.id,
                is_admin=is_admin_actor(current_user),
            )
        except BlueprintInfeasibleError as exc:
            raise _infeasible_to_http(exc)
        return ExamGenerateResponse(solver_status=solver_status, exams=exams).model_dump(mode="json")

    try:
        result = await run_idempotent(db, scope="exam.generate", key=key, fn=_do_generate)
    except IdempotencyConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    return result


@router.get("/exams")
async def list_exams(
    blueprint_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    items, total = await exam_service.list_exams(
        db, owner_id=current_user.id, blueprint_id=blueprint_id, skip=skip, limit=limit
    )
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.get("/exams/{exam_id}", response_model=ExamResponse)
async def get_exam(
    exam_id: str,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await exam_service.get_exam(db, exam_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user))


@router.get("/exams/{exam_id}/preview", response_model=ExamPreviewResponse)
async def preview_exam(
    exam_id: str,
    hide_answers: bool = Query(True),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await exam_service.preview_exam(
        db, exam_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user), hide_answers=hide_answers
    )


@router.post("/exams/{exam_id}/regenerate-section", response_model=ExamResponse)
async def regenerate_section(
    exam_id: str,
    payload: ExamRegenerateSectionRequest,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    try:
        return await exam_service.regenerate_section(
            db,
            exam_id,
            version=payload.version,
            group_type=payload.group_type,
            group_key=payload.group_key,
            actor_id=current_user.id,
            is_admin=is_admin_actor(current_user),
        )
    except BlueprintInfeasibleError as exc:
        raise _infeasible_to_http(exc)


@router.post("/exams/{exam_id}/publish", response_model=ExamResponse)
async def publish_exam(
    exam_id: str,
    payload: ExamPublishRequest,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await exam_service.publish_exam(
        db,
        exam_id,
        version=payload.version,
        audience_type=payload.audience_type,
        target_class_ids=payload.target_class_ids,
        actor_id=current_user.id,
        is_admin=is_admin_actor(current_user),
    )


@router.post("/exams/{exam_id}/clone", response_model=ExamResponse, status_code=201)
async def clone_exam(
    exam_id: str,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await exam_service.clone_exam(db, exam_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user))


@router.post("/exams/{exam_id}/archive", response_model=ExamResponse)
async def archive_exam(
    exam_id: str,
    version: int = Query(...),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await exam_service.archive_exam(
        db, exam_id, version=version, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )
