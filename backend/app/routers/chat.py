from typing import List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.chat import ChatAskRequest, ChatMessageResponse
from app.services.chat_service import get_chat_history, ask_document_question

router = APIRouter()


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
