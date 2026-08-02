"""Lịch sử học liệu + đề thi của giảng viên — gộp 2 collection hiện có
(`documents`, `exams`) thành 1 danh sách sort theo created_at, kèm thống kê
lượt làm bài. Không dùng event-log tập trung (xem
docs/superpowers/specs/2026-08-02-history-feature-design.md) — merge trực
tiếp ở đây vì cả hai nguồn đã có sẵn field owner/deleted_at cần thiết."""

from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Query

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse

router = APIRouter()

ContentType = Literal["all", "document", "exam"]


async def _document_items(db, *, user_id: str, search: Optional[str]) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"user_id": user_id, "deleted_at": None}
    if search:
        query["original_filename"] = {"$regex": search, "$options": "i"}
    items = []
    async for doc in db["documents"].find(query):
        items.append({
            "id": str(doc["_id"]),
            "item_type": "document",
            "title": doc["original_filename"],
            "created_at": doc["created_at"],
            "cloudinary_url": doc.get("cloudinary_url"),
            "blueprint_id": None,
        })
    return items


async def _exam_items(db, *, owner_id: str, search: Optional[str]) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"owner_id": owner_id, "deleted_at": None}
    if search:
        query["code"] = {"$regex": search, "$options": "i"}
    items = []
    async for doc in db["exams"].find(query):
        items.append({
            "id": str(doc["_id"]),
            "item_type": "exam",
            "title": f"Đề {doc['code']}",
            "created_at": doc["created_at"],
            "cloudinary_url": None,
            "blueprint_id": doc.get("blueprint_id"),
            "allow_retake": doc.get("allow_retake", False),
            "version": doc.get("version", 1),
        })
    return items


async def _attach_stats(db, items: List[Dict[str, Any]]) -> None:
    exam_ids = [item["id"] for item in items if item["item_type"] == "exam"]
    if not exam_ids:
        return
    try:
        cursor = db["exam_attempts"].aggregate([
            {"$match": {"exam_id": {"$in": exam_ids}, "status": {"$in": ["submitted", "graded"]}}},
            {"$group": {
                "_id": "$exam_id",
                "attempt_count": {"$sum": 1},
                "avg_score": {"$avg": "$total_score"},
                "last_attempt_at": {"$max": "$created_at"},
            }},
        ])
        stats_by_exam_id = {doc["_id"]: doc async for doc in cursor}
    except Exception:  # noqa: BLE001 - thống kê là phụ, lỗi không được làm hỏng danh sách chính
        stats_by_exam_id = {}

    for item in items:
        if item["item_type"] != "exam":
            continue
        stats = stats_by_exam_id.get(item["id"])
        item["attempt_count"] = stats["attempt_count"] if stats else None
        item["avg_score"] = round(stats["avg_score"], 2) if stats else None
        item["last_attempt_at"] = stats["last_attempt_at"] if stats else None


@router.get("/content-history")
async def get_content_history(
    type: ContentType = Query("all"),
    search: Optional[str] = Query(None, max_length=200),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(get_current_user),
):
    db = get_database()
    items: List[Dict[str, Any]] = []
    if type in ("all", "document"):
        items.extend(await _document_items(db, user_id=current_user.id, search=search))
    if type in ("all", "exam"):
        items.extend(await _exam_items(db, owner_id=current_user.id, search=search))

    items.sort(key=lambda item: item["created_at"], reverse=True)
    total = len(items)
    page = items[skip : skip + limit]
    await _attach_stats(db, page)
    for item in page:
        item.setdefault("attempt_count", None)
        item.setdefault("avg_score", None)
        item.setdefault("last_attempt_at", None)
        item.setdefault("allow_retake", None)
        item.setdefault("version", None)

    return {"items": page, "total": total, "skip": skip, "limit": limit}
