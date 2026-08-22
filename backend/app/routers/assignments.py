from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.assignments import (
    AssignmentCreate,
    AssignmentRead,
    AssignmentUpdate,
    SubmissionCreate,
    SubmissionRead,
    TeacherGrade,
)
from app.schemas.auth import UserResponse
from app.services import assignment_service
from app.services.course_service import get_course


router = APIRouter(tags=["Assignments"])


def _is_admin(user: UserResponse) -> bool:
    return user.role in {"admin", "super_admin"}


async def _ensure_course_manager(db, course_id: str, user: UserResponse) -> None:
    course = await get_course(db, course_id)
    if not _is_admin(user) and user.id not in course.teacher_ids:
        raise HTTPException(status_code=403, detail="Bạn không phụ trách khóa học này.")


async def _ensure_assignment_manager(db, assignment_id: str, user: UserResponse) -> AssignmentRead:
    assignment = await assignment_service.get_assignment(db, assignment_id)
    await _ensure_course_manager(db, assignment.course_id, user)
    return assignment


async def _ensure_submission_reader(db, submission_id: str, user: UserResponse) -> SubmissionRead:
    submission = await assignment_service.get_submission(db, submission_id)
    if user.role == "student":
        if submission.student_id != user.id:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem bài nộp này.")
    else:
        await _ensure_course_manager(db, submission.course_id, user)
    return submission


@router.get("/assignments", response_model=list[AssignmentRead])
async def list_assignments_route(
    course_id: str | None = Query(default=None),
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    if course_id and current_user.role != "student":
        await _ensure_course_manager(db, course_id, current_user)
    items = await assignment_service.list_assignments(
        db,
        course_id=course_id,
        status_filter="published" if current_user.role == "student" else None,
    )
    if _is_admin(current_user):
        return items
    if current_user.role in {"lecturer", "user"}:
        return [item for item in items if current_user.id in (await get_course(db, item.course_id)).teacher_ids]
    if current_user.role == "student":
        enrolled_course_ids = await db["course_enrollments"].distinct(
            "course_id", {"student_id": current_user.id, "status": {"$ne": "cancelled"}}
        )
        return [item for item in items if item.course_id in enrolled_course_ids]
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem bài tập.")


@router.post("/assignments", response_model=AssignmentRead, status_code=status.HTTP_201_CREATED)
async def create_assignment_route(
    payload: AssignmentCreate,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    await _ensure_course_manager(db, payload.course_id, current_user)
    return await assignment_service.create_assignment(db, payload, actor_id=current_user.id)


@router.patch("/assignments/{assignment_id}", response_model=AssignmentRead)
async def update_assignment_route(
    assignment_id: str,
    payload: AssignmentUpdate,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    await _ensure_assignment_manager(db, assignment_id, current_user)
    return await assignment_service.update_assignment(db, assignment_id, payload)


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment_route(
    assignment_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    await _ensure_assignment_manager(db, assignment_id, current_user)
    await assignment_service.delete_or_archive_assignment(db, assignment_id)


@router.post("/assignments/{assignment_id}/submissions", response_model=SubmissionRead)
async def submit_assignment_route(
    assignment_id: str,
    payload: SubmissionCreate,
    current_user: UserResponse = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Chỉ học sinh được nộp bài.")
    return await assignment_service.submit_assignment(
        get_database(), assignment_id, payload, student_id=current_user.id
    )


@router.get("/submissions", response_model=list[SubmissionRead])
async def list_submissions_route(
    assignment_id: str | None = Query(default=None),
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    if current_user.role == "student":
        return await assignment_service.list_submissions(
            db, assignment_id=assignment_id, student_id=current_user.id
        )
    if assignment_id:
        await _ensure_assignment_manager(db, assignment_id, current_user)
    items = await assignment_service.list_submissions(db, assignment_id=assignment_id)
    if _is_admin(current_user):
        return items
    if current_user.role in {"lecturer", "user"}:
        visible = []
        for item in items:
            course = await get_course(db, item.course_id)
            if current_user.id in course.teacher_ids:
                visible.append(item)
        return visible
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem bài nộp.")


@router.get("/submissions/{submission_id}", response_model=SubmissionRead)
async def get_submission_route(
    submission_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    return await _ensure_submission_reader(get_database(), submission_id, current_user)


@router.post("/submissions/{submission_id}/ai-grade", response_model=SubmissionRead)
async def ai_grade_route(
    submission_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    await _ensure_submission_reader(db, submission_id, current_user)
    try:
        return await assignment_service.request_ai_grade(db, submission_id)
    except assignment_service.AIGradingError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.patch("/submissions/{submission_id}/teacher-grade", response_model=SubmissionRead)
async def teacher_grade_route(
    submission_id: str,
    payload: TeacherGrade,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    submission = await assignment_service.get_submission(db, submission_id)
    await _ensure_course_manager(db, submission.course_id, current_user)
    try:
        return await assignment_service.teacher_grade_submission(
            db, submission_id, payload, teacher_id=current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
