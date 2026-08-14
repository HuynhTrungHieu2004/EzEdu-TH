from fastapi import APIRouter, Depends, status

from app.database.mongodb import get_database
from app.exam_bank.api.deps import require_student_actor
from app.exam_bank.schemas.study_exam import (
    StudyExamCreateRequest,
    StudyExamRequestResponse,
)
from app.exam_bank.services.study_exam_service import (
    create_study_exam_request,
    get_study_exam_request,
)
from app.schemas.auth import UserResponse

router = APIRouter()


@router.post(
    "/study-exams/requests",
    response_model=StudyExamRequestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_request(
    payload: StudyExamCreateRequest,
    current_user: UserResponse = Depends(require_student_actor),
):
    return await create_study_exam_request(
        get_database(), student_id=current_user.id, payload=payload
    )


@router.get(
    "/study-exams/requests/{request_id}",
    response_model=StudyExamRequestResponse,
)
async def get_request(
    request_id: str,
    current_user: UserResponse = Depends(require_student_actor),
):
    return await get_study_exam_request(
        get_database(), request_id=request_id, student_id=current_user.id
    )

