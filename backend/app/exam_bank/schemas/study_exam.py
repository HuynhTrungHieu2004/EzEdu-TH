from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.personalization.schemas.onboarding import VN_SUBJECTS


StudyDifficulty = Literal["adaptive", "easy", "medium", "hard"]
StudyQuestionCount = Literal[5, 10, 15, 20]
StudyRequestStatus = Literal["pending", "running", "completed", "failed"]


class StudyExamCreateRequest(BaseModel):
    subject_id: str
    subject_label: Optional[str] = Field(None, max_length=100)
    topic_id: Optional[str] = Field(None, max_length=200)
    topic_label: Optional[str] = Field(None, max_length=200)
    difficulty: StudyDifficulty = "adaptive"
    question_count: StudyQuestionCount = 10
    conversation_id: Optional[str] = None
    message_id: Optional[str] = None
    client_request_id: str = Field(min_length=3, max_length=100)

    @field_validator("subject_id")
    @classmethod
    def validate_subject(cls, value: str) -> str:
        if value not in VN_SUBJECTS:
            raise ValueError("Môn học không hợp lệ.")
        return value


class StudyExamRequestResponse(BaseModel):
    id: str
    student_id: str
    subject_id: str
    subject_label: str
    grade: int
    topic_id: Optional[str] = None
    topic_label: Optional[str] = None
    difficulty: StudyDifficulty
    question_count: StudyQuestionCount
    status: StudyRequestStatus
    exam_id: Optional[str] = None
    selected_count: int = 0
    shortfall_count: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class StudyExamConfig(BaseModel):
    grade: int
    requested_subject_id: Optional[str] = None
    suggested_subject_id: Optional[str] = None
    suggested_topic_id: Optional[str] = None
    suggested_topic_label: Optional[str] = None
    subjects: list[dict]
    topics: list[dict] = Field(default_factory=list)
    difficulties: list[StudyDifficulty] = Field(
        default_factory=lambda: ["adaptive", "easy", "medium", "hard"]
    )
    question_counts: list[StudyQuestionCount] = Field(
        default_factory=lambda: [5, 10, 15, 20]
    )

