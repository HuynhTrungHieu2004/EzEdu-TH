"""Lượt làm bài (ExamAttempt) — đồng hồ đếm giờ do SERVER quyết định
(`due_at` tính từ lúc server ghi nhận `started_at`, KHÔNG dựa vào đồng hồ máy
học sinh). Ba lớp tự nộp bài (auto-submit) khi hết giờ:
  1. Client tự gọi /submit khi countdown về 0 (chủ đạo).
  2. Mọi lần autosave, server kiểm tra nếu đã quá `due_at` thì tự chốt nộp
     (bắt trường hợp học sinh quay lại sau khi hết giờ mà client không kịp gọi submit).
  3. Worker nền (`app/worker.py`) quét định kỳ các attempt còn "in_progress"
     đã quá `due_at` để tự nộp — bắt trường hợp đóng tab hẳn, không quay lại nữa.
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

AttemptStatus = Literal["in_progress", "submitted", "graded"]


class AttemptStartResponse(BaseModel):
    id: str
    exam_id: str
    exam_code: str
    started_at: datetime
    due_at: datetime
    server_now: datetime
    status: AttemptStatus


class AttemptAutosaveRequest(BaseModel):
    version: int = Field(ge=1)
    answers: Dict[str, str] = Field(default_factory=dict)


class AttemptSubmitRequest(BaseModel):
    version: int = Field(ge=1)
    answers: Dict[str, str] = Field(default_factory=dict)


class AttemptOverrideRequest(BaseModel):
    version: int = Field(ge=1)
    question_id: str
    teacher_score: float = Field(ge=0)
    teacher_feedback: Optional[str] = None


class AttemptQuestionResult(BaseModel):
    question_id: str
    question_type: str
    points_possible: float
    student_answer: Optional[str] = None
    is_correct: Optional[bool] = None  # None cho tới khi chấm xong (trắc nghiệm/đúng-sai có ngay, tự luận chờ AI)
    ai_score: Optional[float] = None
    ai_confidence: Optional[float] = None
    ai_feedback: Optional[str] = None
    teacher_score: Optional[float] = None
    teacher_feedback: Optional[str] = None
    final_score: float = 0.0


class AttemptResponse(BaseModel):
    id: str
    exam_id: str
    exam_code: str
    student_id: str
    student_name: Optional[str] = None
    student_email: Optional[str] = None
    status: AttemptStatus
    answers: Dict[str, str]
    started_at: datetime
    due_at: datetime
    server_now: datetime
    submitted_at: Optional[datetime] = None
    auto_submitted: bool = False
    total_score: float = 0.0
    max_score: float = 0.0
    results: List[AttemptQuestionResult] = Field(default_factory=list)
    version: int
    created_at: datetime
    updated_at: datetime


class AttemptListResponse(BaseModel):
    items: List[AttemptResponse]
    total: int
