from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


AdvancedModelName = Literal["neuralcd", "akt"]
AdvancedModelMode = Literal["production", "research_only"]
AdvancedModelStatus = Literal["ready", "not_ready", "skipped", "trained_research"]


class AdvancedModelReadinessThresholds(BaseModel):
    model_config = ConfigDict(frozen=True)

    min_users: int = Field(..., ge=1)
    min_items: int = Field(..., ge=1)
    min_interactions: int = Field(..., ge=1)
    min_interactions_per_user: float = Field(..., gt=0)
    min_knowledge_components: int = Field(..., ge=1)
    min_q_matrix_coverage: float = Field(..., ge=0.0, le=1.0)
    max_sparsity: float = Field(..., gt=0.0, le=1.0)
    min_sequence_length: int = Field(..., ge=1)


class AdvancedModelReadinessAudit(BaseModel):
    model_config = ConfigDict(frozen=True)

    user_count: int = Field(..., ge=0)
    item_count: int = Field(..., ge=0)
    interaction_count: int = Field(..., ge=0)
    average_interactions_per_user: float = Field(..., ge=0.0)
    knowledge_component_count: int = Field(..., ge=0)
    q_matrix_coverage: float = Field(..., ge=0.0, le=1.0)
    data_sparsity: float = Field(..., ge=0.0, le=1.0)
    median_sequence_length: float = Field(..., ge=0.0)
    max_sequence_length: int = Field(..., ge=0)
    train_validation_test_split_feasible: bool
    production_ready: bool
    blocking_reasons: list[str] = Field(default_factory=list)
    thresholds: AdvancedModelReadinessThresholds
    generated_at: datetime


class AdvancedModelCheckpoint(BaseModel):
    model_config = ConfigDict(frozen=True)

    model_name: AdvancedModelName
    version: str = Field(..., min_length=1)
    checkpoint_path: Optional[str] = None
    status: AdvancedModelStatus
    mode: AdvancedModelMode


class AdvancedModelTrainingPlan(BaseModel):
    model_config = ConfigDict(frozen=True)

    model_name: AdvancedModelName
    status: AdvancedModelStatus
    mode: AdvancedModelMode
    version: str = Field(..., min_length=1)
    checkpoint: Optional[AdvancedModelCheckpoint] = None
    split_strategy: str
    metrics: dict[str, object] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class AdvancedDiagnosisExperimentReport(BaseModel):
    model_config = ConfigDict(frozen=True)

    readiness: AdvancedModelReadinessAudit
    production_model: str = "bkt_irt"
    neuralcd: AdvancedModelTrainingPlan
    akt: AdvancedModelTrainingPlan
    baseline_comparison: dict[str, object] = Field(default_factory=dict)
    generated_at: datetime
