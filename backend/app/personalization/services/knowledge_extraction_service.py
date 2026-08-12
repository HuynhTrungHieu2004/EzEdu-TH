import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.core.config import settings
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import (
    KnowledgeComponent,
    KnowledgeGraphEdge,
    LearningItem,
)
from app.personalization.schemas.knowledge_extraction import (
    AIKnowledgeComponentCandidate,
    AIKnowledgeExtractionResponse,
)
from app.personalization.utils.knowledge_normalization import (
    cosine_similarity,
    has_cycle,
    has_direct_cycle,
    local_text_embedding,
    normalize_knowledge_name,
    normalize_weights,
    token_alias_key,
)

logger = logging.getLogger(__name__)


class KnowledgeExtractionValidationError(ValueError):
    """Raised when the AI output violates the strict personalization contract."""


def build_knowledge_extraction_prompt(chunks: list[dict], items: list[dict]) -> str:
    chunk_payload = [
        {
            "chunk_id": chunk["canonical_chunk_id"],
            "chunk_index": chunk.get("chunk_index"),
            "text": (chunk.get("content") or "")[:1200],
        }
        for chunk in chunks
    ]
    item_payload = [
        {
            "item_id": item["item_id"],
            "item_type": item.get("item_type", "question"),
            "text": (item.get("question") or item.get("content") or "")[:1000],
        }
        for item in items
    ]

    return f"""Bạn là hệ thống gắn nhãn kiến thức cho học liệu.

Chỉ trả về JSON hợp lệ theo đúng schema:
{{
  "knowledge_components": [
    {{
      "temporary_id": "KC_001",
      "name": "...",
      "description": "...",
      "subject": "...",
      "topic": "...",
      "difficulty": 0.0,
      "prerequisite_temporary_ids": [],
      "related_temporary_ids": [],
      "evidence_chunk_ids": [],
      "confidence": 0.0
    }}
  ],
  "item_mappings": [
    {{
      "item_id": "...",
      "primary_knowledge_component": "KC_001",
      "knowledge_components": [
        {{"knowledge_component": "KC_001", "weight": 1.0}}
      ],
      "bloom_level": "remember",
      "estimated_difficulty": 0.0,
      "evidence_chunk_ids": [],
      "confidence": 0.0
    }}
  ]
}}

Quy tắc:
- Không tạo Knowledge Component nếu không có evidence_chunk_ids.
- evidence_chunk_ids phải lấy từ danh sách chunk_id bên dưới.
- Không tự bịa item_id ngoài danh sách item_id.
- confidence và difficulty nằm trong [0,1].
- Không tạo prerequisite tự tham chiếu.
- Không tạo chu trình prerequisite.
- Mỗi item chỉ gắn một số ít knowledge components cần thiết.
- Nếu không chắc chắn, giảm confidence thay vì đoán.

CHUNKS:
{json.dumps(chunk_payload, ensure_ascii=False)}

ITEMS:
{json.dumps(item_payload, ensure_ascii=False)}

Chỉ trả JSON, không markdown."""


def _parse_ai_response(raw_response: str | dict) -> AIKnowledgeExtractionResponse:
    try:
        payload = json.loads(raw_response) if isinstance(raw_response, str) else raw_response
        return AIKnowledgeExtractionResponse.model_validate(payload)
    except (json.JSONDecodeError, ValidationError, TypeError) as exc:
        raise KnowledgeExtractionValidationError("AI response does not match knowledge extraction schema.") from exc


def _canonicalize_chunks(chunks: list[dict], document_id: str) -> tuple[list[dict], set[str]]:
    canonicalized = []
    valid_ids: set[str] = set()
    for chunk in chunks:
        chunk_index = int(chunk.get("chunk_index", len(canonicalized)))
        canonical_id = f"{document_id}:{chunk_index}"
        enriched = dict(chunk)
        enriched["canonical_chunk_id"] = canonical_id
        canonicalized.append(enriched)
        valid_ids.add(canonical_id)
        if chunk.get("_id") is not None:
            valid_ids.add(str(chunk["_id"]))
    return canonicalized, valid_ids


def _validate_evidence(candidate_id: str, evidence_chunk_ids: list[str], valid_chunk_ids: set[str]) -> None:
    if not evidence_chunk_ids:
        raise KnowledgeExtractionValidationError(f"{candidate_id} has no evidence_chunk_ids.")
    missing = [chunk_id for chunk_id in evidence_chunk_ids if chunk_id not in valid_chunk_ids]
    if missing:
        raise KnowledgeExtractionValidationError(f"{candidate_id} references chunks outside the current document: {missing}.")


def _validate_ai_graph(ai_response: AIKnowledgeExtractionResponse, valid_chunk_ids: set[str]) -> None:
    candidates = ai_response.knowledge_components
    temp_ids = [candidate.temporary_id for candidate in candidates]
    if len(temp_ids) != len(set(temp_ids)):
        raise KnowledgeExtractionValidationError("Duplicate knowledge component temporary_id.")

    temp_id_set = set(temp_ids)
    prerequisite_edges: list[tuple[str, str]] = []

    for candidate in candidates:
        _validate_evidence(candidate.temporary_id, candidate.evidence_chunk_ids, valid_chunk_ids)
        for ref_id in candidate.prerequisite_temporary_ids + candidate.related_temporary_ids:
            if ref_id not in temp_id_set:
                raise KnowledgeExtractionValidationError(f"{candidate.temporary_id} references missing node {ref_id}.")
        for prereq_id in candidate.prerequisite_temporary_ids:
            if prereq_id == candidate.temporary_id:
                raise KnowledgeExtractionValidationError("Prerequisite self-loop is not allowed.")
            prerequisite_edges.append((prereq_id, candidate.temporary_id))

    if has_direct_cycle(prerequisite_edges) or has_cycle(temp_ids, prerequisite_edges):
        raise KnowledgeExtractionValidationError("Prerequisite cycle is not allowed.")


def _merge_candidates(
    candidates: list[AIKnowledgeComponentCandidate],
    *,
    low_confidence_threshold: float,
    merge_similarity_threshold: float,
) -> tuple[list[list[AIKnowledgeComponentCandidate]], list[str]]:
    groups: list[list[AIKnowledgeComponentCandidate]] = []
    warnings: list[str] = []

    for candidate in candidates:
        normalized = normalize_knowledge_name(candidate.name)
        alias_key = token_alias_key(candidate.name)
        candidate_embedding = local_text_embedding(f"{candidate.name} {candidate.description}")
        matched_group = None

        if candidate.confidence >= low_confidence_threshold:
            for group in groups:
                representative = group[0]
                if representative.confidence < low_confidence_threshold:
                    continue
                if representative.subject.strip().casefold() != candidate.subject.strip().casefold():
                    continue
                rep_normalized = normalize_knowledge_name(representative.name)
                rep_alias_key = token_alias_key(representative.name)
                rep_embedding = local_text_embedding(f"{representative.name} {representative.description}")
                if (
                    normalized == rep_normalized
                    or alias_key == rep_alias_key
                    or cosine_similarity(candidate_embedding, rep_embedding) >= merge_similarity_threshold
                ):
                    matched_group = group
                    break

        if matched_group is None:
            groups.append([candidate])
        else:
            matched_group.append(candidate)
            warnings.append(f"Merged duplicate concept candidate {candidate.temporary_id} into {matched_group[0].temporary_id}.")

    return groups, warnings


def _group_representative(group: list[AIKnowledgeComponentCandidate]) -> AIKnowledgeComponentCandidate:
    return max(group, key=lambda item: item.confidence)


def _edge_status(confidence: float, source_subject: str, target_subject: str, evidence_chunk_ids: list[str]) -> str:
    if confidence < settings.KNOWLEDGE_EXTRACTION_LOW_CONFIDENCE_THRESHOLD:
        return "proposed"
    if source_subject.strip().casefold() != target_subject.strip().casefold():
        return "proposed"
    if not evidence_chunk_ids:
        return "proposed"
    return "verified"


def _item_text(source_item: dict) -> str:
    """Lấy phần chữ đại diện cho item — mỗi loại item lưu ở một khoá khác nhau."""
    for key in ("content", "question", "title"):
        value = source_item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _build_item_embeddings(item_mappings, available_items: dict) -> dict[str, list[float]]:
    """Nhúng nội dung các item theo lô, trả về map item_id -> vector.

    Không bao giờ ném lỗi: trích xuất tri thức phải hoàn tất kể cả khi dịch vụ
    embedding trục trặc — khi đó item chỉ thiếu vector, các phần khác vẫn đúng.
    """
    from app.services.rag_service import build_embeddings

    targets = []
    for mapping in item_mappings:
        source_item = available_items.get(mapping.item_id)
        if not source_item:
            continue
        text = _item_text(source_item)
        if text:
            targets.append((mapping.item_id, text))

    if not targets:
        return {}

    try:
        _, vectors = build_embeddings([text for _, text in targets])
    except Exception as exc:  # noqa: BLE001 - thiếu vector còn hơn hỏng cả bước trích xuất
        logger.warning(
            "Không nhúng được nội dung item, phân cụm nội dung sẽ kém chính xác: %s: %s",
            exc.__class__.__name__, exc,
        )
        return {}

    return {item_id: list(vector) for (item_id, _), vector in zip(targets, vectors)}


async def process_document_knowledge_graph(
    document_id: str,
    user_id: str,
    *,
    ai_response: Optional[str | dict] = None,
    ai_json_generator: Optional[Callable[[str], str]] = None,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> dict:
    repo = repository or PersonalizationMongoRepository()
    document = await repo.get_owned_document(document_id, user_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    raw_chunks = await repo.list_document_chunks(document_id, user_id)
    chunks, valid_chunk_ids = _canonicalize_chunks(raw_chunks, document_id)
    if not chunks:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Document has no parsed/indexed chunks.")

    existing_items = await repo.list_existing_learning_items_for_document(document_id)
    question_items = await repo.list_question_items_for_document(document_id, user_id)
    chunk_items = [
        {
            "item_id": chunk["canonical_chunk_id"],
            "item_type": "document_chunk",
            "content": chunk.get("content", ""),
            "source_chunk_ids": [chunk["canonical_chunk_id"]],
        }
        for chunk in chunks
    ]
    available_items = {item["item_id"]: item for item in [*existing_items, *question_items, *chunk_items]}

    if ai_response is None:
        prompt = build_knowledge_extraction_prompt(chunks, list(available_items.values()))
        if ai_json_generator is None:
            from app.services.llm_service import generate_json, gemini_generate_json, is_gemini_available

            ai_json_generator = gemini_generate_json if is_gemini_available() else generate_json
        ai_response = ai_json_generator(prompt)

    parsed = _parse_ai_response(ai_response)
    _validate_ai_graph(parsed, valid_chunk_ids)

    warnings: list[str] = []
    groups, merge_warnings = _merge_candidates(
        parsed.knowledge_components,
        low_confidence_threshold=settings.KNOWLEDGE_EXTRACTION_LOW_CONFIDENCE_THRESHOLD,
        merge_similarity_threshold=settings.KNOWLEDGE_COMPONENT_MERGE_SIMILARITY_THRESHOLD,
    )
    warnings.extend(merge_warnings)

    now = datetime.now(timezone.utc)
    temp_to_component: dict[str, dict] = {}
    temp_to_candidate: dict[str, AIKnowledgeComponentCandidate] = {}
    persisted_components: list[dict] = []

    for group in groups:
        representative = _group_representative(group)
        evidence = sorted({chunk_id for candidate in group for chunk_id in candidate.evidence_chunk_ids})
        aliases = sorted({candidate.name for candidate in group if candidate.name != representative.name})
        temp_ids = [candidate.temporary_id for candidate in group]
        status_value = (
            "active"
            if representative.confidence >= settings.KNOWLEDGE_EXTRACTION_LOW_CONFIDENCE_THRESHOLD
            else "needs_review"
        )
        component = KnowledgeComponent(
            name=representative.name,
            normalized_name=normalize_knowledge_name(representative.name),
            description=representative.description,
            subject=representative.subject,
            topic=representative.topic,
            difficulty=representative.difficulty,
            source_document_ids=[document_id],
            evidence_chunk_ids=evidence,
            aliases=aliases,
            provenance={
                "source": "ai_knowledge_extraction",
                "temporary_ids": temp_ids,
                "document_id": document_id,
                "merge_strategy": "normalized_name_alias_embedding",
            },
            status=status_value,
            confidence=representative.confidence,
            created_by=user_id,
            created_at=now,
            updated_at=now,
            model_version=settings.KNOWLEDGE_MODEL_VERSION,
        )
        persisted = await repo.upsert_knowledge_component(component, document_id)
        persisted_components.append(persisted)
        for candidate in group:
            temp_to_component[candidate.temporary_id] = persisted
            temp_to_candidate[candidate.temporary_id] = candidate

    persisted_edges: list[dict] = []
    seen_edges: set[tuple[str, str, str, str]] = set()
    for candidate in parsed.knowledge_components:
        target = temp_to_component[candidate.temporary_id]
        target_candidate = temp_to_candidate[candidate.temporary_id]
        for prereq_temp_id in candidate.prerequisite_temporary_ids:
            source = temp_to_component[prereq_temp_id]
            source_candidate = temp_to_candidate[prereq_temp_id]
            edge_key = (source["id"], target["id"], "prerequisite", document_id)
            if edge_key in seen_edges:
                warnings.append(f"Duplicate prerequisite edge skipped: {prereq_temp_id}->{candidate.temporary_id}.")
                continue
            seen_edges.add(edge_key)
            evidence = sorted(set(source.get("evidence_chunk_ids", [])) & set(target.get("evidence_chunk_ids", [])))
            if not evidence:
                evidence = sorted(set(source.get("evidence_chunk_ids", [])) | set(target.get("evidence_chunk_ids", [])))
            confidence = min(source_candidate.confidence, target_candidate.confidence)
            edge = KnowledgeGraphEdge(
                source_knowledge_component_id=source["id"],
                target_knowledge_component_id=target["id"],
                relation_type="prerequisite",
                document_id=document_id,
                evidence_chunk_ids=evidence,
                confidence=confidence,
                status=_edge_status(confidence, source_candidate.subject, target_candidate.subject, evidence),
                created_by=user_id,
                created_at=now,
                updated_at=now,
                model_version=settings.KNOWLEDGE_MODEL_VERSION,
                provenance={"source_temporary_id": prereq_temp_id, "target_temporary_id": candidate.temporary_id},
            )
            persisted_edges.append(await repo.upsert_graph_edge(edge))

        for related_temp_id in candidate.related_temporary_ids:
            source = temp_to_component[candidate.temporary_id]
            target = temp_to_component[related_temp_id]
            source_candidate = temp_to_candidate[candidate.temporary_id]
            target_candidate = temp_to_candidate[related_temp_id]
            source_id, target_id = sorted([source["id"], target["id"]])
            edge_key = (source_id, target_id, "related", document_id)
            if edge_key in seen_edges:
                warnings.append(f"Duplicate related edge skipped: {candidate.temporary_id}<->{related_temp_id}.")
                continue
            seen_edges.add(edge_key)
            evidence = sorted(set(source.get("evidence_chunk_ids", [])) | set(target.get("evidence_chunk_ids", [])))
            confidence = min(source_candidate.confidence, target_candidate.confidence)
            edge = KnowledgeGraphEdge(
                source_knowledge_component_id=source_id,
                target_knowledge_component_id=target_id,
                relation_type="related",
                document_id=document_id,
                evidence_chunk_ids=evidence,
                confidence=confidence,
                status=_edge_status(confidence, source_candidate.subject, target_candidate.subject, evidence),
                created_by=user_id,
                created_at=now,
                updated_at=now,
                model_version=settings.KNOWLEDGE_MODEL_VERSION,
                provenance={"source_temporary_id": candidate.temporary_id, "target_temporary_id": related_temp_id},
            )
            persisted_edges.append(await repo.upsert_graph_edge(edge))

    # Nhúng nội dung từng item TRƯỚC vòng lặp để gọi embedding theo lô thay vì
    # từng cái một. Vector này là 70% trọng số đặc trưng của cụm `content` và
    # `question`; thiếu nó thì phân cụm chạy trên vector hằng và mất trắng phần
    # trọng số đó.
    item_embeddings = _build_item_embeddings(parsed.item_mappings, available_items)

    persisted_items: list[dict] = []
    for mapping in parsed.item_mappings:
        _validate_evidence(mapping.item_id, mapping.evidence_chunk_ids, valid_chunk_ids)
        if mapping.item_id not in available_items:
            raise KnowledgeExtractionValidationError(f"Unknown item_id in Q-Matrix mapping: {mapping.item_id}.")
        if len(mapping.knowledge_components) > settings.MAX_KNOWLEDGE_COMPONENTS_PER_ITEM:
            raise KnowledgeExtractionValidationError("Too many knowledge components mapped to one item.")

        temp_weights = {entry.knowledge_component: entry.weight for entry in mapping.knowledge_components}
        if set(temp_weights) - set(temp_to_component):
            raise KnowledgeExtractionValidationError("Q-Matrix references missing knowledge component.")
        if mapping.primary_knowledge_component not in temp_weights:
            raise KnowledgeExtractionValidationError("Primary knowledge component is not present in Q-Matrix weights.")

        normalized_temp_weights = normalize_weights(temp_weights)
        if any(abs(normalized_temp_weights[temp_id] - temp_weights[temp_id]) > 0.0001 for temp_id in temp_weights):
            warnings.append(f"Normalized Q-Matrix weights for item {mapping.item_id}.")

        q_matrix_weights: dict[str, float] = {}
        for temp_id, weight in normalized_temp_weights.items():
            component_id = temp_to_component[temp_id]["id"]
            q_matrix_weights[component_id] = q_matrix_weights.get(component_id, 0.0) + weight
        q_matrix_weights = normalize_weights(q_matrix_weights)
        mapped_kc_ids = list(q_matrix_weights.keys())
        source_item = available_items[mapping.item_id]
        learning_item = LearningItem(
            id=mapping.item_id,
            semantic_embedding=item_embeddings.get(mapping.item_id, []),
            item_type=source_item.get("item_type", "question"),
            document_id=document_id,
            source_chunk_ids=mapping.evidence_chunk_ids,
            knowledge_component_ids=mapped_kc_ids,
            primary_knowledge_component_id=temp_to_component[mapping.primary_knowledge_component]["id"],
            q_matrix_weights=q_matrix_weights,
            difficulty=mapping.estimated_difficulty,
            bloom_level=mapping.bloom_level,
            quality_score=mapping.confidence,
            verification_status=(
                "verified"
                if mapping.confidence >= settings.KNOWLEDGE_EXTRACTION_LOW_CONFIDENCE_THRESHOLD
                else "needs_review"
            ),
            question_set_id=source_item.get("question_set_id"),
            question_index=source_item.get("question_index"),
            created_at=now,
            updated_at=now,
            model_version=settings.KNOWLEDGE_MODEL_VERSION,
        )
        persisted_items.append(await repo.upsert_learning_item(learning_item))

    review_required = [
        {"type": "knowledge_component", "id": item["id"]}
        for item in persisted_components
        if item.get("status") == "needs_review"
    ]
    review_required.extend(
        {"type": "knowledge_graph_edge", "id": item["id"]}
        for item in persisted_edges
        if item.get("status") == "proposed"
    )
    review_required.extend(
        {"type": "learning_item", "id": item["id"]}
        for item in persisted_items
        if item.get("verification_status") == "needs_review"
    )

    return {
        "document_id": document_id,
        "knowledge_components_saved": len(persisted_components),
        "knowledge_graph_edges_saved": len(persisted_edges),
        "learning_items_mapped": len(persisted_items),
        "review_required": review_required,
        "warnings": warnings,
        "model_version": settings.KNOWLEDGE_MODEL_VERSION,
    }
