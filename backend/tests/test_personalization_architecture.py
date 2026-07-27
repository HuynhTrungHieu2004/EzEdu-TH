import importlib
import unittest

from app.core.config import Settings
from app.personalization.schemas.config import (
    PersonalizationFeatureFlags,
    PersonalizationModelVersions,
)
from app.personalization.services.runtime_config_service import get_runtime_config


def build_settings(**overrides):
    defaults = {
        "_env_file": None,
        "MONGODB_URI": "mongodb://localhost:27017/test_personalization",
        "PERSONALIZATION_ENABLED": False,
        "KNOWLEDGE_GRAPH_ENABLED": False,
        "LEARNER_MODEL_ENABLED": False,
        "RECOMMENDATION_ENABLED": False,
        "AI_RECOMMENDATION_EXPLANATION_ENABLED": False,
        "BANDIT_ENABLED": False,
        "NEURALCD_ENABLED": False,
        "AKT_ENABLED": False,
    }
    defaults.update(overrides)
    return Settings(**defaults)


class TestPersonalizationArchitecture(unittest.TestCase):
    def test_settings_exposes_personalization_defaults(self):
        settings = build_settings()

        self.assertFalse(settings.PERSONALIZATION_ENABLED)
        self.assertFalse(settings.KNOWLEDGE_GRAPH_ENABLED)
        self.assertFalse(settings.LEARNER_MODEL_ENABLED)
        self.assertFalse(settings.RECOMMENDATION_ENABLED)
        self.assertFalse(settings.AI_RECOMMENDATION_EXPLANATION_ENABLED)
        self.assertFalse(settings.BANDIT_ENABLED)
        self.assertFalse(settings.NEURALCD_ENABLED)
        self.assertFalse(settings.AKT_ENABLED)

        self.assertEqual(settings.FEATURE_SCHEMA_VERSION, "v1")
        self.assertEqual(settings.KNOWLEDGE_MODEL_VERSION, "v0")
        self.assertEqual(settings.LEARNER_MODEL_VERSION, "v0")
        self.assertEqual(settings.CLUSTERING_MODEL_VERSION, "v0")
        self.assertEqual(settings.RANKING_MODEL_VERSION, "v0")
        self.assertEqual(settings.BANDIT_POLICY_VERSION, "v0")
        self.assertEqual(settings.NEURALCD_MODEL_VERSION, "v0-research")
        self.assertEqual(settings.AKT_MODEL_VERSION, "v0-research")

    def test_runtime_config_has_typed_flags_and_versions(self):
        runtime_config = get_runtime_config(build_settings())

        self.assertIsInstance(runtime_config.flags, PersonalizationFeatureFlags)
        self.assertIsInstance(runtime_config.effective_flags, PersonalizationFeatureFlags)
        self.assertIsInstance(runtime_config.versions, PersonalizationModelVersions)
        self.assertFalse(runtime_config.effective_flags.personalization_enabled)
        self.assertEqual(runtime_config.versions.feature_schema_version, "v1")

    def test_child_flags_are_ineffective_when_root_flag_is_off(self):
        runtime_config = get_runtime_config(
            build_settings(
                PERSONALIZATION_ENABLED=False,
                RECOMMENDATION_ENABLED=True,
                AI_RECOMMENDATION_EXPLANATION_ENABLED=True,
                NEURALCD_ENABLED=True,
                AKT_ENABLED=True,
            )
        )

        self.assertTrue(runtime_config.flags.recommendation_enabled)
        self.assertFalse(runtime_config.effective_flags.recommendation_enabled)
        self.assertFalse(runtime_config.effective_flags.ai_recommendation_explanation_enabled)
        self.assertFalse(runtime_config.effective_flags.neuralcd_enabled)
        self.assertFalse(runtime_config.effective_flags.akt_enabled)

    def test_child_flags_can_be_effective_when_root_flag_is_on(self):
        runtime_config = get_runtime_config(
            build_settings(
                PERSONALIZATION_ENABLED=True,
                KNOWLEDGE_GRAPH_ENABLED=True,
                LEARNER_MODEL_ENABLED=True,
            )
        )

        self.assertTrue(runtime_config.effective_flags.personalization_enabled)
        self.assertTrue(runtime_config.effective_flags.knowledge_graph_enabled)
        self.assertTrue(runtime_config.effective_flags.learner_model_enabled)
        self.assertFalse(runtime_config.effective_flags.bandit_enabled)

    def test_personalization_module_imports(self):
        modules = [
            "app.personalization",
            "app.personalization.models",
            "app.personalization.schemas",
            "app.personalization.repositories",
            "app.personalization.services",
            "app.personalization.algorithms",
            "app.personalization.api",
            "app.personalization.jobs",
            "app.personalization.evaluation",
            "app.personalization.constants",
            "app.personalization.utils",
        ]

        for module_name in modules:
            with self.subTest(module=module_name):
                self.assertIsNotNone(importlib.import_module(module_name))
