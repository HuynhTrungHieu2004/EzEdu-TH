from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


CourseStatus = Literal["draft", "published", "archived"]
LessonStatus = Literal["draft", "published", "archived"]
EnrollmentStatus = Literal["not_started", "learning", "completed", "cancelled"]


class CourseCreate(BaseModel):
    code: str = Field(min_length=2, max_length=32)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    thumbnail: str = ""
    subject: str = Field(min_length=1, max_length=120)
    grade: str | None = Field(default=None, max_length=40)
    teacher_ids: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    syllabus_overview: str = ""
    start_date: str = ""
    end_date: str = ""
    status: CourseStatus = "draft"


class CourseUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=32)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    thumbnail: str | None = None
    subject: str | None = Field(default=None, min_length=1, max_length=120)
    grade: str | None = Field(default=None, max_length=40)
    teacher_ids: list[str] | None = None
    goals: list[str] | None = None
    syllabus_overview: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    status: CourseStatus | None = None


class CourseRead(CourseCreate):
    id: str
    teacher_id: str = ""
    teacher_name: str = ""
    lesson_count: int = Field(default=0, ge=0)
    assignment_count: int = Field(default=0, ge=0)
    exam_count: int = Field(default=0, ge=0)
    student_count: int = Field(default=0, ge=0)
    created_at: datetime
    updated_at: datetime | None = None


class CourseAttachment(BaseModel):
    id: str
    name: str
    type: Literal["video", "pdf", "document", "link"]
    url: str
    size: str | None = None


class LessonCreate(BaseModel):
    chapter_title: str = Field(default="", max_length=200)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)
    content: str = ""
    duration_mins: int = Field(default=45, ge=0, le=1440)
    sort_order: int | None = Field(default=None, ge=0)
    status: LessonStatus = "draft"
    attachments: list[CourseAttachment] = Field(default_factory=list)


class LessonUpdate(BaseModel):
    chapter_title: str | None = Field(default=None, max_length=200)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    content: str | None = None
    duration_mins: int | None = Field(default=None, ge=0, le=1440)
    sort_order: int | None = Field(default=None, ge=0)
    status: LessonStatus | None = None
    attachments: list[CourseAttachment] | None = None


class LessonRead(LessonCreate):
    id: str
    course_id: str
    sort_order: int
    created_at: datetime
    updated_at: datetime | None = None


class EnrollmentCreate(BaseModel):
    student_id: str = Field(min_length=1)


class EnrollmentRead(BaseModel):
    id: str
    course_id: str
    course_code: str
    course_title: str
    subject: str
    grade: str = ""
    student_id: str
    student_code: str = ""
    student_name: str = ""
    student_email: str = ""
    teacher_name: str = ""
    enrollment_date: datetime
    status: EnrollmentStatus = "not_started"
    progress_pct: float = Field(default=0, ge=0, le=100)
    gpa_average: float = Field(default=0, ge=0, le=10)
    completed_lessons: int = Field(default=0, ge=0)
    total_lessons: int = Field(default=0, ge=0)
    last_activity_at: datetime | None = None


class CourseStatistics(BaseModel):
    total_courses: int = 0
    active_courses: int = 0
    total_teachers: int = 0
    total_students: int = 0
    total_enrollments: int = 0
    total_assignments: int = 0
    total_submissions: int = 0
    ai_graded_submissions: int = 0
