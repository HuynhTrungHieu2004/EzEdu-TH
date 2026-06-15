from typing import List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.database.mongodb import get_database
from app.schemas.auth import UserResponse
from app.schemas.chat import ChatAskRequest, ChatAskResponse
from app.routers.auth import get_current_user
from app.services.chat_service import ask_document_question, get_chat_history

router = APIRouter()

@router.post("/ask", response_model=ChatAskResponse)
async def ask_question_api(
    payload: ChatAskRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Submit a user question about a specific document context, query relevant chunks via RAG, 
    generate an answer using Gemini, and log the interaction.
    """
    db = get_database()
    
    # Enforce document ownership boundary check
    if not ObjectId.is_valid(payload.document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )
        
    doc = await db["documents"].find_one({"_id": ObjectId(payload.document_id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )
        
    if doc["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this document."
        )

    try:
        response = await ask_document_question(
            document_id=payload.document_id,
            user_id=current_user.id,
            question=payload.question
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during Q&A processing: {str(e)}"
        )

    return ChatAskResponse(
        id=response["id"],
        question=response["question"],
        answer=response["answer"],
        sources=response["sources"],
        created_at=response["created_at"]
    )

@router.get("/history/{document_id}", response_model=List[ChatAskResponse])
async def get_history_api(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieve Q&A chat history logs for a specific document.
    """
    db = get_database()
    
    if not ObjectId.is_valid(document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )
        
    doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )
        
    if doc["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this document's Q&A history."
        )

    try:
        history = await get_chat_history(document_id=document_id, user_id=current_user.id)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load Q&A history: {str(e)}"
        )
        
    return [
        ChatAskResponse(
            id=item["id"],
            question=item["question"],
            answer=item["answer"],
            sources=item["sources"],
            created_at=item["created_at"]
        )
        for item in history
    ]
