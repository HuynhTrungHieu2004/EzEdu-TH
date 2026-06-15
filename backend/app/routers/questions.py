from typing import List
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.database.mongodb import get_database
from app.schemas.auth import UserResponse
from app.schemas.question import QuestionGenerateRequest, QuestionSetResponse
from app.routers.auth import get_current_user
from app.services.question_generation_service import generate_questions
from app.services.export_service import export_question_set_to_docx, export_question_set_to_pdf

router = APIRouter()

@router.post("/generate", response_model=QuestionSetResponse, status_code=status.HTTP_201_CREATED)
async def generate_questions_api(
    payload: QuestionGenerateRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Generate assessment questions using Gemini AI based on context chunks of a document owned by the user.
    """
    db = get_database()
    
    # 1. Enforce ownership check of original document
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

    # 2. Call generation service
    try:
        question_set = await generate_questions(
            document_id=payload.document_id,
            user_id=current_user.id,
            question_count=payload.question_count,
            difficulty=payload.difficulty,
            question_type=payload.question_type
        )
    except FileNotFoundError as fnf_err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(fnf_err))
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An error occurred during question generation: {str(e)}"
        )

    return QuestionSetResponse(
        id=str(question_set["_id"]),
        document_id=question_set["document_id"],
        user_id=question_set["user_id"],
        document_name=question_set.get("document_name", "Tài liệu không tên"),
        question_count=question_set["question_count"],
        difficulty=question_set["difficulty"],
        question_type=question_set["question_type"],
        questions=question_set["questions"],
        created_at=question_set["created_at"],
        updated_at=question_set["updated_at"]
    )

@router.get("/document/{document_id}", response_model=List[QuestionSetResponse])
async def get_questions_by_document(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    List all question sets generated from a specific document.
    """
    if not ObjectId.is_valid(document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )
        
    db = get_database()
    doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )
        
    if doc["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this document's questions."
        )

    question_sets = []
    cursor = db["question_sets"].find({"document_id": document_id, "user_id": current_user.id}).sort("created_at", -1)
    async for qs in cursor:
        question_sets.append(
            QuestionSetResponse(
                id=str(qs["_id"]),
                document_id=qs["document_id"],
                user_id=qs["user_id"],
                document_name=qs.get("document_name", "Tài liệu không tên"),
                question_count=qs["question_count"],
                difficulty=qs["difficulty"],
                question_type=qs["question_type"],
                questions=qs["questions"],
                created_at=qs["created_at"],
                updated_at=qs.get("updated_at", qs["created_at"])
            )
        )
    return question_sets

@router.get("/{question_set_id}", response_model=QuestionSetResponse)
async def get_question_set(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieve details of a single question set.
    """
    if not ObjectId.is_valid(question_set_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found."
        )
        
    db = get_database()
    qs = await db["question_sets"].find_one({"_id": ObjectId(question_set_id)})
    if not qs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found."
        )
        
    if qs["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this question set."
        )

    return QuestionSetResponse(
        id=str(qs["_id"]),
        document_id=qs["document_id"],
        user_id=qs["user_id"],
        document_name=qs.get("document_name", "Tài liệu không tên"),
        question_count=qs["question_count"],
        difficulty=qs["difficulty"],
        question_type=qs["question_type"],
        questions=qs["questions"],
        created_at=qs["created_at"],
        updated_at=qs.get("updated_at", qs["created_at"])
    )

@router.get("/{question_set_id}/export/docx")
async def export_docx_api(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Export question set to Microsoft Word (.docx) file download.
    """
    if not ObjectId.is_valid(question_set_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found."
        )
        
    db = get_database()
    qs = await db["question_sets"].find_one({"_id": ObjectId(question_set_id)})
    if not qs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found."
        )
        
    if qs["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this question set."
        )

    file_stream = export_question_set_to_docx(qs)
    filename = f"bo_cau_hoi_{question_set_id}.docx"
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/{question_set_id}/export/pdf")
async def export_pdf_api(
    question_set_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Export question set to PDF (.pdf) file download.
    """
    if not ObjectId.is_valid(question_set_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found."
        )
        
    db = get_database()
    qs = await db["question_sets"].find_one({"_id": ObjectId(question_set_id)})
    if not qs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question set not found."
        )
        
    if qs["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this question set."
        )

    file_stream = export_question_set_to_pdf(qs)
    filename = f"bo_cau_hoi_{question_set_id}.pdf"
    return StreamingResponse(
        file_stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
