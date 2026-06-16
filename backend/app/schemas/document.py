from datetime import datetime
from typing import Optional

from pydantic import BaseModel

class DocumentMetadataBase(BaseModel):
    user_id: str
    original_filename: str
    file_type: str
    file_size: int
    cloudinary_url: str
    cloudinary_public_id: str
    cloudinary_resource_type: str = "raw"
    media_kind: str = "document"
    status: str = "uploaded"
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class DocumentResponse(DocumentMetadataBase):
    id: str

class DocumentUploadResponse(DocumentMetadataBase):
    document_id: str
    text_length: Optional[int] = None

    class Config:
        json_schema_extra = {
            "example": {
                "document_id": "60c72b2f9b1d8b234a5c9e2b",
                "user_id": "60c72b2f9b1d8b234a5c9e2a",
                "original_filename": "bai_giang.pdf",
                "file_type": "pdf",
                "file_size": 1048576,
                "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/v1577836800/documents/bai_giang.pdf",
                "cloudinary_public_id": "documents/bai_giang_abc123",
                "status": "processed",
                "error_message": None,
                "text_length": 2450,
                "created_at": "2026-06-16T04:00:00Z",
                "updated_at": "2026-06-16T04:00:00Z"
            }
        }


class DocumentExtractResponse(BaseModel):
    document_id: str
    original_filename: str
    file_type: str
    status: str
    message: str
    text_length: Optional[int] = None
    error_message: Optional[str] = None
    updated_at: datetime


class DocumentContentResponse(BaseModel):
    document_id: str
    original_filename: str
    filename: str
    file_type: str
    status: str
    preview: str
    extracted_text: Optional[str] = None
    text_length: int
