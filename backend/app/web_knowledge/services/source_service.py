"""Lưu kết quả khám phá thành học liệu — cần giáo viên duyệt trước khi trở
thành "đã kiểm chứng, dùng lại được" (state machine draft→reviewing→approved
→published→archived, mirror `app/exam_bank/services/question_bank_service.py`).
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from fastapi import HTTPException, status

from app.core.concurrency import VersionConflict, compare_and_set, version_conflict_http_error
from app.web_knowledge.constants.collections import WEB_KNOWLEDGE_SOURCES
from app.web_knowledge.schemas.source import (
    SaveSourceRequest,
    SourceResponse,
    is_valid_source_transition,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(doc: Dict[str, Any]) -> SourceResponse:
    return SourceResponse(
        id=str(doc["_id"]),
        query=doc["query"],
        answer=doc["answer"],
        citations=doc.get("citations", []),
        subject_id=doc.get("subject_id"),
        grade=doc.get("grade"),
        topic_id=doc.get("topic_id"),
        status=doc["status"],
        version=doc["version"],
        owner_id=doc["owner_id"],
        created_by=doc["created_by"],
        updated_by=doc["updated_by"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


async def save_source(db, payload: SaveSourceRequest, *, owner_id: str) -> SourceResponse:
    now = _now()
    doc = {
        "query": payload.query,
        "answer": payload.answer,
        "citations": [c.model_dump() for c in payload.citations],
        "subject_id": payload.subject_id,
        "grade": payload.grade,
        "topic_id": payload.topic_id,
        "status": "draft",
        "version": 1,
        "owner_id": owner_id,
        "created_by": owner_id,
        "updated_by": owner_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[WEB_KNOWLEDGE_SOURCES].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


async def load_owned_source(db, source_id: str, *, actor_id: str, is_admin: bool) -> Dict[str, Any]:
    doc = await db[WEB_KNOWLEDGE_SOURCES].find_one({"_id": ObjectId(source_id)})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy học liệu.")
    if not is_admin and doc["owner_id"] != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với học liệu này.")
    return doc


async def review_source(
    db, source_id: str, *, version: int, target_status: str, actor_id: str, is_admin: bool
) -> SourceResponse:
    existing = await load_owned_source(db, source_id, actor_id=actor_id, is_admin=is_admin)
    if not is_valid_source_transition(existing["status"], target_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể chuyển trạng thái từ '{existing['status']}' sang '{target_status}'.",
        )
    try:
        updated = await compare_and_set(
            db[WEB_KNOWLEDGE_SOURCES],
            filter_query={"_id": ObjectId(source_id)},
            expected_version=version,
            update={"$set": {"status": target_status, "updated_by": actor_id, "updated_at": _now()}},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)


async def list_sources(
    db, *, owner_id: Optional[str], status_filter: Optional[str], skip: int = 0, limit: int = 50
) -> Tuple[List[SourceResponse], int]:
    query: Dict[str, Any] = {}
    if owner_id is not None:
        query["owner_id"] = owner_id
    if status_filter is not None:
        query["status"] = status_filter
    total = await db[WEB_KNOWLEDGE_SOURCES].count_documents(query)
    cursor = db[WEB_KNOWLEDGE_SOURCES].find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = [_to_response(doc) async for doc in cursor]
    return items, total
