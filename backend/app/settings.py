from __future__ import annotations

import os
from pathlib import Path


def get_env_list(name: str, default: str) -> list[str]:
    value = os.getenv(name, default)
    return [x.strip() for x in value.split(",") if x.strip()]


APP_NAME = os.getenv("APP_NAME", "Participa DF API")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(Path(__file__).resolve().parents[1] / "uploads")))
MAX_FILE_MB = int(os.getenv("MAX_FILE_MB", "15"))
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024

# Em dev, normalmente o frontend roda em http://localhost:5173
CORS_ORIGINS = get_env_list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
