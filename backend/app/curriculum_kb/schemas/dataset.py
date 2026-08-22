from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import AnyHttpUrl, BaseModel, Field, computed_field, field_validator, model_validator


class CurriculumTopic(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_]*$")
    name: str = Field(min_length=2, max_length=200)


class CurriculumSubject(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9_]*$")
    name: str = Field(min_length=2, max_length=200)
    grades: list[int] = Field(min_length=1)
    topics: list[CurriculumTopic] = Field(min_length=1)

    @field_validator("grades")
    @classmethod
    def validate_grades(cls, value: list[int]) -> list[int]:
        grades = sorted(set(value))
        if not grades or grades[0] < 6 or grades[-1] > 12:
            raise ValueError("Taxonomy grades must stay between 6 and 12")
        return grades


class CurriculumTaxonomy(BaseModel):
    curriculum_version: str
    source_url: AnyHttpUrl
    subjects: list[CurriculumSubject] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_unique_subjects(self) -> "CurriculumTaxonomy":
        subject_ids = [subject.id for subject in self.subjects]
        if len(subject_ids) != len(set(subject_ids)):
            raise ValueError("Taxonomy subject ids must be unique")
        return self


class CurriculumMapping(BaseModel):
    subject_id: str = Field(pattern=r"^[a-z0-9][a-z0-9_]*$")
    grades: list[int] = Field(min_length=1)
    topic_ids: list[str] = Field(min_length=1)

    @field_validator("grades")
    @classmethod
    def validate_grades(cls, value: list[int]) -> list[int]:
        grades = sorted(set(value))
        if grades[0] < 6 or grades[-1] > 12:
            raise ValueError("Catalog grades must stay between 6 and 12")
        return grades

    @field_validator("topic_ids")
    @classmethod
    def validate_topic_ids(cls, value: list[str]) -> list[str]:
        topic_ids = list(dict.fromkeys(value))
        if any(not topic_id for topic_id in topic_ids):
            raise ValueError("Catalog topic ids cannot be empty")
        return topic_ids


class CatalogSource(BaseModel):
    source_key: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]+$")
    adapter: Literal["moet_pdf", "mediawiki", "wikibooks", "openstax"]
    url: AnyHttpUrl
    canonical_domain: str = Field(min_length=3, max_length=253)
    title: str = Field(min_length=3, max_length=300)
    language: Literal["vi", "en"]
    license_id: Literal["official-public", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-SA-4.0"]
    license_url: AnyHttpUrl
    attribution: str = Field(min_length=3, max_length=1000)
    noncommercial_only: bool = False
    demo_disposal_required: bool = False
    selectors: dict[str, Any] = Field(default_factory=dict)
    mappings: list[CurriculumMapping] = Field(min_length=1)


class DatasetManifest(BaseModel):
    dataset_key: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]+$")
    manifest_version: int = Field(ge=1)
    curriculum_version: str
    chunk_limit: int = Field(default=25_000, ge=1, le=25_000)
    target_chunks_per_combination: int = Field(default=100, ge=100, le=300)
    noncommercial_demo: bool = True
    sources: list[CatalogSource] = Field(min_length=1)

    @computed_field
    @property
    def requested_chunk_count(self) -> int:
        combinations = {
            (mapping.subject_id, grade, topic_id)
            for source in self.sources
            for mapping in source.mappings
            for grade in mapping.grades
            for topic_id in mapping.topic_ids
        }
        return len(combinations) * self.target_chunks_per_combination

    @model_validator(mode="after")
    def validate_manifest_limits(self) -> "DatasetManifest":
        source_keys = [source.source_key for source in self.sources]
        if len(source_keys) != len(set(source_keys)):
            raise ValueError("Every source_key must be unique")
        if self.requested_chunk_count > min(self.chunk_limit, 25_000):
            raise ValueError("Requested curriculum coverage exceeds the hard limit of 25,000 chunks")
        if any(source.noncommercial_only for source in self.sources) and not self.noncommercial_demo:
            raise ValueError("Noncommercial sources require noncommercial_demo=true")
        return self


class FetchedCurriculumSource(BaseModel):
    source_key: str
    canonical_url: str
    title: str
    text: str | None
    source_language: Literal["vi", "en"]
    upstream_revision: str | None = None
    page_or_section_refs: list[str] = Field(default_factory=list)
    accessed_at: datetime
    disposition: Literal["accepted", "quarantined"]
    reason: str | None = None
