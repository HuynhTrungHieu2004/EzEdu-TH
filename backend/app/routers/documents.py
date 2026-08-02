import asyncio
import hashlib
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import aiofiles
import httpx
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status, BackgroundTasks
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
from app.services.cloudinary_service import (
    InvalidWebhookSignature,
    enqueue_cloudinary_cleanup,
    handle_cloudinary_webhook,
    upload_file_to_cloudinary,
)
from app.services.document_mutation_service import (
    MUTATION_TOKEN_FIELD,
    acquire_document_mutation_lock,
    finalize_document_mutation,
    mutation_owner_filter,
)
from app.services.document_parser import extract_text
from app.services.rag_service import add_document_chunks, search_relevant_chunks
from app.services.text_chunking_service import split_text_into_chunks
from app.services.llm_service import transcribe_video
from app.services.activity_log_service import record_activity
from app.services.admin_audit_service import record_admin_audit, require_reason
from app.services.ai_quota_service import enforce_ai_quota
from app.services.system_settings_service import get_setting_value, require_feature_enabled_flag

router = APIRouter()
BACKEND_DIR = Path(__file__).resolve().parents[2]
UPLOAD_DIR = BACKEND_DIR / "uploads"

DOCUMENT_EXTENSIONS = {"pdf", "docx", "pptx"}
VIDEO_EXTENSIONS = {"mp4", "mov", "webm", "mkv"}
ALLOWED_EXTENSIONS = DOCUMENT_EXTENSIONS | VIDEO_EXTENSIONS
MAX_DOCUMENT_SIZE = 20 * 1024 * 1024  # 20MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB
CONTENT_PREVIEW_LENGTH = 1000


def ensure_lecturer_or_admin(current_user: UserResponse) -> None:
    if getattr(current_user, "role", "user") not in {"lecturer", "admin", "super_admin", "user"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ giảng viên mới được quản lý học liệu.",
        )
DOWNLOAD_TIMEOUT_SECONDS = 60.0
ALREADY_EXTRACTED_STATUSES = {"processed", "transcribed", "indexed"}
BUSY_DOCUMENT_STATUSES = {"extracting", "indexing", "transcribing", "deleting"}
INDEXABLE_DOCUMENT_STATUSES = {"processed", "transcribed", "indexed", "index_failed"}


def _is_admin_actor(current_user: UserResponse) -> bool:
    return getattr(current_user, "role", "user") in {"admin", "super_admin"}


def _audit_document_snapshot(document: dict) -> dict:
    return {
        "id": str(document.get("_id")),
        "user_id": document.get("user_id"),
        "original_filename": document.get("original_filename"),
        "file_type": document.get("file_type"),
        "file_size": document.get("file_size"),
        "media_kind": document.get("media_kind"),
        "status": document.get("status"),
        "error_message": document.get("error_message"),
        "updated_at": document.get("updated_at"),
    }


class SearchRequest(BaseModel):
    query: str
    n_results: int = Field(5, ge=1, le=20)


class ReasonRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


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
    ext = Path(filename).suffix  # e.g. ".mp4", ".pdf"
    return UPLOAD_DIR / f"{uuid.uuid4()}{ext}"


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
        checksum=document.get("checksum"),
        reuse_count=document.get("reuse_count", 0),
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


def ensure_not_quarantined(document: dict) -> None:
    """Block further processing (extract/index/transcribe/chat/question-generation)
    of a document an admin has quarantined for review. Viewing/deleting one's own
    quarantined document is still allowed — only re-use of its content is blocked."""
    if document.get("quarantined_at") is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài liệu đang bị tạm khoá để kiểm duyệt.",
        )


async def get_owned_document(document_id: str, current_user: UserResponse) -> dict:
    object_id = ensure_valid_document_id(document_id)
    db = get_database()
    document = await db["documents"].find_one({"_id": object_id, "deleted_at": None})

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
    mutation_token: Optional[str] = None,
    mutation_status: str = "extracting",
) -> dict:
    now = datetime.now(timezone.utc)
    document_id = str(document["_id"])
    text_length = len(extracted_text)
    db = get_database()

    if mutation_token:
        owner = await db["documents"].find_one(
            mutation_owner_filter(
                document_id,
                document["user_id"],
                mutation_token,
                status=mutation_status,
            ),
            {"_id": 1},
        )
        if not owner:
            raise RuntimeError("Document mutation lock is no longer owned.")

    content_update = {
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
    }
    if mutation_token:
        content_update["$set"].update(
            {
                "content_revision": mutation_token,
                "verification_reindex_pending": False,
            }
        )
        content_update["$unset"] = {
            "applied_verification_issue_ids": "",
            "verification_reindexed_at": "",
        }

    await db["document_contents"].update_one(
        {"document_id": document_id, "user_id": document["user_id"]},
        content_update,
        upsert=True,
    )

    if not mutation_token:
        await update_document_status(
            document,
            status_value=status_value,
            error_message=None,
        )
    return await db["document_contents"].find_one(
        {"document_id": document_id, "user_id": document["user_id"]}
    )


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


async def extract_and_store_document_content(
    document: dict,
    file_path: Path,
    *,
    mutation_token: Optional[str] = None,
) -> dict:
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
        return await save_document_content(
            document,
            extracted_text,
            mutation_token=mutation_token,
        )
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


@router.post("/webhooks/cloudinary", include_in_schema=False)
async def cloudinary_webhook(request: Request):
    """Nhận notification từ Cloudinary (ví dụ: xử lý eager transformation
    xong, kiểm duyệt nội dung). Xác thực bằng chữ ký HMAC của Cloudinary
    (header `X-Cld-Timestamp`/`X-Cld-Signature`) — KHÔNG dùng JWT người dùng
    vì Cloudinary gọi thẳng, không qua trình duyệt. Idempotent theo
    `notification_type+public_id+timestamp` (xem `handle_cloudinary_webhook`)
    — Cloudinary có thể gửi lại cùng notification nếu không nhận 2xx kịp thời.
    """
    body = await request.body()
    timestamp = request.headers.get("X-Cld-Timestamp")
    signature = request.headers.get("X-Cld-Signature")
    if not timestamp or not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Thiếu header xác thực Cloudinary.")

    db = get_database()
    try:
        return await handle_cloudinary_webhook(db, body=body, timestamp=timestamp, signature=signature)
    except InvalidWebhookSignature as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc


@router.post("/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user),
    request: Request = None,
):
    """
    Upload a learning material (document or video), store metadata, and extract text if it is a document.
    """
    ensure_lecturer_or_admin(current_user)
    filename = Path(file.filename or "unnamed_file").name
    file_ext = filename.split(".")[-1].lower() if "." in filename else ""
    allowed_file_types = set(await get_setting_value("allowed_file_types", sorted(ALLOWED_EXTENSIONS)))
    if file_ext not in allowed_file_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng file không được phép: {file_ext}",
        )

    if file_ext in DOCUMENT_EXTENSIONS:
        media_kind = "document"
        max_file_size_mb = int(await get_setting_value("max_file_size_mb", MAX_DOCUMENT_SIZE // (1024 * 1024)))
        max_size = max_file_size_mb * 1024 * 1024
        resource_type = "auto"
    else:
        if not bool(await get_setting_value("enable_video_upload", True)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Upload video đang bị tắt.")
        await require_feature_enabled_flag("enable_video_upload", user_role=current_user.role, user_id=current_user.id)
        media_kind = "video"
        max_size = MAX_VIDEO_SIZE
        resource_type = "video"

    temp_file_path = build_temp_file_path(filename)
    file_size = 0
    hasher = hashlib.sha256()

    try:
        async with aiofiles.open(temp_file_path, "wb") as output_file:
            while chunk := await file.read(1024 * 1024):
                file_size += len(chunk)
                hasher.update(chunk)
                if file_size > max_size:
                    if media_kind == "video":
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Video vượt quá giới hạn 100MB. Cần dùng upload_large/chunk upload ở phiên bản sau.",
                        )
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"File vượt quá giới hạn {max_size // (1024 * 1024)}MB.",
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

    checksum = hasher.hexdigest()
    db = get_database()

    # Dedup: cùng người dùng tải lại đúng file đã có (theo checksum nội dung)
    # -> tái sử dụng bản ghi cũ, không tải lại lên Cloudinary lần nữa (đúng
    # yêu cầu "lưu trữ học liệu để tái sử dụng về sau", tiết kiệm băng
    # thông/dung lượng lưu trữ). So khớp trong phạm vi user_id — không dedup
    # chéo người dùng để tránh rò rỉ việc "ai đã từng tải file này".
    existing = await db["documents"].find_one(
        {"user_id": current_user.id, "checksum": checksum, "deleted_at": None}
    )
    if existing is not None:
        cleanup_temp_file(temp_file_path)
        now = datetime.now(timezone.utc)
        await db["documents"].update_one(
            {"_id": existing["_id"]},
            {"$inc": {"reuse_count": 1}, "$set": {"updated_at": now}},
        )
        await record_activity(
            action="document_reused",
            category="document",
            status="success",
            user_id=current_user.id,
            resource_type="document",
            resource_id=str(existing["_id"]),
            request=request,
            metadata={"file_type": file_ext, "file_size": file_size},
            database=db,
        )
        content_doc = await db["document_contents"].find_one({"document_id": str(existing["_id"])})
        return DocumentUploadResponse(
            document_id=str(existing["_id"]),
            user_id=existing["user_id"],
            original_filename=existing["original_filename"],
            file_type=existing["file_type"],
            file_size=existing["file_size"],
            cloudinary_url=existing["cloudinary_url"],
            cloudinary_public_id=existing["cloudinary_public_id"],
            cloudinary_resource_type=existing["cloudinary_resource_type"],
            media_kind=existing["media_kind"],
            status=existing["status"],
            error_message=existing.get("error_message"),
            checksum=checksum,
            reuse_count=existing.get("reuse_count", 0) + 1,
            text_length=content_doc.get("text_length") if content_doc else None,
            reused=True,
            created_at=existing["created_at"],
            updated_at=now,
        )

    max_documents = int(await get_setting_value("max_documents_per_user", 200, database=db))
    if max_documents > 0:
        document_count = await db["documents"].count_documents({"user_id": current_user.id, "deleted_at": None})
        if document_count >= max_documents:
            cleanup_temp_file(temp_file_path)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Bạn đã đạt giới hạn {max_documents} học liệu.",
            )
    try:
        await enforce_ai_quota(
            user_id=current_user.id,
            role=current_user.role,
            feature="document_upload",
            document_size_bytes=file_size,
            resource_type="document",
            request=request,
            database=db,
        )
    except HTTPException:
        cleanup_temp_file(temp_file_path)
        raise
    now = datetime.now(timezone.utc)
    started = time.perf_counter()
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
        "checksum": checksum,
        "reuse_count": 0,
        "version": 1,
        "created_by": current_user.id,
        "updated_by": current_user.id,
        "deleted_at": None,
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
        await record_activity(
            action="document_uploaded",
            category="document",
            status="success",
            user_id=current_user.id,
            resource_type="document",
            resource_id=str(document_id),
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            metadata={
                "file_type": file_ext,
                "file_size": file_size,
                "media_kind": media_kind,
                "status": document_metadata["status"],
            },
            database=db,
        )

        if media_kind == "document":
            await record_activity(
                action="document_processing_started",
                category="document",
                status="started",
                user_id=current_user.id,
                resource_type="document",
                resource_id=str(document_id),
                request=request,
                metadata={"operation": "upload_extract", "file_type": file_ext, "file_size": file_size},
                database=db,
            )
            try:
                content_doc = await extract_and_store_document_content(document_metadata, temp_file_path)
                await record_activity(
                    action="document_processing_completed",
                    category="document",
                    status="success",
                    user_id=current_user.id,
                    resource_type="document",
                    resource_id=str(document_id),
                    request=request,
                    duration_ms=int((time.perf_counter() - started) * 1000),
                    metadata={
                        "operation": "upload_extract",
                        "file_type": file_ext,
                        "file_size": file_size,
                        "text_length": content_doc.get("text_length") if content_doc else None,
                    },
                    database=db,
                )
            except DocumentProcessingError as exc:
                await fail_document_processing(document_metadata, exc.message)
                await record_activity(
                    action="document_processing_failed",
                    category="document",
                    status="failure",
                    user_id=current_user.id,
                    resource_type="document",
                    resource_id=str(document_id),
                    request=request,
                    duration_ms=int((time.perf_counter() - started) * 1000),
                    error_code=f"DOCUMENT_PROCESSING_{exc.http_status}",
                    metadata={"operation": "upload_extract", "file_type": file_ext, "file_size": file_size},
                    database=db,
                )
    except HTTPException:
        cloudinary_public_id = document_metadata.get("cloudinary_public_id")
        if cloudinary_public_id and not metadata_saved:
            await enqueue_cloudinary_cleanup(db, public_id=cloudinary_public_id)
        raise
    except Exception as exc:
        cloudinary_public_id = document_metadata.get("cloudinary_public_id")
        if cloudinary_public_id and not metadata_saved:
            await enqueue_cloudinary_cleanup(db, public_id=cloudinary_public_id)
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
        checksum=document_metadata.get("checksum"),
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
        cursor = db["documents"].find({"user_id": current_user.id, "deleted_at": None}).sort("created_at", -1)
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
    request: Request = None,
):
    """
    Download the uploaded file from Cloudinary when needed and extract text for the owner.
    """
    ensure_lecturer_or_admin(current_user)
    document = await get_owned_document(document_id, current_user)
    ensure_not_quarantined(document)
    document_before = dict(document)
    if document.get("media_kind") == "video":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Video files must use the transcription endpoint instead of text extraction.",
        )
    db = get_database()

    existing_content = await db["document_contents"].find_one(
        {"document_id": document_id, "user_id": current_user.id}
    )
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

    original_status = document.get("status", "uploaded")
    if original_status in BUSY_DOCUMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu đang được xử lý bởi một yêu cầu khác.",
        )

    cloudinary_url = document.get("cloudinary_url")
    if not cloudinary_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cloudinary URL is missing for this document.",
        )

    lock_token = await acquire_document_mutation_lock(
        db,
        document_id,
        current_user.id,
        expected_status=original_status,
        operation="force_extract" if force else "extract",
        locked_status="extracting",
        expected_updated_at=document.get("updated_at"),
    )
    if not lock_token:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu vừa được thay đổi bởi một yêu cầu khác. Vui lòng thử lại.",
        )

    started = time.perf_counter()
    await record_activity(
        action="document_processing_started",
        category="document",
        status="started",
        user_id=current_user.id,
        resource_type="document",
        resource_id=document_id,
        request=request,
        metadata={"operation": "extract", "force": force, "file_type": document.get("file_type")},
        database=db,
    )
    temp_file_path = build_temp_file_path(document["original_filename"])
    lock_finished = False
    content_saved = False
    failure_status = original_status if existing_content else "failed"
    try:
        await download_document_to_tempfile(cloudinary_url, temp_file_path)
        content_doc = await extract_and_store_document_content(
            document,
            temp_file_path,
            mutation_token=lock_token,
        )
        content_saved = True
        lock_finished = await finalize_document_mutation(
            db,
            document_id,
            current_user.id,
            lock_token,
            final_status="processed",
            error_message=None,
            required_status="extracting",
        )
        if not lock_finished:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Mất quyền cập nhật học liệu trong khi trích xuất.",
            )
        await record_activity(
            action="document_processing_completed",
            category="document",
            status="success",
            user_id=current_user.id,
            resource_type="document",
            resource_id=document_id,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            metadata={
                "operation": "extract",
                "force": force,
                "file_type": document.get("file_type"),
                "text_length": content_doc.get("text_length"),
            },
            database=db,
        )
    except DocumentProcessingError as exc:
        lock_finished = await finalize_document_mutation(
            db,
            document_id,
            current_user.id,
            lock_token,
            final_status=failure_status,
            error_message=exc.message if failure_status == "failed" else document.get("error_message"),
            required_status="extracting",
        )
        await record_activity(
            action="document_processing_failed",
            category="document",
            status="failure",
            user_id=current_user.id,
            resource_type="document",
            resource_id=document_id,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code=f"DOCUMENT_PROCESSING_{exc.http_status}",
            metadata={"operation": "extract", "force": force, "file_type": document.get("file_type")},
            database=db,
        )
        raise HTTPException(status_code=exc.http_status, detail=exc.message) from exc
    finally:
        cleanup_temp_file(temp_file_path)
        if not lock_finished:
            await finalize_document_mutation(
                db,
                document_id,
                current_user.id,
                lock_token,
                final_status="processed" if content_saved else failure_status,
                error_message=(
                    None
                    if content_saved
                    else document.get("error_message")
                ),
                required_status="extracting",
            )

    document = await db["documents"].find_one(
        {"_id": ObjectId(document_id), "user_id": current_user.id}
    )
    if force and _is_admin_actor(current_user):
        await record_admin_audit(
            admin=current_user,
            action="document_reprocessed",
            target_type="document",
            target_id=document_id,
            before=_audit_document_snapshot(document_before),
            after=_audit_document_snapshot(document or {}),
            changed=["status", "updated_at", "error_message"],
            request=request,
            database=db,
        )

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
    request: Request = None,
):
    """
    Split extracted text into chunks, index them into vector storage, and mark the document as indexed.
    """
    ensure_lecturer_or_admin(current_user)
    document = await get_owned_document(document_id, current_user)
    ensure_not_quarantined(document)
    document_before = dict(document)
    db = get_database()
    content_doc = await db["document_contents"].find_one(
        {"document_id": document_id, "user_id": current_user.id}
    )

    original_status = document.get("status")
    if original_status in BUSY_DOCUMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu đang được xử lý bởi một yêu cầu khác.",
        )

    if original_status == "indexed" and not force:
        existing_chunks = await db["document_chunks"].count_documents(
            {"document_id": document_id, "user_id": current_user.id}
        )
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

    if original_status not in INDEXABLE_DOCUMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu chưa sẵn sàng để lập chỉ mục.",
        )

    lock_token = await acquire_document_mutation_lock(
        db,
        document_id,
        current_user.id,
        expected_status=original_status,
        operation="manual_index",
        locked_status="indexing",
        expected_updated_at=document.get("updated_at"),
    )
    if not lock_token:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu vừa được thay đổi bởi một yêu cầu khác. Vui lòng thử lại.",
        )

    lock_finished = False
    indexing_started = False
    started = time.perf_counter()
    await record_activity(
        action="document_processing_started",
        category="document",
        status="started",
        user_id=current_user.id,
        resource_type="document",
        resource_id=document_id,
        request=request,
        metadata={"operation": "index", "force": force, "file_type": document.get("file_type")},
        database=db,
    )
    try:
        # Re-read after acquiring the lock. A request that read an older
        # document snapshot must never index that stale content.
        content_doc = await db["document_contents"].find_one(
            {"document_id": document_id, "user_id": current_user.id}
        )
        if not content_doc or not content_doc.get("extracted_text"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No extracted text found for this document.",
            )

        raw_text = content_doc["extracted_text"]
        content_updated_at = content_doc.get("updated_at")
        chunks = split_text_into_chunks(raw_text)
        if not chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text chunks could be generated from this document.",
            )

        indexing_started = True
        await add_document_chunks(document_id, current_user.id, chunks)

        content_finish = await db["document_contents"].update_one(
            {
                "_id": content_doc["_id"],
                "user_id": current_user.id,
                "extracted_text": raw_text,
                "updated_at": content_updated_at,
            },
            {
                "$set": {
                    "verification_reindex_pending": False,
                    "verification_reindexed_at": datetime.now(timezone.utc),
                }
            },
        )
        if content_finish.matched_count != 1:
            raise RuntimeError("Document content changed during indexing.")

        lock_finished = await finalize_document_mutation(
            db,
            document_id,
            current_user.id,
            lock_token,
            final_status="indexed",
            error_message=None,
            required_status="indexing",
        )
        if not lock_finished:
            raise RuntimeError("Document indexing lock is no longer owned.")
        await record_activity(
            action="document_processing_completed",
            category="document",
            status="success",
            user_id=current_user.id,
            resource_type="document",
            resource_id=document_id,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            metadata={
                "operation": "index",
                "force": force,
                "file_type": document.get("file_type"),
                "chunk_count": len(chunks),
            },
            database=db,
        )
    except HTTPException:
        await record_activity(
            action="document_processing_failed",
            category="document",
            status="failure",
            user_id=current_user.id,
            resource_type="document",
            resource_id=document_id,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="DOCUMENT_INDEX_HTTP_ERROR",
            metadata={"operation": "index", "force": force, "file_type": document.get("file_type")},
            database=db,
        )
        raise
    except Exception as exc:
        await record_activity(
            action="document_processing_failed",
            category="document",
            status="failure",
            user_id=current_user.id,
            resource_type="document",
            resource_id=document_id,
            request=request,
            duration_ms=int((time.perf_counter() - started) * 1000),
            error_code="DOCUMENT_INDEX_FAILED",
            metadata={"operation": "index", "force": force, "file_type": document.get("file_type")},
            database=db,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to index this document into ChromaDB.",
        ) from exc
    finally:
        if not lock_finished:
            await finalize_document_mutation(
                db,
                document_id,
                current_user.id,
                lock_token,
                final_status="index_failed" if indexing_started else original_status,
                error_message=(
                    "Failed to index chunks into ChromaDB."
                    if indexing_started
                    else document.get("error_message")
                ),
                required_status="indexing",
            )

    document_after = await db["documents"].find_one({"_id": ObjectId(document_id), "user_id": current_user.id})
    if force and _is_admin_actor(current_user):
        await record_admin_audit(
            admin=current_user,
            action="document_reprocessed",
            target_type="document",
            target_id=document_id,
            before=_audit_document_snapshot(document_before),
            after=_audit_document_snapshot(document_after or {}),
            changed=["status", "updated_at", "error_message"],
            request=request,
            database=db,
        )

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
    document = await get_owned_document(document_id, current_user)
    if document.get("status") != "indexed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu đang được re-index hoặc chưa lập chỉ mục thành công.",
        )

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


async def run_video_transcription_task(
    document: dict,
    user_id: str,
    mutation_token: str,
):
    import logging
    logger = logging.getLogger("app.routers.documents")
    db = get_database()
    document_id = str(document["_id"])
    cloudinary_url = document.get("cloudinary_url")
    if not cloudinary_url:
        await finalize_document_mutation(
            db,
            document_id,
            user_id,
            mutation_token,
            final_status="failed",
            error_message="Cloudinary URL is missing for this video.",
            required_status="transcribing",
        )
        return

    temp_file_path = build_temp_file_path(document["original_filename"])

    try:
        # 1. Download video
        logger.info(f"Downloading video from {cloudinary_url} for transcription...")
        await download_document_to_tempfile(cloudinary_url, temp_file_path)

        # 2. Transcribe with the configured Groq Whisper backend
        logger.info(f"Sending video file {temp_file_path} to Groq Whisper for transcription...")
        transcript = await asyncio.to_thread(transcribe_video, str(temp_file_path))

        # 3. Save transcript to MongoDB
        logger.info("Saving transcript to MongoDB...")
        await save_document_content(
            document,
            transcript,
            status_value="transcribed",
            mutation_token=mutation_token,
            mutation_status="transcribing",
        )
        finalized = await finalize_document_mutation(
            db,
            document_id,
            user_id,
            mutation_token,
            final_status="transcribed",
            error_message=None,
            required_status="transcribing",
        )
        if not finalized:
            logger.warning(
                "Discarded stale transcription completion for document %s.",
                document_id,
            )
            return
        logger.info(f"Video transcription completed successfully for document {document['_id']}.")
    except Exception as exc:
        finalized = await finalize_document_mutation(
            db,
            document_id,
            user_id,
            mutation_token,
            final_status="failed",
            error_message=f"Video transcription failed: {str(exc)[:240]}",
            required_status="transcribing",
        )
        if finalized:
            logger.error("Video transcription failed for document %s: %s", document_id, exc)
        else:
            logger.info(
                "Ignored stale transcription task for document %s.",
                document_id,
            )
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
    ensure_lecturer_or_admin(current_user)
    document = await get_owned_document(document_id, current_user)
    ensure_not_quarantined(document)

    if document.get("media_kind") != "video":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only video documents can be transcribed.",
        )
        
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chưa cấu hình GROQ_API_KEY để transcribe video.",
        )

    original_status = document.get("status", "uploaded")
    if original_status in {"transcribed", "indexed"}:
        return {
            "status": original_status,
            "message": "Video transcript is already available.",
        }

    if original_status == "transcribing":
        return {
            "status": "transcribing",
            "message": "Video transcription is already in progress.",
        }

    if original_status in BUSY_DOCUMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu đang được xử lý bởi một yêu cầu khác.",
        )

    db = get_database()
    mutation_token = await acquire_document_mutation_lock(
        db,
        document_id,
        current_user.id,
        expected_status=original_status,
        operation="transcription",
        locked_status="transcribing",
        expected_updated_at=document.get("updated_at"),
    )
    if not mutation_token:
        current = await db["documents"].find_one(
            {"_id": ObjectId(document_id), "user_id": current_user.id},
            {"status": 1},
        )
        if current and current.get("status") == "transcribing":
            return {
                "status": "transcribing",
                "message": "Video transcription is already in progress.",
            }
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu vừa được thay đổi bởi một yêu cầu khác. Vui lòng thử lại.",
        )

    # Launch background task
    background_tasks.add_task(
        run_video_transcription_task,
        document=document,
        user_id=current_user.id,
        mutation_token=mutation_token,
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


@router.delete("/{document_id}", status_code=status.HTTP_200_OK)
async def delete_document(
    document_id: str,
    payload: ReasonRequest | None = None,
    request: Request = None,
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Delete a document and all associated data (content, chunks, vectors, cloud file).
    """
    ensure_lecturer_or_admin(current_user)
    document = await get_owned_document(document_id, current_user)
    reason = None
    if _is_admin_actor(current_user):
        reason = require_reason(payload.reason if payload else None, "xóa tài liệu")
    db = get_database()

    if document.get("status") in BUSY_DOCUMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu đang được xử lý. Vui lòng thử xoá lại sau.",
        )

    # CAS against both revision and mutation ownership. This prevents a stale
    # delete request from removing a document while apply/index/extract owns it.
    delete_filter = {
        "_id": document["_id"],
        "user_id": current_user.id,
        "status": document.get("status"),
        MUTATION_TOKEN_FIELD: {"$exists": False},
        "verification_apply_token": {"$exists": False},
    }
    if document.get("updated_at") is not None:
        delete_filter["updated_at"] = document["updated_at"]
    claimed = await db["documents"].update_one(
        delete_filter,
        {
            "$set": {
                "status": "deleting",
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    if claimed.modified_count != 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Học liệu vừa được thay đổi hoặc đang được xử lý. Vui lòng thử lại.",
        )

    # 1. Delete vectors from ChromaDB (best-effort)
    try:
        from app.services.rag_service import init_chroma_client, _delete_document_vectors
        chroma_client = init_chroma_client()
        _delete_document_vectors(chroma_client, document_id, current_user.id)
    except Exception:
        pass

    # 2. Delete file from Cloudinary / local storage — qua hàng đợi job nền
    # (retry có backoff), không xoá đồng bộ rồi im lặng bỏ qua lỗi.
    cloudinary_public_id = document.get("cloudinary_public_id")
    if cloudinary_public_id:
        await enqueue_cloudinary_cleanup(db, public_id=cloudinary_public_id)

    # 3. Delete related MongoDB collections
    await db["document_chunks"].delete_many(
        {"document_id": document_id, "user_id": current_user.id}
    )
    await db["document_contents"].delete_many(
        {"document_id": document_id, "user_id": current_user.id}
    )
    await db["verification_issues"].delete_many(
        {"document_id": document_id, "user_id": current_user.id}
    )
    await db["verification_sessions"].delete_many(
        {"document_id": document_id, "user_id": current_user.id}
    )
    await db["documents"].update_one(
        {
            "_id": document["_id"],
            "user_id": current_user.id,
            "status": "deleting",
        },
        {
            "$set": {
                "status": "deleted",
                "deleted_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    if _is_admin_actor(current_user):
        await record_admin_audit(
            admin=current_user,
            action="document_deleted",
            target_type="document",
            target_id=document_id,
            reason=reason,
            before=_audit_document_snapshot(document),
            after={**_audit_document_snapshot(document), "status": "deleted"},
            changed=["status"],
            request=request,
            database=db,
        )
    
    await record_activity(
        action="document_deleted",
        category="document",
        status="success",
        user_id=current_user.id,
        resource_type="document",
        resource_id=document_id,
        request=request,
        metadata={
            "file_type": document.get("file_type"),
            "media_kind": document.get("media_kind"),
            "status": "deleted",
        },
        database=db,
    )

    return {
        "status": "deleted",
        "message": f"Tài liệu '{document.get('original_filename', '')}' đã được xoá thành công.",
    }


# ═══════════════════════════════════════════════════════════════════════════
# K-Means Clustering & Similar Documents
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/analysis/clusters")
async def get_document_clusters(
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Phân cụm tài liệu tự động bằng thuật toán K-Means dựa trên vector embeddings.
    Trả về danh sách cụm tài liệu, mỗi cụm có tên chủ đề do AI đặt.
    """
    from app.services.clustering_service import (
        get_document_vectors_from_chroma,
        cluster_documents,
    )
    from app.services.llm_service import label_cluster_names

    # 1. Get all document vectors for this user
    doc_vectors = get_document_vectors_from_chroma(current_user.id)

    if len(doc_vectors) < 2:
        return {
            "clusters": [],
            "message": "Cần ít nhất 2 tài liệu đã được lập chỉ mục để phân cụm.",
            "total_documents": len(doc_vectors),
        }

    # 2. Run K-Means clustering
    clusters = cluster_documents(doc_vectors)

    # 3. Get document previews for AI labeling
    db = get_database()
    doc_previews = {}
    doc_names = {}
    for doc_id in doc_vectors.keys():
        if ObjectId.is_valid(doc_id):
            doc = await db["documents"].find_one({"_id": ObjectId(doc_id)})
            if doc:
                doc_names[doc_id] = doc.get("original_filename", "")
            content = await db["document_contents"].find_one({"document_id": doc_id})
            if content:
                doc_previews[doc_id] = (content.get("extracted_text", "") or "")[:200]

    # 4. AI labels the clusters
    clusters = label_cluster_names(clusters, doc_previews)

    # 5. Enrich clusters with document names
    for cluster in clusters:
        cluster["documents"] = []
        for doc_id in cluster.get("document_ids", []):
            cluster["documents"].append({
                "id": doc_id,
                "name": doc_names.get(doc_id, "Unknown"),
            })

    return {
        "clusters": clusters,
        "total_documents": len(doc_vectors),
        "algorithm": "K-Means",
        "message": f"Đã phân cụm {len(doc_vectors)} tài liệu thành {len(clusters)} nhóm.",
    }


@router.get("/{document_id}/similar")
async def get_similar_documents(
    document_id: str,
    top_n: int = Query(5, ge=1, le=20),
    current_user: UserResponse = Depends(get_current_user),
):
    """
    Tìm tài liệu tương tự dựa trên Cosine Similarity của vector embeddings.
    """
    from app.services.clustering_service import (
        get_document_vectors_from_chroma,
        find_similar_documents,
    )

    await get_owned_document(document_id, current_user)

    # 1. Get all document vectors
    doc_vectors = get_document_vectors_from_chroma(current_user.id)

    if document_id not in doc_vectors:
        return {
            "similar_documents": [],
            "message": "Tài liệu chưa được lập chỉ mục vector.",
        }

    # 2. Find similar documents
    target_vector = doc_vectors[document_id]
    similar = find_similar_documents(target_vector, doc_vectors, document_id, top_n)

    # 3. Enrich with document names
    db = get_database()
    for item in similar:
        doc_id = item["document_id"]
        if ObjectId.is_valid(doc_id):
            doc = await db["documents"].find_one({"_id": ObjectId(doc_id)})
            if doc:
                item["document_name"] = doc.get("original_filename", "")
                item["file_type"] = doc.get("file_type", "")

    return {
        "similar_documents": similar,
        "algorithm": "Cosine Similarity",
        "message": f"Tìm thấy {len(similar)} tài liệu tương tự.",
    }
