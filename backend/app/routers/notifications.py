from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from app.database.mongodb import get_database
from app.routers.auth import get_current_user
from app.schemas.admin_notifications_reports import UserNotificationItem
from app.schemas.auth import UserResponse


router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _oid(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=404, detail="Thông báo không tồn tại.")
    return ObjectId(value)


def _query(user: UserResponse) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "status": {"$in": ["published", "scheduled"]},
        "$and": [
            {"$or": [{"starts_at": None}, {"starts_at": {"$lte": now}}]},
            {"$or": [{"expires_at": None}, {"expires_at": {"$gt": now}}]},
            {"$or": [
                {"audience_type": "all"},
                {"audience_type": "roles", "target_roles": user.role},
                {"audience_type": "users", "target_user_ids": user.id},
            ]},
        ],
    }


async def _visible(db, notification_id: str, user: UserResponse) -> dict:
    doc = await db["admin_notifications"].find_one({"_id": _oid(notification_id), **_query(user)})
    if not doc:
        raise HTTPException(status_code=404, detail="Thông báo không tồn tại.")
    return doc


async def _item(db, doc: dict, user_id: str) -> UserNotificationItem:
    notification_id = str(doc["_id"])
    read = await db["notification_reads"].find_one({"notification_id": notification_id, "user_id": user_id})
    return UserNotificationItem(
        id=notification_id,
        title=doc.get("title") or "",
        content=doc.get("content") or "",
        type=doc.get("type") or "system",
        priority=doc.get("priority") or "normal",
        created_at=doc.get("created_at") or datetime.now(timezone.utc),
        is_read=bool(read and read.get("read_at")),
        action_url=doc.get("action_url"),
    )


@router.get("", response_model=list[UserNotificationItem])
async def list_my_notifications_route(current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    dismissed_ids = {
        doc["notification_id"]
        async for doc in db["notification_reads"].find({"user_id": current_user.id, "dismissed_at": {"$ne": None}})
    }
    docs = await db["admin_notifications"].find(_query(current_user)).sort("created_at", -1).to_list(100)
    return [await _item(db, doc, current_user.id) for doc in docs if str(doc["_id"]) not in dismissed_ids]


@router.post("/{notification_id}/read", response_model=UserNotificationItem)
async def mark_notification_read_route(notification_id: str, current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    doc = await _visible(db, notification_id, current_user)
    await db["notification_reads"].update_one(
        {"notification_id": notification_id, "user_id": current_user.id},
        {"$set": {"read_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return await _item(db, doc, current_user.id)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read_route(current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    now = datetime.now(timezone.utc)
    async for doc in db["admin_notifications"].find(_query(current_user), {"_id": 1}):
        await db["notification_reads"].update_one(
            {"notification_id": str(doc["_id"]), "user_id": current_user.id},
            {"$set": {"read_at": now}},
            upsert=True,
        )


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_notification_route(notification_id: str, current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    await _visible(db, notification_id, current_user)
    now = datetime.now(timezone.utc)
    await db["notification_reads"].update_one(
        {"notification_id": notification_id, "user_id": current_user.id},
        {"$set": {"read_at": now, "dismissed_at": now}},
        upsert=True,
    )
