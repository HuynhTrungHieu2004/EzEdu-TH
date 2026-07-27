from collections import defaultdict
from typing import Optional

from app.personalization.constants.collections import (
    LEARNER_KNOWLEDGE_STATES,
    LEARNER_PROFILES,
    LEARNING_EVENTS,
    LEARNING_ITEMS,
)
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.data_models import ClusterType
from app.personalization.services.clustering_service import fit_cluster_model


BLOOM_ENCODING = {"remember": 0.0, "understand": 0.33, "apply": 0.66, "analyze": 1.0}


def _embedding_from_item(item: dict) -> list[float]:
    value = item.get("semantic_embedding") or item.get("embedding") or item.get("feature_embedding")
    if isinstance(value, list):
        return [float(item) for item in value]
    return [0.0, 0.0, 0.0, 0.0]


async def collect_cluster_samples(
    cluster_type: ClusterType,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> list[dict]:
    repo = repository or PersonalizationMongoRepository()
    db = repo.db

    if cluster_type == "content":
        samples = []
        async for item in db[LEARNING_ITEMS].find({"item_type": {"$in": ["lesson", "review_chunk", "document_chunk", "other"]}}):
            samples.append({
                "semantic_embedding": _embedding_from_item(item),
                "difficulty": item.get("difficulty"),
                "bloom_level_encoded": BLOOM_ENCODING.get(item.get("bloom_level"), 0.33),
                "estimated_duration_seconds": item.get("estimated_duration_seconds"),
                "topic": item.get("topic") or "unknown",
            })
        return samples

    if cluster_type == "question":
        stats = defaultdict(lambda: {"attempts": 0, "correct": 0, "response_time": 0.0})
        async for event in db[LEARNING_EVENTS].find({"event_type": "question_answered"}):
            bucket = stats[event["item_id"]]
            bucket["attempts"] += 1
            bucket["correct"] += int(bool(event.get("is_correct")))
            bucket["response_time"] += float(event.get("response_time_ms") or 0.0)
        samples = []
        async for item in db[LEARNING_ITEMS].find({"item_type": "question"}):
            item_stats = stats.get(str(item["_id"]), {"attempts": 0, "correct": 0, "response_time": 0.0})
            attempts = max(1, item_stats["attempts"])
            samples.append({
                "semantic_embedding": _embedding_from_item(item),
                "difficulty": item.get("difficulty"),
                "bloom_level_encoded": BLOOM_ENCODING.get(item.get("bloom_level"), 0.33),
                "average_correctness": item_stats["correct"] / attempts,
                "average_response_time_ms": item_stats["response_time"] / attempts,
                "discrimination": item.get("discrimination") or 0.0,
                "required_knowledge_component_count": len(item.get("knowledge_component_ids", [])),
            })
        return samples

    if cluster_type == "learner_ability":
        mastery_by_user = defaultdict(list)
        async for state in db[LEARNER_KNOWLEDGE_STATES].find({}):
            mastery_by_user[state["user_id"]].append(state)
        samples = []
        async for profile in db[LEARNER_PROFILES].find({}):
            states = mastery_by_user.get(profile["user_id"], [])
            if not states:
                continue
            avg_mastery = sum(float(item.get("mastery_probability") or 0.0) for item in states) / len(states)
            recent_accuracy = sum(float(item.get("recent_accuracy") or 0.0) for item in states) / len(states)
            samples.append({
                "global_theta": profile.get("global_ability") or 0.0,
                "average_mastery": avg_mastery,
                "recent_accuracy": recent_accuracy,
                "solved_difficulty": avg_mastery,
                "prerequisite_gaps": sum(1 for item in states if (item.get("mastery_probability") or 0.0) < 0.5),
            })
        return samples

    event_groups = defaultdict(list)
    async for event in db[LEARNING_EVENTS].find({}):
        event_groups[event["user_id"]].append(event)

    if cluster_type == "learner_behavior":
        samples = []
        for events in event_groups.values():
            total = max(1, len(events))
            completed = sum(1 for item in events if item.get("completed"))
            skipped = sum(1 for item in events if item.get("skipped"))
            samples.append({
                "average_response_time_ms": sum(float(item.get("response_time_ms") or 0.0) for item in events) / total,
                "completion_rate": completed / total,
                "hint_rate": sum(float(item.get("hint_count") or 0.0) for item in events) / total,
                "answer_change_rate": sum(float(item.get("answer_change_count") or 0.0) for item in events) / total,
                "skip_rate": skipped / total,
                "session_consistency": len({item.get("session_id") for item in events if item.get("session_id")}) / total,
            })
        return samples

    if cluster_type == "learner_interest":
        samples = []
        for events in event_groups.values():
            total = max(1, len(events))
            recommendation_clicks = sum(1 for item in events if item.get("event_type") == "recommendation_clicked")
            question_events = sum(1 for item in events if str(item.get("item_id", "")).count(":") == 1)
            document_events = sum(1 for item in events if item.get("document_id"))
            samples.append({
                "topic_interaction_distribution": [question_events / total, document_events / total],
                "content_type_preference": [question_events / total, document_events / total],
                "document_category_preference": [document_events / total],
                "recommendation_click_distribution": [recommendation_clicks / total],
            })
        return samples

    return []


async def train_cluster_type(
    cluster_type: ClusterType,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
):
    repo = repository or PersonalizationMongoRepository()
    samples = await collect_cluster_samples(cluster_type, repository=repo)
    return await fit_cluster_model(cluster_type, samples, repository=repo)
