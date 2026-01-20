from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile


FILENAME_SAFE_CHARS = re.compile(r"[^a-zA-Z0-9._-]+")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_protocol() -> str:
    """Gera um protocolo curto, legível e único para demo.

    Formato: DF-YYYYMMDD-XXXXXX
    """
    date = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand = secrets.token_hex(3).upper()  # 6 hex chars
    return f"DF-{date}-{rand}"


def safe_filename(filename: str) -> str:
    """Sanitiza nome de arquivo para armazenamento local."""
    name = filename.strip().replace(" ", "_")
    name = FILENAME_SAFE_CHARS.sub("-", name)
    # evita nomes vazios
    if not name or name in {".", ".."}:
        name = f"file-{secrets.token_hex(4)}"
    return name


async def read_limited(upload: UploadFile, max_bytes: int) -> bytes:
    """Lê um UploadFile com limite para evitar consumo excessivo de memória."""
    data = await upload.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError("Arquivo excede o limite permitido")
    return data


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
