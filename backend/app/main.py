from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session, init_db
from .models import (
    Attachment,
    CreateManifestationResponse,
    ErrorResponse,
    ManifestationKind,
    ManifestationRecord,
    ManifestationStatus,
)
from .settings import ALLOWED_ORIGINS, MAX_FILE_BYTES, UPLOAD_DIR
from .storage import store
from .utils import ensure_dir, generate_protocol, read_limited, safe_filename, utc_now_iso
from .iza_ollama import router as iza_router


app = FastAPI(
    title="Participa DF API",
    version="1.0.0",
    description="API de Ouvidoria (protocolo + anexos) com persistência em banco e Swagger em /docs.",
)

# Rotas da IZA (Ollama)
app.include_router(iza_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    # DB tables (out-of-the-box). For production, use migrations (Alembic).
    await init_db()
    ensure_dir(UPLOAD_DIR)


@app.get("/api/health")
def health():
    return {"ok": True}


def _require_accessibility_for_media(
    audio_file: Optional[UploadFile],
    image_file: Optional[UploadFile],
    video_file: Optional[UploadFile],
    audio_transcript: Optional[str],
    image_alt: Optional[str],
    video_description: Optional[str],
):
    # WCAG-friendly: mídia deve ter alternativa textual.
    if audio_file and not (audio_transcript or "").strip():
        raise HTTPException(status_code=422, detail="Áudio anexado requer transcrição.")
    if image_file and not (image_alt or "").strip():
        raise HTTPException(status_code=422, detail="Imagem anexada requer texto alternativo.")
    if video_file and not (video_description or "").strip():
        raise HTTPException(status_code=422, detail="Vídeo anexado requer descrição.")


async def _save_upload(protocol: str, field: str, upload: UploadFile) -> Attachment:
    ensure_dir(UPLOAD_DIR / protocol)

    raw_name = upload.filename or f"{field}.bin"
    filename = safe_filename(raw_name)

    try:
        content = await read_limited(upload, MAX_FILE_BYTES)
    except ValueError:
        raise HTTPException(status_code=413, detail="Arquivo muito grande.")

    out = UPLOAD_DIR / protocol / f"{field}-{filename}"
    out.write_bytes(content)

    return Attachment(
        field=field,
        filename=out.name,
        content_type=upload.content_type or "application/octet-stream",
        bytes=len(content),
    )


@app.post(
    "/api/manifestations",
    response_model=CreateManifestationResponse,
    status_code=201,
    responses={
        422: {"model": ErrorResponse},
        413: {"model": ErrorResponse},
    },
)
async def create_manifestation(
    session: AsyncSession = Depends(get_session),
    kind: ManifestationKind = Form(...),
    subject: str = Form(...),
    description_text: Optional[str] = Form(None),
    anonymous: bool = Form(False),
    audio_transcript: Optional[str] = Form(None),
    image_alt: Optional[str] = Form(None),
    video_description: Optional[str] = Form(None),
    audio_file: Optional[UploadFile] = File(None),
    image_file: Optional[UploadFile] = File(None),
    video_file: Optional[UploadFile] = File(None),
):
    subject = (subject or "").strip()
    description_text = (description_text or "").strip() or None
    audio_transcript = (audio_transcript or "").strip() or None
    image_alt = (image_alt or "").strip() or None
    video_description = (video_description or "").strip() or None

    has_any_file = any([audio_file, image_file, video_file])
    if not description_text and not has_any_file:
        raise HTTPException(
            status_code=422,
            detail="Envie um relato em texto ou anexe pelo menos um arquivo.",
        )

    _require_accessibility_for_media(
        audio_file=audio_file,
        image_file=image_file,
        video_file=video_file,
        audio_transcript=audio_transcript,
        image_alt=image_alt,
        video_description=video_description,
    )

    protocol = generate_protocol()
    created_at = utc_now_iso()

    attachments: list[Attachment] = []
    if audio_file:
        attachments.append(await _save_upload(protocol, "audio_file", audio_file))
    if image_file:
        attachments.append(await _save_upload(protocol, "image_file", image_file))
    if video_file:
        attachments.append(await _save_upload(protocol, "video_file", video_file))

    record = ManifestationRecord(
        protocol=protocol,
        created_at=created_at,
        status=ManifestationStatus.recebido,
        kind=kind,
        subject=subject,
        description_text=description_text,
        anonymous=anonymous,
        audio_transcript=audio_transcript,
        image_alt=image_alt,
        video_description=video_description,
        attachments=attachments,
    )

    await store.create(session, record)
    return CreateManifestationResponse(protocol=protocol, created_at=created_at)


@app.get(
    "/api/manifestations/{protocol}",
    response_model=ManifestationRecord,
    responses={404: {"model": ErrorResponse}},
)
async def get_manifestation(protocol: str, session: AsyncSession = Depends(get_session)):
    record = await store.get(session, protocol)
    if not record:
        raise HTTPException(status_code=404, detail="Protocolo não encontrado")
    return record


@app.get(
    "/api/manifestations/{protocol}/files/{filename}",
    responses={404: {"model": ErrorResponse}},
)
def download_file(protocol: str, filename: str):
    # Bloqueia path traversal
    safe = Path(filename).name
    file_path = UPLOAD_DIR / protocol / safe
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    return FileResponse(path=str(file_path), filename=safe)
