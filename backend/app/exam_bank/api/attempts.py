from fastapi import APIRouter, Depends
from app.schemas.auth import UserResponse

from app.database.mongodb import get_database
from app.exam_bank.api.deps import is_admin_actor, require_exam_bank_actor, require_student_actor
from app.exam_bank.schemas.attempt import (
    AttemptAutosaveRequest,
    AttemptListResponse,
    AttemptOverrideRequest,
    AttemptResponse,
    AttemptStartResponse,
    AttemptSubmitRequest,
)
from app.exam_bank.schemas.exam import ExamPreviewResponse
from app.exam_bank.services import attempt_service, exam_service

router = APIRouter()


@router.post("/exams/{exam_id}/attempts/start", response_model=AttemptStartResponse)
async def start_attempt(exam_id: str, current_user: UserResponse = Depends(require_student_actor)):
    db = get_database()
    return await attempt_service.start_attempt(db, exam_id, student_id=current_user.id)


@router.get("/exams/{exam_id}/questions", response_model=ExamPreviewResponse)
async def get_exam_questions(exam_id: str, current_user: UserResponse = Depends(require_student_actor)):
    db = get_database()
    return await exam_service.get_exam_questions_for_student(db, exam_id)


@router.get("/exam-attempts/{attempt_id}", response_model=AttemptResponse)
async def get_attempt(attempt_id: str, current_user: UserResponse = Depends(require_student_actor)):
    db = get_database()
    return await attempt_service.get_attempt(db, attempt_id, student_id=current_user.id)


@router.patch("/exam-attempts/{attempt_id}/autosave", response_model=AttemptResponse)
async def autosave_attempt(
    attempt_id: str, payload: AttemptAutosaveRequest, current_user: UserResponse = Depends(require_student_actor)
):
    db = get_database()
    return await attempt_service.autosave(
        db, attempt_id, version=payload.version, answers=payload.answers, student_id=current_user.id
    )


@router.post("/exam-attempts/{attempt_id}/submit", response_model=AttemptResponse)
async def submit_attempt(
    attempt_id: str, payload: AttemptSubmitRequest, current_user: UserResponse = Depends(require_student_actor)
):
    db = get_database()
    return await attempt_service.submit_attempt(
        db, attempt_id, version=payload.version, answers=payload.answers, student_id=current_user.id
    )


@router.get("/exams/{exam_id}/attempts", response_model=AttemptListResponse)
async def list_attempts(exam_id: str, current_user: UserResponse = Depends(require_exam_bank_actor)):
    db = get_database()
    items = await attempt_service.list_attempts_for_exam(
        db, exam_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )
    return {"items": items, "total": len(items)}


@router.post("/exam-attempts/{attempt_id}/override", response_model=AttemptResponse)
async def override_score(
    attempt_id: str, payload: AttemptOverrideRequest, current_user: UserResponse = Depends(require_exam_bank_actor)
):
    db = get_database()
    return await attempt_service.override_score(
        db,
        attempt_id,
        version=payload.version,
        question_id=payload.question_id,
        teacher_score=payload.teacher_score,
        teacher_feedback=payload.teacher_feedback,
        actor_id=current_user.id,
        is_admin=is_admin_actor(current_user),
    )
