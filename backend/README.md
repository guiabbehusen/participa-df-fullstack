# Participa DF — Backend (FastAPI + PostgreSQL)

Este backend expõe uma API para registro de manifestações (texto + anexos) e o assistente IZA via Ollama.

## 1) Subir PostgreSQL (Docker)

Dentro da pasta `backend/`:

```bash
docker compose -f docker-compose.yml up -d
```

## 2) Configurar variáveis de ambiente

Copie `.env.example` para `.env` e ajuste se necessário:

```bash
cp .env.example .env
```

## 3) Instalar dependências e rodar

```bash
python -m venv .venv
# Windows PowerShell:
# .venv\Scripts\Activate.ps1
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8000
```

Swagger:
- http://localhost:8000/docs

## Migrations (opcional, recomendado)

O app cria tabelas no startup (para "rodar de primeira"). Para fluxo mais profissional, use Alembic:

```bash
alembic upgrade head
```
