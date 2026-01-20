from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .models import (
    Attachment,
    CreateManifestationResponse,
    ErrorResponse,
    ManifestationKind,
    ManifestationRecord,
    ManifestationStatus,
)
from .settings import APP_NAME, CORS_ORIGINS, MAX_FILE_BYTES, UPLOAD_DIR
from .storage import STORE
from .utils import ensure_dir, generate_protocol, read_limited, safe_filename, utc_now_iso


app = FastAPI(
    title=APP_NAME,
    version="1.0.0",
    description=(
        "API mínima de Ouvidoria para hackathon: cria manifestações (texto + anexos) "
        "e retorna protocolo para acompanhamento."
    ),
    contact={"name": "Participa DF (hackathon)"},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    ensure_dir(UPLOAD_DIR)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


def validate_accessibility_requirements(
    audio_file: Optional[UploadFile],
    audio_transcript: Optional[str],
    image_file: Optional[UploadFile],
    image_alt: Optional[str],
    video_file: Optional[UploadFile],
    video_description: Optional[str],
    description_text: Optional[str],
) -> None:
    # Regras de acessibilidade: se anexou mídia, deve haver texto alternativo/transcrição.
    if audio_file and not (audio_transcript or "").strip():
        raise HTTPException(
            status_code=422,
            detail="Audio anexado requer transcrição (audio_transcript) para acessibilidade.",
        )

    if image_file and not (image_alt or "").strip():
        raise HTTPException(
            status_code=422,
            detail="Imagem anexada requer texto alternativo (image_alt) para acessibilidade.",
        )

    if video_file and not (video_description or "").strip():
        raise HTTPException(
            status_code=422,
            detail="Video anexado requer descrição (video_description) para acessibilidade.",
        )

    if not (description_text or "").strip() and not (audio_file or image_file or video_file):
        raise HTTPException(
            status_code=422,
            detail="Envie um relato em texto ou anexe pelo menos um arquivo.",
        )


async def save_upload(protocol_dir: Path, field: str, upload: UploadFile) -> Attachment:
    # Sanitiza e prefixa para evitar colisões
    original = upload.filename or "upload"
    safe = safe_filename(original)
    filename = f"{field}-{safe}"

    try:
        content = await read_limited(upload, MAX_FILE_BYTES)
    except ValueError:
        raise HTTPException(
            status_code=413,
            detail=f"Arquivo muito grande. Limite: {MAX_FILE_BYTES // (1024 * 1024)}MB.",
        )

    ensure_dir(protocol_dir)
    file_path = protocol_dir / filename
    file_path.write_bytes(content)

    return Attachment(
        field=field,
        filename=filename,
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
    # Campos principais
    kind: ManifestationKind = Form(..., description="Tipo: reclamacao/denuncia/sugestao/elogio/solicitacao"),
    subject: str = Form(..., min_length=3, max_length=120, description="Assunto/tema"),
    description_text: Optional[str] = Form(None, max_length=5000, description="Relato em texto"),
    anonymous: bool = Form(False, description="Se true, não solicita dados pessoais"),
    # Campos de acessibilidade para mídias
    audio_transcript: Optional[str] = Form(None, max_length=5000, description="Transcrição do áudio"),
    image_alt: Optional[str] = Form(None, max_length=400, description="Texto alternativo da imagem"),
    video_description: Optional[str] = Form(None, max_length=800, description="Descrição do vídeo"),
    # Mídias
    audio_file: Optional[UploadFile] = File(None),
    image_file: Optional[UploadFile] = File(None),
    video_file: Optional[UploadFile] = File(None),
):
    validate_accessibility_requirements(
        audio_file=audio_file,
        audio_transcript=audio_transcript,
        image_file=image_file,
        image_alt=image_alt,
        video_file=video_file,
        video_description=video_description,
        description_text=description_text,
    )

    protocol = generate_protocol()
    created_at = utc_now_iso()

    protocol_dir = UPLOAD_DIR / protocol
    attachments: list[Attachment] = []

    # Salva anexos (se existirem)
    if audio_file:
        attachments.append(await save_upload(protocol_dir, "audio_file", audio_file))
    if image_file:
        attachments.append(await save_upload(protocol_dir, "image_file", image_file))
    if video_file:
        attachments.append(await save_upload(protocol_dir, "video_file", video_file))

    record = ManifestationRecord(
        protocol=protocol,
        created_at=created_at,
        status=ManifestationStatus.recebido,
        kind=kind,
        subject=subject,
        description_text=(description_text or None),
        anonymous=anonymous,
        audio_transcript=(audio_transcript or None),
        image_alt=(image_alt or None),
        video_description=(video_description or None),
        attachments=attachments,
    )

    STORE.create(record)

    return CreateManifestationResponse(protocol=protocol, created_at=created_at)


@app.get(
    "/api/manifestations/{protocol}",
    response_model=ManifestationRecord,
    responses={404: {"model": ErrorResponse}},
)
def get_manifestation(protocol: str):
    record = STORE.get(protocol)
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
