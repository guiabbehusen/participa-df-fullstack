from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class ManifestationDB(Base):
    __tablename__ = "manifestations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    protocol: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="Recebido")

    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    subject: Mapped[str] = mapped_column(String(120), nullable=False)

    description_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    anonymous: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    audio_transcript: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_alt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    video_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    attachments: Mapped[List["AttachmentDB"]] = relationship(
        back_populates="manifestation",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class AttachmentDB(Base):
    __tablename__ = "attachments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    manifestation_id: Mapped[str] = mapped_column(String(36), ForeignKey("manifestations.id", ondelete="CASCADE"), index=True)

    field: Mapped[str] = mapped_column(String(64), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    manifestation: Mapped["ManifestationDB"] = relationship(back_populates="attachments")
