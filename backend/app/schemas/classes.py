from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ClassCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)


class ClassUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)


class ClassStudentAddRequest(BaseModel):
    student_ids: List[str] = Field(..., min_length=1, max_length=200)


class ClassJoinRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)


class ClassSummary(BaseModel):
    """Lecturer/admin view: a class they own."""
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    class_code: str
    student_count: int
    created_at: datetime
    updated_at: Optional[datetime] = None


class ClassMemberView(BaseModel):
    """Student view: a class they belong to (no full roster exposed)."""
    id: str
    name: str
    student_count: int


class ClassStudentSummary(BaseModel):
    id: str
    full_name: str
    email: str


class ClassDetail(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str
    class_code: str
    students: List[ClassStudentSummary] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None


class ClassListResponse(BaseModel):
    items: List[ClassSummary] = Field(default_factory=list)


class ClassMemberListResponse(BaseModel):
    items: List[ClassMemberView] = Field(default_factory=list)


class StudentSearchResult(BaseModel):
    id: str
    full_name: str
    email: str


class StudentSearchResponse(BaseModel):
    items: List[StudentSearchResult] = Field(default_factory=list)
