from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

class ChatAskRequest(BaseModel):
    document_id: str
    question: str

class SourceChunk(BaseModel):
    chunk_index: Optional[int] = None
    text: str

class ChatAskResponse(BaseModel):
    id: str
    question: str
    answer: str
    sources: List[SourceChunk]
    created_at: datetime
