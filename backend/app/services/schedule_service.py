from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ASCENDING

from app.schemas.schedules import ScheduleCreate, ScheduleRead, ScheduleUpdate
from app.services.course_service import get_course


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch.")
    return ObjectId(value)


async def ensure_schedule_indexes(db) -> None:
    await db["schedules"].create_index([("course_id", ASCENDING), ("start_at", ASCENDING)])


async def _read(db, doc: dict) -> ScheduleRead:
    course = await db["courses"].find_one({"_id": ObjectId(doc["course_id"])}) or {}
    return ScheduleRead(
        **{key: value for key, value in doc.items() if key != "_id"},
        id=str(doc["_id"]),
        course_title=course.get("title", ""),
    )


async def create_schedule(db, payload: ScheduleCreate, *, actor_id: str) -> ScheduleRead:
    await get_course(db, payload.course_id)
    now = _now()
    doc = {
        **payload.model_dump(),
        "title": payload.title.strip(),
        "join_url": str(payload.join_url) if payload.join_url else None,
        "created_by": actor_id,
        "created_at": now,
        "updated_at": None,
    }
    result = await db["schedules"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _read(db, doc)


async def list_schedules(
    db,
    *,
    course_id: str | None = None,
    course_ids: list[str] | None = None,
    from_at: datetime | None = None,
    to_at: datetime | None = None,
    event_type: str | None = None,
) -> list[ScheduleRead]:
    query: dict = {}
    if course_id:
        query["course_id"] = course_id
    elif course_ids is not None:
        query["course_id"] = {"$in": course_ids}
    if from_at:
        query["end_at"] = {"$gt": from_at.astimezone(timezone.utc)}
    if to_at:
        query["start_at"] = {"$lt": to_at.astimezone(timezone.utc)}
    if event_type:
        query["event_type"] = event_type
    cursor = db["schedules"].find(query).sort("start_at", 1)
    return [await _read(db, doc) async for doc in cursor]


async def get_schedule(db, schedule_id: str) -> ScheduleRead:
    doc = await db["schedules"].find_one({"_id": _object_id(schedule_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch.")
    return await _read(db, doc)


async def update_schedule(db, schedule_id: str, payload: ScheduleUpdate) -> ScheduleRead:
    current = await get_schedule(db, schedule_id)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    validated = ScheduleCreate(
        course_id=current.course_id,
        title=changes.get("title", current.title),
        event_type=changes.get("event_type", current.event_type),
        start_at=changes.get("start_at", current.start_at),
        end_at=changes.get("end_at", current.end_at),
        join_url=changes.get("join_url", current.join_url),
        status=changes.get("status", current.status),
    )
    changes = validated.model_dump()
    changes["join_url"] = str(validated.join_url) if validated.join_url else None
    changes["updated_at"] = _now()
    await db["schedules"].update_one({"_id": ObjectId(schedule_id)}, {"$set": changes})
    return await get_schedule(db, schedule_id)


async def cancel_schedule(db, schedule_id: str) -> bool:
    await get_schedule(db, schedule_id)
    await db["schedules"].update_one(
        {"_id": ObjectId(schedule_id)}, {"$set": {"status": "cancelled", "updated_at": _now()}}
    )
    return True
