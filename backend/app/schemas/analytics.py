"""Analytics schemas for AI Usage Events and Admin Dashboard metrics."""
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

# ─────────────────────────── Event Kind ────────────────────────────
EventKind = Literal["logical_operation", "provider_attempt"]

# ─────────────────────────── Operation Types ───────────────────────
OperationType = Literal[
    "advanced_chat",
    "material_verification",
    "question_generation",
    "embedding_document",
    "embedding_query",
    "web_grounding",
]

# ─────────────────────────── Provider ──────────────────────────────
ProviderType = Literal["google", "groq", "local"]

# ─────────────────────────── Retrieval Modes ───────────────────────
# Exact production values from AdvancedChatResponse.retrieval_mode
RetrievalModeType = Literal[
    "internal_only",
    "web_only",
    "hybrid",
    "model_knowledge",
    "clarification_required",
]

# ─────────────────────────── Evidence Status ───────────────────────
# Exact production values from AdvancedChatResponse.evidence_status
EvidenceStatusType = Literal[
    "well_supported",
    "partially_supported",
    "insufficient_evidence",
    "conflicting_sources",
    "unverified",
]

# ─────────────────────────── Error Codes ───────────────────────────
ErrorCodeType = Literal[
    "429_EXHAUSTED",
    "TIMEOUT",
    "PROVIDER_DOWN",
    "500_INTERNAL",
    "INVALID_RESPONSE",
]


class UsageEventCreate(BaseModel):
    """Internal model used to write a single usage event to the database."""
    event_id: str                              # UUID4, unique per event
    logical_request_id: str                   # UUID4, same across retries of same user request
    attempt_id: str                            # UUID4, unique per provider call attempt
    attempt_number: int = Field(..., ge=1)     # 1-indexed
    is_final: bool                             # True for the last attempt returned to user
    event_kind: EventKind

    user_id: str
    operation_type: OperationType
    provider: ProviderType
    model_name: str

    # Only present on advanced_chat logical operations
    retrieval_mode: Optional[RetrievalModeType] = None
    evidence_status: Optional[EvidenceStatusType] = None

    status: Literal["success", "failure"]
    error_code: Optional[ErrorCodeType] = None

    latency_ms: int = Field(..., ge=0)

    # Token counts – null when SDK does not return usage_metadata
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None

    # Number of real web-grounding HTTP calls (for web_grounding provider_attempts)
    grounding_request_count: int = 0

    created_at: datetime
