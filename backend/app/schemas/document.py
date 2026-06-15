from datetime import datetime
from pydantic import BaseModel, Field

class DocumentResponse(BaseModel):
    id: str
    user_id: str
    original_filename: str
    file_type: str
    file_size: int
    cloudinary_url: str
    cloudinary_public_id: str
    status: str = "uploaded"
    created_at: datetime
    updated_at: datetime

    class Config:
        json_schema_extra = {
            "example": {
                "id": "60c72b2f9b1d8b234a5c9e2b",
                "user_id": "60c72b2f9b1d8b234a5c9e2a",
                "original_filename": "bai_giang.pdf",
                "file_type": "pdf",
                "file_size": 1048576,
                "cloudinary_url": "https://res.cloudinary.com/demo/image/upload/v1577836800/documents/bai_giang.pdf",
                "cloudinary_public_id": "documents/bai_giang_abc123",
                "status": "uploaded",
                "created_at": "2026-06-16T04:00:00Z",
                "updated_at": "2026-06-16T04:00:00Z"
            }
        }
