from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field

from app.curriculum_kb.services import ingestion_service

MIN_RELEVANCE_SCORE = 0.35


class UngroundedOutputError(ValueError):
    pass


class GroundedChunk(BaseModel):
    chunk_id: str
    source_id: str
    title: str
    text: str
    subject_id: str
    grade: int | None = None
    topic_id: str | None = None
    source_language: Literal["vi", "en"]
    license_id: str | None = None
    citations: list[dict] = Field(default_factory=list)
    relevance_score: float


async def resolve_context(
    db,
    *,
    query: str,
    subject_id: str,
    grade: int,
    topic_id: str | None = None,
    language: str | None = None,
    n_results: int = 5,
) -> list[GroundedChunk]:
    rows = await ingestion_service.search(
        db,
        query=query,
        subject_id=subject_id,
        grade=grade,
        topic_id=topic_id,
        n_results=max(n_results, min(n_results * 2, 20)),
    )
    chunks: list[GroundedChunk] = []
    seen: set[str] = set()
    for row in rows:
        chunk_id = row.get("chunk_id")
        if not chunk_id or chunk_id in seen:
            continue
        if float(row.get("relevance_score", 0)) < MIN_RELEVANCE_SCORE:
            continue
        if language and row.get("source_language") != language:
            continue
        seen.add(chunk_id)
        chunks.append(GroundedChunk(
            chunk_id=chunk_id,
            source_id=row["source_id"],
            title=row["title"],
            text=row["chunk_text"],
            subject_id=row["subject_id"],
            grade=row.get("grade"),
            topic_id=row.get("topic_id"),
            source_language=row.get("source_language", "vi"),
            license_id=row.get("license_id"),
            citations=row.get("citations", []),
            relevance_score=float(row["relevance_score"]),
        ))
        if len(chunks) >= n_results:
            break
    return chunks


def _normalized_excerpt(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def validate_evidence(
    source_chunk_ids: list[str],
    supplied: list[GroundedChunk],
    *,
    supporting_excerpt: str | None = None,
) -> None:
    if not source_chunk_ids:
        raise UngroundedOutputError("AI output has no source chunk evidence")
    by_id = {chunk.chunk_id: chunk for chunk in supplied}
    unknown = set(source_chunk_ids) - set(by_id)
    if unknown:
        raise UngroundedOutputError(f"AI output references unknown chunks: {', '.join(sorted(unknown))}")
    if supporting_excerpt:
        excerpt = _normalized_excerpt(supporting_excerpt)
        if not excerpt or not any(excerpt in _normalized_excerpt(by_id[chunk_id].text) for chunk_id in source_chunk_ids):
            raise UngroundedOutputError("Supporting excerpt does not occur in the referenced chunks")
