import cloudinary
import cloudinary.uploader
from app.core.config import settings

def configure_cloudinary():
    """Configure the Cloudinary SDK using application settings"""
    if not settings.CLOUDINARY_CLOUD_NAME or not settings.CLOUDINARY_API_KEY or not settings.CLOUDINARY_API_SECRET:
        raise ValueError("Cloudinary credentials are not configured in the application environment (.env file).")
    
    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True
    )

def upload_file_to_cloudinary(file_path: str, folder: str = "documents") -> dict:
    """Uploads a local file to Cloudinary with resource_type='auto' to support PDF, DOCX, PPTX"""
    configure_cloudinary()
    response = cloudinary.uploader.upload(
        file_path,
        folder=folder,
        resource_type="auto"
    )
    return response

def delete_file_from_cloudinary(public_id: str) -> dict:
    """Deletes a file from Cloudinary given its public_id"""
    configure_cloudinary()
    response = cloudinary.uploader.destroy(public_id)
    return response
