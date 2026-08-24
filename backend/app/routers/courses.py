from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.courses import (
    CourseCreate,
    CourseRead,
    CourseStatistics,
    CourseUpdate,
    EnrollmentCreate,
    EnrollmentRead,
    LessonCreate,
    LessonRead,
    LessonUpdate,
)
from app.services import course_service


router = APIRouter(prefix="/courses", tags=["Courses"])


def _is_admin(user: UserResponse) -> bool:
    return user.role in {"admin", "super_admin"}


def _ensure_admin(user: UserResponse) -> None:
    if not _is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Chỉ quản trị viên được thực hiện thao tác này.")


async def _ensure_course_manager(db, course_id: str, user: UserResponse) -> CourseRead:
    course = await course_service.get_course(db, course_id)
    if not _is_admin(user) and user.id not in course.teacher_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không phụ trách khóa học này.")
    return course


async def _ensure_course_reader(db, course_id: str, user: UserResponse) -> CourseRead:
    course = await course_service.get_course(db, course_id)
    if _is_admin(user) or user.id in course.teacher_ids:
        return course
    enrolled = await db["course_enrollments"].count_documents({
        "course_id": course_id,
        "student_id": user.id,
        "status": {"$ne": "cancelled"},
    })
    if user.role != "student" or course.status != "published" or not enrolled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền xem khóa học này.")
    return course


def _raise_conflict(exc: course_service.CourseConflict) -> None:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/mine", response_model=list[EnrollmentRead])
async def list_my_enrollments(current_user: UserResponse = Depends(get_current_user)):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Chỉ học sinh có danh sách khóa học đã ghi danh.")
    return await course_service.list_enrollments(get_database(), student_id=current_user.id)


@router.get("/statistics", response_model=CourseStatistics)
async def get_statistics_route(current_user: UserResponse = Depends(get_current_user)):
    _ensure_admin(current_user)
    return await course_service.get_course_statistics(get_database())


@router.get("/recommended", response_model=list[CourseRead])
async def list_recommended_courses_route(
    current_user: UserResponse = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Chỉ học sinh xem được khóa học AI gợi ý.")
    return await course_service.list_recommended_courses(get_database())


@router.get("", response_model=list[CourseRead])
async def list_courses_route(
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    if _is_admin(current_user):
        return await course_service.list_courses(db, status_filter=status_filter)
    if current_user.role in {"lecturer", "user"}:
        return await course_service.list_courses(db, status_filter=status_filter, teacher_id=current_user.id)
    if current_user.role == "student":
        return await course_service.list_courses(db, status_filter="published", student_id=current_user.id)
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem danh sách khóa học.")


@router.post("", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
async def create_course_route(
    payload: CourseCreate,
    current_user: UserResponse = Depends(get_current_user),
):
    _ensure_admin(current_user)
    try:
        return await course_service.create_course(get_database(), payload, actor_id=current_user.id)
    except course_service.CourseConflict as exc:
        _raise_conflict(exc)


@router.get("/enrollments", response_model=list[EnrollmentRead])
async def list_all_enrollments_route(current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    if _is_admin(current_user):
        return await course_service.list_enrollments(db)
    if current_user.role in {"lecturer", "user"}:
        courses = await course_service.list_courses(db, teacher_id=current_user.id)
        items: list[EnrollmentRead] = []
        for course in courses:
            items.extend(await course_service.list_enrollments(db, course_id=course.id))
        return items
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem danh sách ghi danh.")


@router.delete("/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_enrollment_by_id_route(
    enrollment_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    _ensure_admin(current_user)
    await course_service.remove_enrollment(get_database(), None, enrollment_id)


@router.get("/{course_id}", response_model=CourseRead)
async def get_course_route(course_id: str, current_user: UserResponse = Depends(get_current_user)):
    return await _ensure_course_reader(get_database(), course_id, current_user)


@router.patch("/{course_id}", response_model=CourseRead)
async def update_course_route(
    course_id: str,
    payload: CourseUpdate,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    await _ensure_course_manager(db, course_id, current_user)
    try:
        return await course_service.update_course(db, course_id, payload)
    except course_service.CourseConflict as exc:
        _raise_conflict(exc)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course_route(course_id: str, current_user: UserResponse = Depends(get_current_user)):
    _ensure_admin(current_user)
    await course_service.delete_or_archive_course(get_database(), course_id)


@router.get("/{course_id}/lessons", response_model=list[LessonRead])
async def list_lessons_route(course_id: str, current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    await _ensure_course_reader(db, course_id, current_user)
    return await course_service.list_lessons(db, course_id, published_only=current_user.role == "student")


@router.post("/{course_id}/lessons", response_model=LessonRead, status_code=status.HTTP_201_CREATED)
async def create_lesson_route(
    course_id: str,
    payload: LessonCreate,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    await _ensure_course_manager(db, course_id, current_user)
    return await course_service.create_lesson(db, course_id, payload)


@router.patch("/{course_id}/lessons/{lesson_id}", response_model=LessonRead)
async def update_lesson_route(
    course_id: str,
    lesson_id: str,
    payload: LessonUpdate,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    await _ensure_course_manager(db, course_id, current_user)
    return await course_service.update_lesson(db, course_id, lesson_id, payload)


@router.delete("/{course_id}/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson_route(
    course_id: str,
    lesson_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    _ensure_admin(current_user)
    await course_service.delete_or_archive_lesson(get_database(), course_id, lesson_id)


@router.get("/{course_id}/enrollments", response_model=list[EnrollmentRead])
async def list_enrollments_route(course_id: str, current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    await _ensure_course_manager(db, course_id, current_user)
    return await course_service.list_enrollments(db, course_id=course_id)


@router.post("/{course_id}/enrollments", response_model=EnrollmentRead, status_code=status.HTTP_201_CREATED)
async def enroll_student_route(
    course_id: str,
    payload: EnrollmentCreate,
    current_user: UserResponse = Depends(get_current_user),
):
    _ensure_admin(current_user)
    try:
        return await course_service.enroll_student(get_database(), course_id, payload)
    except course_service.CourseConflict as exc:
        _raise_conflict(exc)


@router.post("/{course_id}/self-enroll", response_model=EnrollmentRead)
async def self_enroll_recommended_course_route(
    course_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Chỉ học sinh được tự ghi danh.")
    return await course_service.self_enroll_recommended_course(
        get_database(), course_id, current_user.id
    )


@router.delete("/{course_id}/enrollments/{enrollment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_enrollment_route(
    course_id: str,
    enrollment_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    _ensure_admin(current_user)
    await course_service.remove_enrollment(get_database(), course_id, enrollment_id)
