from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, LargeBinary, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class ManifestationDB(Base):
    __tablename__ = "manifestations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    protocol: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Recebido")

    kind: Mapped[str] = mapped_column(String(24), nullable=False)  # reclamacao|denuncia|sugestao|elogio|solicitacao
    subject: Mapped[str] = mapped_column(String(120), nullable=False)  # ex.: Infraestrutura (buraco)
    subject_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # "Descreva o tema"

    description_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Identification (required for elogio/sugestao/solicitacao)
    contact_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    # Useful for auditing / internal triage
    channel: Mapped[str] = mapped_column(String(24), nullable=False, default="web")
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    attachments: Mapped[List["AttachmentDB"]] = relationship(
        back_populates="manifestation",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class AttachmentDB(Base):
    __tablename__ = "attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manifestation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("manifestations.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    # Field name from form (image_file|audio_file|video_file)
    field: Mapped[str] = mapped_column(String(64), nullable=False)

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False, default="application/octet-stream")
    bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sha256: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # The file itself (stored in Postgres)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # A11y text: alt for image, transcript for audio, description for video
    accessibility_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    manifestation: Mapped["ManifestationDB"] = relationship(back_populates="attachments")
