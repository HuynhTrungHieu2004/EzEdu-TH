import logging
from dataclasses import dataclass
from typing import Iterable, List, Tuple

from pymongo import ASCENDING, DESCENDING

from app.personalization.constants.collections import (
    CLUSTER_MODELS,
    KNOWLEDGE_GRAPH_EDGES,
    KNOWLEDGE_COMPONENTS,
    LEARNER_KNOWLEDGE_STATES,
    LEARNER_PROFILES,
    LEARNING_EVENTS,
    LEARNING_ITEMS,
    LEARNING_SESSIONS,
    RECOMMENDATION_LOGS,
    BANDIT_POLICIES,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IndexSpec:
    collection: str
    keys: List[Tuple[str, int]]
    name: str
    unique: bool = False


PERSONALIZATION_INDEXES: tuple[IndexSpec, ...] = (
    IndexSpec(KNOWLEDGE_COMPONENTS, [("normalized_name", ASCENDING)], "kc_normalized_name"),
    IndexSpec(KNOWLEDGE_COMPONENTS, [("subject", ASCENDING), ("topic", ASCENDING)], "kc_subject_topic"),
    IndexSpec(KNOWLEDGE_COMPONENTS, [("created_by", ASCENDING), ("updated_at", DESCENDING)], "kc_created_by_updated_at"),
    IndexSpec(KNOWLEDGE_COMPONENTS, [("model_version", ASCENDING)], "kc_model_version"),
    IndexSpec(KNOWLEDGE_GRAPH_EDGES, [("document_id", ASCENDING), ("relation_type", ASCENDING)], "kge_document_relation"),
    IndexSpec(KNOWLEDGE_GRAPH_EDGES, [("source_knowledge_component_id", ASCENDING)], "kge_source_kc"),
    IndexSpec(KNOWLEDGE_GRAPH_EDGES, [("target_knowledge_component_id", ASCENDING)], "kge_target_kc"),
    IndexSpec(KNOWLEDGE_GRAPH_EDGES, [("status", ASCENDING), ("updated_at", DESCENDING)], "kge_status_updated_at"),
    IndexSpec(KNOWLEDGE_GRAPH_EDGES, [("model_version", ASCENDING)], "kge_model_version"),
    IndexSpec(LEARNING_ITEMS, [("item_type", ASCENDING), ("document_id", ASCENDING)], "li_type_document"),
    IndexSpec(LEARNING_ITEMS, [("knowledge_component_ids", ASCENDING)], "li_knowledge_component_ids"),
    IndexSpec(LEARNING_ITEMS, [("primary_knowledge_component_id", ASCENDING)], "li_primary_kc"),
    IndexSpec(LEARNING_ITEMS, [("model_version", ASCENDING)], "li_model_version"),
    IndexSpec(LEARNING_EVENTS, [("user_id", ASCENDING), ("occurred_at", DESCENDING)], "le_user_occurred_at"),
    IndexSpec(LEARNING_EVENTS, [("user_id", ASCENDING), ("session_id", ASCENDING), ("occurred_at", DESCENDING)], "le_user_session_time"),
    IndexSpec(LEARNING_EVENTS, [("user_id", ASCENDING), ("item_id", ASCENDING), ("occurred_at", DESCENDING)], "le_user_item_time"),
    IndexSpec(LEARNING_EVENTS, [("item_id", ASCENDING)], "le_item_id"),
    IndexSpec(LEARNING_EVENTS, [("user_id", ASCENDING), ("idempotency_key", ASCENDING)], "le_user_idempotency_key"),
    IndexSpec(LEARNING_EVENTS, [("knowledge_component_ids", ASCENDING)], "le_knowledge_component_ids"),
    IndexSpec(LEARNING_EVENTS, [("schema_version", ASCENDING)], "le_schema_version"),
    IndexSpec(LEARNING_SESSIONS, [("user_id", ASCENDING), ("last_activity_at", DESCENDING)], "ls_user_last_activity"),
    IndexSpec(LEARNING_SESSIONS, [("user_id", ASCENDING), ("session_id", ASCENDING)], "ls_user_session_unique", unique=True),
    IndexSpec(LEARNING_SESSIONS, [("document_id", ASCENDING)], "ls_document_id"),
    IndexSpec(LEARNING_SESSIONS, [("schema_version", ASCENDING)], "ls_schema_version"),
    IndexSpec(LEARNER_PROFILES, [("user_id", ASCENDING)], "lp_user_unique", unique=True),
    IndexSpec(LEARNER_PROFILES, [("ability_cluster_id", ASCENDING)], "lp_ability_cluster"),
    IndexSpec(LEARNER_PROFILES, [("behavior_cluster_id", ASCENDING)], "lp_behavior_cluster"),
    IndexSpec(LEARNER_PROFILES, [("interest_cluster_id", ASCENDING)], "lp_interest_cluster"),
    IndexSpec(LEARNER_PROFILES, [("model_version", ASCENDING)], "lp_model_version"),
    IndexSpec(LEARNER_KNOWLEDGE_STATES, [("user_id", ASCENDING), ("knowledge_component_id", ASCENDING)], "lks_user_kc_unique", unique=True),
    IndexSpec(LEARNER_KNOWLEDGE_STATES, [("knowledge_component_id", ASCENDING)], "lks_kc"),
    IndexSpec(LEARNER_KNOWLEDGE_STATES, [("user_id", ASCENDING), ("last_updated_at", DESCENDING)], "lks_user_updated_at"),
    IndexSpec(LEARNER_KNOWLEDGE_STATES, [("model_version", ASCENDING)], "lks_model_version"),
    IndexSpec(RECOMMENDATION_LOGS, [("user_id", ASCENDING), ("generated_at", DESCENDING)], "rl_user_generated_at"),
    IndexSpec(RECOMMENDATION_LOGS, [("user_id", ASCENDING), ("session_id", ASCENDING), ("generated_at", DESCENDING)], "rl_user_session_time"),
    IndexSpec(RECOMMENDATION_LOGS, [("user_id", ASCENDING), ("item_id", ASCENDING), ("generated_at", DESCENDING)], "rl_user_item_time"),
    IndexSpec(RECOMMENDATION_LOGS, [("item_id", ASCENDING)], "rl_item_id"),
    IndexSpec(RECOMMENDATION_LOGS, [("learner_model_version", ASCENDING)], "rl_learner_model_version"),
    IndexSpec(RECOMMENDATION_LOGS, [("ranking_model_version", ASCENDING)], "rl_ranking_model_version"),
    IndexSpec(RECOMMENDATION_LOGS, [("bandit_policy_version", ASCENDING)], "rl_bandit_policy_version"),
    IndexSpec(CLUSTER_MODELS, [("cluster_type", ASCENDING), ("version", ASCENDING)], "cm_type_version_unique", unique=True),
    IndexSpec(CLUSTER_MODELS, [("cluster_type", ASCENDING), ("status", ASCENDING)], "cm_type_status"),
    IndexSpec(CLUSTER_MODELS, [("feature_schema_version", ASCENDING)], "cm_feature_schema_version"),
    IndexSpec(BANDIT_POLICIES, [("policy_type", ASCENDING), ("version", ASCENDING)], "bp_type_version_unique", unique=True),
    IndexSpec(BANDIT_POLICIES, [("policy_type", ASCENDING), ("status", ASCENDING)], "bp_type_status"),
    IndexSpec(BANDIT_POLICIES, [("context_schema_version", ASCENDING)], "bp_context_schema_version"),
)


async def create_personalization_indexes(db, *, dry_run: bool = False) -> list[str]:
    """Create personalization indexes. Safe to run repeatedly."""
    created_names: list[str] = []
    for spec in PERSONALIZATION_INDEXES:
        if dry_run:
            logger.info("[DRY RUN] Would create index %s on %s.", spec.name, spec.collection)
            created_names.append(spec.name)
            continue
        await db[spec.collection].create_index(spec.keys, name=spec.name, unique=spec.unique)
        created_names.append(spec.name)
    return created_names


def iter_personalization_indexes() -> Iterable[IndexSpec]:
    return PERSONALIZATION_INDEXES
