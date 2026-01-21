from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env if present (dev-friendly, Windows-friendly)
load_dotenv()


def get_env_list(name: str, default: str) -> list[str]:
    value = os.getenv(name, default)
    return [x.strip() for x in value.split(",") if x.strip()]


APP_NAME = os.getenv("APP_NAME", "Participa DF API")

# Storage (uploads)
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(Path(__file__).resolve().parents[1] / "uploads")))
MAX_FILE_MB = int(os.getenv("MAX_FILE_MB", "15"))
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

# CORS
_DEFAULT_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
ALLOWED_ORIGINS = get_env_list("ALLOWED_ORIGINS", _DEFAULT_ORIGINS)
CORS_ORIGINS = ALLOWED_ORIGINS

# Database
# Recommended: PostgreSQL
#   postgresql+asyncpg://user:pass@localhost:5432/dbname
# Fallback: SQLite (works without external dependencies)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./participa_df.db")
