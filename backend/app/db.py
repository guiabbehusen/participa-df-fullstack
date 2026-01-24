from __future__ import annotations

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .db_models import Base
from .settings import DATABASE_URL

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def _ensure_postgres_schema(conn) -> None:
    """Best-effort schema hardening for local/dev environments.

    Por que isso existe?
    - Em hackathons/demos, é comum a base Postgres persistir (volume Docker) enquanto o código muda.
    - `Base.metadata.create_all()` NÃO altera tabelas já existentes.
    - Resultado: erros 500 na primeira tentativa de salvar (colunas faltando).

    Este método adiciona colunas/índices essenciais quando faltarem.
    Em produção, use Alembic (migrations) como fonte de verdade.
    """
    if not str(DATABASE_URL).startswith("postgres"):
        return

    async def columns_of(table: str) -> set[str]:
        # table name vem de constantes internas, não de input do usuário.
        res = await conn.exec_driver_sql(
            f"""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '{table}'
            """
        )
        return {row[0] for row in res.fetchall()}


    # === manifestations ===
    mcols = await columns_of("manifestations")
    # Colunas adicionadas ao longo das versões do projeto
    alterations_manifestations = [
        ("status", "VARCHAR(32) NOT NULL DEFAULT 'Recebido'"),
        ("subject_detail", "TEXT"),
        ("description_text", "TEXT"),
        ("anonymous", "BOOLEAN NOT NULL DEFAULT false"),
        ("contact_name", "VARCHAR(120)"),
        ("contact_email", "VARCHAR(160)"),
        ("contact_phone", "VARCHAR(40)"),
        ("channel", "VARCHAR(24) NOT NULL DEFAULT 'web'"),
        ("user_agent", "TEXT"),
    ]

    for name, ddl in alterations_manifestations:
        if name not in mcols:
            await conn.exec_driver_sql(f"ALTER TABLE manifestations ADD COLUMN IF NOT EXISTS {name} {ddl}")

    # Índice/unique do protocolo (usado como chave pública)
    await conn.exec_driver_sql(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS ix_manifestations_protocol
        ON manifestations (protocol)
        """
    )

    # === attachments ===
    acols = await columns_of("attachments")
    alterations_attachments = [
        ("field", "VARCHAR(64) NOT NULL DEFAULT ''"),
        ("filename", "VARCHAR(255) NOT NULL DEFAULT ''"),
        ("content_type", "VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream'"),
        ("bytes", "INTEGER NOT NULL DEFAULT 0"),
        ("sha256", "VARCHAR(64)"),
        # `data` pode faltar se versões antigas guardavam em disco.
        # Adicionamos com default vazio para não quebrar registros antigos.
        ("data", "BYTEA NOT NULL DEFAULT decode('', 'hex')"),
        ("accessibility_text", "TEXT"),
        ("created_at", "TIMESTAMPTZ NOT NULL DEFAULT now()"),
    ]

    for name, ddl in alterations_attachments:
        if name not in acols:
            await conn.exec_driver_sql(f"ALTER TABLE attachments ADD COLUMN IF NOT EXISTS {name} {ddl}")

    await conn.exec_driver_sql(
        """
        CREATE INDEX IF NOT EXISTS ix_attachments_manifestation_id
        ON attachments (manifestation_id)
        """
    )


async def init_db() -> None:
    # In production, use Alembic migrations.
    # For demo/dev, create tables + apply best-effort "add column if missing".
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _ensure_postgres_schema(conn)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
