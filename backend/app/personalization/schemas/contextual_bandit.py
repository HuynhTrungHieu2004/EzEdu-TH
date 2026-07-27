from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


BanditPolicyStatus = Literal["draft", "shadow", "active", "rolled_back", "disabled"]
BanditActionType = Literal["candidate_source"]


class BanditContextVector(BaseModel):
    model_config = ConfigDict(frozen=True)

    schema_version: str = Field(..., min_length=1)
    feature_names: list[str] = Field(default_factory=list)
    values: list[float] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_dimensions(self) -> "BanditContextVector":
        if len(self.feature_names) != len(self.values):
            raise ValueError("Context feature_names and values must have the same length.")
        forbidden = {"user_id", "item_id", "document_id", "question_id", "email", "full_name"}
        leaked = forbidden.intersection(self.feature_names)
        if leaked:
            raise ValueError(f"Identifier features are not allowed in bandit context: {sorted(leaked)}")
        return self


class BanditActionScore(BaseModel):
    action: str = Field(..., min_length=1)
    item_id: str = Field(..., min_length=1)
    sampled_score: float
    posterior_mean_score: float
    exploration: bool = False


class BanditDecision(BaseModel):
    policy_version: str = Field(..., min_length=1)
    context_schema_version: str = Field(..., min_length=1)
    mode: Literal["shadow", "active", "disabled", "fallback_ranker"]
    selected_item_id: Optional[str] = None
    selected_action: Optional[str] = None
    reason: str
    action_scores: list[BanditActionScore] = Field(default_factory=list)


class BanditRewardBreakdown(BaseModel):
    immediate_reward: float = Field(..., ge=-1.0, le=1.0)
    learning_reward: float = Field(..., ge=-1.0, le=1.0)
    final_reward: float = Field(..., ge=-1.0, le=1.0)
    reward_components: dict[str, float] = Field(default_factory=dict)


class ContextualBanditPolicy(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: Optional[str] = None
    policy_type: BanditActionType = "candidate_source"
    version: str = Field(..., min_length=1)
    context_schema_version: str = Field(..., min_length=1)
    feature_names: list[str] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
    prior_parameters: dict[str, float] = Field(default_factory=dict)
    posterior_parameters: dict[str, dict[str, list[float] | float]] = Field(default_factory=dict)
    update_count: int = Field(default=0, ge=0)
    status: BanditPolicyStatus = "draft"
    trained_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None
    rolled_back_at: Optional[datetime] = None


class BanditSimulationResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    is_synthetic: bool
    policy_version: str
    interaction_count: int = Field(..., ge=0)
    cumulative_reward: float
    regret: float
    learning_gain_proxy: float
    safety_violation_rate: float = Field(..., ge=0.0, le=1.0)
    coverage: float = Field(..., ge=0.0, le=1.0)
    exploration_distribution: dict[str, int] = Field(default_factory=dict)
    generated_at: datetime
