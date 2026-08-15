from fastapi import APIRouter

from app.curriculum_kb.api import crawler, registry, search

router = APIRouter(tags=["Curriculum Knowledge Base"])
router.include_router(registry.router)
router.include_router(search.router)
router.include_router(crawler.router)
