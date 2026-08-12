from typing import Any, Dict, Optional

from bson import ObjectId

from app.database.mongodb import get_database
from app.personalization.constants.collections import (
    KNOWLEDGE_COMPONENTS,
    CLUSTER_MODELS,
    KNOWLEDGE_GRAPH_EDGES,
    BANDIT_POLICIES,
    LEARNER_KNOWLEDGE_STATES,
    LEARNER_PROFILES,
    LEARNING_EVENTS,
    LEARNING_ITEMS,
    LEARNING_SESSIONS,
    RECOMMENDATION_LOGS,
)
from app.personalization.schemas.data_models import (
    KnowledgeComponent,
    ClusterModel,
    KnowledgeGraphEdge,
    LearnerKnowledgeState,
    LearnerProfile,
    LearningEvent,
    LearningItem,
    LearningSession,
    RecommendationLog,
)
from app.personalization.schemas.contextual_bandit import ContextualBanditPolicy


def _require_non_empty(value: Optional[str], field_name: str) -> str:
    if not value or not str(value).strip():
        raise ValueError(f"{field_name} is required.")
    return str(value)


def _serialize_model(model) -> Dict[str, Any]:
    data = model.model_dump(exclude_none=True)
    if data.get("id"):
        data["_id"] = data.pop("id")
    else:
        data.pop("id", None)
    return data


def _with_string_id(document: Optional[dict]) -> Optional[dict]:
    if not document:
        return None
    mapped = dict(document)
    mapped["id"] = str(mapped.pop("_id"))
    return mapped


class PersonalizationMongoRepository:
    """MongoDB repository with explicit ownership guards for learner data."""

    def __init__(self, db=None):
        self.db = db if db is not None else get_database()

    async def get_owned_document(self, document_id: str, user_id: str) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        query: dict[str, Any] = {"user_id": user_id}
        query["_id"] = ObjectId(document_id) if ObjectId.is_valid(document_id) else document_id
        return _with_string_id(await self.db["documents"].find_one(query))

    async def list_document_chunks(self, document_id: str, user_id: str) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        cursor = (
            self.db["document_chunks"]
            .find({"document_id": document_id, "user_id": user_id})
            .sort("chunk_index", 1)
        )
        return [item async for item in cursor]

    async def list_existing_learning_items_for_document(self, document_id: str) -> list[dict]:
        cursor = self.db[LEARNING_ITEMS].find({"document_id": document_id})
        items = []
        async for item in cursor:
            mapped = _with_string_id(item)
            mapped["item_id"] = mapped.get("id")
            items.append(mapped)
        return items

    async def list_owned_document_ids(self, user_id: str, *, limit: int = 1000) -> list[Any]:
        user_id = _require_non_empty(user_id, "user_id")
        cursor = self.db["documents"].find({"user_id": user_id}, {"_id": 1}).limit(max(1, min(limit, 5000)))
        document_ids: list[Any] = []
        async for document in cursor:
            raw_id = document["_id"]
            document_ids.append(raw_id)
            document_ids.append(str(raw_id))
        return list(dict.fromkeys(document_ids))

    async def list_question_items_for_document(self, document_id: str, user_id: str) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        cursor = self.db["question_sets"].find(
            {"document_id": document_id, "user_id": user_id, "deleted_at": None}
        )
        items: list[dict] = []
        async for question_set in cursor:
            question_set_id = str(question_set["_id"])
            for index, question in enumerate(question_set.get("questions", [])):
                items.append(
                    {
                        "item_id": f"{question_set_id}:{index}",
                        "question_set_id": question_set_id,
                        "question_index": index,
                        "question": question.get("question", ""),
                        "bloom_level": question.get("bloom_level"),
                        "difficulty": question.get("difficulty"),
                        "question_type": question.get("question_type"),
                    }
                )
        return items

    async def upsert_knowledge_component(self, component: KnowledgeComponent, document_id: str) -> dict:
        _require_non_empty(component.created_by, "created_by")
        _require_non_empty(component.normalized_name, "normalized_name")
        _require_non_empty(document_id, "document_id")
        data = _serialize_model(component)
        data.pop("_id", None)
        source_document_ids = data.pop("source_document_ids", [])
        evidence_chunk_ids = data.pop("evidence_chunk_ids", [])
        aliases = data.pop("aliases", [])
        result = await self.db[KNOWLEDGE_COMPONENTS].find_one_and_update(
            {
                "created_by": component.created_by,
                "normalized_name": component.normalized_name,
                "provenance.document_id": document_id,
            },
            {
                "$set": data,
                "$addToSet": {
                    "source_document_ids": {"$each": source_document_ids},
                    "evidence_chunk_ids": {"$each": evidence_chunk_ids},
                    "aliases": {"$each": aliases},
                },
            },
            upsert=True,
            return_document=True,
        )
        return _with_string_id(result)

    async def upsert_learning_item(self, item: LearningItem) -> dict:
        data = _serialize_model(item)
        if "_id" not in data:
            raise ValueError("LearningItem.id is required for idempotent Q-Matrix upsert.")
        item_id = data.pop("_id")
        result = await self.db[LEARNING_ITEMS].find_one_and_update(
            {"_id": item_id},
            {"$set": data},
            upsert=True,
            return_document=True,
        )
        return _with_string_id(result)

    async def upsert_graph_edge(self, edge: KnowledgeGraphEdge) -> dict:
        data = _serialize_model(edge)
        data.pop("_id", None)
        # Phải tách khỏi `$set`: MongoDB từ chối khi cùng một trường xuất hiện
        # ở hai toán tử update (ConflictingUpdateOperators). Ở đây
        # `evidence_chunk_ids` do `$addToSet` phụ trách để gộp dồn qua nhiều
        # lần trích xuất thay vì ghi đè.
        data.pop("evidence_chunk_ids", None)
        result = await self.db[KNOWLEDGE_GRAPH_EDGES].find_one_and_update(
            {
                "source_knowledge_component_id": edge.source_knowledge_component_id,
                "target_knowledge_component_id": edge.target_knowledge_component_id,
                "relation_type": edge.relation_type,
                "document_id": edge.document_id,
            },
            {
                "$set": data,
                "$addToSet": {"evidence_chunk_ids": {"$each": edge.evidence_chunk_ids}},
            },
            upsert=True,
            return_document=True,
        )
        return _with_string_id(result)

    async def list_review_suggestions(self, user_id: str, document_id: Optional[str] = None) -> dict:
        user_id = _require_non_empty(user_id, "user_id")
        component_query: dict[str, Any] = {"created_by": user_id, "status": {"$in": ["draft", "needs_review"]}}
        edge_query: dict[str, Any] = {"created_by": user_id, "status": "proposed"}
        if document_id:
            component_query["source_document_ids"] = document_id
            edge_query["document_id"] = document_id

        components = [
            _with_string_id(item)
            async for item in self.db[KNOWLEDGE_COMPONENTS].find(component_query).sort("updated_at", -1)
        ]
        edges = [
            _with_string_id(item)
            async for item in self.db[KNOWLEDGE_GRAPH_EDGES].find(edge_query).sort("updated_at", -1)
        ]
        return {"knowledge_components": components, "knowledge_graph_edges": edges}

    async def review_knowledge_component(
        self,
        component_id: str,
        user_id: str,
        *,
        action: str,
        updates: Optional[dict] = None,
    ) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        updates = updates or {}
        status_value = "active" if action == "accepted" else "archived"
        if action == "edited":
            status_value = "needs_review"
        set_doc = {"status": status_value, **updates}
        query_id = ObjectId(component_id) if ObjectId.is_valid(component_id) else component_id
        result = await self.db[KNOWLEDGE_COMPONENTS].find_one_and_update(
            {"_id": query_id, "created_by": user_id},
            {"$set": set_doc},
            return_document=True,
        )
        return _with_string_id(result)

    async def review_graph_edge(self, edge_id: str, user_id: str, *, action: str) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        status_value = "verified" if action == "accepted" else "rejected"
        query_id = ObjectId(edge_id) if ObjectId.is_valid(edge_id) else edge_id
        result = await self.db[KNOWLEDGE_GRAPH_EDGES].find_one_and_update(
            {"_id": query_id, "created_by": user_id},
            {"$set": {"status": status_value}},
            return_document=True,
        )
        return _with_string_id(result)

    async def create_learning_event(self, event: LearningEvent) -> dict:
        _require_non_empty(event.user_id, "user_id")
        _require_non_empty(event.item_id, "item_id")
        data = _serialize_model(event)
        result = await self.db[LEARNING_EVENTS].insert_one(data)
        data["_id"] = result.inserted_id
        return _with_string_id(data)

    async def get_event_by_idempotency_key(self, user_id: str, idempotency_key: str) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        idempotency_key = _require_non_empty(idempotency_key, "idempotency_key")
        return _with_string_id(
            await self.db[LEARNING_EVENTS].find_one(
                {"user_id": user_id, "idempotency_key": idempotency_key}
            )
        )

    async def create_learning_event_idempotent(self, event: LearningEvent) -> tuple[dict, bool]:
        if event.idempotency_key:
            existing = await self.get_event_by_idempotency_key(event.user_id, event.idempotency_key)
            if existing:
                return existing, True
        return await self.create_learning_event(event), False

    async def upsert_learning_session(self, session: LearningSession) -> dict:
        _require_non_empty(session.user_id, "user_id")
        _require_non_empty(session.session_id, "session_id")
        data = _serialize_model(session)
        data.pop("_id", None)
        result = await self.db[LEARNING_SESSIONS].find_one_and_update(
            {"user_id": session.user_id, "session_id": session.session_id},
            {
                "$setOnInsert": {
                    "user_id": session.user_id,
                    "session_id": session.session_id,
                    "started_at": session.started_at,
                    "schema_version": session.schema_version,
                },
                "$set": {
                    "document_id": session.document_id,
                    "subject": session.subject,
                    "last_activity_at": session.last_activity_at,
                    "metadata": session.metadata,
                    "schema_version": session.schema_version,
                },
            },
            upsert=True,
            return_document=True,
        )
        return _with_string_id(result)

    async def get_learning_event_for_user(self, user_id: str, event_id: str) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        query: dict[str, Any] = {"user_id": user_id}
        query["_id"] = ObjectId(event_id) if ObjectId.is_valid(event_id) else event_id
        return _with_string_id(await self.db[LEARNING_EVENTS].find_one(query))

    async def get_learning_event_by_id(self, event_id: str) -> Optional[dict]:
        query_id = ObjectId(event_id) if ObjectId.is_valid(event_id) else event_id
        return _with_string_id(await self.db[LEARNING_EVENTS].find_one({"_id": query_id}))

    async def mark_learning_event_processed(self, event_id: str, model_version: str) -> bool:
        query_id = ObjectId(event_id) if ObjectId.is_valid(event_id) else event_id
        result = await self.db[LEARNING_EVENTS].update_one(
            {
                "_id": query_id,
                "learner_model_processed_versions": {"$ne": model_version},
            },
            {"$addToSet": {"learner_model_processed_versions": model_version}},
        )
        return result.modified_count == 1

    async def set_learning_event_model_prediction(self, event_id: str, prediction: dict) -> None:
        query_id = ObjectId(event_id) if ObjectId.is_valid(event_id) else event_id
        await self.db[LEARNING_EVENTS].update_one(
            {"_id": query_id},
            {"$set": {"learner_model_prediction": prediction}},
        )

    async def list_learning_events_for_user(self, user_id: str, *, limit: int = 50) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        cursor = (
            self.db[LEARNING_EVENTS]
            .find({"user_id": user_id})
            .sort("occurred_at", -1)
            .limit(max(1, min(limit, 100)))
        )
        return [_with_string_id(item) async for item in cursor]

    async def resolve_accessible_learning_item(
        self,
        *,
        item_id: str,
        user_id: str,
        user_role: str,
        document_id: Optional[str] = None,
    ) -> Optional[dict]:
        item_id = _require_non_empty(item_id, "item_id")
        user_id = _require_non_empty(user_id, "user_id")

        existing_item = await self.db[LEARNING_ITEMS].find_one({"_id": item_id})
        if existing_item:
            mapped = _with_string_id(existing_item)
            mapped["item_id"] = mapped["id"]
            item_document_id = mapped.get("document_id") or document_id
            if item_document_id and await self.get_owned_document(str(item_document_id), user_id):
                return mapped

        if ":" in item_id:
            question_set_id, raw_index = item_id.rsplit(":", 1)
            if raw_index.isdigit() and ObjectId.is_valid(question_set_id):
                question_set = await self.db["question_sets"].find_one(
                    {"_id": ObjectId(question_set_id), "deleted_at": None}
                )
                if not question_set:
                    return None
                questions = list(question_set.get("questions", []))
                is_owner_or_admin = question_set.get("user_id") == user_id or user_role == "admin"
                if not is_owner_or_admin:
                    questions = [item for item in questions if item.get("status", "draft") == "published"]
                question_index = int(raw_index)
                if question_index < 0 or question_index >= len(questions):
                    return None
                question = questions[question_index]
                return {
                    "item_id": item_id,
                    "item_type": "question",
                    "document_id": question_set.get("document_id"),
                    "question_set_id": question_set_id,
                    "question_index": question_index,
                    "knowledge_component_ids": [],
                    "question": question.get("question", ""),
                }

        if document_id and item_id == document_id:
            document = await self.get_owned_document(document_id, user_id)
            if document or user_role == "admin":
                return {
                    "item_id": item_id,
                    "item_type": "lesson",
                    "document_id": document_id,
                    "knowledge_component_ids": [],
                }

        return None

    async def upsert_learner_profile(self, profile: LearnerProfile) -> dict:
        _require_non_empty(profile.user_id, "user_id")
        data = _serialize_model(profile)
        data.pop("_id", None)
        await self.db[LEARNER_PROFILES].update_one(
            {"user_id": profile.user_id},
            {"$set": data},
            upsert=True,
        )
        return await self.get_learner_profile(profile.user_id)

    async def get_learner_profile(self, user_id: str) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        return _with_string_id(await self.db[LEARNER_PROFILES].find_one({"user_id": user_id}))

    async def update_learner_preferences(
        self,
        user_id: str,
        updates: dict[str, Any],
        set_on_insert: dict[str, Any],
    ) -> dict:
        user_id = _require_non_empty(user_id, "user_id")
        await self.db[LEARNER_PROFILES].update_one(
            {"user_id": user_id},
            {"$set": updates, "$setOnInsert": set_on_insert},
            upsert=True,
        )
        return await self.get_learner_profile(user_id)

    async def upsert_knowledge_state(self, state: LearnerKnowledgeState) -> dict:
        _require_non_empty(state.user_id, "user_id")
        _require_non_empty(state.knowledge_component_id, "knowledge_component_id")
        data = _serialize_model(state)
        data.pop("_id", None)
        await self.db[LEARNER_KNOWLEDGE_STATES].update_one(
            {
                "user_id": state.user_id,
                "knowledge_component_id": state.knowledge_component_id,
            },
            {"$set": data},
            upsert=True,
        )
        return await self.get_knowledge_state(state.user_id, state.knowledge_component_id)

    async def get_knowledge_state(self, user_id: str, knowledge_component_id: str) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        knowledge_component_id = _require_non_empty(knowledge_component_id, "knowledge_component_id")
        return _with_string_id(
            await self.db[LEARNER_KNOWLEDGE_STATES].find_one(
                {"user_id": user_id, "knowledge_component_id": knowledge_component_id}
            )
        )

    async def list_knowledge_states_for_user(self, user_id: str, *, limit: int = 200) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        cursor = (
            self.db[LEARNER_KNOWLEDGE_STATES]
            .find({"user_id": user_id})
            .sort("last_updated_at", -1)
            .limit(max(1, min(limit, 500)))
        )
        return [_with_string_id(item) async for item in cursor]

    async def list_knowledge_components_for_user(self, user_id: str, *, limit: int = 500) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        cursor = (
            self.db[KNOWLEDGE_COMPONENTS]
            .find({"created_by": user_id, "status": {"$ne": "archived"}})
            .sort("updated_at", -1)
            .limit(max(1, min(limit, 1000)))
        )
        return [_with_string_id(item) async for item in cursor]

    async def list_prerequisite_edges_for_user(
        self,
        user_id: str,
        *,
        knowledge_component_ids: Optional[list[str]] = None,
        limit: int = 500,
    ) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        query: dict[str, Any] = {
            "created_by": user_id,
            "relation_type": "prerequisite",
            "status": {"$in": ["verified", "proposed"]},
        }
        if knowledge_component_ids:
            query["target_knowledge_component_id"] = {"$in": knowledge_component_ids}
        cursor = (
            self.db[KNOWLEDGE_GRAPH_EDGES]
            .find(query)
            .sort("updated_at", -1)
            .limit(max(1, min(limit, 1000)))
        )
        return [_with_string_id(item) async for item in cursor]

    async def list_accessible_learning_items_for_user(self, user_id: str, *, limit: int = 500) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        document_ids = await self.list_owned_document_ids(user_id)
        if not document_ids:
            return []
        cursor = (
            self.db[LEARNING_ITEMS]
            .find({"document_id": {"$in": document_ids}})
            .sort("updated_at", -1)
            .limit(max(1, min(limit, 1000)))
        )
        return [_with_string_id(item) async for item in cursor]

    async def list_accessible_learning_items_by_knowledge_components(
        self,
        user_id: str,
        knowledge_component_ids: list[str],
        *,
        limit: int = 100,
    ) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        if not knowledge_component_ids:
            return []
        document_ids = await self.list_owned_document_ids(user_id)
        if not document_ids:
            return []
        cursor = (
            self.db[LEARNING_ITEMS]
            .find(
                {
                    "document_id": {"$in": document_ids},
                    "knowledge_component_ids": {"$in": list(dict.fromkeys(knowledge_component_ids))},
                }
            )
            .sort("quality_score", -1)
            .limit(max(1, min(limit, 500)))
        )
        return [_with_string_id(item) async for item in cursor]

    async def get_learning_item_by_id(self, item_id: str) -> Optional[dict]:
        item_id = _require_non_empty(item_id, "item_id")
        return _with_string_id(await self.db[LEARNING_ITEMS].find_one({"_id": item_id}))

    async def get_accessible_learning_item_for_user(self, user_id: str, item_id: str) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        item = await self.get_learning_item_by_id(item_id)
        if not item:
            return None
        document_id = item.get("document_id")
        if not document_id or not await self.get_owned_document(str(document_id), user_id):
            return None
        return item

    async def list_knowledge_components_by_ids_for_user(self, user_id: str, knowledge_component_ids: list[str]) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        if not knowledge_component_ids:
            return []
        ids: list[Any] = []
        for value in dict.fromkeys(str(item) for item in knowledge_component_ids):
            ids.append(ObjectId(value) if ObjectId.is_valid(value) else value)
        cursor = self.db[KNOWLEDGE_COMPONENTS].find({"_id": {"$in": ids}, "created_by": user_id})
        return [_with_string_id(item) async for item in cursor]

    async def set_learning_item_irt_state(self, item_id: str, irt_state: dict, difficulty: Optional[float] = None) -> None:
        item_id = _require_non_empty(item_id, "item_id")
        set_doc: dict[str, Any] = {"irt_state": irt_state}
        if difficulty is not None:
            set_doc["difficulty"] = difficulty
        await self.db[LEARNING_ITEMS].update_one({"_id": item_id}, {"$set": set_doc})

    async def create_recommendation_log(self, log: RecommendationLog) -> dict:
        _require_non_empty(log.user_id, "user_id")
        _require_non_empty(log.item_id, "item_id")
        data = _serialize_model(log)
        result = await self.db[RECOMMENDATION_LOGS].insert_one(data)
        data["_id"] = result.inserted_id
        return _with_string_id(data)

    async def list_recommendation_logs_for_user(self, user_id: str, *, limit: int = 20) -> list[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        cursor = (
            self.db[RECOMMENDATION_LOGS]
            .find({"user_id": user_id})
            .sort("generated_at", -1)
            .limit(max(1, min(limit, 100)))
        )
        return [_with_string_id(item) async for item in cursor]

    async def get_recommendation_log_for_user(self, user_id: str, recommendation_log_id: str) -> Optional[dict]:
        user_id = _require_non_empty(user_id, "user_id")
        recommendation_log_id = _require_non_empty(recommendation_log_id, "recommendation_log_id")
        query_id = ObjectId(recommendation_log_id) if ObjectId.is_valid(recommendation_log_id) else recommendation_log_id
        return _with_string_id(await self.db[RECOMMENDATION_LOGS].find_one({"_id": query_id, "user_id": user_id}))

    async def record_recommendation_feedback(
        self,
        *,
        user_id: str,
        recommendation_log_id: str,
        item_id: str,
        feedback_type: str,
        recorded_at,
    ) -> tuple[Optional[dict], bool]:
        user_id = _require_non_empty(user_id, "user_id")
        recommendation_log_id = _require_non_empty(recommendation_log_id, "recommendation_log_id")
        item_id = _require_non_empty(item_id, "item_id")
        feedback_type = _require_non_empty(feedback_type, "feedback_type")
        query_id = ObjectId(recommendation_log_id) if ObjectId.is_valid(recommendation_log_id) else recommendation_log_id
        existing = await self.db[RECOMMENDATION_LOGS].find_one(
            {
                "_id": query_id,
                "user_id": user_id,
                "item_id": item_id,
            }
        )
        if not existing:
            return None, False
        feedback_path = f"feedback.{feedback_type}"
        if existing.get("feedback", {}).get(feedback_type):
            return _with_string_id(existing), True
        set_doc: dict[str, Any] = {
            feedback_path: recorded_at,
            "feedback_updated_at": recorded_at,
        }
        if feedback_type == "clicked":
            set_doc["clicked"] = True
        if feedback_type == "completed":
            set_doc["completed"] = True
        result = await self.db[RECOMMENDATION_LOGS].find_one_and_update(
            {
                "_id": query_id,
                "user_id": user_id,
                "item_id": item_id,
                feedback_path: {"$exists": False},
            },
            {"$set": set_doc},
            return_document=True,
        )
        if result:
            return _with_string_id(result), False
        return _with_string_id(await self.db[RECOMMENDATION_LOGS].find_one({"_id": query_id, "user_id": user_id})), True

    async def record_bandit_reward(
        self,
        *,
        user_id: str,
        recommendation_log_id: str,
        reward_key: str,
        reward: float,
        reward_breakdown: dict,
        recorded_at,
    ) -> tuple[Optional[dict], bool]:
        user_id = _require_non_empty(user_id, "user_id")
        recommendation_log_id = _require_non_empty(recommendation_log_id, "recommendation_log_id")
        reward_key = _require_non_empty(reward_key, "reward_key")
        query_id = ObjectId(recommendation_log_id) if ObjectId.is_valid(recommendation_log_id) else recommendation_log_id
        reward_path = f"bandit_rewards.{reward_key}"
        result = await self.db[RECOMMENDATION_LOGS].find_one_and_update(
            {
                "_id": query_id,
                "user_id": user_id,
                reward_path: {"$exists": False},
            },
            {
                "$set": {
                    reward_path: {
                        "reward": reward,
                        "breakdown": reward_breakdown,
                        "recorded_at": recorded_at,
                    },
                    "reward": reward,
                    "bandit_reward_updated_at": recorded_at,
                }
            },
            return_document=True,
        )
        if result:
            return _with_string_id(result), False
        existing = await self.db[RECOMMENDATION_LOGS].find_one({"_id": query_id, "user_id": user_id})
        return _with_string_id(existing), True

    async def upsert_bandit_policy(self, policy: ContextualBanditPolicy) -> dict:
        data = policy.model_dump(exclude_none=True)
        if data.get("id"):
            data["_id"] = data.pop("id")
        else:
            data.pop("id", None)
        result = await self.db[BANDIT_POLICIES].find_one_and_update(
            {"policy_type": policy.policy_type, "version": policy.version},
            {"$set": data},
            upsert=True,
            return_document=True,
        )
        return _with_string_id(result)

    async def get_bandit_policy(self, policy_type: str, version: str) -> Optional[dict]:
        policy_type = _require_non_empty(policy_type, "policy_type")
        version = _require_non_empty(version, "version")
        return _with_string_id(await self.db[BANDIT_POLICIES].find_one({"policy_type": policy_type, "version": version}))

    async def get_active_bandit_policy(self, policy_type: str = "candidate_source") -> Optional[dict]:
        policy_type = _require_non_empty(policy_type, "policy_type")
        return _with_string_id(await self.db[BANDIT_POLICIES].find_one({"policy_type": policy_type, "status": "active"}))

    async def update_bandit_policy_posterior(
        self,
        *,
        policy_type: str,
        version: str,
        posterior_parameters: dict,
        updated_at,
    ) -> Optional[dict]:
        policy_type = _require_non_empty(policy_type, "policy_type")
        version = _require_non_empty(version, "version")
        result = await self.db[BANDIT_POLICIES].find_one_and_update(
            {"policy_type": policy_type, "version": version},
            {
                "$set": {
                    "posterior_parameters": posterior_parameters,
                    "updated_at": updated_at,
                },
                "$inc": {"update_count": 1},
            },
            return_document=True,
        )
        return _with_string_id(result)

    async def rollback_bandit_policy(self, policy_type: str, target_version: str, rolled_back_at) -> Optional[dict]:
        policy_type = _require_non_empty(policy_type, "policy_type")
        target_version = _require_non_empty(target_version, "target_version")
        await self.db[BANDIT_POLICIES].update_many(
            {"policy_type": policy_type, "status": "active"},
            {"$set": {"status": "rolled_back", "rolled_back_at": rolled_back_at}},
        )
        result = await self.db[BANDIT_POLICIES].find_one_and_update(
            {"policy_type": policy_type, "version": target_version},
            {"$set": {"status": "active", "activated_at": rolled_back_at}},
            return_document=True,
        )
        return _with_string_id(result)

    async def create_cluster_model(self, model: ClusterModel) -> dict:
        data = _serialize_model(model)
        result = await self.db[CLUSTER_MODELS].insert_one(data)
        data["_id"] = result.inserted_id
        return _with_string_id(data)

    async def get_active_cluster_model(self, cluster_type: str) -> Optional[dict]:
        cluster_type = _require_non_empty(cluster_type, "cluster_type")
        return _with_string_id(await self.db[CLUSTER_MODELS].find_one({"cluster_type": cluster_type, "status": "active"}))

    async def get_cluster_model_by_version(self, cluster_type: str, version: str) -> Optional[dict]:
        cluster_type = _require_non_empty(cluster_type, "cluster_type")
        version = _require_non_empty(version, "version")
        return _with_string_id(
            await self.db[CLUSTER_MODELS].find_one({"cluster_type": cluster_type, "version": version})
        )

    async def activate_cluster_model(self, cluster_type: str, version: str, activated_at) -> Optional[dict]:
        cluster_type = _require_non_empty(cluster_type, "cluster_type")
        version = _require_non_empty(version, "version")
        await self.db[CLUSTER_MODELS].update_many(
            {"cluster_type": cluster_type, "status": "active"},
            {"$set": {"status": "retired"}},
        )
        result = await self.db[CLUSTER_MODELS].find_one_and_update(
            {"cluster_type": cluster_type, "version": version},
            {"$set": {"status": "active", "activated_at": activated_at}},
            return_document=True,
        )
        return _with_string_id(result)

    async def rollback_cluster_model(self, cluster_type: str, target_version: str, activated_at) -> Optional[dict]:
        return await self.activate_cluster_model(cluster_type, target_version, activated_at)
