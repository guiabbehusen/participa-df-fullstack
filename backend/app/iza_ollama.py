from __future__ import annotations

import json
import re
from typing import Any, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from pydantic.config import ConfigDict

from .settings import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_NUM_CTX,
    OLLAMA_TEMPERATURE,
    OLLAMA_TIMEOUT_S,
    OLLAMA_TOP_P,
)


router = APIRouter(prefix="/api/iza", tags=["IZA"])


Role = Literal["system", "user", "assistant"]


class IzaChatMessage(BaseModel):
    role: Role
    content: str


class IzaChatRequest(BaseModel):
    messages: list[IzaChatMessage] = Field(default_factory=list)
    # Rascunho atual do formulário (para a IZA sugerir preenchimento).
    # Mantemos como dict flexível para evitar acoplamento com o frontend.
    draft: Optional[dict[str, Any]] = None


Intent = Literal[
    "denuncia_infraestrutura",
    "saúde",
    "segurança",
    "elogio",
    "cumprimento",
]


class IzaDraftPatch(BaseModel):
    kind: Optional[str] = None
    subject: Optional[str] = None
    anonymous: Optional[bool] = None
    description_text: Optional[str] = None
    needs_photo: Optional[bool] = None
    needs_location: Optional[bool] = None
    needs_time: Optional[bool] = None

    model_config = ConfigDict(extra="ignore")


class IzaChatLLMOutput(BaseModel):
    assistant_message: str
    intent: Intent = "cumprimento"
    draft_patch: Optional[IzaDraftPatch] = None
    can_submit: bool = False

    model_config = ConfigDict(extra="ignore")


class IzaChatResponse(BaseModel):
    ok: bool = True
    provider: str = "ollama"
    model: str
    assistant_message: str
    intent: Intent
    draft_patch: Optional[IzaDraftPatch] = None
    can_submit: bool = False
    raw: Optional[Any] = None


def _system_prompt(draft: Optional[dict[str, Any]]) -> str:
    # Prompt em PT-BR, focado em ouvidoria e acessibilidade.
    # Exigimos JSON válido para permitir auto-preenchimento.
    draft_json = "{}"
    try:
        if draft is not None:
            draft_json = json.dumps(draft, ensure_ascii=False)
    except Exception:
        draft_json = "{}"

    return (
        "Você é a IZA, assistente virtual do Participa DF (Ouvidoria). "
        "Seu objetivo é ajudar o cidadão a registrar uma manifestação de forma simples, inclusiva e acessível.\n\n"
        "Contexto:\n"
        "- O cidadão pode preferir usar voz. Então, escreva frases curtas e fáceis de ouvir.\n"
        "- Pergunte apenas o necessário: o que aconteceu, onde, quando, e se deseja anonimato.\n"
        "- Se for INFRAESTRUTURA (buraco, asfalto, iluminação, calçada, esgoto), peça foto quando possível.\n"
        "- Se houver risco imediato (ameaça/violência em andamento), oriente buscar canais de emergência.\n"
        "- Não peça dados pessoais sensíveis.\n\n"
        "Você deve responder SEMPRE e APENAS com um JSON válido (sem markdown, sem texto fora do JSON) no formato:\n"
        "{\n"
        '  "assistant_message": "texto em pt-BR, empático e objetivo",\n'
        '  "intent": "denuncia_infraestrutura" | "saúde" | "segurança" | "elogio" | "cumprimento",\n'
        '  "draft_patch": {\n'
        '    "kind": "reclamacao" | "denuncia" | "sugestao" | "elogio" | "solicitacao" | null,\n'
        '    "subject": "assunto curto" | null,\n'
        '    "anonymous": true | false | null,\n'
        '    "description_text": "resumo do relato (inclua local/tempo se informado)" | null,\n'
        '    "needs_photo": true | false | null,\n'
        '    "needs_location": true | false | null,\n'
        '    "needs_time": true | false | null\n'
        "  },\n"
        '  "can_submit": true | false\n'
        "}\n\n"
        "Rascunho atual do formulário (JSON):\n"
        f"{draft_json}\n"
    )


def _extract_json(text: str) -> Optional[str]:
    t = (text or "").strip()
    if not t:
        return None

    # Caso já seja JSON
    if t.startswith("{") and t.endswith("}"):
        return t

    # Extrai o primeiro objeto JSON que aparecer
    m = re.search(r"\{[\s\S]*\}", t)
    if m:
        return m.group(0)
    return None


async def _call_ollama(messages: list[IzaChatMessage], draft: Optional[dict[str, Any]]) -> dict[str, Any]:
    base = OLLAMA_BASE_URL.rstrip("/")
    url = f"{base}/api/chat"

    system = IzaChatMessage(role="system", content=_system_prompt(draft))

    # Sanitiza mensagens (evita roles inesperados)
    safe_msgs: list[dict[str, str]] = [system.model_dump()]
    for m in messages[-20:]:
        role = m.role if m.role in ("user", "assistant", "system") else "user"
        content = (m.content or "").strip()
        if not content:
            continue
        # Evita que o cliente injete outro system prompt — mantenha 1 system acima
        if role == "system":
            continue
        safe_msgs.append({"role": role, "content": content})

    payload = {
        "model": OLLAMA_MODEL,
        "messages": safe_msgs,
        "stream": False,
        "options": {
            "temperature": OLLAMA_TEMPERATURE,
            "top_p": OLLAMA_TOP_P,
            "num_ctx": OLLAMA_NUM_CTX,
        },
    }

    timeout = httpx.Timeout(OLLAMA_TIMEOUT_S)
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


@router.get("/health")
async def iza_health():
    base = OLLAMA_BASE_URL.rstrip("/")
    # /api/tags existe em versões comuns do Ollama e é o jeito mais útil de testar.
    # Se não existir, retornamos um health degradado.
    timeout = httpx.Timeout(5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(f"{base}/api/tags")
            ok = r.status_code == 200
            data = r.json() if ok else None
            return {
                "ok": ok,
                "provider": "ollama",
                "base_url": base,
                "model": OLLAMA_MODEL,
                "tags": data,
            }
    except Exception as e:
        return {
            "ok": False,
            "provider": "ollama",
            "base_url": base,
            "model": OLLAMA_MODEL,
            "error": str(e),
        }


@router.post("/chat", response_model=IzaChatResponse)
async def iza_chat(req: IzaChatRequest):
    try:
        raw = await _call_ollama(req.messages, req.draft)
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=(
                "Não consegui conectar ao Ollama. Garanta que o serviço está rodando em "
                f"{OLLAMA_BASE_URL} e que o modelo '{OLLAMA_MODEL}' foi baixado."
            ),
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Ollama respondeu com erro: {e.response.text[:300]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao chamar o Ollama: {str(e)}")

    content = (
        (raw.get("message") or {}).get("content")
        or raw.get("response")
        or ""
    )

    json_text = _extract_json(content)
    if not json_text:
        # Fallback: devolve texto cru.
        return IzaChatResponse(
            model=OLLAMA_MODEL,
            assistant_message=content.strip() or "Desculpe, não consegui gerar uma resposta. Pode repetir?",
            intent="cumprimento",
            draft_patch=None,
            can_submit=False,
            raw=raw,
        )

    try:
        obj = json.loads(json_text)
        out = IzaChatLLMOutput.model_validate(obj)
    except Exception:
        # Fallback: devolve conteúdo cru.
        return IzaChatResponse(
            model=OLLAMA_MODEL,
            assistant_message=content.strip() or "Desculpe, não consegui gerar uma resposta. Pode repetir?",
            intent="cumprimento",
            draft_patch=None,
            can_submit=False,
            raw=raw,
        )

    return IzaChatResponse(
        model=OLLAMA_MODEL,
        assistant_message=out.assistant_message.strip(),
        intent=out.intent,
        draft_patch=out.draft_patch,
        can_submit=bool(out.can_submit),
        raw=raw,
    )
