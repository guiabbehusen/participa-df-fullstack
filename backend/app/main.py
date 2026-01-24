from __future__ import annotations

import os
import uuid
import logging
from typing import Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import EmailStr, ValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session, init_db
from .db_models import AttachmentDB, ManifestationDB
from .iza_ollama import router as iza_router
from .models import CreateManifestationResponse, ErrorResponse, ManifestationRecord
from .settings import ALLOWED_ORIGINS, APP_NAME, INITIAL_RESPONSE_SLA_DAYS, MAX_FILE_BYTES, MAX_FILE_MB
from .storage import store
from .utils import generate_protocol, read_limited, safe_filename, sha256_hex, utc_now_iso


app = FastAPI(title=APP_NAME, version="1.0.0")

logger = logging.getLogger("participa_df")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(iza_router)

@app.exception_handler(SQLAlchemyError)
async def _sqlalchemy_error_handler(request: Request, exc: SQLAlchemyError):
    """Handler único para erros de banco.

    - Mantém resposta JSON (evita HTML/traceback no frontend)
    - Loga com um `error_id` para diagnóstico
    - Em modo DEBUG_SQL_ERRORS=true, inclui detalhe resumido do erro do driver.
    """

    error_id = uuid.uuid4().hex[:10].upper()
    logger.exception("Database error [%s] %s %s: %s", error_id, request.method, request.url.path, exc)

    debug = os.getenv("DEBUG_SQL_ERRORS", "false").lower() == "true"
    content: dict = {
        "message": "Não foi possível processar sua solicitação agora. Tente novamente em instantes.",
        "error_id": error_id,
    }

    if debug:
        # `orig` costuma trazer a mensagem do driver (psycopg/asyncpg)
        try:
            content["detail"] = str(getattr(exc, "orig", exc))
        except Exception:
            content["detail"] = "(sem detalhe)"

    return JSONResponse(status_code=500, content=content)



@app.on_event("startup")
async def _startup() -> None:
    await init_db()


@app.get("/api/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    db_ok = True
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"ok": True, "db": db_ok}


def _validate_email(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    try:
        return str(EmailStr._validate(email))  # type: ignore[attr-defined]
    except Exception:
        raise HTTPException(status_code=422, detail="E-mail inválido.")


def _kind_requires_identification(kind: str) -> bool:
    return kind in {"elogio", "sugestao", "solicitacao"}


@app.post(
    "/api/manifestations",
    response_model=CreateManifestationResponse,
    responses={422: {"model": ErrorResponse}},
)
async def create_manifestation(
    # 1) Identificação
    kind: str = Form(..., description="reclamacao|denuncia|sugestao|elogio|solicitacao"),
    subject: str = Form(..., description="Assunto principal (ex.: Infraestrutura)"),
    subject_detail: str = Form(..., description="Descreva o tema (mín. 3 caracteres)"),

    # 2) Relato
    description_text: Optional[str] = Form(None, description="Relato (o quê, onde, quando, impacto)"),

    # Acessibilidade e anexos
    image_file: Optional[UploadFile] = File(None),
    image_alt: Optional[str] = Form(None, description="Texto alternativo da imagem (obrigatório se anexar)"),

    audio_file: Optional[UploadFile] = File(None),
    audio_transcript: Optional[str] = Form(None, description="Transcrição do áudio (obrigatório se anexar)"),

    video_file: Optional[UploadFile] = File(None),
    video_description: Optional[str] = Form(None, description="Descrição do vídeo (obrigatório se anexar)"),

    # Anônimo / identificação
    anonymous: bool = Form(False),
    contact_name: Optional[str] = Form(None),
    contact_email: Optional[str] = Form(None),
    contact_phone: Optional[str] = Form(None),

    session: AsyncSession = Depends(get_session),
) -> CreateManifestationResponse:
    kind = (kind or "").strip().lower()
    subject = (subject or "").strip()
    subject_detail = (subject_detail or "").strip()
    description_text = (description_text or "").strip() if description_text else None

    # Basic validation
    if kind not in {"reclamacao", "denuncia", "sugestao", "elogio", "solicitacao"}:
        raise HTTPException(status_code=422, detail="Tipo de manifestação inválido.")

    if len(subject) < 3:
        raise HTTPException(status_code=422, detail="Assunto deve ter no mínimo 3 caracteres.")
    if len(subject_detail) < 3:
        raise HTTPException(status_code=422, detail="Descreva o tema deve ter no mínimo 3 caracteres.")

    has_any_file = bool(image_file or audio_file or video_file)
    if (not description_text or len(description_text) < 3) and not has_any_file:
        raise HTTPException(
            status_code=422,
            detail="Envie um relato em texto ou anexe pelo menos um arquivo.",
        )

    # Identification rules
    email_norm = _validate_email(contact_email)
    if _kind_requires_identification(kind):
        if anonymous:
            raise HTTPException(status_code=422, detail="Para este tipo, o envio anônimo não é permitido. Informe seus dados.")
        if not contact_name or len(contact_name.strip()) < 3:
            raise HTTPException(status_code=422, detail="Nome é obrigatório para este tipo de manifestação.")
        if not email_norm:
            raise HTTPException(status_code=422, detail="E-mail é obrigatório para este tipo de manifestação.")

    # Attachment accessibility rules
    attachments: list[AttachmentDB] = []

    async def _add_attachment(field: str, f: UploadFile, a11y_text: Optional[str]) -> None:
        try:
            raw = await read_limited(f, MAX_FILE_BYTES)
        except ValueError:
            raise HTTPException(
                status_code=413,
                detail=f"Arquivo muito grande. Tamanho máximo permitido: {MAX_FILE_MB} MB.",
            )
        filename = safe_filename(f.filename or field)
        ct = (f.content_type or "application/octet-stream").strip()

        if not a11y_text or len(a11y_text.strip()) < 3:
            # A11y text is mandatory whenever the file exists
            if field == "image_file":
                raise HTTPException(status_code=422, detail="Texto alternativo da imagem é obrigatório quando há anexo.")
            if field == "audio_file":
                raise HTTPException(status_code=422, detail="Transcrição do áudio é obrigatória quando há anexo.")
            if field == "video_file":
                raise HTTPException(status_code=422, detail="Descrição do vídeo é obrigatória quando há anexo.")
            raise HTTPException(status_code=422, detail="Descrição de acessibilidade é obrigatória quando há anexo.")

        attachments.append(
            AttachmentDB(
                field=field,
                filename=filename,
                content_type=ct,
                bytes=len(raw),
                sha256=sha256_hex(raw),
                data=raw,
                accessibility_text=a11y_text.strip(),
            )
        )

    if image_file:
        await _add_attachment("image_file", image_file, image_alt)
    if audio_file:
        await _add_attachment("audio_file", audio_file, audio_transcript)
    if video_file:
        await _add_attachment("video_file", video_file, video_description)

    protocol = generate_protocol()
    m = ManifestationDB(
        protocol=protocol,
        kind=kind,
        subject=subject,
        subject_detail=subject_detail,
        description_text=description_text,
        anonymous=bool(anonymous),
        contact_name=(contact_name.strip() if contact_name else None),
        contact_email=(email_norm.strip() if email_norm else None),
        contact_phone=(contact_phone.strip() if contact_phone else None),
        channel="web",
    )

    await store.create_manifestation(session=session, m=m, attachments=attachments)

    return CreateManifestationResponse(
        protocol=protocol,
        created_at=utc_now_iso(),
        initial_response_sla_days=INITIAL_RESPONSE_SLA_DAYS,
    )


@app.get("/api/manifestations/{protocol}", response_model=ManifestationRecord, responses={404: {"model": ErrorResponse}})
async def get_manifestation(protocol: str, session: AsyncSession = Depends(get_session)) -> ManifestationRecord:
    rec = await store.get_by_protocol(session, protocol)
    if not rec:
        raise HTTPException(status_code=404, detail="Manifestação não encontrada.")
    return rec


@app.get("/api/manifestations/{protocol}/attachments/{attachment_id}")
async def download_attachment(
    protocol: str,
    attachment_id: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        uid = uuid.UUID(attachment_id)
    except Exception:
        raise HTTPException(status_code=422, detail="attachment_id inválido.")

    a = await store.get_attachment(session, protocol=protocol, attachment_id=uid)
    if not a:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")

    headers = {
        "Content-Disposition": f'attachment; filename="{a.filename}"',
        "X-Content-Type-Options": "nosniff",
    }
    return Response(content=a.data, media_type=a.content_type or "application/octet-stream", headers=headers)


@app.get("/api/manifestations/{protocol}/files/{filename}")
async def download_attachment_by_filename(
    protocol: str,
    filename: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    # Backward-compatible endpoint (older frontends)
    a = await store.get_attachment_by_filename(session, protocol=protocol, filename=filename)
    if not a:
        raise HTTPException(status_code=404, detail="Anexo não encontrado.")

    headers = {
        "Content-Disposition": f'attachment; filename="{a.filename}"',
        "X-Content-Type-Options": "nosniff",
    }
    return Response(content=a.data, media_type=a.content_type or "application/octet-stream", headers=headers)
