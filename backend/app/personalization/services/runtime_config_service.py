from app.core.config import settings
from app.personalization.schemas.config import (
    PersonalizationFeatureFlags,
    PersonalizationModelVersions,
    PersonalizationRuntimeConfig,
)


def get_runtime_config(app_settings=settings) -> PersonalizationRuntimeConfig:
    """Build a typed personalization config snapshot from application settings."""
    flags = PersonalizationFeatureFlags.from_settings(app_settings)
    return PersonalizationRuntimeConfig(
        flags=flags,
        effective_flags=flags.effective(),
        versions=PersonalizationModelVersions.from_settings(app_settings),
    )
