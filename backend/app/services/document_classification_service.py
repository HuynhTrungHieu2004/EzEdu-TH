"""Classify an indexed student document against the existing curriculum tree."""

from __future__ import annotations

import asyncio
import inspect
import json
import math
from datetime import datetime, timezone

from bson import ObjectId

from app.services.llm_service import generate_json_with_failover


CLASSIFICATION_KEYS = frozenset({
    "subject_id",
    "grade",
    "curriculum_version",
    "chapter_id",
    "topic_ids",
    "confidence",
    "method",
    "status",
    "classified_at",
})


def classification_status(confidence: float) -> str:
    if confidence >= 0.85:
        return "confirmed"
    if confidence >= 0.60:
        return "needs_confirmation"
    return "manual_required"


async def _generate(prompt: str, llm) -> object:
    if llm is None:
        return await asyncio.to_thread(generate_json_with_failover, prompt, quality=False)
    result = llm(prompt)
    return await result if inspect.isawaitable(result) else result


def _taxonomy_id(value: object, nodes: dict[str, dict], node_type: str) -> str:
    value = str(value or "")
    node = nodes.get(value)
    if node is None or node.get("node_type") != node_type:
        raise ValueError(f"Taxonomy {node_type} ID is invalid.")
    return value


def _validate_metadata(classification: dict, selected_nodes: list[dict]) -> None:
    grade = classification.get("grade")
    if isinstance(grade, bool) or not isinstance(grade, int) or not 1 <= grade <= 12:
        raise ValueError("Classification grade is invalid.")
    curriculum_version = classification.get("curriculum_version")
    if (
        not isinstance(curriculum_version, str)
        or not curriculum_version
        or curriculum_version != curriculum_version.strip()
        or len(curriculum_version) > 64
    ):
        raise ValueError("Classification curriculum_version is invalid.")
    for node in selected_nodes:
        if node.get("grade") is not None and node["grade"] != grade:
            raise ValueError("Classification grade does not match the taxonomy.")
        if node.get("curriculum_version") is not None and node["curriculum_version"] != curriculum_version:
            raise ValueError("Classification curriculum_version does not match the taxonomy.")


async def classify_document(db, document: dict, llm=None) -> dict:
    chunks = await (
        db.document_chunks.find(
            {"document_id": str(document["_id"]), "user_id": document["user_id"]},
            {"_id": 0, "chunk_index": 1, "content": 1},
        )
        .sort("chunk_index", 1)
        .limit(6)
        .to_list(6)
    )
    if not chunks:
        raise ValueError("Indexed document has no owned chunks.")

    taxonomy = await db.curriculum_taxonomy.find(
        {"node_type": {"$in": ["subject", "chapter", "topic"]}},
        {"name": 1, "node_type": 1, "parent_id": 1, "grade": 1, "curriculum_version": 1},
    ).to_list(None)
    if not taxonomy:
        raise ValueError("Curriculum taxonomy is empty.")
    nodes = {str(node["_id"]): node for node in taxonomy}
    candidates = [
        {
            "id": str(node["_id"]),
            **{key: node.get(key) for key in ("name", "node_type", "parent_id", "grade", "curriculum_version")},
        }
        for node in taxonomy
    ]
    evidence = {
        "title": document.get("original_filename") or document.get("title") or "",
        "chunks": [chunk.get("content", "") for chunk in chunks],
    }
    prompt = (
        "Phân loại tài liệu vào cây chương trình có sẵn. Chỉ dùng ID trong TAXONOMY; "
        "không tạo ID. Trả đúng một JSON object gồm subject_id, grade, curriculum_version, "
        "chapter_id, topic_ids, confidence. Không trả giải thích.\nEVIDENCE="
        + json.dumps(evidence, ensure_ascii=False, separators=(",", ":"))
        + "\nTAXONOMY="
        + json.dumps(candidates, ensure_ascii=False, separators=(",", ":"), default=str)
    )

    raw = await _generate(prompt, llm)
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError("LLM returned malformed classification JSON.") from exc
    if not isinstance(raw, dict):
        raise ValueError("LLM classification must be a JSON object.")

    subject_id = _taxonomy_id(raw.get("subject_id"), nodes, "subject")
    chapter_id = _taxonomy_id(raw.get("chapter_id"), nodes, "chapter")
    if str(nodes[chapter_id].get("parent_id") or "") != subject_id:
        raise ValueError("Classification chapter does not belong to the subject.")
    raw_topic_ids = raw.get("topic_ids")
    if not isinstance(raw_topic_ids, list):
        raise ValueError("Classification topic_ids must be a list.")
    topic_ids = list(dict.fromkeys(_taxonomy_id(value, nodes, "topic") for value in raw_topic_ids))
    if any(str(nodes[topic_id].get("parent_id") or "") != chapter_id for topic_id in topic_ids):
        raise ValueError("Classification topic does not belong to the chapter.")

    try:
        confidence = float(raw["confidence"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("Classification confidence is invalid.") from exc
    if not math.isfinite(confidence) or not 0 <= confidence <= 1:
        raise ValueError("Classification confidence is invalid.")
    selected_nodes = [nodes[subject_id], nodes[chapter_id], *(nodes[value] for value in topic_ids)]
    _validate_metadata(raw, selected_nodes)

    return {
        "subject_id": subject_id,
        "grade": raw.get("grade"),
        "curriculum_version": raw.get("curriculum_version"),
        "chapter_id": chapter_id,
        "topic_ids": topic_ids,
        "confidence": confidence,
        "method": "ai",
        "status": classification_status(confidence),
        "classified_at": datetime.now(timezone.utc),
    }
