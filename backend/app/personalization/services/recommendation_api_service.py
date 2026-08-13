from __future__ import annotations

from datetime import datetime, timezone
import json
import re
from typing import Callable, Optional

from fastapi import HTTPException, status
from pydantic import ValidationError

from app.core.config import settings
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.schemas.recommendations import (
    AIRecommendationExplanation,
    RecommendationAPIItemResponse,
    RecommendationAPIResponse,
    RecommendationFeedbackRequest,
    RecommendationFeedbackResponse,
    RecommendationHistoryItem,
    RecommendationHistoryResponse,
    RecommendationItemResponse,
)
from app.personalization.services.digital_twin_service import get_current_user_digital_twin
from app.personalization.services.recommendation_ranking_service import recommend_for_user
from app.personalization.services.contextual_bandit_service import update_bandit_from_recommendation_feedback


_RECOMMENDATION_CACHE: dict[str, tuple[datetime, RecommendationAPIResponse]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _cache_key(user_id: str, limit: int, language: str, explanation_style: str) -> str:
    return f"{user_id}:{limit}:{language}:{explanation_style}"


def invalidate_recommendation_cache(user_id: str) -> None:
    prefix = f"{user_id}:"
    for key in list(_RECOMMENDATION_CACHE):
        if key.startswith(prefix):
            _RECOMMENDATION_CACHE.pop(key, None)


def _model_versions() -> dict[str, str]:
    return {
        "feature_schema_version": settings.FEATURE_SCHEMA_VERSION,
        "knowledge_model_version": settings.KNOWLEDGE_MODEL_VERSION,
        "learner_model_version": settings.LEARNER_MODEL_VERSION,
        "clustering_model_version": settings.CLUSTERING_MODEL_VERSION,
        "ranking_model_version": settings.RANKING_MODEL_VERSION,
        "bandit_policy_version": settings.BANDIT_POLICY_VERSION,
    }


async def get_recommendations_for_current_user(
    user_id: str,
    *,
    limit: int = 10,
    language: str = "vi",
    explanation_style: Optional[str] = None,
    repository: Optional[PersonalizationMongoRepository] = None,
    ai_json_generator: Optional[Callable[[str], str]] = None,
    use_cache: bool = True,
) -> RecommendationAPIResponse:
    repo = repository or PersonalizationMongoRepository()
    generated_at = _now()
    style = explanation_style or "normal"
    key = _cache_key(user_id, limit, language, style)
    ttl = settings.RECOMMENDATION_CACHE_TTL_SECONDS
    if use_cache and ttl > 0 and key in _RECOMMENDATION_CACHE:
        cached_at, cached = _RECOMMENDATION_CACHE[key]
        if (generated_at - cached_at).total_seconds() <= ttl:
            return cached

    ranked = await recommend_for_user(user_id, limit=limit, repository=repo, log_recommendations=True)
    twin = await get_current_user_digital_twin(user_id, repository=repo, use_cache=False)
    items: list[RecommendationAPIItemResponse] = []
    for recommendation in ranked.recommendations:
        item = await repo.get_accessible_learning_item_for_user(user_id, recommendation.item_id)
        if not item:
            continue
        components = await repo.list_knowledge_components_by_ids_for_user(
            user_id,
            recommendation.knowledge_component_ids,
        )
        document = None
        if item.get("document_id"):
            document = await repo.get_owned_document(str(item["document_id"]), user_id)
        explanation = await _explain_recommendation(
            recommendation,
            item=item,
            components=components,
            document=document,
            twin=twin,
            language=language,
            explanation_style=style,
            ai_json_generator=ai_json_generator,
        )
        items.append(
            RecommendationAPIItemResponse(
                recommendation_log_id=recommendation.recommendation_log_id,
                item_id=recommendation.item_id,
                item_type=str(item.get("item_type") or "other"),
                title=_item_title(item),
                preview=_item_preview(item),
                difficulty=recommendation.difficulty,
                knowledge_components=[
                    {"id": component["id"], "name": str(component.get("name") or component["id"])}
                    for component in components
                ],
                final_score=recommendation.final_score,
                reason_codes=recommendation.reason_codes,
                explanation=explanation,
                source_document=_source_document(document),
                estimated_duration=item.get("estimated_duration_seconds"),
                model_versions=_model_versions(),
                generated_at=recommendation.generated_at,
            )
        )

    response = RecommendationAPIResponse(
        user_id=user_id,
        items=items,
        generated_at=generated_at,
        model_versions=_model_versions(),
    )
    if use_cache and ttl > 0:
        _RECOMMENDATION_CACHE[key] = (generated_at, response)
    return response


async def record_recommendation_feedback(
    user_id: str,
    payload: RecommendationFeedbackRequest,
    *,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> RecommendationFeedbackResponse:
    repo = repository or PersonalizationMongoRepository()
    recorded_at = _now()
    log, duplicate = await repo.record_recommendation_feedback(
        user_id=user_id,
        recommendation_log_id=payload.recommendation_log_id,
        item_id=payload.item_id,
        feedback_type=payload.feedback_type,
        recorded_at=recorded_at,
    )
    if not log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recommendation log not found.")
    await update_bandit_from_recommendation_feedback(
        user_id=user_id,
        recommendation_log=log,
        feedback_type=payload.feedback_type,
        duplicate_feedback=duplicate,
        repository=repo,
    )
    invalidate_recommendation_cache(user_id)
    return RecommendationFeedbackResponse(
        recommendation_log_id=log["id"],
        item_id=payload.item_id,
        feedback_type=payload.feedback_type,
        recorded_at=log.get("feedback", {}).get(payload.feedback_type) or recorded_at,
        duplicate=duplicate,
    )


async def get_recommendation_history_for_current_user(
    user_id: str,
    *,
    limit: int = 20,
    repository: Optional[PersonalizationMongoRepository] = None,
) -> RecommendationHistoryResponse:
    repo = repository or PersonalizationMongoRepository()
    logs = await repo.list_recommendation_logs_for_user(user_id, limit=limit)
    return RecommendationHistoryResponse(
        user_id=user_id,
        items=[
            RecommendationHistoryItem(
                recommendation_log_id=log["id"],
                item_id=log["item_id"],
                candidate_sources=log.get("candidate_sources", []),
                component_scores=log.get("component_scores", {}),
                final_score=log.get("final_score", 0.0),
                rank_position=log.get("rank_position", 1),
                reason_codes=log.get("reason_codes", []),
                generated_at=log["generated_at"],
                feedback=log.get("feedback", {}),
            )
            for log in logs
        ],
    )


async def _explain_recommendation(
    recommendation: RecommendationItemResponse,
    *,
    item: dict,
    components: list[dict],
    document: Optional[dict],
    twin,
    language: str,
    explanation_style: str,
    ai_json_generator: Optional[Callable[[str], str]],
) -> AIRecommendationExplanation:
    fallback = _fallback_explanation(recommendation, item=item, language=language)
    if not settings.AI_RECOMMENDATION_EXPLANATION_ENABLED:
        return fallback
    generator = ai_json_generator
    if generator is None:
        try:
            from app.services.llm_service import generate_json_with_failover

            generator = generate_json_with_failover
        except Exception:
            return fallback
    prompt = _build_explanation_prompt(
        recommendation,
        item=item,
        components=components,
        document=document,
        twin=twin,
        language=language,
        explanation_style=explanation_style,
    )
    try:
        raw = generator(prompt)
        parsed = json.loads(raw) if isinstance(raw, str) else raw
        explanation = AIRecommendationExplanation.model_validate(parsed)
        _validate_ai_explanation(explanation)
        return explanation
    except (Exception, ValidationError, json.JSONDecodeError):
        return fallback


def _build_explanation_prompt(
    recommendation: RecommendationItemResponse,
    *,
    item: dict,
    components: list[dict],
    document: Optional[dict],
    twin,
    language: str,
    explanation_style: str,
) -> str:
    mastery = {
        signal.knowledge_component_id: {
            "mastery_probability": signal.mastery_probability,
            "status": signal.status,
            "confidence": signal.confidence,
        }
        for signal in [*twin.weaknesses, *twin.at_risk_knowledge, *twin.prerequisite_gaps]
        if signal.knowledge_component_id in recommendation.knowledge_component_ids
    }
    payload = {
        "reason_codes": recommendation.reason_codes,
        "mastery": mastery,
        "difficulty_fit": recommendation.component_scores.get("difficulty_fit"),
        "prerequisite_state": recommendation.prerequisite_status,
        "learning_goals": twin.learning_goals[:5],
        "item_metadata": {
            "item_type": item.get("item_type"),
            "title": _item_title(item),
            "difficulty": recommendation.difficulty,
            "estimated_duration_seconds": item.get("estimated_duration_seconds"),
        },
        "knowledge_components": [
            {"id": component["id"], "name": component.get("name")}
            for component in components
        ],
        "source": _source_document(document),
        "language": language,
        "explanation_style": explanation_style,
    }
    return f"""You explain why a pre-selected learning recommendation is useful.

Rules:
- Do not add, remove, or change the recommended item.
- Do not invent numbers or learner data.
- Do not mention mastery values that are not present in the input.
- Do not make absolute diagnoses.
- Return only JSON with keys: short_reason, learning_objective, expected_benefit, suggested_action, confidence.

Input:
{json.dumps(payload, ensure_ascii=False)}
"""


def _validate_ai_explanation(explanation: AIRecommendationExplanation) -> None:
    texts = [
        explanation.short_reason,
        explanation.learning_objective,
        explanation.expected_benefit,
        explanation.suggested_action,
    ]
    forbidden_patterns = [
        r"\d",
        r"\b(always|never|guaranteed|diagnosis|diagnose)\b",
        r"\b(chắc chắn|luôn luôn|không bao giờ|chẩn đoán|đảm bảo)\b",
    ]
    for text in texts:
        lowered = text.lower()
        for pattern in forbidden_patterns:
            if re.search(pattern, lowered):
                raise ValueError("AI explanation contains unsupported quantitative or absolute claims.")


def _fallback_explanation(recommendation: RecommendationItemResponse, *, item: dict, language: str) -> AIRecommendationExplanation:
    reason = recommendation.reason_codes[0] if recommendation.reason_codes else "SUITABLE_DIFFICULTY"
    templates = {
        "IMPROVE_WEAK_SKILL": "This item is selected to practice a skill that currently needs attention.",
        "REVIEW_BEFORE_FORGETTING": "This item helps review knowledge that may need reinforcement.",
        "FILL_PREREQUISITE_GAP": "This item supports prerequisite knowledge before moving further.",
        "MATCH_LEARNING_GOAL": "This item aligns with the learner's current goal.",
        "SUITABLE_DIFFICULTY": "This item fits the current difficulty range.",
        "CONTINUE_LEARNING_PATH": "This item continues the current learning path.",
        "EXPLORE_RELATED_TOPIC": "This item explores a related topic at a safe difficulty.",
    }
    vi_templates = {
        "IMPROVE_WEAK_SKILL": "Nội dung này giúp luyện một kỹ năng đang cần củng cố.",
        "REVIEW_BEFORE_FORGETTING": "Nội dung này giúp ôn lại kiến thức có nguy cơ quên.",
        "FILL_PREREQUISITE_GAP": "Nội dung này hỗ trợ lấp khoảng trống kiến thức tiên quyết.",
        "MATCH_LEARNING_GOAL": "Nội dung này phù hợp với mục tiêu học tập hiện tại.",
        "SUITABLE_DIFFICULTY": "Nội dung này nằm trong vùng độ khó phù hợp.",
        "CONTINUE_LEARNING_PATH": "Nội dung này tiếp nối lộ trình học hiện tại.",
        "EXPLORE_RELATED_TOPIC": "Nội dung này giúp khám phá chủ đề liên quan ở mức an toàn.",
    }
    mapping = vi_templates if language.startswith("vi") else templates
    short_reason = mapping.get(reason, mapping["SUITABLE_DIFFICULTY"])
    return AIRecommendationExplanation(
        short_reason=short_reason,
        learning_objective=_item_title(item),
        expected_benefit=short_reason,
        suggested_action="Hãy hoàn thành nội dung này rồi xem giải thích sau khi trả lời." if language.startswith("vi") else "Complete this item, then review the explanation after answering.",
        confidence=0.5,
    )


def _item_title(item: dict) -> str:
    for key in ("title", "question", "name"):
        if item.get(key):
            return str(item[key])[:240]
    return f"{str(item.get('item_type') or 'Item').title()} {item.get('id') or item.get('_id') or ''}".strip()


def _item_preview(item: dict) -> Optional[str]:
    for key in ("preview", "question", "content", "description"):
        if item.get(key):
            return str(item[key])[:500]
    return None


def _source_document(document: Optional[dict]) -> Optional[dict[str, str]]:
    if not document:
        return None
    title = document.get("original_filename") or document.get("title") or document.get("name") or "Document"
    return {"id": document["id"], "title": str(title)}
