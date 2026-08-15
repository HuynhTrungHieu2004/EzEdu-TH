"""Source registry — đăng ký, duyệt, tra cứu nguồn tri thức chuẩn. Việc nạp
(ingest) thành chunk tìm kiếm được nằm ở `ingestion_service.py`."""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId
from fastapi import HTTPException, status

from app.core.concurrency import VersionConflict, compare_and_set, version_conflict_http_error
from app.curriculum_kb.constants.collections import CURRICULUM_SOURCES
from app.curriculum_kb.schemas.source import (
    CurriculumSourceCreate,
    CurriculumSourceResponse,
    is_valid_review_transition,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(doc: Dict[str, Any]) -> CurriculumSourceResponse:
    return CurriculumSourceResponse(
        id=str(doc["_id"]),
        title=doc["title"],
        content_text=doc["content_text"],
        subject_id=doc["subject_id"],
        grade=doc.get("grade"),
        topic_id=doc.get("topic_id"),
        curriculum_version=doc.get("curriculum_version"),
        citations=doc.get("citations", []),
        origin_type=doc["origin_type"],
        origin_id=doc.get("origin_id"),
        review_status=doc["review_status"],
        quality_status=doc["quality_status"],
        ingest_status=doc["ingest_status"],
        chunk_count=doc.get("chunk_count", 0),
        ingest_error=doc.get("ingest_error"),
        version=doc["version"],
        owner_id=doc["owner_id"],
        created_by=doc["created_by"],
        updated_by=doc["updated_by"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


async def create_source(db, payload: CurriculumSourceCreate, *, owner_id: str) -> CurriculumSourceResponse:
    now = _now()
    doc = {
        "title": payload.title,
        "content_text": payload.content_text,
        "subject_id": payload.subject_id,
        "grade": payload.grade,
        "topic_id": payload.topic_id,
        "curriculum_version": payload.curriculum_version,
        "citations": [c.model_dump() for c in payload.citations],
        "origin_type": "manual",
        "origin_id": None,
        "review_status": "draft",
        "quality_status": "unreviewed",
        "ingest_status": "not_ingested",
        "chunk_count": 0,
        "ingest_error": None,
        "version": 1,
        "owner_id": owner_id,
        "created_by": owner_id,
        "updated_by": owner_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[CURRICULUM_SOURCES].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


async def create_source_from_web_knowledge(db, web_source_id: str, *, actor_id: str, is_admin: bool) -> CurriculumSourceResponse:
    """Đưa 1 kết quả 'Khám phá kiến thức Internet' (Giai đoạn 6) đã duyệt
    (approved/published) vào kho tri thức chuẩn. Nguồn đã qua vòng duyệt bên
    đó rồi nên vào thẳng `approved` ở đây (không bắt duyệt lại từ đầu) —
    giáo viên chỉ cần bấm "Nạp vào kho" (`enqueue_ingestion`)."""
    from app.web_knowledge.services import source_service as web_knowledge_source_service

    web_source = await web_knowledge_source_service.load_owned_source(
        db, web_source_id, actor_id=actor_id, is_admin=is_admin
    )
    if web_source["status"] not in ("approved", "published"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ đưa vào kho tri thức chuẩn được khi học liệu Internet đã ở trạng thái 'approved' hoặc 'published'.",
        )

    now = _now()
    doc = {
        "title": web_source["query"],
        "content_text": web_source["answer"],
        "subject_id": web_source.get("subject_id") or "chua_phan_loai",
        "grade": web_source.get("grade"),
        "topic_id": web_source.get("topic_id"),
        "curriculum_version": None,
        "citations": web_source.get("citations", []),
        "origin_type": "web_knowledge",
        "origin_id": web_source_id,
        "review_status": "approved",
        "quality_status": "verified",
        "ingest_status": "not_ingested",
        "chunk_count": 0,
        "ingest_error": None,
        "version": 1,
        "owner_id": actor_id,
        "created_by": actor_id,
        "updated_by": actor_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[CURRICULUM_SOURCES].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


async def create_source_from_crawl(
    db, crawl_item_id: str, *, actor_id: str, is_admin: bool
) -> CurriculumSourceResponse:
    """Promote only a reviewed crawl item; raw crawler output never enters the KB."""
    from app.curriculum_kb.constants.collections import CRAWL_ITEMS

    if not ObjectId.is_valid(crawl_item_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy nội dung crawl.")
    item = await db[CRAWL_ITEMS].find_one({"_id": ObjectId(crawl_item_id)})
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy nội dung crawl.")
    if not is_admin and item["owner_id"] != actor_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền với nội dung này.")
    if item.get("review_status") != "approved" or item.get("quality_status") != "verified":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nội dung crawl phải được duyệt và xác minh trước khi đưa vào kho tri thức.",
        )
    existing = await db[CURRICULUM_SOURCES].find_one(
        {"origin_type": "web_crawl", "origin_id": crawl_item_id}
    )
    if existing is not None:
        return _to_response(existing)

    now = _now()
    doc = {
        "title": item.get("title") or item["canonical_url"],
        "content_text": item["content_text"],
        "subject_id": item["subject_id"],
        "grade": item.get("grade"),
        "topic_id": item.get("topic_id"),
        "curriculum_version": None,
        "citations": [{
            "title": item.get("title") or item["canonical_url"],
            "url": item["canonical_url"],
            "accessed_at": now.isoformat(),
        }],
        "origin_type": "web_crawl",
        "origin_id": crawl_item_id,
        "review_status": "approved",
        "quality_status": "verified",
        "ingest_status": "not_ingested",
        "chunk_count": 0,
        "ingest_error": None,
        "version": 1,
        "owner_id": item["owner_id"],
        "created_by": actor_id,
        "updated_by": actor_id,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[CURRICULUM_SOURCES].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


async def load_owned_source(db, source_id: str, *, actor_id: str, is_admin: bool) -> Dict[str, Any]:
    doc = await db[CURRICULUM_SOURCES].find_one({"_id": ObjectId(source_id)})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy nguồn tri thức.")
    if not is_admin and doc["owner_id"] != actor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bạn không có quyền với nguồn tri thức này.")
    return doc


async def review_source(
    db, source_id: str, *, version: int, target_status: str, actor_id: str, is_admin: bool
) -> CurriculumSourceResponse:
    existing = await load_owned_source(db, source_id, actor_id=actor_id, is_admin=is_admin)
    if not is_valid_review_transition(existing["review_status"], target_status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Không thể chuyển trạng thái từ '{existing['review_status']}' sang '{target_status}'.",
        )

    update_fields: Dict[str, Any] = {"review_status": target_status, "updated_by": actor_id, "updated_at": _now()}
    # Cùng quy ước với question_bank_service: duyệt xong (approved) coi như
    # đã kiểm chứng nội dung — tự chuyển quality_status, không cần bước riêng.
    if target_status == "approved":
        update_fields["quality_status"] = "verified"

    try:
        updated = await compare_and_set(
            db[CURRICULUM_SOURCES],
            filter_query={"_id": ObjectId(source_id)},
            expected_version=version,
            update={"$set": update_fields},
        )
    except VersionConflict:
        raise version_conflict_http_error()
    return _to_response(updated)


async def list_sources(
    db, *, owner_id: Optional[str], review_status: Optional[str] = None, skip: int = 0, limit: int = 50
) -> Tuple[List[CurriculumSourceResponse], int]:
    query: Dict[str, Any] = {}
    if owner_id is not None:
        query["owner_id"] = owner_id
    if review_status is not None:
        query["review_status"] = review_status
    total = await db[CURRICULUM_SOURCES].count_documents(query)
    cursor = db[CURRICULUM_SOURCES].find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = [_to_response(doc) async for doc in cursor]
    return items, total


async def list_published_sources(
    db, *, subject_id: Optional[str] = None, grade: Optional[int] = None, topic_id: Optional[str] = None, skip: int = 0, limit: int = 50
) -> Tuple[List[CurriculumSourceResponse], int]:
    """Duyệt kho tri thức đã xuất bản VÀ đã nạp xong — chỉ nội dung này mới
    hiển thị cho học sinh/giáo viên khác (không phải chủ sở hữu)."""
    query: Dict[str, Any] = {"review_status": "published", "ingest_status": "ingested"}
    if subject_id:
        query["subject_id"] = subject_id
    if grade:
        query["grade"] = grade
    if topic_id:
        query["topic_id"] = topic_id
    total = await db[CURRICULUM_SOURCES].count_documents(query)
    cursor = db[CURRICULUM_SOURCES].find(query).sort("created_at", -1).skip(skip).limit(limit)
    items = [_to_response(doc) async for doc in cursor]
    return items, total
