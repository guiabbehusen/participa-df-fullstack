from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import UploadFile


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def generate_protocol() -> str:
    # Protocol format: DF-YYYYMMDD-XXXXXXXX
    now = datetime.now(timezone.utc)
    ymd = now.strftime("%Y%m%d")
    # 8 hex chars from random UUID (evita colisões em cenários concorrentes)
    token = uuid.uuid4().hex[:8].upper()
    return f"DF-{ymd}-{token}"


_filename_re = re.compile(r"[^a-zA-Z0-9._-]+")

def safe_filename(name: str) -> str:
    name = name.strip().replace("\\", "_").replace("/", "_")
    name = _filename_re.sub("_", name)
    if not name:
        return "arquivo"
    return name[:180]


async def read_limited(upload: UploadFile, max_bytes: int) -> bytes:
    data = await upload.read()
    if len(data) > max_bytes:
        raise ValueError("File too large")
    return data


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
