from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel, Field

class QuestionGenerateRequest(BaseModel):
    document_id: str
    question_count: int = Field(10, ge=1, le=50)
    difficulty: str = Field("medium", pattern="^(easy|medium|hard)$")
    question_type: str = Field("multiple_choice", pattern="^(multiple_choice|true_false|short_answer)$")

class QuestionItem(BaseModel):
    question: str
    options: Optional[Dict[str, str]] = None
    correct_answer: str
    explanation: str
    difficulty: str
    question_type: str

class QuestionSetResponse(BaseModel):
    id: str
    document_id: str
    user_id: str
    document_name: str
    question_count: int
    difficulty: str
    question_type: str
    questions: List[QuestionItem]
    created_at: datetime
    updated_at: datetime
