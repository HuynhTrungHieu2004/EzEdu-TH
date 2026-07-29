from fastapi import APIRouter

from app.web_knowledge.api import explore, sources

router = APIRouter(tags=["Web Knowledge"])
router.include_router(explore.router)
router.include_router(sources.router)
