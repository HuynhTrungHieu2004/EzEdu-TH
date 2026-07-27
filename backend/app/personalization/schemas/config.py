from pydantic import BaseModel, ConfigDict, Field


class PersonalizationFeatureFlags(BaseModel):
    """Runtime switches for personalization capabilities."""

    model_config = ConfigDict(frozen=True)

    personalization_enabled: bool = False
    knowledge_graph_enabled: bool = False
    learner_model_enabled: bool = False
    recommendation_enabled: bool = False
    ai_recommendation_explanation_enabled: bool = False
    bandit_enabled: bool = False
    neuralcd_enabled: bool = False
    akt_enabled: bool = False

    @classmethod
    def from_settings(cls, settings) -> "PersonalizationFeatureFlags":
        return cls(
            personalization_enabled=settings.PERSONALIZATION_ENABLED,
            knowledge_graph_enabled=settings.KNOWLEDGE_GRAPH_ENABLED,
            learner_model_enabled=settings.LEARNER_MODEL_ENABLED,
            recommendation_enabled=settings.RECOMMENDATION_ENABLED,
            ai_recommendation_explanation_enabled=settings.AI_RECOMMENDATION_EXPLANATION_ENABLED,
            bandit_enabled=settings.BANDIT_ENABLED,
            neuralcd_enabled=settings.NEURALCD_ENABLED,
            akt_enabled=settings.AKT_ENABLED,
        )

    def effective(self) -> "PersonalizationFeatureFlags":
        """Disable every child capability when the root flag is off."""
        if self.personalization_enabled:
            return self
        return PersonalizationFeatureFlags()


class PersonalizationModelVersions(BaseModel):
    """Version fields persisted with future personalization outputs."""

    model_config = ConfigDict(frozen=True)

    feature_schema_version: str = Field(default="v1", min_length=1)
    knowledge_model_version: str = Field(default="v0", min_length=1)
    learner_model_version: str = Field(default="v0", min_length=1)
    clustering_model_version: str = Field(default="v0", min_length=1)
    ranking_model_version: str = Field(default="v0", min_length=1)
    bandit_policy_version: str = Field(default="v0", min_length=1)
    neuralcd_model_version: str = Field(default="v0-research", min_length=1)
    akt_model_version: str = Field(default="v0-research", min_length=1)

    @classmethod
    def from_settings(cls, settings) -> "PersonalizationModelVersions":
        return cls(
            feature_schema_version=settings.FEATURE_SCHEMA_VERSION,
            knowledge_model_version=settings.KNOWLEDGE_MODEL_VERSION,
            learner_model_version=settings.LEARNER_MODEL_VERSION,
            clustering_model_version=settings.CLUSTERING_MODEL_VERSION,
            ranking_model_version=settings.RANKING_MODEL_VERSION,
            bandit_policy_version=settings.BANDIT_POLICY_VERSION,
            neuralcd_model_version=settings.NEURALCD_MODEL_VERSION,
            akt_model_version=settings.AKT_MODEL_VERSION,
        )


class PersonalizationRuntimeConfig(BaseModel):
    """Typed snapshot of personalization configuration."""

    model_config = ConfigDict(frozen=True)

    flags: PersonalizationFeatureFlags
    effective_flags: PersonalizationFeatureFlags
    versions: PersonalizationModelVersions
