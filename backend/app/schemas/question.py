from datetime import datetime
from typing import Any, Optional, Dict, List, Literal
from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from app.services.language_policy_service import resolve_output_language


QuestionWorkflowStatus = Literal["draft", "review_pending", "approved", "published"]


class QuestionGenerateRequest(BaseModel):
    document_id: str
    question_count: int = Field(10, ge=1, le=50)
    difficulty: str = Field("medium", pattern="^(easy|medium|hard)$")
    question_type: str = Field("multiple_choice", pattern="^(multiple_choice|true_false|short_answer)$")
    bloom_level: Optional[str] = Field(None, pattern="^(remember|understand|apply|analyze)$")
    subject_id: Optional[str] = Field(None, min_length=1, max_length=100)
    grade: Optional[int] = Field(None, ge=6, le=12)
    topic_id: Optional[str] = Field(None, max_length=100)
    output_language: Optional[Literal["vi", "en"]] = None

    @model_validator(mode="after")
    def require_subject_and_grade_together(self) -> "QuestionGenerateRequest":
        if (self.subject_id is None) != (self.grade is None):
            raise ValueError("subject_id and grade must be supplied together")
        return self

    @computed_field
    @property
    def resolved_output_language(self) -> Literal["vi", "en"]:
        if self.subject_id is None or self.grade is None:
            return self.output_language or "vi"
        return resolve_output_language(
            subject_id=self.subject_id,
            grade=self.grade,
            explicit=self.output_language,
        )


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
    language: Optional[Literal["vi", "en"]] = None
    source_chunk_ids: List[str] = Field(default_factory=list)
    grounding_excerpt: Optional[str] = None


class QuestionItemUpdateRequest(BaseModel):
    question: Optional[str] = Field(None, min_length=1, max_length=4000)
    options: Optional[Dict[str, str]] = None
    correct_answer: Optional[str] = Field(None, min_length=1, max_length=1000)
    explanation: Optional[str] = Field(None, min_length=1, max_length=8000)
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
    question_type: Optional[Literal["multiple_choice", "true_false", "short_answer"]] = None
    bloom_level: Optional[Literal["remember", "understand", "apply", "analyze"]] = None
    tags: Optional[List[str]] = None
    reason: Optional[str] = Field(None, max_length=500)

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


PublishAudienceType = Literal["all", "classes"]


class PublishQuestionSetRequest(BaseModel):
    audience_type: PublishAudienceType = "all"
    target_class_ids: List[str] = Field(default_factory=list, max_length=50)
    # Id node trong `curriculum_taxonomy`. Không bắt buộc: học liệu công bố
    # trước tính năng "Học theo môn" đều chưa có, và ép buộc sẽ chặn giáo viên
    # công bố nhanh một bộ luyện tập.
    subject_id: Optional[str] = None
    chapter_id: Optional[str] = None

    @field_validator("target_class_ids")
    @classmethod
    def dedupe_class_ids(cls, value: List[str]) -> List[str]:
        seen: set[str] = set()
        deduped: list[str] = []
        for item in value:
            item = item.strip()
            if item and item not in seen:
                seen.add(item)
                deduped.append(item)
        return deduped


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
    # Thống kê bước K-Means khử trùng lặp ngữ nghĩa (xem question_diversity_service).
    diversity: Optional[Dict[str, Any]] = None


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
    audience_type: PublishAudienceType = "all"
    target_class_ids: List[str] = Field(default_factory=list)
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    chapter_id: Optional[str] = None
    chapter_name: Optional[str] = None
    grade: Optional[int] = None
    topic_id: Optional[str] = None
    output_language: Optional[Literal["vi", "en"]] = None
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
    audience_type: PublishAudienceType = "all"
    target_class_ids: List[str] = Field(default_factory=list)
    subject_id: Optional[str] = None
    subject_name: Optional[str] = None
    chapter_id: Optional[str] = None
    chapter_name: Optional[str] = None
    created_at: datetime


class TaxonomyNodeWriteRequest(BaseModel):
    node_type: Literal["subject", "chapter"]
    name: str = Field(min_length=1, max_length=200)
    parent_id: Optional[str] = None


class TaxonomyNodeRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class SubjectChapterNode(BaseModel):
    id: str
    name: str
    count: int


class SubjectCatalogNode(BaseModel):
    """Một môn trong mục lục "Học theo môn", kèm các chương có nội dung."""
    id: str
    name: str
    count: int
    chapters: List[SubjectChapterNode] = Field(default_factory=list)


class HistoryListResponse(BaseModel):
    """Paginated history response with signed cursor."""
    items: List[QuestionSetSummary]
    next_cursor: Optional[str] = None
    has_more: bool = False
