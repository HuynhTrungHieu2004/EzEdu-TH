"""Ngân hàng câu hỏi — entity `Question` độc lập với `question_sets.questions[]`
hiện có (xem docs/feature-expansion/02-data-model-plan.md mục 1 & mục 9 —
quyết định KHÔNG hợp nhất, để tránh phá `QuestionSetEditorPage`/
`PracticeAttemptPage` đang chạy thật).
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator
from bson import ObjectId

# Cố ý dùng đúng 3 giá trị hiện có ở app/schemas/question.py để không tạo hai
# tập giá trị lệch nhau cho cùng khái niệm nghiệp vụ.
QuestionType = Literal["multiple_choice", "true_false", "short_answer"]
Difficulty = Literal["easy", "medium", "hard"]
BloomLevel = Literal["remember", "understand", "apply", "analyze"]

# State machine riêng cho ngân hàng câu hỏi — KHÁC với
# `QuestionWorkflowStatus` (draft/review_pending/approved/published) của
# question_sets hiện có, cố ý không dùng chung tên để tránh nhầm 2 khái niệm.
QuestionBankStatus = Literal["draft", "reviewing", "approved", "published", "archived"]

_BANK_STATUS_TRANSITIONS: Dict[QuestionBankStatus, set] = {
    "draft": {"reviewing"},
    "reviewing": {"draft", "approved"},
    "approved": {"draft", "published"},
    "published": {"archived"},
    "archived": set(),
}


def is_valid_bank_transition(current: QuestionBankStatus, target: QuestionBankStatus) -> bool:
    return target in _BANK_STATUS_TRANSITIONS.get(current, set())


class QuestionBankCreate(BaseModel):
    subject_id: str
    grade: int = Field(ge=1, le=12)
    curriculum_version: str
    chapter_id: Optional[str] = None
    topic_id: Optional[str] = None
    learning_outcome_id: Optional[str] = None
    bloom_level: BloomLevel
    difficulty: Difficulty
    question_type: QuestionType
    content: str = Field(min_length=1, max_length=4000)
    options: Optional[Dict[str, str]] = None
    correct_answer: str = Field(min_length=1, max_length=1000)
    explanation: str = Field(min_length=1, max_length=8000)
    points: float = Field(default=1.0, gt=0)
    expected_time_seconds: int = Field(default=60, gt=0)
    tags: List[str] = Field(default_factory=list)


class QuestionBankImportItem(QuestionBankCreate):
    source_document_id: Optional[str] = None
    source_chunk_ids: List[str] = Field(default_factory=list)
    citation: Optional[str] = None
    origin_question_set_id: Optional[str] = None
    origin_question_index: Optional[int] = None


class QuestionBankImportRequest(BaseModel):
    items: List[QuestionBankImportItem] = Field(min_length=1, max_length=200)


class QuestionBankUpdate(BaseModel):
    """Mọi field optional — chỉ field được gửi mới bị đổi. Bắt buộc `version`
    hiện tại của client để optimistic concurrency (xem app/core/concurrency.py).
    """

    version: int = Field(ge=1)
    subject_id: Optional[str] = None
    grade: Optional[int] = Field(None, ge=1, le=12)
    curriculum_version: Optional[str] = None
    chapter_id: Optional[str] = None
    topic_id: Optional[str] = None
    learning_outcome_id: Optional[str] = None
    bloom_level: Optional[BloomLevel] = None
    difficulty: Optional[Difficulty] = None
    question_type: Optional[QuestionType] = None
    content: Optional[str] = Field(None, min_length=1, max_length=4000)
    options: Optional[Dict[str, str]] = None
    correct_answer: Optional[str] = Field(None, min_length=1, max_length=1000)
    explanation: Optional[str] = Field(None, min_length=1, max_length=8000)
    points: Optional[float] = Field(None, gt=0)
    expected_time_seconds: Optional[int] = Field(None, gt=0)
    tags: Optional[List[str]] = None


class QuestionBankReviewRequest(BaseModel):
    version: int = Field(ge=1)
    target_status: QuestionBankStatus


class QuestionBankBulkActionRequest(BaseModel):
    question_ids: List[str] = Field(min_length=1, max_length=500)

    @field_validator("question_ids")
    @classmethod
    def validate_question_ids(cls, value: List[str]) -> List[str]:
        if any(not ObjectId.is_valid(item) for item in value):
            raise ValueError("Danh sách chứa mã câu hỏi không hợp lệ.")
        return list(dict.fromkeys(value))


class QuestionBankResponse(BaseModel):
    id: str
    subject_id: str
    grade: int
    curriculum_version: str
    chapter_id: Optional[str] = None
    topic_id: Optional[str] = None
    learning_outcome_id: Optional[str] = None
    bloom_level: BloomLevel
    difficulty: Difficulty
    question_type: QuestionType
    content: str
    options: Optional[Dict[str, str]] = None
    correct_answer: str
    explanation: str
    points: float
    expected_time_seconds: int
    source_document_id: Optional[str] = None
    source_chunk_ids: List[str] = Field(default_factory=list)
    citation: Optional[str] = None
    quality_status: Literal["unreviewed", "flagged", "verified"] = "unreviewed"
    origin_question_set_id: Optional[str] = None
    origin_question_index: Optional[int] = None
    tags: List[str] = Field(default_factory=list)
    usage_count: int = 0
    last_used_at: Optional[datetime] = None
    status: QuestionBankStatus
    version: int
    owner_id: str
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class QuestionBankListResponse(BaseModel):
    items: List[QuestionBankResponse]
    total: int
    skip: int
    limit: int
