from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


CrawlBatchStatus = Literal["pending", "running", "completed", "failed"]
CrawlReviewStatus = Literal["draft", "reviewing", "approved", "rejected"]


class CrawlBatchCreate(BaseModel):
    seed_urls: list[str] = Field(min_length=1, max_length=20)
    subject_id: str = Field(min_length=1, max_length=100)
    grade: Optional[int] = Field(None, ge=1, le=12)
    topic_id: Optional[str] = Field(None, max_length=200)
    max_pages: int = Field(20, ge=1, le=100)


class CrawlBatchResponse(BaseModel):
    id: str
    seed_urls: list[str]
    subject_id: str
    grade: Optional[int] = None
    topic_id: Optional[str] = None
    max_pages: int
    status: CrawlBatchStatus
    fetched_count: int = 0
    blocked_count: int = 0
    failed_count: int = 0
    error_message: Optional[str] = None
    owner_id: str
    created_at: datetime
    updated_at: datetime


class CrawlItemReviewRequest(BaseModel):
    target_status: CrawlReviewStatus


class CrawlItemResponse(BaseModel):
    id: str
    batch_id: str
    canonical_url: str
    source_url: str
    title: Optional[str] = None
    content_text: Optional[str] = None
    crawl_status: str
    crawl_error: Optional[str] = None
    review_status: CrawlReviewStatus
    quality_status: str
    copyright_status: str
    subject_id: Optional[str] = None
    grade: Optional[int] = None
    topic_id: Optional[str] = None
    owner_id: str
    created_at: datetime
    updated_at: datetime


class CrawlItemListResponse(BaseModel):
    items: list[CrawlItemResponse]
    total: int
