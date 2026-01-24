from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .settings import (
    OLLAMA_BASE_URL,
    OLLAMA_MODEL,
    OLLAMA_NUM_CTX,
    OLLAMA_TEMPERATURE,
    OLLAMA_TOP_P,
)


router = APIRouter(prefix="/api/iza", tags=["IZA (Ollama)"])


Intent = Literal[
    "denuncia_infraestrutura",
    "saúde",
    "segurança",
    "elogio",
    "cumprimento",
    "outro",
]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class IzaDraft(BaseModel):
    kind: Optional[str] = None
    subject: Optional[str] = None
    subject_detail: Optional[str] = None
    description_text: Optional[str] = None
    anonymous: Optional[bool] = None

    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None

    # Accessibility texts for attachments (if user intends to attach)
    image_alt: Optional[str] = None
    audio_transcript: Optional[str] = None
    video_description: Optional[str] = None

    # Optional signals from frontend
    has_image_file: Optional[bool] = None
    has_audio_file: Optional[bool] = None
    has_video_file: Optional[bool] = None


class IzaChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(default_factory=list)
    draft: IzaDraft = Field(default_factory=IzaDraft)


class IzaChatResponse(BaseModel):
    model: str = Field(default=OLLAMA_MODEL)
    assistant_message: str
    intent: Intent
    draft_patch: Dict[str, Any] = Field(default_factory=dict)
    missing_required_fields: List[str] = Field(default_factory=list)
    missing_recommended_fields: List[str] = Field(default_factory=list)
    can_submit: bool = False


_JSON_RE = re.compile(r"\{[\s\S]*\}\s*$")


def _compute_missing(draft: Dict[str, Any]) -> tuple[list[str], list[str], bool]:
    """Compute required/recommended fields deterministically (server-side).

    This keeps UX consistent even if the model returns imperfect metadata.
    """

    required: list[str] = []

    kind = (draft.get("kind") or "").strip()
    subject = (draft.get("subject") or "").strip()
    subject_detail = (draft.get("subject_detail") or "").strip()
    desc = (draft.get("description_text") or "").strip()
    anon = draft.get("anonymous")

    has_img = bool(draft.get("has_image_file"))
    has_audio = bool(draft.get("has_audio_file"))
    has_video = bool(draft.get("has_video_file"))

    if not kind:
        required.append("kind")
    if len(subject) < 3:
        required.append("subject")
    if len(subject_detail) < 3:
        required.append("subject_detail")

    if not desc and not (has_img or has_audio or has_video):
        required.append("description_text_or_attachment")

    # Identification required for certain kinds
    if kind in {"elogio", "sugestao", "solicitacao"}:
        if anon is True:
            required.append("anonymous_must_be_false")
        if len((draft.get("contact_name") or "").strip()) < 3:
            required.append("contact_name")
        if len((draft.get("contact_email") or "").strip()) < 5:
            required.append("contact_email")

    # A11y requirements if attachments are present
    if has_img and len((draft.get("image_alt") or "").strip()) < 3:
        required.append("image_alt")
    if has_audio and len((draft.get("audio_transcript") or "").strip()) < 3:
        required.append("audio_transcript")
    if has_video and len((draft.get("video_description") or "").strip()) < 3:
        required.append("video_description")

    # Recommended: try to encourage complete narrative
    recommended: list[str] = []
    desc_l = desc.lower()

    # Heuristics for location/time/impact based on keywords.
    # This doesn't need to be perfect; it's a gentle nudge.
    if desc:
        if not any(k in desc_l for k in ["onde", "rua", "avenida", "quadra", "setor", "bairro", "cep", "df", "brasília", "taguatinga", "ceilândia", "samambaia", "planaltina", "sobradinho", "asa "]):
            recommended.append("location_details")
        if not any(k in desc_l for k in ["quando", "hoje", "ontem", "amanhã", "manhã", "tarde", "noite", "dia", "data", "às", "as "]):
            recommended.append("time_details")
        if not any(k in desc_l for k in ["impact", "preju", "risco", "perigo", "dificult", "atras", "feriu", "impediu", "afetou"]):
            recommended.append("impact_details")

    can_submit = len(required) == 0
    return required, recommended, can_submit


def _system_prompt(draft: Dict[str, Any], missing_required: list[str], missing_recommended: list[str]) -> str:
    """System prompt grounded on the *current* draft.

    The draft acts as source-of-truth, so the model won't lose context.
    """

    draft_json = json.dumps(draft, ensure_ascii=False)
    missing_req_json = json.dumps(missing_required, ensure_ascii=False)
    missing_rec_json = json.dumps(missing_recommended, ensure_ascii=False)

    return (
        "Você é a IZA, assistente oficial da Ouvidoria do Governo do Distrito Federal.\n"
        "Seu objetivo é ajudar o cidadão a REGISTRAR UMA MANIFESTAÇÃO preenchendo o formulário.\n\n"
        "Contexto importante (fonte de verdade):\n"
        f"- Estado atual do rascunho do formulário (JSON): {draft_json}\n"
        f"- Campos obrigatórios que ainda faltam (compute server-side): {missing_req_json}\n"
        f"- Sugestões para fortalecer o relato: {missing_rec_json}\n\n"
        "Regras de comportamento:\n"
        "- Responda SEMPRE em português (Brasil) e com linguagem simples e acolhedora.\n"
        "- NÃO fuja do tema (registro de manifestação na Ouvidoria). Se o usuário pedir algo fora disso, redirecione com educação.\n"
        "- Faça UMA pergunta por vez e seja objetivo.\n"
        "- NÃO perca contexto: use o rascunho acima como memória. Se um campo já estiver preenchido, não pergunte novamente.\n"
        "- Se o usuário trouxer novos dados, atualize apenas os campos relacionados no patch (não apague o que já está correto).\n"
        "- Acessibilidade (WCAG): se houver anexo, exija descrição alternativa: imagem -> texto alternativo; áudio -> transcrição; vídeo -> descrição.\n"
        "- Tipos do formulário: reclamacao, denuncia, sugestao, elogio, solicitacao.\n"
        "- Se kind for elogio, sugestao ou solicitacao: IDENTIFICAÇÃO É OBRIGATÓRIA (contact_name e contact_email) e anonymous deve ser false.\n\n"
        "Você deve produzir SEMPRE um JSON válido (apenas JSON, sem texto fora).\n"
        "Formato obrigatório:\n"
        "{\n"
        "  \"assistant_message\": string,\n"
        "  \"intent\": \"denuncia_infraestrutura\"|\"saúde\"|\"segurança\"|\"elogio\"|\"cumprimento\"|\"outro\",\n"
        "  \"draft_patch\": {\n"
        "     \"kind\"?: string,\n"
        "     \"subject\"?: string,\n"
        "     \"subject_detail\"?: string,\n"
        "     \"description_text\"?: string,\n"
        "     \"anonymous\"?: boolean,\n"
        "     \"contact_name\"?: string,\n"
        "     \"contact_email\"?: string,\n"
        "     \"contact_phone\"?: string,\n"
        "     \"image_alt\"?: string,\n"
        "     \"audio_transcript\"?: string,\n"
        "     \"video_description\"?: string,\n"
        "     \"needs_location\"?: boolean,\n"
        "     \"needs_time\"?: boolean,\n"
        "     \"needs_impact\"?: boolean,\n"
        "     \"needs_photo\"?: boolean\n"
        "  }\n"
        "}\n\n"
        "Orientação de conversa:\n"
        "- Priorize completar: kind -> subject -> subject_detail -> relato/onde/quando/impacto -> anexos (se aplicável) -> identificação (se exigida).\n"
        "- Se for infraestrutura, normalmente uma foto ajuda: peça para anexar uma foto se ainda não houver anexo.\n"
        "- Em assistant_message, explique o próximo passo de forma curta e clara.\n"
    )


def _extract_json(text: str) -> Dict[str, Any]:
    text = (text or "").strip()

    # direct json
    try:
        return json.loads(text)
    except Exception:
        pass

    # find last JSON object
    m = _JSON_RE.search(text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass

    # fallback: first {...} block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass

    raise ValueError("Resposta do modelo não estava em JSON válido.")


@router.get("/health")
async def iza_health() -> Dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
            r.raise_for_status()
            return {"ok": True, "ollama": True, "model": OLLAMA_MODEL}
    except Exception as e:
        return {"ok": False, "ollama": False, "error": str(e)}


@router.post("/chat", response_model=IzaChatResponse)
async def iza_chat(req: IzaChatRequest) -> IzaChatResponse:
    # Build a grounded system prompt using the current draft as source-of-truth.
    draft_dict = req.draft.model_dump()
    missing_req, missing_rec, can_submit_now = _compute_missing(draft_dict)

    messages: List[Dict[str, str]] = [{"role": "system", "content": _system_prompt(draft_dict, missing_req, missing_rec)}]
    messages.extend([{"role": m.role, "content": m.content} for m in req.messages])

    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        # Ask Ollama to format response as JSON to reduce parsing failures.
        "format": "json",
        "options": {
            "temperature": OLLAMA_TEMPERATURE,
            "top_p": OLLAMA_TOP_P,
            "num_ctx": OLLAMA_NUM_CTX,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                r = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                # Compatibilidade: versões antigas do Ollama podem não suportar o campo `format`.
                if e.response is not None and e.response.status_code in {400, 422}:
                    payload_compat = dict(payload)
                    payload_compat.pop("format", None)
                    r = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload_compat)
                    r.raise_for_status()
                else:
                    raise

            data = r.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Falha ao chamar Ollama: {e}")

    content = (((data or {}).get("message") or {}).get("content") or "").strip()

    try:
        obj = _extract_json(content)
    except Exception:
        # Hard fallback: deterministic guidance without breaking the UI
        return IzaChatResponse(
            model=OLLAMA_MODEL,
            assistant_message=(
                "Vamos registrar sua manifestação passo a passo. "
                "Qual é o tipo: Reclamação, Denúncia, Sugestão, Elogio ou Solicitação?"
            ),
            intent="outro",
            draft_patch={
                "needs_location": True,
                "needs_time": True,
                "needs_impact": True,
            },
            missing_required_fields=missing_req,
            missing_recommended_fields=missing_rec,
            can_submit=can_submit_now,
        )

    draft_patch = obj.get("draft_patch") or {}

    # Merge patch into draft (server-side truth)
    merged = {**draft_dict, **draft_patch}
    missing_req2, missing_rec2, can_submit2 = _compute_missing(merged)

    assistant_message = str(obj.get("assistant_message") or "").strip() or "Entendi."
    intent = obj.get("intent") or "outro"

    # Normalize intent to allowed values
    if intent not in {"denuncia_infraestrutura", "saúde", "segurança", "elogio", "cumprimento", "outro"}:
        intent = "outro"

    return IzaChatResponse(
        model=OLLAMA_MODEL,
        assistant_message=assistant_message,
        intent=intent,
        draft_patch=draft_patch,
        # Always compute these server-side for consistency
        missing_required_fields=missing_req2,
        missing_recommended_fields=missing_rec2,
        can_submit=can_submit2,
    )
