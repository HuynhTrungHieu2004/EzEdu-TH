import os
import uuid
import aiofiles
from pathlib import Path
from datetime import datetime, timezone
from typing import List
from bson import ObjectId

from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from pydantic import BaseModel, Field

from app.database.mongodb import get_database
from app.schemas.auth import UserResponse
from app.schemas.document import DocumentResponse
from app.routers.auth import get_current_user
from app.services.cloudinary_service import upload_file_to_cloudinary
from app.services.document_parser import extract_text
from app.services.text_chunking_service import split_text_into_chunks
from app.services.rag_service import add_document_chunks, search_relevant_chunks

router = APIRouter()

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_EXTENSIONS = {"pdf", "docx", "pptx"}

class SearchRequest(BaseModel):
    query: str
    n_results: int = Field(5, ge=1, le=20)

class SearchResultItem(BaseModel):
    id: str
    text: str
    metadata: dict
    distance: float

class DocumentContentResponse(BaseModel):
    document_id: str
    filename: str
    extracted_text: str

class ChunkResponse(BaseModel):
    id: str
    document_id: str
    chunk_index: int
    content: str

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Upload a document (PDF, DOCX, PPTX) up to 20MB.
    Uploads to Cloudinary, extracts text contents, and updates status.
    """
    # 1. Validate file extension
    filename = file.filename or "unnamed_file"
    file_ext = filename.split(".")[-1].lower() if "." in filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only PDF, DOCX, and PPTX files are allowed. Got type: {file_ext}"
        )

    # 2. Setup local uploads folder
    upload_dir = Path("uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    temp_filename = f"{uuid.uuid4()}_{filename}"
    temp_file_path = upload_dir / temp_filename

    # 3. Save file locally while verifying maximum size
    file_size = 0
    try:
        async with aiofiles.open(temp_file_path, "wb") as out_file:
            while chunk := await file.read(1024 * 1024):  # Read in 1MB chunks
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="File size exceeds the limit of 20MB."
                    )
                await out_file.write(chunk)
    except HTTPException:
        if temp_file_path.exists():
            os.remove(temp_file_path)
        raise
    except Exception as e:
        if temp_file_path.exists():
            os.remove(temp_file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save temporary file locally: {str(e)}"
        )

    # 4. Upload to Cloudinary
    try:
        upload_result = upload_file_to_cloudinary(str(temp_file_path), folder="documents")
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(val_err)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to upload file to Cloudinary: {str(e)}"
        )

    # 5. Extract text content & cleanup local temp file
    db = get_database()
    now = datetime.now(timezone.utc)
    document_id = str(ObjectId())  # Pre-generate document ID
    
    extracted_text = ""
    status_str = "uploaded"
    
    try:
        extracted_text = extract_text(str(temp_file_path), file_ext)
        status_str = "processed"
        
        # Save extracted text to MongoDB document_contents
        content_metadata = {
            "document_id": document_id,
            "user_id": current_user.id,
            "extracted_text": extracted_text,
            "created_at": now
        }
        await db["document_contents"].insert_one(content_metadata)
    except Exception as extract_err:
        status_str = "failed"
        print(f"Extraction failed for document: {extract_err}")
    finally:
        # Clean up temporary file locally in any case
        if temp_file_path.exists():
            os.remove(temp_file_path)

    # 6. Save metadata to MongoDB
    document_metadata = {
        "_id": ObjectId(document_id),
        "user_id": current_user.id,
        "original_filename": filename,
        "file_type": file_ext,
        "file_size": file_size,
        "cloudinary_url": upload_result["secure_url"],
        "cloudinary_public_id": upload_result["public_id"],
        "status": status_str,
        "created_at": now,
        "updated_at": now
    }

    try:
        await db["documents"].insert_one(document_metadata)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save document metadata to database: {str(e)}"
        )

    return DocumentResponse(
        id=document_id,
        user_id=document_metadata["user_id"],
        original_filename=document_metadata["original_filename"],
        file_type=document_metadata["file_type"],
        file_size=document_metadata["file_size"],
        cloudinary_url=document_metadata["cloudinary_url"],
        cloudinary_public_id=document_metadata["cloudinary_public_id"],
        status=document_metadata["status"],
        created_at=document_metadata["created_at"],
        updated_at=document_metadata["updated_at"]
    )

@router.get("", response_model=List[DocumentResponse])
async def list_documents(current_user: UserResponse = Depends(get_current_user)):
    """
    List all documents belonging to the current authenticated user.
    """
    db = get_database()
    documents = []
    
    try:
        cursor = db["documents"].find({"user_id": current_user.id})
        async for doc in cursor:
            documents.append(
                DocumentResponse(
                    id=str(doc["_id"]),
                    user_id=doc["user_id"],
                    original_filename=doc["original_filename"],
                    file_type=doc["file_type"],
                    file_size=doc["file_size"],
                    cloudinary_url=doc["cloudinary_url"],
                    cloudinary_public_id=doc["cloudinary_public_id"],
                    status=doc.get("status", "uploaded"),
                    created_at=doc["created_at"],
                    updated_at=doc["updated_at"]
                )
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch documents: {str(e)}"
        )

    return documents

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieve details of a single document metadata if the authenticated user is the owner.
    """
    if not ObjectId.is_valid(document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )

    db = get_database()
    try:
        doc = await db["documents"].find_one({"_id": ObjectId(document_id)})
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve document: {str(e)}"
        )

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

    return DocumentResponse(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        original_filename=doc["original_filename"],
        file_type=doc["file_type"],
        file_size=doc["file_size"],
        cloudinary_url=doc["cloudinary_url"],
        cloudinary_public_id=doc["cloudinary_public_id"],
        status=doc.get("status", "uploaded"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"]
    )

@router.get("/{document_id}/content", response_model=DocumentContentResponse)
async def get_document_content(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieve full extracted text of a document. Enforces ownership check.
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
            detail="You do not have permission to access this document."
        )

    content_doc = await db["document_contents"].find_one({"document_id": document_id})
    if not content_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extracted content not found or parsing failed for this document."
        )

    return DocumentContentResponse(
        document_id=document_id,
        filename=doc.get("original_filename", ""),
        extracted_text=content_doc.get("extracted_text", "")
    )

@router.post("/{document_id}/index", status_code=status.HTTP_200_OK)
async def index_document_api(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Splits the extracted document text into chunks, indexes them into vector storage and MongoDB,
    and transitions the document state to "indexed".
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
            detail="You do not have permission to access this document."
        )

    content_doc = await db["document_contents"].find_one({"document_id": document_id})
    if not content_doc or not content_doc.get("extracted_text"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No extracted text found for this document. Please upload first or ensure parsing succeeded."
        )

    # 1. Clean and split text into chunks
    raw_text = content_doc["extracted_text"]
    chunks = split_text_into_chunks(raw_text)
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No text chunks could be generated from this document."
        )

    # 2. Add chunks to vector database storage
    try:
        await add_document_chunks(document_id, current_user.id, chunks)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add document chunks to index: {str(e)}"
        )

    # 3. Transition document status metadata
    await db["documents"].update_one(
        {"_id": ObjectId(document_id)},
        {
            "$set": {
                "status": "indexed",
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )

    return {
        "status": "indexed",
        "message": f"Successfully split and indexed {len(chunks)} chunks.",
        "chunk_count": len(chunks)
    }

@router.get("/{document_id}/chunks", response_model=List[ChunkResponse])
async def get_document_chunks(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieve list of raw chunks stored in database for the given document.
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
            detail="You do not have permission to access this document."
        )

    chunks = []
    cursor = db["document_chunks"].find({"document_id": document_id}).sort("chunk_index", 1)
    async for chunk in cursor:
        chunks.append(
            ChunkResponse(
                id=str(chunk["_id"]),
                document_id=chunk["document_id"],
                chunk_index=chunk["chunk_index"],
                content=chunk["content"]
            )
        )
    return chunks

@router.post("/{document_id}/search", response_model=List[SearchResultItem])
async def search_document_chunks(
    document_id: str,
    payload: SearchRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Search relevant semantic chunks within the target document using cosine vector similarity.
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
            detail="You do not have permission to access this document."
        )

    try:
        results = await search_relevant_chunks(
            document_id=document_id,
            user_id=current_user.id,
            query=payload.query,
            n_results=payload.n_results
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic RAG search failed: {str(e)}"
        )

    return [
        SearchResultItem(
            id=item["id"],
            text=item["text"],
            metadata=item["metadata"],
            distance=item["distance"]
        )
        for item in results
    ]
