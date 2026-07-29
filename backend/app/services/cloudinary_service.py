import os
import shutil
import uuid
from pathlib import Path
import cloudinary
import cloudinary.uploader
from app.core.config import settings

def is_cloudinary_configured() -> bool:
    """Returns True when all Cloudinary credentials are configured."""
    return bool(
        settings.CLOUDINARY_CLOUD_NAME
        and settings.CLOUDINARY_API_KEY
        and settings.CLOUDINARY_API_SECRET
    )

def configure_cloudinary():
    """Configure the Cloudinary SDK using application settings"""
    if not is_cloudinary_configured():
        raise ValueError("Cloudinary credentials are not configured in the application environment (.env file).")
    
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True
    )

def upload_file_to_cloudinary(file_path: str, folder: str = "documents", resource_type: str = "auto") -> dict:
    """Uploads a local file to Cloudinary with specified resource_type"""
    if not is_cloudinary_configured():
        # Fallback to local storage
        target_dir = Path(file_path).parent
        target_dir.mkdir(parents=True, exist_ok=True)
        
        orig_name = Path(file_path).name
        # Create a unique persisted file name in uploads directory
        persisted_filename = f"persisted_{uuid.uuid4()}_{orig_name}"
        persisted_path = target_dir / persisted_filename
        
        shutil.copy(file_path, persisted_path)
        
        return {
            "secure_url": f"local://{persisted_path.resolve()}",
            "public_id": f"local_{persisted_filename}",
            "resource_type": "video" if resource_type == "video" else "raw"
        }

    configure_cloudinary()
    file_size = os.path.getsize(file_path)
    # Use upload_large for video or files larger than 20MB (20 * 1024 * 1024 bytes)
    # to handle large file sizes without timing out or failing.
    if resource_type == "video" or file_size > 20 * 1024 * 1024:
        response = cloudinary.uploader.upload_large(
            file_path,
            folder=folder,
            resource_type=resource_type,
            chunk_size=6000000  # 6MB chunks
        )
    else:
        response = cloudinary.uploader.upload(
            file_path,
            folder=folder,
            resource_type=resource_type
        )
    return response

CLEANUP_ASSET_JOB_TYPE = "cleanup_cloudinary_asset"


async def enqueue_cloudinary_cleanup(db, *, public_id: str) -> None:
    """Xoá asset Cloudinary qua hàng đợi job nền (retry có backoff, xem
    `background_job_service.py`) thay vì gọi đồng bộ trong request rồi im
    lặng bỏ qua lỗi (`except Exception: pass` trước đây) — asset mồ côi sẽ
    được thử lại thay vì mất dấu vĩnh viễn khi Cloudinary lỗi tạm thời."""
    from app.services.background_job_service import enqueue

    if not public_id:
        return
    await enqueue(
        db,
        job_type=CLEANUP_ASSET_JOB_TYPE,
        payload={"public_id": public_id},
        idempotency_key=f"cloudinary-delete:{public_id}",
    )


async def cleanup_cloudinary_asset_job(payload: dict) -> dict:
    """Handler cho job `cleanup_cloudinary_asset` — gọi từ `app/worker.py`."""
    delete_file_from_cloudinary(payload["public_id"])
    return {"deleted": payload["public_id"]}


class InvalidWebhookSignature(Exception):
    pass


async def handle_cloudinary_webhook(db, *, body: bytes, timestamp: str, signature: str) -> dict:
    """Xác thực chữ ký + xử lý idempotent 1 notification Cloudinary. Tách
    khỏi router để kiểm thử được mà không cần dựng `Request` ASGI thật."""
    from cloudinary.utils import verify_notification_signature

    if not is_cloudinary_configured():
        raise ValueError("Cloudinary chưa được cấu hình.")
    configure_cloudinary()

    if not verify_notification_signature(body.decode("utf-8"), int(timestamp), signature):
        raise InvalidWebhookSignature("Chữ ký Cloudinary không hợp lệ.")

    import json

    payload = json.loads(body)
    notification_type = payload.get("notification_type", "unknown")
    public_id = payload.get("public_id", "unknown")

    async def _apply() -> dict:
        if payload.get("public_id"):
            from datetime import datetime, timezone

            await db["documents"].update_one(
                {"cloudinary_public_id": payload["public_id"]},
                {"$set": {"cloudinary_notification_status": notification_type, "updated_at": datetime.now(timezone.utc)}},
            )
        return {"handled": notification_type}

    from app.core.idempotency import run_idempotent

    return await run_idempotent(
        db, scope="cloudinary_webhook", key=f"{notification_type}:{public_id}:{timestamp}", fn=_apply
    )


def delete_file_from_cloudinary(public_id: str) -> dict:
    """Deletes a file from Cloudinary given its public_id"""
    if not is_cloudinary_configured():
        if public_id.startswith("local_"):
            filename = public_id.replace("local_", "")
            target_dir = Path(__file__).resolve().parents[2] / "uploads"
            target_file = target_dir / filename
            if target_file.exists():
                try:
                    os.remove(target_file)
                except Exception:
                    pass
        return {"result": "ok"}

    configure_cloudinary()
    response = cloudinary.uploader.destroy(public_id)
    return response
