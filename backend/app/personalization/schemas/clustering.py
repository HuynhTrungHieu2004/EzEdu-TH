from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from app.personalization.schemas.data_models import ClusterType


class ClusterPredictionResponse(BaseModel):
    cluster_type: ClusterType
    model_version: Optional[str] = None
    cluster_id: Optional[int] = None
    distance_to_centroid: Optional[float] = None
    outlier: bool = False
    provisional: bool = False
    confidence: float = Field(..., ge=0.0, le=1.0)
    reason: str


class ClusterTrainingResult(BaseModel):
    status: str
    cluster_type: ClusterType
    version: Optional[str] = None
    selected_k: Optional[int] = None
    metrics: Dict[str, Any] = Field(default_factory=dict)
    sample_count: int = 0
    reason: Optional[str] = None
