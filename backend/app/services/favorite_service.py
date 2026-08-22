from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException

from app.schemas.favorites import FavoriteCreate, FavoriteRead


COLLECTIONS = {
    "document": "documents",
    "exam": "exams",
    "question_set": "question_sets",
    "course": "courses",
}


async def ensure_favorite_indexes(db) -> None:
    await db["favorites"].create_index(
        [("user_id", 1), ("resource_type", 1), ("resource_id", 1)],
        unique=True,
    )


def _oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Không tìm thấy tài nguyên.")
    return ObjectId(value)


def _title(resource: dict) -> str:
    return str(
        resource.get("title")
        or resource.get("name")
        or resource.get("original_filename")
        or resource.get("file_name")
        or "Tài nguyên"
    )


async def _resource(db, resource_type: str, resource_id: str) -> dict:
    resource = await db[COLLECTIONS[resource_type]].find_one({
        "_id": _oid(resource_id),
        "deleted_at": None,
    })
    if not resource:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài nguyên.")
    return resource


def _read(doc: dict, title: str) -> FavoriteRead:
    return FavoriteRead(
        id=str(doc["_id"]),
        user_id=doc["user_id"],
        resource_type=doc["resource_type"],
        resource_id=doc["resource_id"],
        title=title,
        created_at=doc["created_at"],
    )


async def create_favorite(db, user_id: str, payload: FavoriteCreate) -> FavoriteRead:
    resource = await _resource(db, payload.resource_type, payload.resource_id)
    query = {
        "user_id": user_id,
        "resource_type": payload.resource_type,
        "resource_id": payload.resource_id,
    }
    existing = await db["favorites"].find_one(query)
    if existing:
        return _read(existing, _title(resource))

    doc = {**query, "created_at": datetime.now(timezone.utc)}
    result = await db["favorites"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _read(doc, _title(resource))


async def list_favorites(db, user_id: str) -> list[FavoriteRead]:
    items = []
    async for doc in db["favorites"].find({"user_id": user_id}).sort("created_at", -1):
        try:
            resource = await _resource(db, doc["resource_type"], doc["resource_id"])
        except HTTPException:
            continue
        items.append(_read(doc, _title(resource)))
    return items


async def delete_favorite(db, favorite_id: str, user_id: str) -> None:
    result = await db["favorites"].delete_one({"_id": _oid(favorite_id), "user_id": user_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Không tìm thấy mục yêu thích.")
