"""Đề thi sinh ra từ ma trận (Exam) — nhiều mã đề tương đương cùng một
`equivalent_group_id`.
"""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

ExamStatus = Literal["draft", "ready", "published", "closed", "archived"]

_EXAM_TRANSITIONS = {
    "draft": {"ready"},
    "ready": {"draft", "published"},
    "published": {"closed"},
    "closed": {"archived"},
    "archived": set(),
}


def is_valid_exam_transition(current: ExamStatus, target: ExamStatus) -> bool:
    return target in _EXAM_TRANSITIONS.get(current, set())


class ExamGenerateRequest(BaseModel):
    blueprint_id: str
    code_count: int = Field(default=1, ge=1, le=20)
    seed: Optional[int] = Field(None, description="Cố định để tái tạo lại đúng kết quả đảo câu/đáp án.")


class ExamRegenerateSectionRequest(BaseModel):
    version: int = Field(ge=1)
    group_type: Literal["topic", "bloom_level", "difficulty", "question_type"]
    group_key: str


class ExamPublishRequest(BaseModel):
    version: int = Field(ge=1)
    audience_type: Literal["all", "classes"] = "all"
    target_class_ids: List[str] = Field(default_factory=list)


class ExamResponse(BaseModel):
    id: str
    blueprint_id: str
    blueprint_version: int
    code: str
    equivalent_group_id: str
    question_ids: List[str]
    question_order_seed: Optional[int] = None
    total_points: float
    duration_minutes: int
    status: ExamStatus
    published_at: Optional[datetime] = None
    audience_type: Literal["all", "classes"] = "all"
    target_class_ids: List[str] = Field(default_factory=list)
    version: int
    owner_id: str
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class ExamGenerateResponse(BaseModel):
    solver_status: Literal["OPTIMAL", "FEASIBLE"]
    exams: List[ExamResponse]


class ExamPreviewQuestionItem(BaseModel):
    question_id: str
    order: int
    content: str
    options: Optional[dict] = None
    correct_answer: Optional[str] = None  # None khi hide_answers=True
    explanation: Optional[str] = None  # None khi hide_answers=True
    points: float
    bloom_level: str
    difficulty: str
    question_type: str
    source_document_id: Optional[str] = None
    citation: Optional[str] = None


class ExamPreviewResponse(BaseModel):
    exam: ExamResponse
    questions: List[ExamPreviewQuestionItem]
    hide_answers: bool
