from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException, status
from pymongo import ASCENDING
from pymongo.errors import DuplicateKeyError

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


class CourseConflict(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học.")
    return ObjectId(value)


async def ensure_course_indexes(db) -> None:
    await db["courses"].create_index("code", unique=True)
    await db["course_enrollments"].create_index(
        [("course_id", ASCENDING), ("student_id", ASCENDING)], unique=True
    )
    await db["course_lessons"].create_index(
        [("course_id", ASCENDING), ("sort_order", ASCENDING)]
    )


async def _user(db, user_id: str) -> dict | None:
    if ObjectId.is_valid(user_id):
        return await db["users"].find_one({"_id": ObjectId(user_id)})
    return await db["users"].find_one({"_id": user_id})


async def _validate_teachers(db, teacher_ids: list[str]) -> None:
    for teacher_id in teacher_ids:
        teacher = await _user(db, teacher_id)
        if not teacher or teacher.get("role") not in {"lecturer", "admin", "super_admin", "user"}:
            raise HTTPException(status_code=404, detail="Không tìm thấy giảng viên.")


async def _course_read(db, doc: dict) -> CourseRead:
    course_id = str(doc["_id"])
    teacher_ids = doc.get("teacher_ids") or []
    teacher = await _user(db, teacher_ids[0]) if teacher_ids else None
    return CourseRead(
        **{key: value for key, value in doc.items() if key != "_id"},
        id=course_id,
        teacher_id=teacher_ids[0] if teacher_ids else "",
        teacher_name=(teacher or {}).get("full_name", ""),
        lesson_count=await db["course_lessons"].count_documents(
            {"course_id": course_id, "deleted_at": None}
        ),
        assignment_count=await db["course_assignments"].count_documents(
            {"course_id": course_id, "deleted_at": None}
        ),
        exam_count=await db["course_exams"].count_documents(
            {"course_id": course_id, "deleted_at": None}
        ),
        student_count=await db["course_enrollments"].count_documents(
            {"course_id": course_id, "status": {"$ne": "cancelled"}}
        ),
    )


async def _lesson_read(doc: dict) -> LessonRead:
    return LessonRead(**{key: value for key, value in doc.items() if key != "_id"}, id=str(doc["_id"]))


async def _enrollment_read(db, doc: dict) -> EnrollmentRead:
    course = await db["courses"].find_one({"_id": _object_id(doc["course_id"])})
    if not course:
        raise HTTPException(status_code=404, detail="Không tìm thấy khóa học.")
    student = await _user(db, doc["student_id"]) or {}
    teacher_ids = course.get("teacher_ids") or []
    teacher = await _user(db, teacher_ids[0]) if teacher_ids else None
    total_lessons = await db["course_lessons"].count_documents(
        {"course_id": doc["course_id"], "status": "published", "deleted_at": None}
    )
    return EnrollmentRead(
        **{key: value for key, value in doc.items() if key != "_id"},
        id=str(doc["_id"]),
        course_code=course["code"],
        course_title=course["title"],
        subject=course["subject"],
        grade=course.get("grade") or "",
        student_code=student.get("student_code", ""),
        student_name=student.get("full_name", ""),
        student_email=student.get("email", ""),
        teacher_name=(teacher or {}).get("full_name", ""),
        total_lessons=total_lessons,
    )


async def list_courses(
    db,
    *,
    status_filter: str | None = None,
    teacher_id: str | None = None,
    student_id: str | None = None,
) -> list[CourseRead]:
    query: dict = {"deleted_at": None}
    if status_filter:
        query["status"] = status_filter
    if teacher_id:
        query["teacher_ids"] = teacher_id
    if student_id:
        course_ids = [
            item["course_id"]
            async for item in db["course_enrollments"].find(
                {"student_id": student_id, "status": {"$ne": "cancelled"}}, {"course_id": 1}
            )
        ]
        query["_id"] = {"$in": [ObjectId(value) for value in course_ids if ObjectId.is_valid(value)]}
    cursor = db["courses"].find(query).sort("created_at", -1)
    return [await _course_read(db, doc) async for doc in cursor]


async def get_course(db, course_id: str) -> CourseRead:
    doc = await db["courses"].find_one({"_id": _object_id(course_id), "deleted_at": None})
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy khóa học.")
    return await _course_read(db, doc)


async def create_course(db, payload: CourseCreate, *, actor_id: str) -> CourseRead:
    await _validate_teachers(db, payload.teacher_ids)
    now = _now()
    doc = {
        **payload.model_dump(),
        "code": payload.code.strip().upper(),
        "title": payload.title.strip(),
        "created_by": actor_id,
        "created_at": now,
        "updated_at": None,
        "deleted_at": None,
    }
    try:
        result = await db["courses"].insert_one(doc)
    except DuplicateKeyError as exc:
        raise CourseConflict("Mã khóa học đã tồn tại.") from exc
    doc["_id"] = result.inserted_id
    return await _course_read(db, doc)


async def update_course(db, course_id: str, payload: CourseUpdate) -> CourseRead:
    object_id = _object_id(course_id)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "teacher_ids" in changes:
        await _validate_teachers(db, changes["teacher_ids"])
    if "code" in changes:
        changes["code"] = changes["code"].strip().upper()
    if "title" in changes:
        changes["title"] = changes["title"].strip()
    changes["updated_at"] = _now()
    try:
        result = await db["courses"].update_one(
            {"_id": object_id, "deleted_at": None}, {"$set": changes}
        )
    except DuplicateKeyError as exc:
        raise CourseConflict("Mã khóa học đã tồn tại.") from exc
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy khóa học.")
    return await get_course(db, course_id)


async def delete_or_archive_course(db, course_id: str) -> bool:
    object_id = _object_id(course_id)
    if not await db["courses"].find_one({"_id": object_id, "deleted_at": None}):
        raise HTTPException(status_code=404, detail="Không tìm thấy khóa học.")
    has_learning_data = bool(
        await db["course_enrollments"].count_documents({"course_id": course_id})
        or await db["course_submissions"].count_documents({"course_id": course_id})
    )
    if has_learning_data:
        await db["courses"].update_one(
            {"_id": object_id}, {"$set": {"status": "archived", "updated_at": _now()}}
        )
    else:
        await db["courses"].delete_one({"_id": object_id})
        await db["course_lessons"].delete_many({"course_id": course_id})
    return True


async def list_lessons(db, course_id: str, *, published_only: bool = False) -> list[LessonRead]:
    await get_course(db, course_id)
    query: dict = {"course_id": course_id, "deleted_at": None}
    if published_only:
        query["status"] = "published"
    cursor = db["course_lessons"].find(query).sort("sort_order", 1)
    return [await _lesson_read(doc) async for doc in cursor]


async def create_lesson(db, course_id: str, payload: LessonCreate) -> LessonRead:
    await get_course(db, course_id)
    sort_order = payload.sort_order
    if sort_order is None:
        last = await db["course_lessons"].find_one(
            {"course_id": course_id, "deleted_at": None}, sort=[("sort_order", -1)]
        )
        sort_order = (last or {}).get("sort_order", 0) + 1
    now = _now()
    doc = {
        **payload.model_dump(exclude={"sort_order"}),
        "course_id": course_id,
        "sort_order": sort_order,
        "created_at": now,
        "updated_at": None,
        "deleted_at": None,
    }
    result = await db["course_lessons"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _lesson_read(doc)


async def update_lesson(db, course_id: str, lesson_id: str, payload: LessonUpdate) -> LessonRead:
    await get_course(db, course_id)
    lesson_object_id = _object_id(lesson_id)
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    changes["updated_at"] = _now()
    result = await db["course_lessons"].update_one(
        {"_id": lesson_object_id, "course_id": course_id, "deleted_at": None},
        {"$set": changes},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài học.")
    doc = await db["course_lessons"].find_one({"_id": lesson_object_id})
    return await _lesson_read(doc)


async def delete_or_archive_lesson(db, course_id: str, lesson_id: str) -> bool:
    await get_course(db, course_id)
    lesson_object_id = _object_id(lesson_id)
    query = {"_id": lesson_object_id, "course_id": course_id, "deleted_at": None}
    if not await db["course_lessons"].find_one(query):
        raise HTTPException(status_code=404, detail="Không tìm thấy bài học.")
    if await db["course_lesson_progress"].count_documents({"lesson_id": lesson_id}):
        await db["course_lessons"].update_one(
            query, {"$set": {"status": "archived", "updated_at": _now()}}
        )
    else:
        await db["course_lessons"].delete_one(query)
    return True


async def list_enrollments(
    db, *, course_id: str | None = None, student_id: str | None = None
) -> list[EnrollmentRead]:
    query: dict = {}
    if course_id:
        await get_course(db, course_id)
        query["course_id"] = course_id
    if student_id:
        query["student_id"] = student_id
    cursor = db["course_enrollments"].find(query).sort("enrollment_date", -1)
    return [await _enrollment_read(db, doc) async for doc in cursor]


async def enroll_student(db, course_id: str, payload: EnrollmentCreate) -> EnrollmentRead:
    await get_course(db, course_id)
    student = await _user(db, payload.student_id)
    if not student or student.get("role") != "student":
        raise HTTPException(status_code=404, detail="Không tìm thấy tài khoản học sinh.")
    now = _now()
    doc = {
        "course_id": course_id,
        "student_id": payload.student_id,
        "status": "learning",
        "progress_pct": 0,
        "gpa_average": 0,
        "completed_lessons": 0,
        "enrollment_date": now,
        "last_activity_at": now,
    }
    try:
        result = await db["course_enrollments"].insert_one(doc)
    except DuplicateKeyError as exc:
        raise CourseConflict("Học sinh đã được ghi danh vào khóa học.") from exc
    doc["_id"] = result.inserted_id
    return await _enrollment_read(db, doc)


async def remove_enrollment(db, course_id: str | None, enrollment_id: str) -> bool:
    enrollment_object_id = _object_id(enrollment_id)
    query: dict = {"_id": enrollment_object_id}
    if course_id:
        query["course_id"] = course_id
    enrollment = await db["course_enrollments"].find_one(query)
    if not enrollment:
        raise HTTPException(status_code=404, detail="Không tìm thấy ghi danh.")
    if enrollment.get("progress_pct", 0) or enrollment.get("completed_lessons", 0):
        await db["course_enrollments"].update_one(query, {"$set": {"status": "cancelled"}})
    else:
        await db["course_enrollments"].delete_one(query)
    return True


async def get_course_statistics(db) -> CourseStatistics:
    active_query = {"status": "published", "deleted_at": None}
    teacher_ids = await db["courses"].distinct("teacher_ids", {"deleted_at": None})
    student_ids = await db["course_enrollments"].distinct("student_id", {"status": {"$ne": "cancelled"}})
    return CourseStatistics(
        total_courses=await db["courses"].count_documents({"deleted_at": None}),
        active_courses=await db["courses"].count_documents(active_query),
        total_teachers=len(teacher_ids),
        total_students=len(student_ids),
        total_enrollments=await db["course_enrollments"].count_documents({}),
        total_assignments=await db["course_assignments"].count_documents({"deleted_at": None}),
        total_submissions=await db["course_submissions"].count_documents({}),
        ai_graded_submissions=await db["course_submissions"].count_documents(
            {"ai_grading": {"$exists": True}}
        ),
    )
