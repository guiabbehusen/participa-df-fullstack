"""init

Revision ID: 0001_init
Revises: 
Create Date: 2026-01-22

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "manifestations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("protocol", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="Recebido"),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("subject", sa.String(length=120), nullable=False),
        sa.Column("subject_detail", sa.Text(), nullable=True),
        sa.Column("description_text", sa.Text(), nullable=True),
        sa.Column("anonymous", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("contact_name", sa.String(length=120), nullable=True),
        sa.Column("contact_email", sa.String(length=160), nullable=True),
        sa.Column("contact_phone", sa.String(length=40), nullable=True),
        sa.Column("channel", sa.String(length=24), nullable=False, server_default="web"),
        sa.Column("user_agent", sa.Text(), nullable=True),
    )
    op.create_index("ix_manifestations_protocol", "manifestations", ["protocol"], unique=True)

    op.create_table(
        "attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("manifestation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field", sa.String(length=64), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=False, server_default="application/octet-stream"),
        sa.Column("bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("accessibility_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["manifestation_id"], ["manifestations.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_attachments_manifestation_id", "attachments", ["manifestation_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_attachments_manifestation_id", table_name="attachments")
    op.drop_table("attachments")
    op.drop_index("ix_manifestations_protocol", table_name="manifestations")
    op.drop_table("manifestations")
