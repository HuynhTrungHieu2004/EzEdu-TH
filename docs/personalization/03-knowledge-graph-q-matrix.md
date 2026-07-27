# 03 - Knowledge Graph and Q-Matrix From Learning Materials

## Scope

Prompt 3 adds a document-scoped pipeline that converts existing parsed learning materials into personalization metadata:

- Knowledge Components (KC).
- prerequisite and related Knowledge Graph edges.
- Q-Matrix mappings from item/question to KC weights.
- review metadata for low-confidence AI output.

The implementation does not replace the current parse/chunk/embedding/question generation pipeline. It reads already parsed chunks and existing/generated question sets, then writes personalization collections through the personalization repository layer.

## Current Module Placement

```text
backend/app/personalization/
  api/
    knowledge_graph.py
  schemas/
    data_models.py
    knowledge_extraction.py
  services/
    knowledge_extraction_service.py
  repositories/
    mongo.py
    indexes.py
  utils/
    knowledge_normalization.py
  constants/
    collections.py
```

The public router is registered under:

```text
/api/v1/personalization
```

It remains gated by:

- `PERSONALIZATION_ENABLED`
- `KNOWLEDGE_GRAPH_ENABLED`

Both are disabled by default in the current architecture.

## AI Output Schema

AI output is accepted only as strict JSON and is validated by Pydantic schemas in `backend/app/personalization/schemas/knowledge_extraction.py`.

```json
{
  "knowledge_components": [
    {
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
    }
  ],
  "item_mappings": [
    {
      "item_id": "...",
      "primary_knowledge_component": "KC_001",
      "knowledge_components": [
        {
          "knowledge_component": "KC_001",
          "weight": 1.0
        }
      ],
      "bloom_level": "remember",
      "estimated_difficulty": 0.0,
      "evidence_chunk_ids": [],
      "confidence": 0.0
    }
  ]
}
```

Strict schema behavior:

- Unknown JSON fields are rejected.
- `difficulty`, `estimated_difficulty`, `confidence`, and Q-Matrix weights are range-checked.
- `temporary_id` and KC references must follow the `KC_*` temporary-id convention.
- `primary_knowledge_component` must also be present in the item mapping.

## AI Prompt Boundary

The prompt is built by `build_knowledge_extraction_prompt()`.

Input sent to AI:

- current document chunks, trimmed to bounded text.
- current document item/question identifiers.

AI is allowed to:

- identify concepts in the supplied chunks.
- propose prerequisite and related relations.
- map existing item/question IDs to proposed concepts.
- provide confidence and evidence chunk IDs.

AI is not allowed to:

- create KCs without evidence.
- invent chunk IDs.
- invent item IDs.
- use another user's document.
- decide learner mastery, ability, or personalization scores.
- write directly to database.

The service validates all AI output before persistence.

## Pipeline Flow

```text
POST /api/v1/personalization/documents/{document_id}/knowledge-graph/extract
  |
  v
Feature flag check
  |
  v
Document ownership check: document_id + current_user.id
  |
  v
Load existing parsed chunks from document_chunks
  |
  v
Load current learning items:
  - existing personalization learning_items for the document
  - question_sets.questions for the document
  - document chunks as document_chunk items
  |
  v
Build strict extraction prompt and call configured AI provider
  |
  v
Parse strict JSON schema
  |
  v
Validate graph and evidence
  |
  v
Normalize and merge duplicate KC candidates
  |
  v
Upsert Knowledge Components
  |
  v
Upsert Knowledge Graph edges
  |
  v
Validate and normalize Q-Matrix mappings
  |
  v
Upsert Learning Items
  |
  v
Return report with warnings and review_required items
```

The pipeline processes one document at a time. It does not scan or mutate the whole database.

## Evidence and Ownership Rules

Ownership is enforced before any AI output is accepted:

- `get_owned_document(document_id, user_id)` must find the document.
- chunks are loaded with both `document_id` and `user_id`.
- question items are loaded with both `document_id` and `user_id`.
- review APIs update only records owned by the current user.

Evidence validation:

- every KC candidate must contain at least one evidence chunk.
- every item mapping must contain at least one evidence chunk.
- every referenced chunk ID must exist in the current document.
- canonical chunk IDs use `document_id:chunk_index`; stored Mongo chunk `_id` values are also accepted for compatibility.

## Knowledge Component Normalization and Merge

KC candidates are normalized by:

- lowercase, whitespace-normalized names.
- alias token key comparison.
- deterministic local text embedding comparison.

High-confidence duplicates can be merged when:

- subject matches.
- normalized name matches, alias token key matches, or local cosine similarity passes `KNOWLEDGE_COMPONENT_MERGE_SIMILARITY_THRESHOLD`.

Low-confidence candidates are not auto-merged into another group. They are persisted with review status instead.

Persisted KCs include:

- `normalized_name`
- `aliases`
- `source_document_ids`
- `evidence_chunk_ids`
- `provenance`
- `created_by`
- `model_version`

Upsert keys include owner, normalized name, and source document provenance so repeated runs do not create duplicate KCs for the same document.

## Knowledge Graph Validation

Validation rejects:

- missing KC temporary references.
- prerequisite self-loops.
- direct prerequisite cycles.
- longer prerequisite cycles.
- evidence pointing outside the current document.

Persistence also prevents edge duplication through idempotent upsert keys:

- source KC ID.
- target KC ID.
- relation type.
- document ID.

Edge status rules:

- `verified`: confidence is above threshold, subjects match, and evidence exists.
- `proposed`: low confidence, unusual cross-subject relation, or uncertain evidence.
- `rejected`: set only during review.

The current implementation records cross-subject relations as `proposed`; it does not automatically reject them because interdisciplinary materials may be valid.

## Q-Matrix Rules

Q-Matrix entries are persisted on `learning_items.q_matrix_weights`:

```text
learning_item_id -> { knowledge_component_id: normalized_weight }
```

Rules:

- `item_id` must already exist in available document items.
- mapped KCs must exist in the current AI response.
- primary KC must be included in the mapped KC list.
- each item is capped by `MAX_KNOWLEDGE_COMPONENTS_PER_ITEM`.
- weights are normalized by algorithm before persistence.
- duplicate temporary KCs that merge into one persisted KC are aggregated and normalized again.

The AI may suggest weights, but the service performs deterministic normalization.

## Review Mode

Review endpoints:

```text
GET  /api/v1/personalization/documents/{document_id}/knowledge-graph/review
POST /api/v1/personalization/knowledge-components/{component_id}/review
POST /api/v1/personalization/knowledge-graph-edges/{edge_id}/review
```

Review actions:

- KC `accepted`: status becomes `active`.
- KC `rejected`: status becomes `archived`.
- KC `edited`: status becomes `needs_review` with edited fields.
- Edge `accepted`: status becomes `verified`.
- Edge `rejected`: status becomes `rejected`.

Returned pipeline reports include `review_required` for:

- low-confidence KCs.
- proposed graph edges.
- low-confidence item mappings.

## Configuration

Added settings:

```text
MAX_KNOWLEDGE_COMPONENTS_PER_ITEM=4
KNOWLEDGE_EXTRACTION_LOW_CONFIDENCE_THRESHOLD=0.65
KNOWLEDGE_COMPONENT_MERGE_SIMILARITY_THRESHOLD=0.92
```

These are validated at application startup:

- max KC per item must be positive.
- thresholds must be within `[0,1]`.

## Persistence

Collections used or extended:

- `knowledge_components`
- `knowledge_graph_edges`
- `learning_items`
- existing `documents`
- existing `document_chunks`
- existing `question_sets`

New `knowledge_graph_edges` indexes are declared in `PERSONALIZATION_INDEXES`:

- document + relation type.
- source KC.
- target KC.
- status + updated time.
- model version.

Migration remains idempotent through the existing personalization index migration script.

## Tests

Added `backend/tests/test_knowledge_graph_pipeline.py`.

Covered cases:

- invalid AI JSON/schema.
- evidence chunk outside the current document.
- prerequisite cycle.
- duplicate concept merge.
- cross-user document access.
- low-confidence output requiring review.
- Q-Matrix weight normalization.
- rerunning the same pipeline without duplicate data.
- successful save of KCs, graph edge, and Q-Matrix mapping.

## Limitations

The AI output is treated as a proposal. The system does not claim AI can always identify the correct knowledge structure.

Known limitations before broader rollout:

- semantic merge currently uses deterministic local text features, not the production vector database.
- graph review UI is not implemented yet.
- confidence thresholds are configurable but not calibrated with human-labeled data.
- related/prerequisite quality still depends on review for low-confidence or unusual edges.
- no automatic learner mastery or recommendation algorithm is introduced in this prompt.

## Suggested Next Steps

1. Add a frontend review screen for proposed KCs and graph edges.
2. Connect KC merge comparison to existing embedding/vector infrastructure where ownership-safe.
3. Add migration/index execution to deployment checklist.
4. Add learning event capture before learner-state algorithms.
5. Implement deterministic learner-state algorithms before AI-generated explanations.
