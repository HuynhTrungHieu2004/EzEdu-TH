import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import aiofiles
import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status, BackgroundTasks
from pydantic import BaseModel, Field

from app.core.config import settings
from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.schemas.document import (
    DocumentContentResponse,
    DocumentExtractResponse,
    DocumentResponse,
    DocumentUploadResponse,
)
from app.services.cloudinary_service import delete_file_from_cloudinary, upload_file_to_cloudinary
from app.services.document_parser import extract_text
from app.services.rag_service import add_document_chunks, search_relevant_chunks
from app.services.text_chunking_service import split_text_into_chunks
from app.services.llm_service import transcribe_video

router = APIRouter()
BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BACKEND_DIR / "uploads"

DOCUMENT_EXTENSIONS = {"pdf", "docx", "pptx"}
VIDEO_EXTENSIONS = {"mp4", "mov", "webm", "mkv"}
ALLOWED_EXTENSIONS = DOCUMENT_EXTENSIONS | VIDEO_EXTENSIONS
MAX_DOCUMENT_SIZE = 20 * 1024 * 1024  # 20MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB
CONTENT_PREVIEW_LENGTH = 1000
DOWNLOAD_TIMEOUT_SECONDS = 60.0
ALREADY_EXTRACTED_STATUSES = {"processed", "transcribed", "indexed"}


class SearchRequest(BaseModel):
    query: str
    n_results: int = Field(5, ge=1, le=20)


class SearchResultItem(BaseModel):
    id: str
    text: str
    metadata: dict
    distance: float


class ChunkResponse(BaseModel):
    id: str
    document_id: str
    chunk_index: int
    content: str
    text_preview: Optional[str] = None
    created_at: Optional[datetime] = None


class DocumentProcessingError(Exception):
    def __init__(self, message: str, http_status: int):
        super().__init__(message)
        self.message = message
        self.http_status = http_status


def cleanup_temp_file(file_path: Path) -> None:
    if file_path.exists():
        os.remove(file_path)


def build_temp_file_path(filename: str) -> Path:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return UPLOAD_DIR / f"{uuid.uuid4()}_{Path(filename).name}"


def ensure_valid_document_id(document_id: str) -> ObjectId:
    if not ObjectId.is_valid(document_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return ObjectId(document_id)


def serialize_document(document: dict) -> DocumentResponse:
    return DocumentResponse(
        id=str(document["_id"]),
        user_id=document["user_id"],
        original_filename=document["original_filename"],
        file_type=document["file_type"],
        file_size=document["file_size"],
        cloudinary_url=document.get("cloudinary_url", ""),
        cloudinary_public_id=document.get("cloudinary_public_id", ""),
        cloudinary_resource_type=document.get("cloudinary_resource_type", "raw"),
        media_kind=document.get("media_kind", "document"),
        status=document.get("status", "uploaded"),
        error_message=document.get("error_message"),
        created_at=document["created_at"],
        updated_at=document["updated_at"],
    )


def build_content_response(
    document: dict,
    content_doc: dict,
    include_full_text: bool,
) -> DocumentContentResponse:
    extracted_text = content_doc.get("extracted_text", "")
    preview = extracted_text[:CONTENT_PREVIEW_LENGTH]
    document_id = str(document["_id"])
    original_filename = document.get("original_filename", "")

    return DocumentContentResponse(
        document_id=document_id,
        original_filename=original_filename,
        filename=original_filename,
        file_type=document.get("file_type", ""),
        status=document.get("status", "uploaded"),
        preview=preview,
        extracted_text=extracted_text if include_full_text else None,
        text_length=content_doc.get("text_length", len(extracted_text)),
    )


def build_extract_response(
    document: dict,
    message: str,
    text_length: Optional[int],
) -> DocumentExtractResponse:
    return DocumentExtractResponse(
        document_id=str(document["_id"]),
        original_filename=document.get("original_filename", ""),
        file_type=document.get("file_type", ""),
        status=document.get("status", "uploaded"),
        message=message,
        text_length=text_length,
        error_message=document.get("error_message"),
        updated_at=document["updated_at"],
    )


async def get_owned_document(document_id: str, current_user: UserResponse) -> dict:
    object_id = ensure_valid_document_id(document_id)
    db = get_database()
    document = await db["documents"].find_one({"_id": object_id})

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


async def update_document_status(
    document: dict,
    *,
    status_value: str,
    error_message: Optional[str] = None,
) -> None:
    now = datetime.now(timezone.utc)
    db = get_database()
    await db["documents"].update_one(
        {"_id": document["_id"]},
        {
            "$set": {
                "status": status_value,
                "error_message": error_message,
                "updated_at": now,
            }
        },
    )
    document["status"] = status_value
    document["error_message"] = error_message
    document["updated_at"] = now


async def save_document_content(
    document: dict,
    extracted_text: str,
    *,
    status_value: str = "processed",
) -> dict:
    now = datetime.now(timezone.utc)
    document_id = str(document["_id"])
    text_length = len(extracted_text)
    db = get_database()

    await db["document_contents"].update_one(
        {"document_id": document_id},
        {
            "$set": {
                "user_id": document["user_id"],
                "extracted_text": extracted_text,
                "text_length": text_length,
                "updated_at": now,
            },
            "$setOnInsert": {
                "document_id": document_id,
                "created_at": now,
            },
        },
        upsert=True,
    )

    await update_document_status(document, status_value=status_value, error_message=None)
    return await db["document_contents"].find_one({"document_id": document_id})


async def download_document_to_tempfile(cloudinary_url: str, destination: Path) -> None:
    if cloudinary_url.startswith("local://") or os.path.exists(cloudinary_url.replace("local://", "")):
        import shutil
        local_path = cloudinary_url.replace("local://", "")
        if os.path.exists(local_path):
            try:
                shutil.copy(local_path, destination)
                return
            except Exception as exc:
                raise DocumentProcessingError(
                    f"Failed to copy local file: {str(exc)}",
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                ) from exc
        
        filename = os.path.basename(local_path)
        possible_path = UPLOAD_DIR / filename
        if possible_path.exists():
            try:
                shutil.copy(possible_path, destination)
                return
            except Exception as exc:
                raise DocumentProcessingError(
                    f"Failed to copy local file from uploads: {str(exc)}",
                    status.HTTP_500_INTERNAL_SERVER_ERROR,
                ) from exc

        raise DocumentProcessingError(
            f"Local file does not exist: {local_path}",
            status.HTTP_404_NOT_FOUND,
        )

    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=DOWNLOAD_TIMEOUT_SECONDS,
        ) as client:
            async with client.stream("GET", cloudinary_url) as response:
                response.raise_for_status()
                async with aiofiles.open(destination, "wb") as output_file:
                    async for chunk in response.aiter_bytes():
                        if chunk:
                            await output_file.write(chunk)
    except httpx.HTTPStatusError as exc:
        raise DocumentProcessingError(
            f"Could not download file from Cloudinary (HTTP {exc.response.status_code}).",
            status.HTTP_502_BAD_GATEWAY,
        ) from exc
    except httpx.HTTPError as exc:
        raise DocumentProcessingError(
            "Could not download file from Cloudinary.",
            status.HTTP_502_BAD_GATEWAY,
        ) from exc


async def extract_and_store_document_content(document: dict, file_path: Path) -> dict:
    try:
        extracted_text = extract_text(str(file_path), document["file_type"])
    except FileNotFoundError as exc:
        raise DocumentProcessingError(
            "Could not find the file to extract text.",
            status.HTTP_404_NOT_FOUND,
        ) from exc
    except ValueError as exc:
        raise DocumentProcessingError(
            str(exc),
            status.HTTP_400_BAD_REQUEST,
        ) from exc
    except Exception as exc:  # pragma: no cover - defensive catch for unexpected parser errors
        raise DocumentProcessingError(
            f"Could not read the {document['file_type'].upper()} file.",
            status.HTTP_400_BAD_REQUEST,
        ) from exc

    try:
        return await save_document_content(document, extracted_text)
    except Exception as exc:
        raise DocumentProcessingError(
            "Failed to save extracted text to the database.",
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        ) from exc


async def fail_document_processing(document: dict, error_message: str) -> None:
    short_error_message = error_message.strip()[:300]
    now = datetime.now(timezone.utc)
    document["status"] = "failed"
    document["error_message"] = short_error_message
    document["updated_at"] = now
    try:
        db = get_database()
        await db["documents"].update_one(
            {"_id": document["_id"]},
            {
                "$set": {
                    "status": "failed",
                    "error_message": short_error_message,
                    "updated_at": now,
                }
            },
        )
    except Exception:
        pass


async def fail_document_indexing(document: dict, error_message: str) -> None:
    short_error_message = error_message.strip()[:300]
    now = datetime.now(timezone.utc)
    document["status"] = "index_failed"
    document["error_message"] = short_error_message
    document["updated_at"] = now
    try:
        db = get_database()
        await db["documents"].update_one(
            {"_id": document["_id"]},
            {
                "$set": {
                    "status": "index_failed",
                    "error_message": short_error_message,
                    "updated_at": now,
                }
            },
        )
    except Exception:
        pass


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Upload a learning material (document or video), store metadata, and extract text if it is a document.
    """
    filename = Path(file.filename or "unnamed_file").name
    file_ext = filename.split(".")[-1].lower() if "." in filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only PDF, DOCX, PPTX, MP4, MOV, WEBM, MKV files are allowed. Got type: {file_ext}",
        )

    if file_ext in DOCUMENT_EXTENSIONS:
        media_kind = "document"
        max_size = MAX_DOCUMENT_SIZE
        resource_type = "auto"
    else:
        media_kind = "video"
        max_size = MAX_VIDEO_SIZE
        resource_type = "video"

    temp_file_path = build_temp_file_path(filename)
    file_size = 0

    try:
        async with aiofiles.open(temp_file_path, "wb") as output_file:
            while chunk := await file.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > max_size:
                    if media_kind == "video":
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Video vượt quá giới hạn 100MB. Cần dùng upload_large/chunk upload ở phiên bản sau.",
                        )
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="File size exceeds the limit of 20MB.",
                        )
                await output_file.write(chunk)
    except HTTPException:
        cleanup_temp_file(temp_file_path)
        raise
    except Exception as exc:
        cleanup_temp_file(temp_file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save temporary file locally: {str(exc)}",
        ) from exc

    db = get_database()
    now = datetime.now(timezone.utc)
    document_id = ObjectId()
    content_doc = None
    metadata_saved = False

    document_metadata = {
        "_id": document_id,
        "user_id": current_user.id,
        "original_filename": filename,
        "file_type": file_ext,
        "file_size": file_size,
        "cloudinary_url": "",
        "cloudinary_public_id": "",
        "cloudinary_resource_type": resource_type,
        "media_kind": media_kind,
        "status": "uploaded",
        "error_message": None,
        "created_at": now,
        "updated_at": now,
    }

    try:
        try:
            upload_result = upload_file_to_cloudinary(str(temp_file_path), folder="documents", resource_type=resource_type)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=str(exc),
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to upload file to Cloudinary: {str(exc)}",
            ) from exc

        document_metadata["cloudinary_url"] = upload_result.get("secure_url", "")
        document_metadata["cloudinary_public_id"] = upload_result.get("public_id", "")
        document_metadata["cloudinary_resource_type"] = upload_result.get("resource_type", resource_type)

        await db["documents"].insert_one(document_metadata)
        metadata_saved = True

        if media_kind == "document":
            try:
                content_doc = await extract_and_store_document_content(document_metadata, temp_file_path)
            except DocumentProcessingError as exc:
                await fail_document_processing(document_metadata, exc.message)
    except HTTPException:
        cloudinary_public_id = document_metadata.get("cloudinary_public_id")
        if cloudinary_public_id and not metadata_saved:
            try:
                delete_file_from_cloudinary(cloudinary_public_id)
            except Exception:
                pass
        raise
    except Exception as exc:
        cloudinary_public_id = document_metadata.get("cloudinary_public_id")
        if cloudinary_public_id and not metadata_saved:
            try:
                delete_file_from_cloudinary(cloudinary_public_id)
            except Exception:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save document metadata to database: {str(exc)}",
        ) from exc
    finally:
        cleanup_temp_file(temp_file_path)

    return DocumentUploadResponse(
        document_id=str(document_id),
        user_id=document_metadata["user_id"],
        original_filename=document_metadata["original_filename"],
        file_type=document_metadata["file_type"],
        file_size=document_metadata["file_size"],
        cloudinary_url=document_metadata["cloudinary_url"],
        cloudinary_public_id=document_metadata["cloudinary_public_id"],
        cloudinary_resource_type=document_metadata["cloudinary_resource_type"],
        media_kind=document_metadata["media_kind"],
        status=document_metadata["status"],
        error_message=document_metadata.get("error_message"),
        text_length=content_doc.get("text_length") if content_doc else None,
        created_at=document_metadata["created_at"],
        updated_at=document_metadata["updated_at"],
    )


@router.get("", response_model=List[DocumentResponse])
async def list_documents(current_user: UserResponse = Depends(get_current_user)):
    """
    List all documents belonging to the current authenticated user.
    """
    db = get_database()
    documents = []

    try:
        cursor = db["documents"].find({"user_id": current_user.id}).sort("created_at", -1)
        async for document in cursor:
            documents.append(serialize_document(document))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch documents: {str(exc)}",
        ) from exc

    return documents


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Retrieve metadata of a document owned by the authenticated user.
    """
    document = await get_owned_document(document_id, current_user)
    return serialize_document(document)


@router.post("/{document_id}/extract", response_model=DocumentExtractResponse, status_code=status.HTTP_200_OK)
async def extract_document_content(
    document_id: str,
    force: bool = Query(False, description="Set true to re-extract text even if it is already processed."),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Download the uploaded file from Cloudinary when needed and extract text for the owner.
    """
    document = await get_owned_document(document_id, current_user)
    if document.get("media_kind") == "video":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video files must use the transcription endpoint instead of text extraction.",
        )
    db = get_database()

    existing_content = await db["document_contents"].find_one({"document_id": document_id})
    if (
        document.get("status") in ALREADY_EXTRACTED_STATUSES
        and existing_content
        and existing_content.get("extracted_text")
        and not force
    ):
        return build_extract_response(
            document,
            message="Document text has already been extracted.",
            text_length=existing_content.get("text_length"),
        )

    cloudinary_url = document.get("cloudinary_url")
    if not cloudinary_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cloudinary URL is missing for this document.",
        )

    temp_file_path = build_temp_file_path(document["original_filename"])

    try:
        await download_document_to_tempfile(cloudinary_url, temp_file_path)
        content_doc = await extract_and_store_document_content(document, temp_file_path)
    except DocumentProcessingError as exc:
        await fail_document_processing(document, exc.message)
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc
    finally:
        cleanup_temp_file(temp_file_path)

    return build_extract_response(
        document,
        message="Document text extracted successfully.",
        text_length=content_doc.get("text_length"),
    )


@router.get("/{document_id}/content", response_model=DocumentContentResponse)
async def get_document_content(
    document_id: str,
    full_text: bool = Query(False, description="Set true to include the full extracted text."),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Retrieve extracted content for a document. Returns preview by default to avoid huge payloads.
    """
    document = await get_owned_document(document_id, current_user)
    db = get_database()
    content_doc = await db["document_contents"].find_one({"document_id": document_id})

    if not content_doc or not content_doc.get("extracted_text"):
        if document.get("status") == "failed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=document.get("error_message") or "Text extraction failed for this document.",
            )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extracted content not found for this document.",
        )

    return build_content_response(document, content_doc, include_full_text=full_text)


@router.post("/{document_id}/index", status_code=status.HTTP_200_OK)
async def index_document_api(
    document_id: str,
    force: bool = Query(False, description="Set true to rebuild chunks and ChromaDB vectors even if already indexed."),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Split extracted text into chunks, index them into vector storage, and mark the document as indexed.
    """
    document = await get_owned_document(document_id, current_user)
    db = get_database()
    content_doc = await db["document_contents"].find_one({"document_id": document_id})

    if document.get("status") == "indexed" and not force:
        existing_chunks = await db["document_chunks"].count_documents({"document_id": document_id, "user_id": current_user.id})
        return {
            "status": "indexed",
            "message": "Document is already indexed.",
            "chunk_count": existing_chunks,
        }

    if not content_doc or not content_doc.get("extracted_text"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No extracted text found for this document. Please upload first or ensure parsing succeeded.",
        )

    raw_text = content_doc["extracted_text"]
    chunks = split_text_into_chunks(raw_text)
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No text chunks could be generated from this document.",
        )

    try:
        await add_document_chunks(document_id, current_user.id, chunks)
    except Exception as exc:
        await fail_document_indexing(document, "Failed to index chunks into ChromaDB.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to index this document into ChromaDB.",
        ) from exc

    await update_document_status(document, status_value="indexed", error_message=None)

    return {
        "status": "indexed",
        "message": f"Successfully split and indexed {len(chunks)} chunks.",
        "chunk_count": len(chunks),
    }


@router.get("/{document_id}/chunks", response_model=List[ChunkResponse])
async def get_document_chunks(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Retrieve raw text chunks stored in the database for the given document.
    """
    await get_owned_document(document_id, current_user)
    db = get_database()

    chunks = []
    cursor = db["document_chunks"].find({"document_id": document_id}).sort("chunk_index", 1)
    async for chunk in cursor:
        chunks.append(
            ChunkResponse(
                id=str(chunk["_id"]),
                document_id=chunk["document_id"],
                chunk_index=chunk["chunk_index"],
                content=chunk["content"],
                text_preview=chunk.get("text_preview"),
                created_at=chunk.get("created_at"),
            )
        )
    return chunks


@router.post("/{document_id}/search", response_model=List[SearchResultItem])
async def search_document_chunks(
    document_id: str,
    payload: SearchRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Search relevant semantic chunks within the target document using vector similarity.
    """
    await get_owned_document(document_id, current_user)

    try:
        results = await search_relevant_chunks(
            document_id=document_id,
            user_id=current_user.id,
            query=payload.query,
            n_results=payload.n_results,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Semantic search is temporarily unavailable.",
        ) from exc

    return [
        SearchResultItem(
            id=item["id"],
            text=item["text"],
            metadata=item["metadata"],
            distance=item["distance"],
        )
        for item in results
    ]


async def run_video_transcription_task(document: dict, user_id: str):
    import logging
    logger = logging.getLogger("app.routers.documents")
    cloudinary_url = document.get("cloudinary_url")
    if not cloudinary_url:
        await fail_document_processing(document, "Cloudinary URL is missing for this video.")
        return
        
    temp_file_path = build_temp_file_path(document["original_filename"])
    
    try:
        # 1. Download video
        logger.info(f"Downloading video from {cloudinary_url} for transcription...")
        await download_document_to_tempfile(cloudinary_url, temp_file_path)
        
        # 2. Call Gemini transcribe
        logger.info(f"Sending video file {temp_file_path} to Gemini for transcription...")
        transcript = transcribe_video(str(temp_file_path))
        
        # 3. Save transcript to MongoDB
        logger.info("Saving transcript to MongoDB...")
        await save_document_content(document, transcript, status_value="transcribed")
        logger.info(f"Video transcription completed successfully for document {document['_id']}.")
    except Exception as exc:
        logger.error(f"Error in run_video_transcription_task: {exc}")
        await fail_document_processing(document, f"Video transcription failed: {str(exc)}")
    finally:
        cleanup_temp_file(temp_file_path)


@router.post("/{document_id}/transcribe", status_code=status.HTTP_202_ACCEPTED)
async def transcribe_video_api(
    document_id: str,
    background_tasks: BackgroundTasks,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Start transcription for a video document in the background.
    """
    document = await get_owned_document(document_id, current_user)
    
    if document.get("media_kind") != "video":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only video documents can be transcribed.",
        )
        
    if not settings.GEMINI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chưa cấu hình dịch vụ transcription cho video.",
        )

    if document.get("status") in {"transcribed", "indexed"}:
        return {
            "status": document.get("status"),
            "message": "Video transcript is already available.",
        }
        
    if document.get("status") == "transcribing":
        return {
            "status": "transcribing",
            "message": "Video transcription is already in progress.",
        }

    # Update status to transcribing
    await update_document_status(document, status_value="transcribing", error_message=None)
    
    # Launch background task
    background_tasks.add_task(
        run_video_transcription_task,
        document=document,
        user_id=current_user.id
    )
    
    return {
        "status": "transcribing",
        "message": "Video transcription has been started in the background.",
    }


@router.get("/{document_id}/transcript", response_model=DocumentContentResponse)
async def get_video_transcript(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Retrieve the transcript of a video document.
    """
    document = await get_owned_document(document_id, current_user)
    
    if document.get("media_kind") != "video":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only video documents have transcripts.",
        )
        
    db = get_database()
    content_doc = await db["document_contents"].find_one({"document_id": document_id})
    
    if not content_doc or not content_doc.get("extracted_text"):
        if document.get("status") == "failed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=document.get("error_message") or "Video transcription failed.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transcript not found. Please transcribe the video first.",
        )
        
    return build_content_response(document, content_doc, include_full_text=True)
