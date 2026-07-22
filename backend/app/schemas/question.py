from datetime import datetime
from typing import Optional, Dict, List, Literal
from pydantic import BaseModel, Field, field_validator


QuestionWorkflowStatus = Literal["draft", "review_pending", "approved", "published"]


class QuestionGenerateRequest(BaseModel):
    document_id: str
    question_count: int = Field(10, ge=1, le=50)
    difficulty: str = Field("medium", pattern="^(easy|medium|hard)$")
    question_type: str = Field("multiple_choice", pattern="^(multiple_choice|true_false|short_answer)$")
    bloom_level: Optional[str] = Field(None, pattern="^(remember|understand|apply|analyze)$")


class QuestionItem(BaseModel):
    question: str
    options: Optional[Dict[str, str]] = None
    correct_answer: str
    explanation: str
    difficulty: str
    question_type: str
    bloom_level: Optional[str] = None  # Auto-classified Bloom level
    tags: List[str] = Field(default_factory=list)
    status: QuestionWorkflowStatus = "draft"
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    published_at: Optional[datetime] = None


class QuestionItemUpdateRequest(BaseModel):
    question: Optional[str] = Field(None, min_length=1, max_length=4000)
    options: Optional[Dict[str, str]] = None
    correct_answer: Optional[str] = Field(None, min_length=1, max_length=1000)
    explanation: Optional[str] = Field(None, min_length=1, max_length=8000)
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
    question_type: Optional[Literal["multiple_choice", "true_false", "short_answer"]] = None
    bloom_level: Optional[Literal["remember", "understand", "apply", "analyze"]] = None
    tags: Optional[List[str]] = None

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return value
        normalized: list[str] = []
        seen: set[str] = set()
        for item in value:
            tag = item.strip().lower()
            if not tag or tag in seen:
                continue
            if len(tag) > 40:
                tag = tag[:40]
            seen.add(tag)
            normalized.append(tag)
        return normalized[:12]


class QuestionWorkflowRequest(BaseModel):
    status: QuestionWorkflowStatus


class QuestionAttemptAnswer(BaseModel):
    question_index: int = Field(..., ge=0)
    answer: str = Field("", max_length=4000)


class QuestionAttemptSubmitRequest(BaseModel):
    answers: List[QuestionAttemptAnswer] = Field(default_factory=list)


class QuestionAttemptAnswerResult(BaseModel):
    question_index: int
    answer: str
    correct_answer: str
    is_correct: bool


class QuestionAttemptResponse(BaseModel):
    id: str
    question_set_id: str
    document_id: str
    user_id: str
    score: int
    max_score: int
    percent: float
    answers: List[QuestionAttemptAnswerResult]
    created_at: datetime


class KeywordItem(BaseModel):
    keyword: str
    score: float


class ValidationStats(BaseModel):
    cross_validated: bool = False
    total_generated: int = 0
    valid_count: int = 0
    invalid_count: int = 0
    fixed_count: int = 0
    replaced_count: int = 0
    validator: Optional[str] = None


class QuestionSetResponse(BaseModel):
    """Full question set detail — includes all questions."""
    id: str
    document_id: str
    user_id: str
    document_name: str
    question_count: int
    difficulty: str
    question_type: str
    questions: List[QuestionItem]
    validation_stats: Optional[ValidationStats] = None
    keywords: Optional[List[KeywordItem]] = None  # TF-IDF extracted keywords
    bloom_distribution: Optional[Dict[str, int]] = None  # e.g. {"remember": 2, "understand": 3}
    workflow_counts: Optional[Dict[str, int]] = None
    published_question_count: int = 0
    created_at: datetime
    updated_at: datetime


class QuestionSetSummary(BaseModel):
    """Lightweight summary for history listing — omits questions array."""
    id: str
    document_id: str
    document_name: str
    question_count: int
    difficulty: str
    question_type: str
    bloom_distribution: Optional[Dict[str, int]] = None
    workflow_counts: Optional[Dict[str, int]] = None
    published_question_count: int = 0
    created_at: datetime


class HistoryListResponse(BaseModel):
    """Paginated history response with signed cursor."""
    items: List[QuestionSetSummary]
    next_cursor: Optional[str] = None
    has_more: bool = False
