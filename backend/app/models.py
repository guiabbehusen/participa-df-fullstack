from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ManifestationKind(str, Enum):
    reclamacao = "reclamacao"
    denuncia = "denuncia"
    sugestao = "sugestao"
    elogio = "elogio"
    solicitacao = "solicitacao"


class ManifestationStatus(str, Enum):
    recebido = "Recebido"
    em_analise = "Em análise"
    respondido = "Respondido"


class Attachment(BaseModel):
    field: str = Field(..., description="Nome do campo do formulário (ex.: image_file)")
    filename: str = Field(..., description="Nome do arquivo armazenado")
    content_type: str = Field(..., description="MIME type")
    bytes: int = Field(..., ge=0, description="Tamanho em bytes")


class ManifestationRecord(BaseModel):
    protocol: str
    created_at: str
    status: ManifestationStatus

    kind: ManifestationKind
    subject: str
    description_text: Optional[str] = None
    anonymous: bool = False

    audio_transcript: Optional[str] = None
    image_alt: Optional[str] = None
    video_description: Optional[str] = None

    attachments: List[Attachment] = []


class CreateManifestationResponse(BaseModel):
    protocol: str
    created_at: str


class ErrorResponse(BaseModel):
    message: str
