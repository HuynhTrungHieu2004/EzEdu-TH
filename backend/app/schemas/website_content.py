from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

WebsiteSectionKey = Literal["site_identity", "header", "hero", "sections", "footer"]
WebsiteStatus = Literal["draft", "published"]


class WebsiteContentBase(BaseModel):
    section_key: WebsiteSectionKey
    draft_content: dict[str, Any] = Field(default_factory=dict)
    published_content: dict[str, Any] = Field(default_factory=dict)
    status: WebsiteStatus = "draft"
    version: int = 1
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    published_by: Optional[str] = None
    published_at: Optional[datetime] = None


class WebsiteContentItem(WebsiteContentBase):
    id: str


class WebsiteContentPublicItem(BaseModel):
    section_key: WebsiteSectionKey
    content: dict[str, Any] = Field(default_factory=dict)
    version: int = 1
    published_at: Optional[datetime] = None


class WebsiteContentPublicResponse(BaseModel):
    items: list[WebsiteContentPublicItem]
    generated_at: datetime


class WebsiteContentAdminResponse(BaseModel):
    items: list[WebsiteContentItem]
    generated_at: datetime


class WebsiteContentDraftUpdateRequest(BaseModel):
    draft_content: dict[str, Any] = Field(default_factory=dict)


class WebsiteContentPublishRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)


class WebsiteContentRollbackRequest(BaseModel):
    version: int = Field(..., ge=1)
    reason: str = Field(..., min_length=1, max_length=500)


class WebsiteContentReorderItem(BaseModel):
    section_key: str = Field(..., min_length=1, max_length=80)
    order: int = Field(..., ge=0, le=100)
    enabled: bool = True


class WebsiteContentReorderRequest(BaseModel):
    items: list[WebsiteContentReorderItem] = Field(default_factory=list)


class WebsiteContentVersionItem(BaseModel):
    id: str
    section_key: WebsiteSectionKey
    version: int
    content: dict[str, Any] = Field(default_factory=dict)
    source: Literal["draft", "published", "rollback"] = "draft"
    created_by: Optional[str] = None
    created_at: datetime
    reason: Optional[str] = None


class WebsiteContentVersionResponse(BaseModel):
    items: list[WebsiteContentVersionItem]
    total: int
    generated_at: datetime
