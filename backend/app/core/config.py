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
    ACTIVITY_LOG_RETENTION_DAYS: Optional[int] = None
    AI_MODEL_PRICING_JSON: str = ""
    AI_ROLE_QUOTA_JSON: str = ""
    # Path to the offline benchmark evaluation report file (server-side only)
    EVALUATION_REPORT_PATH: str = "evaluation/reports/report_latest.json"
    EVALUATION_REPORT_MAX_SIZE_BYTES: int = 5 * 1024 * 1024  # 5 MB

    # Personalization feature flags. All unimplemented capabilities stay off by default.
    PERSONALIZATION_ENABLED: bool = False
    KNOWLEDGE_GRAPH_ENABLED: bool = False
    LEARNER_MODEL_ENABLED: bool = False
    RECOMMENDATION_ENABLED: bool = False
    AI_RECOMMENDATION_EXPLANATION_ENABLED: bool = False
    BANDIT_ENABLED: bool = False
    NEURALCD_ENABLED: bool = False
    AKT_ENABLED: bool = False

    # Personalization model/version metadata. v0 means the feature is scaffolded
    # but no production algorithm/model has been activated yet.
    FEATURE_SCHEMA_VERSION: str = "v1"
    KNOWLEDGE_MODEL_VERSION: str = "v0"
    LEARNER_MODEL_VERSION: str = "v0"
    CLUSTERING_MODEL_VERSION: str = "v0"
    RANKING_MODEL_VERSION: str = "v0"
    BANDIT_POLICY_VERSION: str = "v0"
    NEURALCD_MODEL_VERSION: str = "v0-research"
    AKT_MODEL_VERSION: str = "v0-research"
    ADVANCED_MODEL_MIN_USERS: int = 100
    ADVANCED_MODEL_MIN_ITEMS: int = 300
    ADVANCED_MODEL_MIN_INTERACTIONS: int = 5000
    ADVANCED_MODEL_MIN_INTERACTIONS_PER_USER: float = 20.0
    ADVANCED_MODEL_MIN_KNOWLEDGE_COMPONENTS: int = 20
    ADVANCED_MODEL_MIN_Q_MATRIX_COVERAGE: float = 0.8
    ADVANCED_MODEL_MAX_SPARSITY: float = 0.98
    ADVANCED_MODEL_MIN_SEQUENCE_LENGTH: int = 10
    MAX_KNOWLEDGE_COMPONENTS_PER_ITEM: int = 4
    KNOWLEDGE_EXTRACTION_LOW_CONFIDENCE_THRESHOLD: float = 0.65
    KNOWLEDGE_COMPONENT_MERGE_SIMILARITY_THRESHOLD: float = 0.92
    BKT_DEFAULT_P_INIT: float = 0.25
    BKT_DEFAULT_P_LEARN: float = 0.12
    BKT_DEFAULT_P_GUESS: float = 0.2
    BKT_DEFAULT_P_SLIP: float = 0.1
    BKT_MIN_PROBABILITY: float = 0.001
    BKT_MAX_PROBABILITY: float = 0.999
    IRT_LEARNING_RATE: float = 0.08
    IRT_MIN_THETA: float = -4.0
    IRT_MAX_THETA: float = 4.0
    IRT_MIN_BETA: float = -4.0
    IRT_MAX_BETA: float = 4.0
    IRT_MIN_ATTEMPTS_RELIABLE: int = 5
    KMEANS_MIN_K: int = 2
    KMEANS_MAX_K: int = 8
    KMEANS_MIN_CLUSTER_SIZE: int = 2
    KMEANS_MIN_SAMPLES: int = 8
    KMEANS_RANDOM_STATE: int = 42
    KMEANS_N_INIT: int = 10
    KMEANS_MAX_ITER: int = 300
    KMEANS_EMBEDDING_WEIGHT: float = 0.7
    KMEANS_NUMERIC_WEIGHT: float = 0.3
    KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER: float = 2.5
    DIGITAL_TWIN_CACHE_TTL_SECONDS: int = 60
    DIGITAL_TWIN_STRENGTH_MASTERY_THRESHOLD: float = 0.75
    DIGITAL_TWIN_WEAK_MASTERY_THRESHOLD: float = 0.45
    DIGITAL_TWIN_UNCERTAINTY_THRESHOLD: float = 0.55
    DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED: int = 3
    DIGITAL_TWIN_FORGETTING_RISK_DAYS: int = 14
    DIGITAL_TWIN_FORGETTING_RISK_THRESHOLD: float = 0.65
    DIGITAL_TWIN_TARGET_PROBABILITY_MIN: float = 0.6
    DIGITAL_TWIN_TARGET_PROBABILITY_MAX: float = 0.8
    CANDIDATE_PER_SOURCE_LIMIT: int = 5
    CANDIDATE_TOTAL_LIMIT: int = 30
    CANDIDATE_MIN_QUALITY_SCORE: float = 0.5
    CANDIDATE_RECENT_WINDOW_HOURS: int = 24
    CANDIDATE_EXPLORATION_RATIO: float = 0.1
    CANDIDATE_APPROPRIATE_DIFFICULTY_MARGIN: float = 0.15
    CANDIDATE_FORGETTING_MIN_MASTERY: float = 0.65
    RANKER_WEIGHT_WEAKNESS_MATCH: float = 0.25
    RANKER_WEIGHT_DIFFICULTY_FIT: float = 0.20
    RANKER_WEIGHT_PREREQUISITE_READINESS: float = 0.15
    RANKER_WEIGHT_FORGETTING_NEED: float = 0.15
    RANKER_WEIGHT_GOAL_MATCH: float = 0.10
    RANKER_WEIGHT_INTEREST_MATCH: float = 0.05
    RANKER_WEIGHT_CLUSTER_MATCH: float = 0.0
    RANKER_WEIGHT_QUALITY_SCORE: float = 0.10
    RANKER_WEIGHT_NOVELTY_SCORE: float = 0.0
    RANKER_WEIGHT_CONTINUITY_SCORE: float = 0.0
    RANKER_SAFE_DIFFICULTY_MARGIN: float = 0.25
    RERANK_MAX_SAME_KNOWLEDGE_COMPONENT: int = 2
    RERANK_MAX_SAME_QUESTION_CLUSTER: int = 2
    RERANK_MAX_SAME_ITEM_TYPE: int = 2
    RECOMMENDATION_CACHE_TTL_SECONDS: int = 60
    BANDIT_SHADOW_MODE_ENABLED: bool = False
    BANDIT_KILL_SWITCH: bool = True
    BANDIT_CONTEXT_SCHEMA_VERSION: str = "bandit-context-v1"
    BANDIT_EXPLORATION_RATE: float = 0.05
    BANDIT_MAX_EXPLORATION_RATE: float = 0.10
    BANDIT_PRIOR_PRECISION: float = 1.0
    BANDIT_PRIOR_MEAN: float = 0.0
    BANDIT_REWARD_LEARNING_WEIGHT: float = 0.6
    BANDIT_REWARD_IMMEDIATE_WEIGHT: float = 0.4




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
        if self.MAX_KNOWLEDGE_COMPONENTS_PER_ITEM <= 0:
            raise ValueError("MAX_KNOWLEDGE_COMPONENTS_PER_ITEM must be greater than 0.")
        if not 0 <= self.KNOWLEDGE_EXTRACTION_LOW_CONFIDENCE_THRESHOLD <= 1:
            raise ValueError("KNOWLEDGE_EXTRACTION_LOW_CONFIDENCE_THRESHOLD must be between 0 and 1.")
        if not 0 <= self.KNOWLEDGE_COMPONENT_MERGE_SIMILARITY_THRESHOLD <= 1:
            raise ValueError("KNOWLEDGE_COMPONENT_MERGE_SIMILARITY_THRESHOLD must be between 0 and 1.")
        for value_name in ("BKT_DEFAULT_P_INIT", "BKT_DEFAULT_P_LEARN", "BKT_DEFAULT_P_GUESS", "BKT_DEFAULT_P_SLIP"):
            if not 0 <= getattr(self, value_name) <= 1:
                raise ValueError(f"{value_name} must be between 0 and 1.")
        if not 0 < self.BKT_MIN_PROBABILITY < self.BKT_MAX_PROBABILITY < 1:
            raise ValueError("BKT probability clamp bounds must be inside (0,1).")
        if self.IRT_LEARNING_RATE <= 0:
            raise ValueError("IRT_LEARNING_RATE must be greater than 0.")
        if self.IRT_MIN_THETA >= self.IRT_MAX_THETA:
            raise ValueError("IRT theta bounds are invalid.")
        if self.IRT_MIN_BETA >= self.IRT_MAX_BETA:
            raise ValueError("IRT beta bounds are invalid.")
        if self.IRT_MIN_ATTEMPTS_RELIABLE <= 0:
            raise ValueError("IRT_MIN_ATTEMPTS_RELIABLE must be greater than 0.")
        if self.KMEANS_MIN_K < 2:
            raise ValueError("KMEANS_MIN_K must be at least 2.")
        if self.KMEANS_MAX_K < self.KMEANS_MIN_K:
            raise ValueError("KMEANS_MAX_K must be greater than or equal to KMEANS_MIN_K.")
        if self.KMEANS_MIN_CLUSTER_SIZE <= 0 or self.KMEANS_MIN_SAMPLES <= 0:
            raise ValueError("KMEANS minimum sizes must be positive.")
        if self.KMEANS_N_INIT <= 0 or self.KMEANS_MAX_ITER <= 0:
            raise ValueError("KMEANS_N_INIT and KMEANS_MAX_ITER must be positive.")
        if self.KMEANS_EMBEDDING_WEIGHT < 0 or self.KMEANS_NUMERIC_WEIGHT < 0:
            raise ValueError("KMEANS feature weights must be non-negative.")
        if self.KMEANS_EMBEDDING_WEIGHT + self.KMEANS_NUMERIC_WEIGHT <= 0:
            raise ValueError("At least one K-Means feature weight must be positive.")
        if self.KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER <= 0:
            raise ValueError("KMEANS_OUTLIER_DISTANCE_STD_MULTIPLIER must be positive.")
        for value_name in (
            "ADVANCED_MODEL_MIN_USERS",
            "ADVANCED_MODEL_MIN_ITEMS",
            "ADVANCED_MODEL_MIN_INTERACTIONS",
            "ADVANCED_MODEL_MIN_KNOWLEDGE_COMPONENTS",
            "ADVANCED_MODEL_MIN_SEQUENCE_LENGTH",
        ):
            if getattr(self, value_name) <= 0:
                raise ValueError(f"{value_name} must be positive.")
        if self.ADVANCED_MODEL_MIN_INTERACTIONS_PER_USER <= 0:
            raise ValueError("ADVANCED_MODEL_MIN_INTERACTIONS_PER_USER must be positive.")
        if not 0 <= self.ADVANCED_MODEL_MIN_Q_MATRIX_COVERAGE <= 1:
            raise ValueError("ADVANCED_MODEL_MIN_Q_MATRIX_COVERAGE must be between 0 and 1.")
        if not 0 < self.ADVANCED_MODEL_MAX_SPARSITY <= 1:
            raise ValueError("ADVANCED_MODEL_MAX_SPARSITY must be in (0,1].")
        if self.DIGITAL_TWIN_CACHE_TTL_SECONDS < 0:
            raise ValueError("DIGITAL_TWIN_CACHE_TTL_SECONDS must be non-negative.")
        if not 0 <= self.BANDIT_EXPLORATION_RATE <= self.BANDIT_MAX_EXPLORATION_RATE <= 1:
            raise ValueError("Bandit exploration rates must satisfy 0 <= rate <= max <= 1.")
        if self.BANDIT_PRIOR_PRECISION <= 0:
            raise ValueError("BANDIT_PRIOR_PRECISION must be positive.")
        if self.BANDIT_REWARD_LEARNING_WEIGHT < 0 or self.BANDIT_REWARD_IMMEDIATE_WEIGHT < 0:
            raise ValueError("Bandit reward weights must be non-negative.")
        if self.BANDIT_REWARD_LEARNING_WEIGHT + self.BANDIT_REWARD_IMMEDIATE_WEIGHT <= 0:
            raise ValueError("At least one bandit reward weight must be positive.")
        if self.DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED <= 0:
            raise ValueError("DIGITAL_TWIN_MIN_ATTEMPTS_ASSESSED must be greater than 0.")
        if self.DIGITAL_TWIN_FORGETTING_RISK_DAYS <= 0:
            raise ValueError("DIGITAL_TWIN_FORGETTING_RISK_DAYS must be greater than 0.")
        for value_name in (
            "DIGITAL_TWIN_STRENGTH_MASTERY_THRESHOLD",
            "DIGITAL_TWIN_WEAK_MASTERY_THRESHOLD",
            "DIGITAL_TWIN_UNCERTAINTY_THRESHOLD",
            "DIGITAL_TWIN_FORGETTING_RISK_THRESHOLD",
            "DIGITAL_TWIN_TARGET_PROBABILITY_MIN",
            "DIGITAL_TWIN_TARGET_PROBABILITY_MAX",
        ):
            if not 0 <= getattr(self, value_name) <= 1:
                raise ValueError(f"{value_name} must be between 0 and 1.")
        if self.DIGITAL_TWIN_WEAK_MASTERY_THRESHOLD >= self.DIGITAL_TWIN_STRENGTH_MASTERY_THRESHOLD:
            raise ValueError("Digital Twin weak threshold must be lower than strength threshold.")
        if self.DIGITAL_TWIN_TARGET_PROBABILITY_MIN >= self.DIGITAL_TWIN_TARGET_PROBABILITY_MAX:
            raise ValueError("Digital Twin target probability min must be lower than max.")
        if self.CANDIDATE_PER_SOURCE_LIMIT <= 0 or self.CANDIDATE_TOTAL_LIMIT <= 0:
            raise ValueError("Candidate limits must be positive.")
        if self.CANDIDATE_PER_SOURCE_LIMIT > self.CANDIDATE_TOTAL_LIMIT:
            raise ValueError("CANDIDATE_PER_SOURCE_LIMIT must not exceed CANDIDATE_TOTAL_LIMIT.")
        if self.CANDIDATE_RECENT_WINDOW_HOURS < 0:
            raise ValueError("CANDIDATE_RECENT_WINDOW_HOURS must be non-negative.")
        for value_name in (
            "CANDIDATE_MIN_QUALITY_SCORE",
            "CANDIDATE_EXPLORATION_RATIO",
            "CANDIDATE_APPROPRIATE_DIFFICULTY_MARGIN",
            "CANDIDATE_FORGETTING_MIN_MASTERY",
            "RANKER_WEIGHT_WEAKNESS_MATCH",
            "RANKER_WEIGHT_DIFFICULTY_FIT",
            "RANKER_WEIGHT_PREREQUISITE_READINESS",
            "RANKER_WEIGHT_FORGETTING_NEED",
            "RANKER_WEIGHT_GOAL_MATCH",
            "RANKER_WEIGHT_INTEREST_MATCH",
            "RANKER_WEIGHT_CLUSTER_MATCH",
            "RANKER_WEIGHT_QUALITY_SCORE",
            "RANKER_WEIGHT_NOVELTY_SCORE",
            "RANKER_WEIGHT_CONTINUITY_SCORE",
            "RANKER_SAFE_DIFFICULTY_MARGIN",
        ):
            if not 0 <= getattr(self, value_name) <= 1:
                raise ValueError(f"{value_name} must be between 0 and 1.")
        ranker_weight_sum = sum(
            getattr(self, value_name)
            for value_name in (
                "RANKER_WEIGHT_WEAKNESS_MATCH",
                "RANKER_WEIGHT_DIFFICULTY_FIT",
                "RANKER_WEIGHT_PREREQUISITE_READINESS",
                "RANKER_WEIGHT_FORGETTING_NEED",
                "RANKER_WEIGHT_GOAL_MATCH",
                "RANKER_WEIGHT_INTEREST_MATCH",
                "RANKER_WEIGHT_CLUSTER_MATCH",
                "RANKER_WEIGHT_QUALITY_SCORE",
                "RANKER_WEIGHT_NOVELTY_SCORE",
                "RANKER_WEIGHT_CONTINUITY_SCORE",
            )
        )
        if abs(ranker_weight_sum - 1.0) > 0.000001:
            raise ValueError("Ranker weights must sum to 1.0.")
        if (
            self.RERANK_MAX_SAME_KNOWLEDGE_COMPONENT <= 0
            or self.RERANK_MAX_SAME_QUESTION_CLUSTER <= 0
            or self.RERANK_MAX_SAME_ITEM_TYPE <= 0
        ):
            raise ValueError("Re-ranker diversity limits must be positive.")
        if self.RECOMMENDATION_CACHE_TTL_SECONDS < 0:
            raise ValueError("RECOMMENDATION_CACHE_TTL_SECONDS must be non-negative.")
            
        return self

settings = Settings()
