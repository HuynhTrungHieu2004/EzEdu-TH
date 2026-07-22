from typing import List, Optional, Tuple

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

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

    return document


@router.post("/ask", response_model=ChatMessageResponse, status_code=status.HTTP_200_OK)
async def ask_question_api(
    payload: ChatAskRequest,
    current_user: UserResponse = Depends(get_current_user),
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

    try:
        response = await ask_document_question(
            document_id=payload.document_id,
            user_id=current_user.id,
            question=payload.question,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Hệ thống hỏi đáp học liệu tạm thời gặp lỗi.",
        ) from exc

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
):
    """
    Advanced learning Q&A with document RAG context and Internet Search Grounding.
    """
    try:
        response = await ask_advanced_question(
            user_id=current_user.id,
            payload=payload
        )
        return AdvancedChatResponse(**response)
    except HTTPException as exc:
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
