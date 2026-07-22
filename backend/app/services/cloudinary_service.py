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
