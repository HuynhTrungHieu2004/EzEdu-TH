from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Literal, Dict, Any

CategoryType = Literal["parsing", "retrieval", "qa", "routing", "verification", "question_gen", "injection", "conversation"]
ScopeType = Literal["document", "multiple_documents", "all_documents", "web_only", "general"]
EvidenceStatusType = Literal["well_supported", "partially_supported", "insufficient_evidence", "conflicting_sources", "unverified"]

class BaseEvaluationCase(BaseModel):
    case_id: str
    category: CategoryType
    scope: ScopeType
    user_fixture: Literal["user_a", "user_b"]
    document_fixtures: List[str] = Field(default_factory=list)
    question: str
    use_web_search: bool = False

# 1. Parsing & Chunking Case
class ParsingEvaluationCase(BaseEvaluationCase):
    expected_min_chunks: int = 1
    expected_max_chunks: int = 100
    required_sentences: List[str] = Field(default_factory=list)

# 2. Retrieval Case
class ExpectedChunkSpec(BaseModel):
    document_id: str
    chunk_index: int

class RetrievalEvaluationCase(BaseEvaluationCase):
    expected_chunks: List[ExpectedChunkSpec] = Field(default_factory=list)
    expected_document_ids: List[str] = Field(default_factory=list)
    expected_urls: List[str] = Field(default_factory=list)

# 3. QA Case
class QAEvaluationCase(BaseEvaluationCase):
    expected_answer: str
    required_facts: List[str] = Field(default_factory=list)
    forbidden_claims: List[str] = Field(default_factory=list)
    expected_citations: List[str] = Field(default_factory=list)
    expected_evidence_status: EvidenceStatusType
    should_abstain: bool = False

# 4. Routing Case
class RoutingEvaluationCase(BaseEvaluationCase):
    expected_retrieval_mode: Literal["internal_only", "web_only", "hybrid", "model_knowledge", "clarification_required"]

# 5. Material Verification Case
class ExpectedIssueSpec(BaseModel):
    issue_type: Literal["factual_error", "outdated_info", "needs_verification"]
    severity: Literal["low", "medium", "high", "critical"]
    sentence: str

class VerificationEvaluationCase(BaseEvaluationCase):
    expected_issues: List[ExpectedIssueSpec] = Field(default_factory=list)

# 6. Question Generation Case
class QuestionGenEvaluationCase(BaseEvaluationCase):
    expected_question_count: int = 5
    difficulty: Optional[str] = None

# 7. Prompt Injection Case
class InjectionEvaluationCase(BaseEvaluationCase):
    forbidden_claims: List[str] = Field(default_factory=list)

# 8. Conversation & Follow-up Case
class MessageSpec(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ConversationEvaluationCase(BaseEvaluationCase):
    conversation_history: List[MessageSpec] = Field(default_factory=list)
    expected_resolved_subject: Optional[str] = None
    expected_retrieval_mode: Optional[Literal["internal_only", "web_only", "hybrid", "model_knowledge", "clarification_required"]] = None
    required_facts: List[str] = Field(default_factory=list)
    forbidden_claims: List[str] = Field(default_factory=list)
    expected_max_history_used: Optional[int] = None
    should_use_web: bool = False
