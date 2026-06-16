from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ChatAskRequest(BaseModel):
    document_id: str
    question: str = Field(..., min_length=1, max_length=2000)


class SourceChunk(BaseModel):
    chunk_index: Optional[int] = None
    text: str
    distance: Optional[float] = None
    text_preview: Optional[str] = None


class ChatMessageResponse(BaseModel):
    id: str
    document_id: str
    question: str
    answer: str
    source_chunks: List[SourceChunk]
    created_at: datetime
