from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import noload

from .db_models import AttachmentDB, ManifestationDB
from .models import AttachmentOut, ManifestationRecord


class Store:
    async def create_manifestation(
        self,
        session: AsyncSession,
        m: ManifestationDB,
        attachments: list[AttachmentDB],
    ) -> None:
        for a in attachments:
            m.attachments.append(a)

        session.add(m)
        try:
            await session.commit()
        except SQLAlchemyError:
            # Evita deixar a sessão em estado inválido e melhora debuggabilidade
            await session.rollback()
            raise

    async def get_by_protocol(self, session: AsyncSession, protocol: str) -> Optional[ManifestationRecord]:
        # Importante:
        # - Evitamos carregar `attachments.data` (BYTEA) quando a tela só precisa de metadados.
        # - Isso reduz uso de memória e evita erros/latência em bases com anexos grandes.
        stmt = (
            select(ManifestationDB)
            .options(noload(ManifestationDB.attachments))
            .where(ManifestationDB.protocol == protocol)
        )
        res = await session.execute(stmt)
        row = res.scalar_one_or_none()
        if not row:
            return None

        attachments_out: list[AttachmentOut] = []
        try:
            # Seleciona apenas metadados; não traz o blob (`data`).
            stmt_a = (
                select(
                    AttachmentDB.id,
                    AttachmentDB.field,
                    AttachmentDB.filename,
                    AttachmentDB.content_type,
                    AttachmentDB.bytes,
                    AttachmentDB.accessibility_text,
                )
                .where(AttachmentDB.manifestation_id == row.id)
                .order_by(AttachmentDB.created_at.asc())
            )
            res_a = await session.execute(stmt_a)
            for (aid, field, filename, content_type, bytes_, a11y) in res_a.all():
                attachments_out.append(
                    AttachmentOut(
                        id=str(aid),
                        field=field,
                        filename=filename,
                        content_type=content_type,
                        bytes=int(bytes_ or 0),
                        accessibility_text=a11y,
                        download_url=f"/api/manifestations/{row.protocol}/attachments/{aid}",
                    )
                )
        except SQLAlchemyError:
            # Se houver inconsistência de schema (ex.: tabela antiga sem anexos),
            # devolvemos o protocolo sem anexos para não quebrar a UX.
            attachments_out = []

        created_at = row.created_at.isoformat() if row.created_at else ""

        return ManifestationRecord(
            protocol=row.protocol,
            created_at=created_at,
            status=row.status,
            kind=row.kind,
            subject=row.subject,
            subject_detail=row.subject_detail,
            description_text=row.description_text,
            anonymous=row.anonymous,
            contact_name=row.contact_name,
            contact_email=row.contact_email,
            contact_phone=row.contact_phone,
            attachments=attachments_out,
        )

    async def get_attachment(
        self,
        session: AsyncSession,
        protocol: str,
        attachment_id: uuid.UUID,
    ) -> Optional[AttachmentDB]:
        stmt = (
            select(AttachmentDB)
            .join(ManifestationDB, AttachmentDB.manifestation_id == ManifestationDB.id)
            .where(ManifestationDB.protocol == protocol)
            .where(AttachmentDB.id == attachment_id)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    async def get_attachment_by_filename(
        self,
        session: AsyncSession,
        protocol: str,
        filename: str,
    ) -> Optional[AttachmentDB]:
        stmt = (
            select(AttachmentDB)
            .join(ManifestationDB, AttachmentDB.manifestation_id == ManifestationDB.id)
            .where(ManifestationDB.protocol == protocol)
            .where(AttachmentDB.filename == filename)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()


store = Store()
