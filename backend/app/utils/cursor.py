import hmac
import hashlib
import json
import base64
from typing import Optional, Any
from fastapi import HTTPException
from app.core.config import settings

def _get_signing_key() -> bytes:
    """
    Returns the secret key used for signing cursors.
    Uses settings.CURSOR_SIGNING_SECRET if provided, otherwise derives
    a key from settings.JWT_SECRET_KEY using domain separation.
    """
    secret = settings.CURSOR_SIGNING_SECRET
    if secret:
        return secret.encode()
    
    # Domain separated key derivation from JWT_SECRET_KEY
    jwt_key = settings.JWT_SECRET_KEY.encode()
    derived = hmac.new(jwt_key, b"conversation-pagination-cursor-signing", hashlib.sha256).digest()
    return derived

def serialize_cursor(payload: dict) -> str:
    """
    Serializes a payload dict into a canonical JSON, encodes it as URL-safe Base64,
    signs it using HMAC-SHA256, and returns a signed cursor string: 'base64_payload.signature'.
    """
    # Canonical JSON (keys sorted to preserve exact byte sequence)
    canonical_json = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode('utf-8')
    
    # URL-safe base64 encoding (without trailing padding '=')
    b64_bytes = base64.urlsafe_b64encode(canonical_json)
    b64_str = b64_bytes.decode('utf-8').rstrip('=')
    
    # HMAC-SHA256 signature
    key = _get_signing_key()
    sig = hmac.new(key, b64_str.encode('utf-8'), hashlib.sha256).hexdigest()
    
    return f"{b64_str}.{sig}"

def deserialize_cursor(cursor_str: str, expected_kind: str) -> dict:
    """
    Verifies signature and deserializes a signed cursor string.
    Validates version, size, kind, and format.
    Raises HTTPException 400 if validation fails.
    """
    if not cursor_str:
        raise HTTPException(status_code=400, detail="Mã phân trang trống.")
        
    # Size check to prevent abuse
    if len(cursor_str) > 1000:
        raise HTTPException(status_code=400, detail="Mã phân trang quá dài.")
        
    parts = cursor_str.split('.')
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail="Định dạng mã phân trang không hợp lệ.")
        
    b64_str, sig = parts
    
    # Recompute and compare signature using time-attack safe compare_digest
    key = _get_signing_key()
    expected_sig = hmac.new(key, b64_str.encode('utf-8'), hashlib.sha256).hexdigest()
    
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=400, detail="Mã phân trang bị thay đổi hoặc không hợp lệ.")
        
    # Add padding back for standard base64 decoding
    padded_b64 = b64_str + '=' * (4 - len(b64_str) % 4)
    try:
        json_bytes = base64.urlsafe_b64decode(padded_b64.encode('utf-8'))
        payload = json.loads(json_bytes.decode('utf-8'))
    except Exception:
        raise HTTPException(status_code=400, detail="Không thể giải mã phân trang.")
        
    # Strict validation
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Mã phân trang không hợp lệ.")
        
    if payload.get("v") != 1:
        raise HTTPException(status_code=400, detail="Phiên bản mã phân trang không được hỗ trợ.")
        
    if payload.get("kind") != expected_kind:
        raise HTTPException(status_code=400, detail="Loại mã phân trang không đúng.")
        
    return payload
