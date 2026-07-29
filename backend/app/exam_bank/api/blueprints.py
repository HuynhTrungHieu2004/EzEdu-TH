from fastapi import APIRouter, Depends, Query
from app.schemas.auth import UserResponse

from app.database.mongodb import get_database
from app.exam_bank.api.deps import is_admin_actor, require_exam_bank_actor
from app.exam_bank.schemas.blueprint import (
    BlueprintValidationResult,
    ExamBlueprintCreate,
    ExamBlueprintResponse,
    ExamBlueprintUpdate,
)
from app.exam_bank.services import blueprint_service

router = APIRouter()


@router.post("/exam-blueprints", response_model=ExamBlueprintResponse, status_code=201)
async def create_blueprint(
    payload: ExamBlueprintCreate,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await blueprint_service.create_blueprint(db, payload, owner_id=current_user.id)


@router.get("/exam-blueprints")
async def list_blueprints(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    items, total = await blueprint_service.list_blueprints(db, owner_id=current_user.id, skip=skip, limit=limit)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.get("/exam-blueprints/{blueprint_id}", response_model=ExamBlueprintResponse)
async def get_blueprint(
    blueprint_id: str,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await blueprint_service.get_blueprint(
        db, blueprint_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )


@router.patch("/exam-blueprints/{blueprint_id}", response_model=ExamBlueprintResponse)
async def update_blueprint(
    blueprint_id: str,
    payload: ExamBlueprintUpdate,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await blueprint_service.update_blueprint(
        db, blueprint_id, payload, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )


@router.post("/exam-blueprints/{blueprint_id}/validate", response_model=BlueprintValidationResult)
async def validate_blueprint(
    blueprint_id: str,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await blueprint_service.validate_blueprint(
        db, blueprint_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )


@router.post("/exam-blueprints/{blueprint_id}/clone", response_model=ExamBlueprintResponse, status_code=201)
async def clone_blueprint(
    blueprint_id: str,
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await blueprint_service.clone_blueprint(
        db, blueprint_id, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )


@router.post("/exam-blueprints/{blueprint_id}/archive", response_model=ExamBlueprintResponse)
async def archive_blueprint(
    blueprint_id: str,
    version: int = Query(...),
    current_user: UserResponse = Depends(require_exam_bank_actor),
):
    db = get_database()
    return await blueprint_service.archive_blueprint(
        db, blueprint_id, version=version, actor_id=current_user.id, is_admin=is_admin_actor(current_user)
    )
