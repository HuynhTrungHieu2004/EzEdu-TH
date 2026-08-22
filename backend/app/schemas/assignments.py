from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


AssignmentStatus = Literal["draft", "published", "archived"]
SubmissionStatus = Literal[
    "submitted",
    "ai_grading",
    "ai_suggested",
    "grading_failed",
    "teacher_graded",
]


class AssignmentCreate(BaseModel):
    course_id: str
    lesson_id: str | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    instructions: str = ""
    assignment_type: Literal["essay", "quiz", "practice"] = "essay"
    due_at: datetime
    max_score: float = Field(gt=0, le=1000)
    auto_grade: bool = False
    status: AssignmentStatus = "draft"


class AssignmentUpdate(BaseModel):
    lesson_id: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    instructions: str | None = None
    assignment_type: Literal["essay", "quiz", "practice"] | None = None
    due_at: datetime | None = None
    max_score: float | None = Field(default=None, gt=0, le=1000)
    auto_grade: bool | None = None
    status: AssignmentStatus | None = None


class AssignmentRead(AssignmentCreate):
    id: str
    course_title: str = ""
    submitted_count: int = 0
    total_students: int = 0
    created_by: str
    created_at: datetime
    updated_at: datetime | None = None


class SubmissionCreate(BaseModel):
    content: str = Field(min_length=1)
    attachment_ids: list[str] = Field(default_factory=list)


class AIGradeResult(BaseModel):
    score: float = Field(ge=0)
    feedback: str
    rubric: list[dict[str, str | float]] = Field(default_factory=list)


class TeacherGrade(BaseModel):
    score: float = Field(ge=0)
    feedback: str = ""


class SubmissionRead(BaseModel):
    id: str
    assignment_id: str
    assignment_title: str
    course_id: str
    course_title: str
    student_id: str
    student_code: str = ""
    student_name: str = ""
    submitted_at: datetime
    content: str
    attachment_ids: list[str] = Field(default_factory=list)
    revision_count: int = Field(ge=1)
    status: SubmissionStatus
    ai_grade: AIGradeResult | None = None
    teacher_score: float | None = None
    teacher_feedback: str | None = None
    graded_by: str | None = None
    graded_at: datetime | None = None
    final_score: float | None = None
    grading_error: str | None = None
