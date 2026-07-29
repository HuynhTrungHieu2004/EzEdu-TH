"""Ma trận đề (ExamBlueprint) — ràng buộc đầu vào cho bộ giải CP-SAT.

Mỗi nhóm ràng buộc (topic/bloom/difficulty/question_type) cho phép chỉ định
SỐ CÂU hoặc ĐIỂM hoặc CẢ HAI — nếu cả hai được set, cả hai đều phải thoả
mãn đồng thời (AND, không phải OR) khi giải.
"""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.exam_bank.schemas.question import BloomLevel, Difficulty, QuestionType

BlueprintStatus = Literal["draft", "validated", "published", "archived"]

_BLUEPRINT_TRANSITIONS = {
    "draft": {"validated"},
    "validated": {"draft", "published"},
    "published": {"archived"},
    "archived": set(),
}


def is_valid_blueprint_transition(current: BlueprintStatus, target: BlueprintStatus) -> bool:
    return target in _BLUEPRINT_TRANSITIONS.get(current, set())


class _CountOrPointsConstraint(BaseModel):
    question_count: Optional[int] = Field(None, ge=0)
    points: Optional[float] = Field(None, ge=0)

    @model_validator(mode="after")
    def _require_at_least_one(self):
        if self.question_count is None and self.points is None:
            raise ValueError("Phải chỉ định 'question_count' hoặc 'points' (hoặc cả hai).")
        return self


class TopicConstraint(_CountOrPointsConstraint):
    topic_id: str


class BloomConstraint(_CountOrPointsConstraint):
    bloom_level: BloomLevel


class DifficultyConstraint(_CountOrPointsConstraint):
    difficulty: Difficulty


class QuestionTypeConstraint(_CountOrPointsConstraint):
    question_type: QuestionType


class BlueprintConstraints(BaseModel):
    topics: List[TopicConstraint] = Field(default_factory=list)
    bloom_distribution: List[BloomConstraint] = Field(default_factory=list)
    difficulty_distribution: List[DifficultyConstraint] = Field(default_factory=list)
    question_type_distribution: List[QuestionTypeConstraint] = Field(default_factory=list)
    max_time_seconds: Optional[int] = Field(None, gt=0)
    exclude_recently_used_days: Optional[int] = Field(None, ge=0)


class ExamBlueprintCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    subject_id: str
    grade: int = Field(ge=1, le=12)
    curriculum_version: str
    total_points: float = Field(gt=0)
    duration_minutes: int = Field(gt=0)
    constraints: BlueprintConstraints


class ExamBlueprintUpdate(BaseModel):
    version: int = Field(ge=1)
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    total_points: Optional[float] = Field(None, gt=0)
    duration_minutes: Optional[int] = Field(None, gt=0)
    constraints: Optional[BlueprintConstraints] = None


class ExamBlueprintResponse(BaseModel):
    id: str
    name: str
    subject_id: str
    grade: int
    curriculum_version: str
    total_points: float
    duration_minutes: int
    constraints: BlueprintConstraints
    status: BlueprintStatus
    version: int
    owner_id: str
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


SolverStatus = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "UNKNOWN"]


class MissingQuestionGroup(BaseModel):
    """Khi INFEASIBLE — nêu rõ nhóm ràng buộc nào thiếu câu, thiếu bao nhiêu."""

    group_type: Literal["topic", "bloom_level", "difficulty", "question_type", "total"]
    group_key: Optional[str] = None
    required_count: float
    available_count: float
    shortfall: float


class BlueprintValidationResult(BaseModel):
    status: SolverStatus
    message: str
    missing: List[MissingQuestionGroup] = Field(default_factory=list)
    solve_time_seconds: float
