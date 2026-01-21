from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db_models import AttachmentDB, ManifestationDB
from .models import Attachment, ManifestationRecord


class Store:
    """Persistência (DB) para manifestações.

    Interface: create(session, record) e get(session, protocol).
    """

    async def create(self, session: AsyncSession, record: ManifestationRecord) -> None:
        # A coluna created_at no DB tem default NOW().
        # Mantemos record.created_at como ISO string para resposta imediata.
        m = ManifestationDB(
            protocol=record.protocol,
            status=record.status.value if hasattr(record.status, "value") else str(record.status),
            kind=record.kind.value if hasattr(record.kind, "value") else str(record.kind),
            subject=record.subject,
            description_text=record.description_text,
            anonymous=bool(record.anonymous),
            audio_transcript=record.audio_transcript,
            image_alt=record.image_alt,
            video_description=record.video_description,
        )

        for a in record.attachments:
            m.attachments.append(
                AttachmentDB(
                    field=a.field,
                    filename=a.filename,
                    content_type=a.content_type,
                    bytes=int(a.bytes),
                )
            )

        session.add(m)
        await session.commit()

    async def get(self, session: AsyncSession, protocol: str) -> Optional[ManifestationRecord]:
        stmt = select(ManifestationDB).where(ManifestationDB.protocol == protocol)
        res = await session.execute(stmt)
        m = res.scalar_one_or_none()
        if not m:
            return None

        attachments = [
            Attachment(
                field=a.field,
                filename=a.filename,
                content_type=a.content_type,
                bytes=a.bytes,
            )
            for a in (m.attachments or [])
        ]

        created_at = m.created_at.isoformat() if getattr(m, "created_at", None) else ""

        return ManifestationRecord(
            protocol=m.protocol,
            created_at=created_at,
            status=m.status,
            kind=m.kind,
            subject=m.subject,
            description_text=m.description_text,
            anonymous=m.anonymous,
            audio_transcript=m.audio_transcript,
            image_alt=m.image_alt,
            video_description=m.video_description,
            attachments=attachments,
        )


store = Store()
