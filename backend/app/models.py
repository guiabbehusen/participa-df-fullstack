from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


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


class AttachmentOut(BaseModel):
    id: str
    field: str
    filename: str
    content_type: str
    bytes: int
    accessibility_text: Optional[str] = None
    download_url: Optional[str] = None


class ManifestationRecord(BaseModel):
    protocol: str
    created_at: str
    status: str

    kind: str
    subject: str
    subject_detail: Optional[str] = None

    description_text: Optional[str] = None
    anonymous: bool = False

    contact_name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None

    attachments: List[AttachmentOut] = Field(default_factory=list)


class CreateManifestationResponse(BaseModel):
    protocol: str
    created_at: str
    initial_response_sla_days: int = Field(..., description="Prazo inicial estimado de resposta (dias).")


class ErrorResponse(BaseModel):
    message: str
