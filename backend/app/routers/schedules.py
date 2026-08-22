from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.schedules import ScheduleCreate, ScheduleRead, ScheduleUpdate
from app.services import schedule_service
from app.services.course_service import get_course, list_courses


router = APIRouter(prefix="/schedules", tags=["Schedules"])


def _is_admin(user: UserResponse) -> bool:
    return user.role in {"admin", "super_admin"}


async def _ensure_manager(db, course_id: str, user: UserResponse) -> None:
    course = await get_course(db, course_id)
    if not _is_admin(user) and user.id not in course.teacher_ids:
        raise HTTPException(status_code=403, detail="Bạn không phụ trách khóa học này.")


@router.get("", response_model=list[ScheduleRead])
async def list_schedules_route(
    course_id: Annotated[str | None, Query()] = None,
    from_at: Annotated[datetime | None, Query(alias="from")] = None,
    to_at: Annotated[datetime | None, Query(alias="to")] = None,
    event_type: Annotated[str | None, Query()] = None,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    course_ids = None
    if course_id:
        if current_user.role == "student":
            enrolled = await db["course_enrollments"].count_documents({
                "course_id": course_id,
                "student_id": current_user.id,
                "status": {"$ne": "cancelled"},
            })
            if not enrolled:
                raise HTTPException(status_code=403, detail="Bạn chưa ghi danh khóa học này.")
        else:
            await _ensure_manager(db, course_id, current_user)
    elif current_user.role == "student":
        course_ids = await db["course_enrollments"].distinct(
            "course_id", {"student_id": current_user.id, "status": {"$ne": "cancelled"}}
        )
    elif not _is_admin(current_user):
        if current_user.role not in {"lecturer", "user"}:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem lịch.")
        course_ids = [item.id for item in await list_courses(db, teacher_id=current_user.id)]
    return await schedule_service.list_schedules(
        db,
        course_id=course_id,
        course_ids=course_ids,
        from_at=from_at,
        to_at=to_at,
        event_type=event_type,
    )


@router.post("", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED)
async def create_schedule_route(
    payload: ScheduleCreate,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    await _ensure_manager(db, payload.course_id, current_user)
    return await schedule_service.create_schedule(db, payload, actor_id=current_user.id)


@router.patch("/{schedule_id}", response_model=ScheduleRead)
async def update_schedule_route(
    schedule_id: str,
    payload: ScheduleUpdate,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    schedule = await schedule_service.get_schedule(db, schedule_id)
    await _ensure_manager(db, schedule.course_id, current_user)
    return await schedule_service.update_schedule(db, schedule_id, payload)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_route(
    schedule_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    schedule = await schedule_service.get_schedule(db, schedule_id)
    await _ensure_manager(db, schedule.course_id, current_user)
    await schedule_service.cancel_schedule(db, schedule_id)
