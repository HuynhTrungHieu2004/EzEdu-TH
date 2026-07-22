"""Atomic document mutation locks shared by extract, index, and verification."""

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId


MUTATION_TOKEN_FIELD = "document_mutation_token"
MUTATION_OPERATION_FIELD = "document_mutation_operation"
MUTATION_PREVIOUS_STATUS_FIELD = "document_mutation_previous_status"


def mutation_owner_filter(
    document_id: str,
    user_id: str,
    token: str,
    *,
    status: Optional[str] = None,
) -> dict:
    query = {
        "_id": ObjectId(document_id),
        "user_id": user_id,
        MUTATION_TOKEN_FIELD: token,
    }
    if status is not None:
        query["status"] = status
    return query


async def acquire_document_mutation_lock(
    db,
    document_id: str,
    user_id: str,
    *,
    expected_status: str,
    operation: str,
    locked_status: Optional[str] = None,
    expected_updated_at: Optional[datetime] = None,
) -> Optional[str]:
    """Acquire a CAS lock and optionally move the document to a blocking status."""
    token = str(ObjectId())
    lock_filter = {
        "_id": ObjectId(document_id),
        "user_id": user_id,
        "status": expected_status,
        MUTATION_TOKEN_FIELD: {"$exists": False},
        # Compatibility with builds that used the old apply-only lock.
        "verification_apply_token": {"$exists": False},
    }
    if expected_updated_at is not None:
        lock_filter["updated_at"] = expected_updated_at

    result = await db["documents"].update_one(
        lock_filter,
        {
            "$set": {
                "status": locked_status or expected_status,
                MUTATION_TOKEN_FIELD: token,
                MUTATION_OPERATION_FIELD: operation,
                MUTATION_PREVIOUS_STATUS_FIELD: expected_status,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return token if result.modified_count == 1 else None


async def finalize_document_mutation(
    db,
    document_id: str,
    user_id: str,
    token: str,
    *,
    final_status: str,
    error_message: Optional[str] = None,
    required_status: Optional[str] = None,
) -> bool:
    """Finalize only when the caller still owns the mutation token."""
    result = await db["documents"].update_one(
        mutation_owner_filter(
            document_id,
            user_id,
            token,
            status=required_status,
        ),
        {
            "$set": {
                "status": final_status,
                "error_message": error_message,
                "updated_at": datetime.now(timezone.utc),
            },
            "$unset": {
                MUTATION_TOKEN_FIELD: "",
                MUTATION_OPERATION_FIELD: "",
                MUTATION_PREVIOUS_STATUS_FIELD: "",
                "verification_apply_token": "",
            },
        },
    )
    return result.matched_count == 1


async def recover_interrupted_document_mutations(db) -> int:
    """Recover locks left behind when the previous app process stopped."""
    recovered = 0
    cursor = db["documents"].find(
        {
            "$or": [
                {MUTATION_TOKEN_FIELD: {"$exists": True}},
                {"verification_apply_token": {"$exists": True}},
            ]
        }
    )
    async for document in cursor:
        document_id = str(document["_id"])
        user_id = document.get("user_id")
        token = document.get(MUTATION_TOKEN_FIELD)
        operation = document.get(MUTATION_OPERATION_FIELD)
        previous_status = document.get(MUTATION_PREVIOUS_STATUS_FIELD) or "processed"

        if not user_id:
            continue

        if not token:
            # Legacy verification apply lock.
            result = await db["documents"].update_one(
                {
                    "_id": document["_id"],
                    "verification_apply_token": {"$exists": True},
                },
                {
                    "$set": {
                        "status": "index_failed",
                        "error_message": (
                            "Re-index bị gián đoạn do máy chủ khởi động lại. "
                            "Vui lòng thử lại."
                        ),
                        "updated_at": datetime.now(timezone.utc),
                    },
                    "$unset": {"verification_apply_token": ""},
                },
            )
            recovered += result.modified_count
            continue

        if operation in {"extract", "force_extract", "transcription"}:
            content = await db["document_contents"].find_one(
                {
                    "document_id": document_id,
                    "user_id": user_id,
                    "content_revision": token,
                },
                {"_id": 1},
            )
            if operation == "transcription":
                final_status = "transcribed" if content else previous_status
            else:
                final_status = "processed" if content else previous_status
            error_message = None
        elif operation == "verification_resolve":
            final_status = previous_status
            error_message = document.get("error_message")
        else:
            final_status = "index_failed"
            error_message = (
                "Lập chỉ mục bị gián đoạn do máy chủ khởi động lại. "
                "Vui lòng thử lại."
            )

        if await finalize_document_mutation(
            db,
            document_id,
            user_id,
            token,
            final_status=final_status,
            error_message=error_message,
        ):
            recovered += 1

    return recovered
