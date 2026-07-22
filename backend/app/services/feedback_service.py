import logging
import urllib.parse
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from bson import ObjectId
from fastapi import HTTPException, status
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.database.mongodb import get_database
from app.schemas.feedback import FeedbackRequest

logger = logging.getLogger(__name__)

def _get_domain_from_url(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.netloc or "unknown"
    except Exception:
        return "unknown"

def _is_valid_web_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False

async def verify_message_ownership_or_raise(message_id: str, user_id: str) -> Dict[str, Any]:
    """
    Ownership Validation Chain:
    1. Check if message_id is a valid ObjectId.
    2. Check if message exists.
    3. Check if message role is assistant.
    4. Check if conversation exists.
    5. Check if conversation belongs to the user.
    Uses unified HTTP 403 / 404 policies.
    """
    if not ObjectId.is_valid(message_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy câu trả lời."
        )

    db = get_database()
    msg = await db["conversation_messages"].find_one({"_id": ObjectId(message_id)})
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy câu trả lời."
        )

    if msg.get("role") != "assistant":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ có câu trả lời trợ lý mới có thể được đánh giá."
        )

    conv_id = msg.get("conversation_id")
    if not conv_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cuộc hội thoại liên quan."
        )

    conv = await db["conversations"].find_one({"_id": ObjectId(conv_id), "deleted_at": None})
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy cuộc hội thoại liên quan."
        )

    if conv.get("user_id") != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn không có quyền truy cập hội thoại này."
        )

    return msg

async def submit_or_update_feedback(
    message_id: str,
    user_id: str,
    payload: FeedbackRequest
) -> Dict[str, Any]:
    """
    Verify ownership, validate citations, generate secure snapshots,
    and perform atomic upsert with concurrency retry logic.
    """
    db = get_database()
    msg = await verify_message_ownership_or_raise(message_id, user_id)
    conversation_id = msg["conversation_id"]

    # 1. Parse and validate reported citations from the message citations
    internal_citations = msg.get("internal_citations") or []
    web_citations = msg.get("web_citations") or []

    # Map actual citations by source_id
    internal_map = {c.get("source_id"): c for c in internal_citations if c.get("source_id")}
    web_map = {w.get("source_id"): w for w in web_citations if w.get("source_id")}

    reported_citations_snapshots = []
    for source_id in payload.reported_citation_ids:
        if source_id in internal_map:
            c = internal_map[source_id]
            reported_citations_snapshots.append({
                "source_id": source_id,
                "source_type": "internal",
                "document_id": c.get("document_id"),
                "chunk_id": c.get("chunk_id"),
                "document_title": c.get("document_title", "Tài liệu")
            })
        elif source_id in web_map:
            w = web_map[source_id]
            url = w.get("url", "")
            if not _is_valid_web_url(url):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Nguồn trích dẫn web '{source_id}' có URL không hợp lệ."
                )
            reported_citations_snapshots.append({
                "source_id": source_id,
                "source_type": "web",
                "url": url,
                "domain": _get_domain_from_url(url),
                "title": w.get("title", "Nguồn Internet")
            })
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Trích dẫn nguồn '{source_id}' không tồn tại trong câu trả lời."
            )

    # 2. Prepare Atomic Upsert fields
    query = {
        "user_id": user_id,
        "message_id": ObjectId(message_id)
    }

    update = {
        "$setOnInsert": {
            "user_id": user_id,
            "message_id": ObjectId(message_id),
            "conversation_id": ObjectId(conversation_id),
            "created_at": datetime.now(timezone.utc)
        },
        "$set": {
            "rating": payload.rating,
            "reason_codes": payload.reason_codes,
            "comment": payload.comment,
            "reported_citation_ids": payload.reported_citation_ids,
            "reported_citations": reported_citations_snapshots,
            "retrieval_mode": msg.get("retrieval_mode"),
            "evidence_status": msg.get("evidence_status"),
            "model_name": msg.get("model_name"),
            "confidence": msg.get("confidence"),
            "internal_citation_count": len(internal_citations),
            "web_citation_count": len(web_citations),
            "updated_at": datetime.now(timezone.utc)
        }
    }

    # 3. Exec upsert with DuplicateKeyError retry
    retries = 3
    for attempt in range(retries):
        try:
            doc = await db["ai_answer_feedback"].find_one_and_update(
                query,
                update,
                upsert=True,
                return_document=ReturnDocument.AFTER
            )
            # Map MongoDB fields to response keys
            doc["id"] = str(doc["_id"])
            doc["message_id"] = str(doc["message_id"])
            return doc
        except DuplicateKeyError as e:
            if attempt == retries - 1:
                logger.error(f"DuplicateKeyError on concurrent upsert: {e}")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Có xung đột khi ghi nhận phản hồi. Vui lòng thử lại."
                ) from e
            # Retry without upsert=True if record now exists
            continue

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Không thể lưu phản hồi do lỗi hệ thống."
    )

async def hydrate_messages_with_feedback(
    user_id: str,
    messages: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Query feedbacks by message_id $in query for active messages.
    Ensures message list hydration is completed in O(1) query complexity.
    """
    if not messages:
        return []

    # Get valid ObjectIds for assistant messages
    msg_ids = []
    msg_map = {}
    for m in messages:
        if m.get("role") == "assistant" and ObjectId.is_valid(m["id"]):
            oid = ObjectId(m["id"])
            msg_ids.append(oid)
            msg_map[str(oid)] = m
        # Default user_feedback to None
        m["user_feedback"] = None

    if not msg_ids:
        return messages

    db = get_database()
    feedbacks = await db["ai_answer_feedback"].find({
        "message_id": {"$in": msg_ids},
        "user_id": user_id
    }).to_list(length=len(msg_ids))

    for fb in feedbacks:
        mid_str = str(fb["message_id"])
        if mid_str in msg_map:
            msg_map[mid_str]["user_feedback"] = {
                "id": str(fb["_id"]),
                "message_id": mid_str,
                "rating": fb.get("rating"),
                "reason_codes": fb.get("reason_codes", []),
                "comment": fb.get("comment"),
                "reported_citation_ids": fb.get("reported_citation_ids", []),
                "created_at": fb.get("created_at"),
                "updated_at": fb.get("updated_at")
            }

    return messages
