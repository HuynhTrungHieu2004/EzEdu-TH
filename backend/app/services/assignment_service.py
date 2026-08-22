from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ASCENDING, ReturnDocument

from app.schemas.assignments import (
    AIGradeResult,
    AssignmentCreate,
    AssignmentRead,
    AssignmentUpdate,
    SubmissionCreate,
    SubmissionRead,
    TeacherGrade,
)
from app.services.course_service import get_course


TRANSITIONS = {
    "submitted": {"ai_grading", "teacher_graded"},
    "ai_grading": {"ai_suggested", "grading_failed"},
    "ai_suggested": {"teacher_graded", "ai_grading"},
    "grading_failed": {"ai_grading", "teacher_graded"},
    "teacher_graded": set(),
}


class AIGradingError(Exception):
    pass


def transition_submission_status(current: str, target: str) -> None:
    if target not in TRANSITIONS.get(current, set()):
        raise ValueError(f"Chuyển trạng thái không hợp lệ: {current} -> {target}")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _object_id(value: str, resource: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail=f"Không tìm thấy {resource}.")
    return ObjectId(value)


async def ensure_assignment_indexes(db) -> None:
    await db["course_assignments"].create_index([("course_id", ASCENDING), ("status", ASCENDING)])
    await db["course_submissions"].create_index(
        [("assignment_id", ASCENDING), ("student_id", ASCENDING)], unique=True
    )


async def _assignment_read(db, doc: dict) -> AssignmentRead:
    course = await db["courses"].find_one({"_id": _object_id(doc["course_id"], "khóa học")}) or {}
    assignment_id = str(doc["_id"])
    return AssignmentRead(
        **{key: value for key, value in doc.items() if key != "_id"},
        id=assignment_id,
        course_title=course.get("title", ""),
        submitted_count=await db["course_submissions"].count_documents({"assignment_id": assignment_id}),
        total_students=await db["course_enrollments"].count_documents(
            {"course_id": doc["course_id"], "status": {"$ne": "cancelled"}}
        ),
    )


async def _submission_read(db, doc: dict) -> SubmissionRead:
    assignment = await db["course_assignments"].find_one(
        {"_id": _object_id(doc["assignment_id"], "bài tập")}
    ) or {}
    course = await db["courses"].find_one(
        {"_id": _object_id(doc["course_id"], "khóa học")}
    ) or {}
    student_id = doc["student_id"]
    student_query = {"_id": ObjectId(student_id)} if ObjectId.is_valid(student_id) else {"_id": student_id}
    student = await db["users"].find_one(student_query) or {}
    return SubmissionRead(
        **{key: value for key, value in doc.items() if key != "_id"},
        id=str(doc["_id"]),
        assignment_title=assignment.get("title", ""),
        course_title=course.get("title", ""),
        student_code=student.get("student_code", ""),
        student_name=student.get("full_name", ""),
    )


async def get_assignment(db, assignment_id: str) -> AssignmentRead:
    doc = await db["course_assignments"].find_one(
        {"_id": _object_id(assignment_id, "bài tập"), "deleted_at": None}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài tập.")
    return await _assignment_read(db, doc)


async def create_assignment(db, payload: AssignmentCreate, *, actor_id: str) -> AssignmentRead:
    await get_course(db, payload.course_id)
    now = _now()
    doc = {
        **payload.model_dump(),
        "title": payload.title.strip(),
        "created_by": actor_id,
        "created_at": now,
        "updated_at": None,
        "deleted_at": None,
    }
    result = await db["course_assignments"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _assignment_read(db, doc)


async def list_assignments(
    db,
    *,
    course_id: str | None = None,
    status_filter: str | None = None,
) -> list[AssignmentRead]:
    query: dict = {"deleted_at": None}
    if course_id:
        await get_course(db, course_id)
        query["course_id"] = course_id
    if status_filter:
        query["status"] = status_filter
    cursor = db["course_assignments"].find(query).sort("due_at", 1)
    return [await _assignment_read(db, doc) async for doc in cursor]


async def update_assignment(db, assignment_id: str, payload: AssignmentUpdate) -> AssignmentRead:
    object_id = _object_id(assignment_id, "bài tập")
    changes = payload.model_dump(exclude_unset=True, exclude_none=True)
    if "title" in changes:
        changes["title"] = changes["title"].strip()
    changes["updated_at"] = _now()
    result = await db["course_assignments"].update_one(
        {"_id": object_id, "deleted_at": None}, {"$set": changes}
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài tập.")
    return await get_assignment(db, assignment_id)


async def delete_or_archive_assignment(db, assignment_id: str) -> bool:
    assignment = await get_assignment(db, assignment_id)
    query = {"_id": ObjectId(assignment.id)}
    has_submissions = await db["course_submissions"].count_documents({"assignment_id": assignment.id})
    if assignment.status != "draft" or has_submissions:
        await db["course_assignments"].update_one(query, {"$set": {"status": "archived", "updated_at": _now()}})
    else:
        await db["course_assignments"].delete_one(query)
    return True


async def submit_assignment(
    db,
    assignment_id: str,
    payload: SubmissionCreate,
    *,
    student_id: str,
) -> SubmissionRead:
    assignment = await get_assignment(db, assignment_id)
    if assignment.status != "published":
        raise HTTPException(status_code=409, detail="Bài tập chưa được mở để nộp.")
    due_at = assignment.due_at
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)
    if due_at < _now():
        raise HTTPException(status_code=409, detail="Bài tập đã quá hạn nộp.")
    if not await db["course_enrollments"].count_documents({
        "course_id": assignment.course_id,
        "student_id": student_id,
        "status": {"$ne": "cancelled"},
    }):
        raise HTTPException(status_code=403, detail="Bạn chưa được ghi danh vào khóa học.")
    now = _now()
    doc = await db["course_submissions"].find_one_and_update(
        {"assignment_id": assignment_id, "student_id": student_id},
        {
            "$set": {
                "course_id": assignment.course_id,
                "content": payload.content.strip(),
                "attachment_ids": payload.attachment_ids,
                "submitted_at": now,
                "status": "submitted",
                "ai_grade": None,
                "teacher_score": None,
                "teacher_feedback": None,
                "graded_by": None,
                "graded_at": None,
                "final_score": None,
                "grading_error": None,
            },
            "$inc": {"revision_count": 1},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return await _submission_read(db, doc)


async def get_submission(db, submission_id: str) -> SubmissionRead:
    doc = await db["course_submissions"].find_one({"_id": _object_id(submission_id, "bài nộp")})
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài nộp.")
    return await _submission_read(db, doc)


async def list_submissions(
    db,
    *,
    assignment_id: str | None = None,
    student_id: str | None = None,
) -> list[SubmissionRead]:
    query: dict = {}
    if assignment_id:
        await get_assignment(db, assignment_id)
        query["assignment_id"] = assignment_id
    if student_id:
        query["student_id"] = student_id
    cursor = db["course_submissions"].find(query).sort("submitted_at", -1)
    return [await _submission_read(db, doc) async for doc in cursor]


async def teacher_grade_submission(
    db,
    submission_id: str,
    payload: TeacherGrade,
    *,
    teacher_id: str,
) -> SubmissionRead:
    submission = await get_submission(db, submission_id)
    assignment = await get_assignment(db, submission.assignment_id)
    if payload.score > assignment.max_score:
        raise HTTPException(status_code=422, detail="Điểm vượt quá điểm tối đa của bài tập.")
    transition_submission_status(submission.status, "teacher_graded")
    await db["course_submissions"].update_one(
        {"_id": ObjectId(submission_id)},
        {"$set": {
            "teacher_score": payload.score,
            "teacher_feedback": payload.feedback,
            "graded_by": teacher_id,
            "graded_at": _now(),
            "final_score": payload.score,
            "status": "teacher_graded",
        }},
    )
    return await get_submission(db, submission_id)


async def request_ai_grade(db, submission_id: str, *, generator=None) -> SubmissionRead:
    submission = await get_submission(db, submission_id)
    transition_submission_status(submission.status, "ai_grading")
    await db["course_submissions"].update_one(
        {"_id": ObjectId(submission_id)}, {"$set": {"status": "ai_grading", "grading_error": None}}
    )
    assignment = await get_assignment(db, submission.assignment_id)
    try:
        if generator is None:
            from app.services.llm_service import generate_json_with_failover

            generator = generate_json_with_failover
        prompt = (
            "Chấm bài và chỉ trả JSON gồm score, feedback, rubric. "
            f"Điểm tối đa: {assignment.max_score}. Bài làm: {submission.content}"
        )
        raw = await asyncio.to_thread(generator, prompt)
        result = AIGradeResult.model_validate_json(raw) if isinstance(raw, str) else AIGradeResult.model_validate(raw)
        if result.score > assignment.max_score:
            raise ValueError("Điểm AI vượt quá điểm tối đa")
    except Exception as exc:
        await db["course_submissions"].update_one(
            {"_id": ObjectId(submission_id)},
            {"$set": {"status": "grading_failed", "grading_error": str(exc)[:200], "final_score": None}},
        )
        raise AIGradingError("Không thể chấm AI. Vui lòng thử lại.") from exc
    await db["course_submissions"].update_one(
        {"_id": ObjectId(submission_id)},
        {"$set": {
            "status": "ai_suggested",
            "ai_grade": result.model_dump(),
            "final_score": result.score if assignment.auto_grade else None,
        }},
    )
    return await get_submission(db, submission_id)
