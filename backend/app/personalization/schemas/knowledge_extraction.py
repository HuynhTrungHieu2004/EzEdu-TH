from typing import List, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


BloomLevel = Literal["remember", "understand", "apply", "analyze"]


class AIKnowledgeComponentCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    temporary_id: str = Field(..., pattern=r"^KC_[A-Za-z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=240)
    description: str = Field(..., min_length=1, max_length=4000)
    subject: str = Field(..., min_length=1, max_length=160)
    topic: str = Field(..., min_length=1, max_length=240)
    difficulty: float = Field(..., ge=0.0, le=1.0)
    prerequisite_temporary_ids: List[str] = Field(default_factory=list)
    related_temporary_ids: List[str] = Field(default_factory=list)
    evidence_chunk_ids: List[str] = Field(default_factory=list, min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_no_self_reference(self) -> "AIKnowledgeComponentCandidate":
        if self.temporary_id in self.prerequisite_temporary_ids:
            raise ValueError("Knowledge component cannot be its own prerequisite.")
        if self.temporary_id in self.related_temporary_ids:
            raise ValueError("Knowledge component cannot be related to itself.")
        return self


class AIKnowledgeComponentWeight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    knowledge_component: str = Field(..., pattern=r"^KC_[A-Za-z0-9_-]+$")
    weight: float = Field(..., gt=0.0, le=1.0)


class AIItemMappingCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: str = Field(..., min_length=1)
    primary_knowledge_component: str = Field(..., pattern=r"^KC_[A-Za-z0-9_-]+$")
    knowledge_components: List[AIKnowledgeComponentWeight] = Field(default_factory=list, min_length=1)
    bloom_level: BloomLevel
    estimated_difficulty: float = Field(..., ge=0.0, le=1.0)
    evidence_chunk_ids: List[str] = Field(default_factory=list, min_length=1)
    confidence: float = Field(..., ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_primary_is_mapped(self) -> "AIItemMappingCandidate":
        mapped = {item.knowledge_component for item in self.knowledge_components}
        if self.primary_knowledge_component not in mapped:
            raise ValueError("primary_knowledge_component must be included in knowledge_components.")
        return self


class AIKnowledgeExtractionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    knowledge_components: List[AIKnowledgeComponentCandidate] = Field(default_factory=list)
    item_mappings: List[AIItemMappingCandidate] = Field(default_factory=list)
