from datetime import datetime

from pydantic import BaseModel, Field


class DatasetCoverageItem(BaseModel):
    subject_id: str
    grade: int
    source_language: str
    license_id: str
    source_count: int
    chunk_count: int


class DatasetRunSummary(BaseModel):
    manifest_version: int
    mode: str
    status: str
    started_at: datetime
    finished_at: datetime | None = None


class DatasetReportResponse(BaseModel):
    dataset_key: str
    source_count: int
    chunk_count: int
    coverage: list[DatasetCoverageItem] = Field(default_factory=list)
    latest_run: DatasetRunSummary | None = None
