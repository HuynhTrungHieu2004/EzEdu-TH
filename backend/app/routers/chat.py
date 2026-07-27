import time
from typing import List, Optional, Tuple

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.chat import (
    ChatAskRequest,
    ChatMessageResponse,
    AdvancedChatAskRequest,
    AdvancedChatResponse,
    ConversationListResponse,
    ConversationMessagesListResponse,
    ConversationResponse,
    ConversationUpdateRequest,
    MessageResponse
)
from app.schemas.feedback import FeedbackRequest, FeedbackResponse
from app.services.chat_service import get_chat_history, ask_document_question
from app.services.learning_chat_service import (
    ask_advanced_question,
    list_conversations,
    get_conversation_history,
    SlidingWindowLimiter,
    acquire_lock,
    release_lock
)
from app.services.feedback_service import submit_or_update_feedback, hydrate_messages_with_feedback
from app.services.activity_log_service import record_activity
from app.services.ai_quota_service import enforce_ai_quota
from app.services.system_settings_service import require_feature_enabled_flag

router = APIRouter()

feedback_rate_limiter = SlidingWindowLimiter(limit=30, window=60)
read_rate_limiter = SlidingWindowLimiter(limit=60, window=60)
mutation_rate_limiter = SlidingWindowLimiter(limit=30, window=60)


async def get_owned_document_or_404(document_id: str, current_user: UserResponse) -> dict:
    if not ObjectId.is_valid(document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    db = get_database()
    document = await db["documents"].find_one({"_id": ObjectId(document_id)})
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )

    if document["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this document.",
        )

    if document.get("quarantined_at") is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài liệu đang bị tạm khoá để kiểm duyệt.",
        )

    return document


@router.post("/ask", response_model=ChatMessageResponse, status_code=status.HTTP_200_OK)
async def ask_question_api(
    payload: ChatAskRequest,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    """
    Ask a question grounded only in the indexed content of one owned document.
    """
    document = await get_owned_document_or_404(payload.document_id, current_user)
    if document.get("status") != "indexed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bạn cần index tài liệu trước khi hỏi đáp.",
        )
    await enforce_ai_quota(
        user_id=current_user.id,
        role=current_user.role,
        feature="advanced_chat",
        resource_type="document",
        resource_id=payload.document_id,
        request=request,
        database=get_database(),
    )

    started = time.perf_counter()
    await record_activity(
        action="ai_chat_started",
        category="chat",
        status="started",
        user_id=current_user.id,
        resource_type="document",
        resource_id=payload.document_id,
        request=request,
        metadata={"mode": "document_chat"},
    )
    try:
        response = await ask_document_question(
            document_id=payload.document_id,
            user_id=current_user.id,
            question=payload.question,
        )
    except ValueError as exc:
        await record_activity(
            action="ai_chat_failed",
            category="chat",
            status="failure",
            user_id=current_user.id,
            resource_type="document",
            resource_id=payload.document_id,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="CHAT_INVALID_INPUT",
            metadata={"mode": "document_chat"},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        await record_activity(
            action="ai_chat_failed",
            category="chat",
            status="failure",
            user_id=current_user.id,
            resource_type="document",
            resource_id=payload.document_id,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="CHAT_FAILED",
            metadata={"mode": "document_chat"},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Hệ thống hỏi đáp học liệu tạm thời gặp lỗi.",
        ) from exc

    await record_activity(
        action="ai_chat_completed",
        category="chat",
        status="success",
        user_id=current_user.id,
        resource_type="chat_message",
        resource_id=str(response.get("id", "")),
        request=request,
        duration_ms=int((time.perf_counter() - started) * 1000),
        metadata={
            "mode": "document_chat",
            "document_id": payload.document_id,
            "source_chunk_count": len(response.get("source_chunks", [])),
        },
    )
    return ChatMessageResponse(**response)


@router.get("/history/{document_id}", response_model=List[ChatMessageResponse])
async def get_history_api(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Return Q&A history for one owned document.
    """
    await get_owned_document_or_404(document_id, current_user)

    try:
        history = await get_chat_history(document_id=document_id, user_id=current_user.id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Không thể tải lịch sử hỏi đáp lúc này.",
        ) from exc

    return [ChatMessageResponse(**item) for item in history]


@router.post("/ask-advanced", response_model=AdvancedChatResponse, status_code=status.HTTP_200_OK)
async def ask_advanced_question_api(
    payload: AdvancedChatAskRequest,
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    """
    Advanced learning Q&A with document RAG context and Internet Search Grounding.
    """
    await require_feature_enabled_flag("enable_advanced_chat", user_role=current_user.role, user_id=current_user.id)
    if payload.use_web_search:
        await require_feature_enabled_flag("enable_web_search", user_role=current_user.role, user_id=current_user.id)
    await enforce_ai_quota(
        user_id=current_user.id,
        role=current_user.role,
        feature="advanced_chat",
        resource_type="conversation",
        resource_id=payload.conversation_id,
        request=request,
        database=get_database(),
    )
    await record_activity(
        action="ai_chat_started",
        category="chat",
        status="started",
        user_id=current_user.id,
        resource_type="conversation",
        resource_id=payload.conversation_id,
        request=request,
        request_id=payload.request_id,
        metadata={
            "mode": "advanced_chat",
            "scope": payload.scope,
            "document_count": len(payload.document_ids or []),
            "use_web_search": payload.use_web_search,
        },
    )
    try:
        response = await ask_advanced_question(
            user_id=current_user.id,
            payload=payload
        )
        return AdvancedChatResponse(**response)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
            await record_activity(
                action="quota_exceeded",
                category="ai",
                status="failure",
                user_id=current_user.id,
                resource_type="advanced_chat",
                request=request,
                request_id=payload.request_id,
                error_code="CHAT_RATE_LIMIT",
                metadata={"mode": "advanced_chat", "limit_type": "per_minute"},
            )
        raise exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hệ thống hỏi đáp học liệu tạm thời gặp lỗi: {str(exc)}"
        )


@router.get("/conversations", response_model=ConversationListResponse, status_code=status.HTTP_200_OK)
async def list_conversations_api(
    search: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = 20,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    List conversation threads with Vietnamese normalized contains-search and signed cursor pagination.
    """
    await read_rate_limiter.check_rate_limit(current_user.id)
    try:
        convs, next_cursor, has_more = await list_conversations(
            user_id=current_user.id,
            search=search,
            cursor=cursor,
            limit=limit
        )
        return ConversationListResponse(
            conversations=[ConversationResponse(**c) for c in convs],
            next_cursor=next_cursor,
            has_more=has_more
        )
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể lấy danh sách trò chuyện: {str(exc)}"
        )


@router.get("/conversations/{conversation_id}/messages", response_model=ConversationMessagesListResponse, status_code=status.HTTP_200_OK)
async def get_conversation_history_api(
    conversation_id: str,
    cursor: Optional[str] = None,
    limit: int = 20,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Get message history for a specific conversation thread using cursor pagination.
    """
    if not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc trò chuyện.")
        
    await read_rate_limiter.check_rate_limit(current_user.id)
    try:
        messages, next_cursor, has_more = await get_conversation_history(
            user_id=current_user.id,
            conversation_id=conversation_id,
            cursor=cursor,
            limit=limit
        )
        hydrated_messages = await hydrate_messages_with_feedback(
            user_id=current_user.id,
            messages=messages
        )
        return ConversationMessagesListResponse(
            messages=[MessageResponse(**m) for m in hydrated_messages],
            next_cursor=next_cursor,
            has_more=has_more
        )
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Không thể tải lịch sử tin nhắn: {str(exc)}"
        )


@router.patch("/conversations/{conversation_id}", response_model=ConversationResponse, status_code=status.HTTP_200_OK)
async def patch_conversation_api(
    conversation_id: str,
    payload: ConversationUpdateRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Update a conversation's title and/or pin status.
    """
    if not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc trò chuyện.")

    await mutation_rate_limiter.check_rate_limit(current_user.id)
    db = get_database()

    # Query using 404 Unified Security Policy
    conv = await db["conversations"].find_one({
        "_id": ObjectId(conversation_id),
        "user_id": current_user.id,
        "deleted_at": None
    })
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc trò chuyện.")

    update_fields = {}
    changes = payload.model_dump(exclude_unset=True)

    if "title" in changes and changes["title"] is not None:
        new_title = changes["title"].strip()
        from app.utils.normalization import normalize_title
        update_fields["title"] = new_title
        update_fields["normalized_title"] = normalize_title(new_title)

    if "is_pinned" in changes and changes["is_pinned"] is not None:
        new_pinned = changes["is_pinned"]
        old_pinned = conv.get("is_pinned", False)
        update_fields["is_pinned"] = new_pinned
        if new_pinned:
            if not old_pinned:
                from datetime import datetime, timezone
                update_fields["pinned_at"] = datetime.now(timezone.utc)
            # If already pinned (True -> True), do not update pinned_at to keep order
        else:
            update_fields["pinned_at"] = None

    if not update_fields:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Yêu cầu không có thay đổi hợp lệ.")

    # Atomic conditional update
    res = await db["conversations"].find_one_and_update(
        {"_id": ObjectId(conversation_id), "user_id": current_user.id, "deleted_at": None},
        {"$set": update_fields},
        return_document=True
    )
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc trò chuyện.")

    return ConversationResponse(
        id=str(res["_id"]),
        title=res.get("title", "Trò chuyện"),
        scope=res.get("scope", "general"),
        document_ids=res.get("document_ids", []),
        is_pinned=res.get("is_pinned", False),
        pinned_at=res.get("pinned_at"),
        created_at=res["created_at"],
        updated_at=res["updated_at"]
    )


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_200_OK)
async def delete_conversation_api(
    conversation_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Soft-delete a conversation thread. Checks active chat locks first.
    """
    if not ObjectId.is_valid(conversation_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy cuộc trò chuyện.")

    await mutation_rate_limiter.check_rate_limit(current_user.id)
    db = get_database()

    # Acquire conversation lock to prevent race conditions
    lock_token = await acquire_lock(ObjectId(conversation_id), "delete", lease_seconds=60)
    if not lock_token:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Hội thoại đang bận xử lý câu hỏi khác.")

    try:
        # Re-check ownership and soft-delete state inside the lock
        conv = await db["conversations"].find_one({
            "_id": ObjectId(conversation_id),
            "user_id": current_user.id,
            "deleted_at": None
        })
        if not conv:
            raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện.")

        from datetime import datetime, timezone
        await db["conversations"].update_one(
            {"_id": ObjectId(conversation_id), "user_id": current_user.id, "deleted_at": None},
            {"$set": {
                "deleted_at": datetime.now(timezone.utc),
                "is_pinned": False,
                "pinned_at": None
            }}
        )
        return {"status": "success", "message": "Hội thoại đã được xóa thành công."}

    finally:
        await release_lock(ObjectId(conversation_id), lock_token)


@router.put("/messages/{message_id}/feedback", response_model=FeedbackResponse, status_code=status.HTTP_200_OK)
async def submit_message_feedback_api(
    message_id: str,
    payload: FeedbackRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Submit or update feedback for an assistant message.
    """
    # Rate limit check
    await feedback_rate_limiter.check_rate_limit(current_user.id)

    try:
        feedback_doc = await submit_or_update_feedback(
            message_id=message_id,
            user_id=current_user.id,
            payload=payload
        )
        return FeedbackResponse(**feedback_doc)
    except HTTPException as exc:
        raise exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi lưu phản hồi: {str(exc)}"
        )
