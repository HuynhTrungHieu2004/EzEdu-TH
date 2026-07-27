"""Personalization API layer."""

from fastapi import APIRouter

from app.personalization.api.knowledge_graph import router as knowledge_graph_router
from app.personalization.api.learning_events import router as learning_events_router
from app.personalization.api.learner_state import router as learner_state_router
from app.personalization.api.digital_twin import (
    router as digital_twin_router,
    onboarding_router as digital_twin_onboarding_router,
)
from app.personalization.api.candidates import router as candidates_router
from app.personalization.api.recommendations import router as recommendations_router

router = APIRouter()
router.include_router(recommendations_router, tags=["Personalization"])
router.include_router(candidates_router, tags=["Personalization"])
router.include_router(digital_twin_router, tags=["Personalization"])
router.include_router(knowledge_graph_router, tags=["Personalization"])
router.include_router(learning_events_router, tags=["Personalization"])
router.include_router(learner_state_router, tags=["Personalization"])

# Always-on subset: not gated by the enable_personalization feature flag. See the
# comment on onboarding_router in digital_twin.py for why.
onboarding_router = APIRouter()
onboarding_router.include_router(digital_twin_onboarding_router, tags=["Personalization"])

__all__ = ["router", "onboarding_router"]
