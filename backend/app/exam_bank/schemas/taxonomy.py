"""Cây danh mục môn/lớp/chương/chủ đề/chuẩn đầu ra.

Dùng chung cho ngân hàng câu hỏi (giai đoạn 3) và kho tri thức chuẩn (giai
đoạn 7, chưa triển khai) — xem docs/feature-expansion/02-data-model-plan.md
mục 1 ("Danh mục Subject/Chapter/Topic/LearningOutcome").
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

TaxonomyNodeType = Literal["subject", "chapter", "topic", "learning_outcome"]


class TaxonomyNodeCreate(BaseModel):
    node_type: TaxonomyNodeType
    name: str = Field(min_length=1, max_length=200)
    parent_id: Optional[str] = None
    grade: Optional[int] = Field(None, ge=1, le=12)
    curriculum_version: Optional[str] = None


class TaxonomyNodeResponse(BaseModel):
    id: str
    node_type: TaxonomyNodeType
    name: str
    parent_id: Optional[str] = None
    grade: Optional[int] = None
    curriculum_version: Optional[str] = None
    created_at: datetime
    updated_at: datetime
