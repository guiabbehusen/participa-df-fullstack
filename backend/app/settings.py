from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()

def _env(name: str, default: str) -> str:
    v = os.getenv(name)
    return v if (v is not None and v != "") else default

def get_env_list(name: str, default: str) -> list[str]:
    value = _env(name, default)
    return [x.strip() for x in value.split(",") if x.strip()]

APP_NAME = _env("APP_NAME", "Participa DF API")

# CORS
_DEFAULT_ORIGINS = _env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
ALLOWED_ORIGINS = get_env_list("ALLOWED_ORIGINS", _DEFAULT_ORIGINS)

# Files (stored in Postgres as bytea)
MAX_FILE_MB = int(_env("MAX_FILE_MB", "15"))
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

# Database
DATABASE_URL = _env("DATABASE_URL", "postgresql+asyncpg://participa:participa@localhost:5432/participa_df")

def database_url_sync() -> str:
    """Alembic (migrations) prefers a sync driver.

    Converts:
      postgresql+asyncpg://... -> postgresql+psycopg://...
    """
    if DATABASE_URL.startswith("postgresql+asyncpg://"):
        return DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg://", 1)
    if DATABASE_URL.startswith("postgresql+asyncpg:"):
        return DATABASE_URL.replace("+asyncpg", "+psycopg", 1)
    # Fallback: try removing async driver token
    return DATABASE_URL.replace("+asyncpg", "")

# SLA / prazo
INITIAL_RESPONSE_SLA_DAYS = int(_env("INITIAL_RESPONSE_SLA_DAYS", "10"))

# Ollama (LLM local)
OLLAMA_BASE_URL = _env("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = _env("OLLAMA_MODEL", "llama3.1:8b-instruct")
OLLAMA_TEMPERATURE = float(_env("OLLAMA_TEMPERATURE", "0.2"))
OLLAMA_TOP_P = float(_env("OLLAMA_TOP_P", "0.9"))
OLLAMA_NUM_CTX = int(_env("OLLAMA_NUM_CTX", "4096"))
