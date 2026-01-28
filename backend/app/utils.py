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


# --- Privacy helpers -----------------------------------------------------------

_CPF_RE = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b")
_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
_DATE_RE = re.compile(r"\b\d{2}[/-]\d{2}[/-]\d{4}\b")
_PHONE_RE = re.compile(r"\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}\b")


def redact_personal_data(text: str) -> tuple[str, bool]:
    """Redact common personal data patterns from narrative text.

    We keep it conservative: we do *not* remove addresses, because the location of the fact is essential.
    We do redact CPF, e-mail and phone. Dates are only redacted when text suggests "nascimento".
    """

    original = text or ""
    sanitized = original

    sanitized = _CPF_RE.sub("[CPF REMOVIDO]", sanitized)
    sanitized = _EMAIL_RE.sub("[E-MAIL REMOVIDO]", sanitized)
    sanitized = _PHONE_RE.sub("[TELEFONE REMOVIDO]", sanitized)

    if "nascimento" in sanitized.lower():
        sanitized = _DATE_RE.sub("[DATA REMOVIDA]", sanitized)

    return sanitized, sanitized != original
