from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.routers.auth import get_current_user
from app.schemas.auth import UserResponse
from app.personalization.repositories.mongo import PersonalizationMongoRepository
from app.personalization.services.knowledge_extraction_service import (
    KnowledgeExtractionValidationError,
    process_document_knowledge_graph,
)
from app.personalization.utils.knowledge_normalization import normalize_knowledge_name

router = APIRouter()


class KnowledgeExtractionRequest(BaseModel):
    ai_response: Optional[dict] = Field(
        None,
        description="Internal/testing override. Omit to call the configured AI provider.",
    )


class ReviewComponentRequest(BaseModel):
    action: str = Field(..., pattern="^(accepted|rejected|edited)$")
    name: Optional[str] = Field(None, min_length=1, max_length=240)
    description: Optional[str] = Field(None, min_length=1, max_length=4000)


class ReviewEdgeRequest(BaseModel):
    action: str = Field(..., pattern="^(accepted|rejected)$")


def ensure_knowledge_graph_enabled() -> None:
    if not settings.PERSONALIZATION_ENABLED or not settings.KNOWLEDGE_GRAPH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personalization knowledge graph is disabled.",
        )


@router.post("/documents/{document_id}/knowledge-graph/extract")
async def extract_document_knowledge_graph(
    document_id: str,
    payload: KnowledgeExtractionRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_knowledge_graph_enabled()
    try:
        return await process_document_knowledge_graph(
            document_id=document_id,
            user_id=current_user.id,
            ai_response=payload.ai_response,
        )
    except KnowledgeExtractionValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@router.get("/documents/{document_id}/knowledge-graph/review")
async def list_knowledge_graph_review_items(
    document_id: str,
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_knowledge_graph_enabled()
    repo = PersonalizationMongoRepository()
    document = await repo.get_owned_document(document_id, current_user.id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return await repo.list_review_suggestions(current_user.id, document_id=document_id)


@router.post("/knowledge-components/{component_id}/review")
async def review_knowledge_component(
    component_id: str,
    payload: ReviewComponentRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_knowledge_graph_enabled()
    updates = {}
    if payload.name:
        updates["name"] = payload.name
        updates["normalized_name"] = normalize_knowledge_name(payload.name)
    if payload.description:
        updates["description"] = payload.description

    reviewed = await PersonalizationMongoRepository().review_knowledge_component(
        component_id,
        current_user.id,
        action=payload.action,
        updates=updates,
    )
    if not reviewed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge component not found.")
    return reviewed


@router.post("/knowledge-graph-edges/{edge_id}/review")
async def review_knowledge_graph_edge(
    edge_id: str,
    payload: ReviewEdgeRequest,
    current_user: UserResponse = Depends(get_current_user),
):
    ensure_knowledge_graph_enabled()
    reviewed = await PersonalizationMongoRepository().review_graph_edge(
        edge_id,
        current_user.id,
        action=payload.action,
    )
    if not reviewed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge graph edge not found.")
    return reviewed
