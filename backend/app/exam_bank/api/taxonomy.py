from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from app.schemas.auth import UserResponse

from app.database.mongodb import get_database
from app.exam_bank.api.deps import require_exam_bank_actor
from app.exam_bank.schemas.taxonomy import TaxonomyNodeCreate, TaxonomyNodeResponse
from app.exam_bank.services import taxonomy_service

router = APIRouter()


@router.post("/taxonomy", response_model=TaxonomyNodeResponse, status_code=201)
async def create_taxonomy_node(
    payload: TaxonomyNodeCreate,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await taxonomy_service.create_node(db, payload, created_by=current_user.id)


@router.get("/taxonomy", response_model=List[TaxonomyNodeResponse])
async def list_taxonomy_nodes(
    node_type: Optional[str] = Query(None),
    parent_id: Optional[str] = Query(None),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await taxonomy_service.list_nodes(db, node_type=node_type, parent_id=parent_id)
