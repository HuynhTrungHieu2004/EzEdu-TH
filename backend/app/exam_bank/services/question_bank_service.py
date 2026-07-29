from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.core.concurrency import VersionConflict, compare_and_set, version_conflict_http_error
from app.exam_bank.constants.collections import QUESTIONS
from app.exam_bank.schemas.question import (
    QuestionBankCreate,
    QuestionBankImportItem,
    QuestionBankResponse,
    QuestionBankUpdate,
    is_valid_bank_transition,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(doc: dict) -> QuestionBankResponse:
    return QuestionBankResponse(
        id=str(doc["_id"]),
        subject_id=doc["subject_id"],
        grade=doc["grade"],
        curriculum_version=doc["curriculum_version"],
        chapter_id=doc.get("chapter_id"),
        topic_id=doc.get("topic_id"),
        learning_outcome_id=doc.get("learning_outcome_id"),
        bloom_level=doc["bloom_level"],
        difficulty=doc["difficulty"],
        question_type=doc["question_type"],
        content=doc["content"],
        options=doc.get("options"),
        correct_answer=doc["correct_answer"],
        explanation=doc["explanation"],
        points=doc["points"],
        expected_time_seconds=doc["expected_time_seconds"],
        source_document_id=doc.get("source_document_id"),
        source_chunk_ids=doc.get("source_chunk_ids", []),
        citation=doc.get("citation"),
        quality_status=doc.get("quality_status", "unreviewed"),
        origin_question_set_id=doc.get("origin_question_set_id"),
        origin_question_index=doc.get("origin_question_index"),
        tags=doc.get("tags", []),
        usage_count=doc.get("usage_count", 0),
        last_used_at=doc.get("last_used_at"),
        status=doc["status"],
        version=doc["version"],
        owner_id=doc["owner_id"],
        created_by=doc["created_by"],
        updated_by=doc["updated_by"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
        deleted_at=doc.get("deleted_at"),
    )


def _base_document(payload: QuestionBankCreate, *, owner_id: str) -> dict:
    now = _now()
    return {
        "subject_id": payload.subject_id,
        "grade": payload.grade,
        "curriculum_version": payload.curriculum_version,
        "chapter_id": payload.chapter_id,
        "topic_id": payload.topic_id,
        "learning_outcome_id": payload.learning_outcome_id,
        "bloom_level": payload.bloom_level,
        "difficulty": payload.difficulty,
        "question_type": payload.question_type,
        "content": payload.content,
        "options": payload.options,
        "correct_answer": payload.correct_answer,
        "explanation": payload.explanation,
        "points": payload.points,
        "expected_time_seconds": payload.expected_time_seconds,
        "source_document_id": getattr(payload, "source_document_id", None),
        "source_chunk_ids": getattr(payload, "source_chunk_ids", []),
        "citation": getattr(payload, "citation", None),
        "quality_status": "unreviewed",
        "origin_question_set_id": getattr(payload, "origin_question_set_id", None),
        "origin_question_index": getattr(payload, "origin_question_index", None),
        "tags": payload.tags,
        "usage_count": 0,
        "last_used_at": None,
        "status": "draft",
        "version": 1,
        "owner_id": owner_id,
        "created_by": owner_id,
        "updated_by": owner_id,
        "created_at": now,
        "updated_at": now,
        "deleted_at": None,
    }


async def create_question(db, payload: QuestionBankCreate, *, owner_id: str) -> QuestionBankResponse:
    doc = _base_document(payload, owner_id=owner_id)
    result = await db[QUESTIONS].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


async def import_questions(
    db, items: List[QuestionBankImportItem], *, owner_id: str
) -> List[QuestionBankResponse]:
    docs = [_base_document(item, owner_id=owner_id) for item in items]
    result = await db[QUESTIONS].insert_many(docs)
    for doc, inserted_id in zip(docs, result.inserted_ids):
        doc["_id"] = inserted_id
    return [_to_response(doc) for doc in docs]


async def _load_owned_question(db, question_id: str, *, actor_id: str, is_admin: bool) -> dict:
    doc = await db[QUESTIONS].find_one({"_id": ObjectId(question_id), "deleted_at": None})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy câu hỏi.")
    if not is_admin and doc["owner_id"] != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với câu hỏi này.")
    return doc


async def get_question(db, question_id: str, *, actor_id: str, is_admin: bool) -> QuestionBankResponse:
    doc = await _load_owned_question(db, question_id, actor_id=actor_id, is_admin=is_admin)
    return _to_response(doc)


async def list_questions(
    db,
    *,
    owner_id: Optional[str],
    subject_id: Optional[str] = None,
    grade: Optional[int] = None,
    chapter_id: Optional[str] = None,
    topic_id: Optional[str] = None,
    bloom_level: Optional[str] = None,
    difficulty: Optional[str] = None,
    question_type: Optional[str] = None,
    status_filter: Optional[str] = None,
    tag: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[List[QuestionBankResponse], int]:
    query: Dict[str, Any] = {"deleted_at": None}
    if owner_id is not None:
        query["owner_id"] = owner_id
    for field_name, value in (
        ("subject_id", subject_id),
        ("grade", grade),
        ("chapter_id", chapter_id),
        ("topic_id", topic_id),
        ("bloom_level", bloom_level),
        ("difficulty", difficulty),
        ("question_type", question_type),
        ("status", status_filter),
    ):
        if value is not None:
            query[field_name] = value
    if tag:
        query["tags"] = tag

    total = await db[QUESTIONS].count_documents(query)
    cursor = db[QUESTIONS].find(query).sort("updated_at", -1).skip(skip).limit(limit)
    items = [_to_response(doc) async for doc in cursor]
    return items, total


async def update_question(
    db, question_id: str, payload: QuestionBankUpdate, *, actor_id: str, is_admin: bool
) -> QuestionBankResponse:
    existing = await _load_owned_question(db, question_id, actor_id=actor_id, is_admin=is_admin)

    update_fields = payload.model_dump(exclude={"version"}, exclude_none=True)
    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không có trường nào để cập nhật.")

    update_fields["updated_by"] = actor_id
    update_fields["updated_at"] = _now()
    # Sửa câu đã approved/published thì quay lại draft — theo đúng hành vi đã
    # có ở question_sets.questions[] hiện tại (giữ nhất quán trải nghiệm giáo
    # viên giữa 2 nơi).
    if existing["status"] in ("approved", "published"):
        update_fields["status"] = "draft"

    try:
        updated = await compare_and_set(
            db[QUESTIONS],
            filter_query={"_id": ObjectId(question_id)},
            expected_version=payload.version,
            update={"$set": update_fields},
        )
    except VersionConflict:
        raise version_conflict_http_error()

    return _to_response(updated)


async def review_question(
    db, question_id: str, *, target_status: str, version: int, actor_id: str, is_admin: bool
) -> QuestionBankResponse:
    existing = await _load_owned_question(db, question_id, actor_id=actor_id, is_admin=is_admin)

    if not is_valid_bank_transition(existing["status"], target_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể chuyển trạng thái từ '{existing['status']}' sang '{target_status}'.",
        )

    update: Dict[str, Any] = {"status": target_status, "updated_by": actor_id, "updated_at": _now()}
    if target_status == "approved":
        update["quality_status"] = "verified"

    try:
        updated = await compare_and_set(
            db[QUESTIONS],
            filter_query={"_id": ObjectId(question_id)},
            expected_version=version,
            update={"$set": update},
        )
    except VersionConflict:
        raise version_conflict_http_error()

    return _to_response(updated)


async def bulk_update_status(
    db, question_ids: List[str], *, target_status: str, actor_id: str, is_admin: bool
) -> int:
    """Duyệt/lưu trữ hàng loạt. Bỏ qua (không lỗi) câu không thuộc quyền của
    actor hoặc không ở trạng thái cho phép chuyển — trả về số câu ĐÃ đổi.
    """
    object_ids = [ObjectId(qid) for qid in question_ids]
    query: Dict[str, Any] = {"_id": {"$in": object_ids}, "deleted_at": None}
    if not is_admin:
        query["owner_id"] = actor_id

    changed = 0
    async for doc in db[QUESTIONS].find(query):
        if not is_valid_bank_transition(doc["status"], target_status):
            continue
        result = await db[QUESTIONS].update_one(
            {"_id": doc["_id"], "version": doc["version"]},
            {
                "$set": {"status": target_status, "updated_by": actor_id, "updated_at": _now()},
                "$inc": {"version": 1},
            },
        )
        changed += result.modified_count

    return changed
