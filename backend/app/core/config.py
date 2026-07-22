import json
from pathlib import Path
from typing import List, Union, Optional
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_ignore_empty=True,
        extra="ignore"
    )

    APP_ENV: str = "development"
    PROJECT_NAME: str = "FastAPI Backend"
    API_V1_STR: str = "/api/v1"
    BACKEND_CORS_ORIGINS: List[str] = []

    # MongoDB configurations
    MONGODB_URI: str = ""
    MONGODB_DB_NAME: str = "ai_question_generator"

    # JWT configurations
    JWT_SECRET_KEY: str = "change_this_to_a_long_random_secret_key"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CREATE_DEFAULT_TEST_USER: bool = False
    CURSOR_SIGNING_SECRET: Optional[str] = None

    # Cloudinary configurations
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    # ChromaDB configurations
    CHROMA_PERSIST_DIR: str = "./chroma_db"

    # Gemini configurations (for cross-validation)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Groq configurations (for free primary LLM & transcription)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    # Advanced Chat Configurations
    RAG_DISTANCE_THRESHOLD: float = 0.75
    AI_TIMEOUT_SECONDS: float = 25.0
    SEARCH_TIMEOUT_SECONDS: float = 10.0
    MAX_HISTORY_MESSAGES: int = 5
    MAX_QUESTION_LENGTH: int = 2000
    MAX_DOCUMENT_IDS: int = 10
    MAX_RAG_CHUNKS: int = 5
    MAX_CONTEXT_CHARACTERS: int = 6000
    MAX_WEB_CITATIONS: int = 5
    MAX_ANSWER_LENGTH: int = 4000
    MAX_RETRIES: int = 2
    CHAT_RATE_LIMIT_PER_MINUTE: int = 15

    # Admin Analytics Settings
    ADMIN_ANALYTICS_RATE_LIMIT_PER_MINUTE: int = 20
    ADMIN_ANALYTICS_QUERY_TIMEOUT_SECONDS: float = 10.0
    ADMIN_ANALYTICS_MAX_RANGE_DAYS: int = 90
    ANALYTICS_CACHE_TTL_SECONDS: int = 60
    # Path to the offline benchmark evaluation report file (server-side only)
    EVALUATION_REPORT_PATH: str = "evaluation/reports/report_latest.json"
    EVALUATION_REPORT_MAX_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB




    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str):
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                return []
        return v

    @model_validator(mode="after")
    def validate_secrets(self) -> "Settings":
        if not self.MONGODB_URI:
            if self.APP_ENV == "production":
                raise ValueError("MONGODB_URI must be set in production mode.")
            else:
                self.MONGODB_URI = "mongodb://localhost:27017/ai_question_generator"

        if self.APP_ENV == "production":
            if self.JWT_SECRET_KEY == "change_this_to_a_long_random_secret_key":
                raise ValueError("JWT_SECRET_KEY must be changed to a secure key in production mode.")
        
        if not self.GEMINI_MODEL:
            raise ValueError("GEMINI_MODEL cannot be empty.")
            
        if self.AI_TIMEOUT_SECONDS <= 0:
            raise ValueError("AI_TIMEOUT_SECONDS must be greater than 0.")
        if self.SEARCH_TIMEOUT_SECONDS <= 0:
            raise ValueError("SEARCH_TIMEOUT_SECONDS must be greater than 0.")
            
        if self.MAX_RETRIES < 0:
            raise ValueError("MAX_RETRIES must be non-negative.")
            
        if self.CHAT_RATE_LIMIT_PER_MINUTE <= 0:
            raise ValueError("CHAT_RATE_LIMIT_PER_MINUTE must be greater than 0.")
            
        return self

settings = Settings()
