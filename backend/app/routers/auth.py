from typing import Optional
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token
from app.database.mongodb import get_database
from app.schemas.auth import UserRegister, UserLogin, UserResponse, Token, TokenPayload

router = APIRouter()

# Swagger UI Authorize sẽ sử dụng endpoint login-swagger
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login-swagger", auto_error=False)

async def get_current_user(
    token_header: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token")
) -> UserResponse:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token = token_header or token_query
    if not token:
        raise credentials_exception
        
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    token_data = TokenPayload(sub=user_id)
        
    db = get_database()
    try:
        user_doc = await db["users"].find_one({"_id": ObjectId(token_data.sub)})
    except Exception:
        raise credentials_exception
        
    if user_doc is None:
        raise credentials_exception
        
    return UserResponse(
        id=str(user_doc["_id"]),
        email=user_doc["email"],
        full_name=user_doc["full_name"],
        role=user_doc.get("role", "user"),
        created_at=user_doc["created_at"]
    )

async def require_admin(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Dependency to enforce admin authorization."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Quyền truy cập bị từ chối. Chỉ dành cho quản trị viên."
        )
    return current_user

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserRegister):
    db = get_database()
    # Kiểm tra trùng email
    existing_user = await db["users"].find_one({"email": user_in.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    hashed_password = get_password_hash(user_in.password)
    user_doc = {
        "email": user_in.email,
        "full_name": user_in.full_name,
        "hashed_password": hashed_password,
        "role": user_in.role,
        "created_at": datetime.now(timezone.utc)
    }
    
    result = await db["users"].insert_one(user_doc)
    
    return UserResponse(
        id=str(result.inserted_id),
        email=user_in.email,
        full_name=user_in.full_name,
        role=user_in.role,
        created_at=user_doc["created_at"]
    )

@router.post("/login", response_model=Token)
async def login(user_in: UserLogin):
    """Endpoint đăng nhập chính thức sử dụng JSON Body (UserLogin schema)"""
    db = get_database()
    user = await db["users"].find_one({"email": user_in.email})
    if not user or not verify_password(user_in.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = create_access_token(subject=str(user["_id"]))
    return Token(access_token=access_token, token_type="bearer")

@router.post("/login-swagger", response_model=Token, include_in_schema=True)
async def login_swagger(form_data: OAuth2PasswordRequestForm = Depends()):
    """Endpoint phụ trợ giúp Swagger UI tương thích với nút Authorize dùng Form Data"""
    db = get_database()
    user = await db["users"].find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(subject=str(user["_id"]))
    return Token(access_token=access_token, token_type="bearer")

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: UserResponse = Depends(get_current_user)):
    return current_user
