from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import HTTPException, status

from app.exam_bank.constants.collections import CURRICULUM_TAXONOMY
from app.exam_bank.schemas.taxonomy import TaxonomyNodeCreate, TaxonomyNodeResponse


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_response(doc: dict) -> TaxonomyNodeResponse:
    return TaxonomyNodeResponse(
        id=str(doc["_id"]),
        node_type=doc["node_type"],
        name=doc["name"],
        parent_id=doc.get("parent_id"),
        grade=doc.get("grade"),
        curriculum_version=doc.get("curriculum_version"),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


async def create_node(db, payload: TaxonomyNodeCreate, *, created_by: str) -> TaxonomyNodeResponse:
    if payload.parent_id is not None:
        parent = await db[CURRICULUM_TAXONOMY].find_one({"_id": ObjectId(payload.parent_id)})
        if parent is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không tìm thấy node cha.")

    now = _now()
    doc = {
        "node_type": payload.node_type,
        "name": payload.name,
        "parent_id": payload.parent_id,
        "grade": payload.grade,
        "curriculum_version": payload.curriculum_version,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[CURRICULUM_TAXONOMY].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _to_response(doc)


async def list_nodes(
    db, *, node_type: Optional[str] = None, parent_id: Optional[str] = None
) -> list[TaxonomyNodeResponse]:
    query: dict = {}
    if node_type:
        query["node_type"] = node_type
    if parent_id is not None:
        query["parent_id"] = parent_id

    cursor = db[CURRICULUM_TAXONOMY].find(query).sort("name", 1)
    return [_to_response(doc) async for doc in cursor]
