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


# --- Privacy / Routing helpers -------------------------------------------------

_CPF_RE = re.compile(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b")
_EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
_DATE_RE = re.compile(r"\b\d{2}[/-]\d{2}[/-]\d{4}\b")
_PHONE_RE = re.compile(r"\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}\b")


def _sanitize_description_text(text: str) -> tuple[str, bool, list[str]]:
    """Redact common personal data patterns from the narrative.

    We *don't* remove addresses, because the location of the fact is often essential.
    We do redact CPF, emails, phone numbers and full dates, which often represent sensitive data.
    """

    original = text or ""
    sanitized = original
    removed: list[str] = []

    if _CPF_RE.search(sanitized):
        sanitized = _CPF_RE.sub("[CPF REMOVIDO]", sanitized)
        removed.append("CPF")

    if _EMAIL_RE.search(sanitized):
        sanitized = _EMAIL_RE.sub("[E-MAIL REMOVIDO]", sanitized)
        removed.append("e-mail")

    if _PHONE_RE.search(sanitized):
        sanitized = _PHONE_RE.sub("[TELEFONE REMOVIDO]", sanitized)
        removed.append("telefone")

    # Dates can be legitimate (when the fact happened), so we only redact if the user
    # explicitly seems to be sharing personal data. We keep it conservative by redacting
    # only when the message contains hints like "nascimento".
    lower = sanitized.lower()
    if "nascimento" in lower and _DATE_RE.search(sanitized):
        sanitized = _DATE_RE.sub("[DATA REMOVIDA]", sanitized)
        removed.append("data")

    changed = sanitized != original
    return sanitized, changed, removed


_FEDERAL_KEYWORDS = (
    "inss",
    "conecta sus",
    "conectasus",
    "gov.br",
    "governo federal",
    "fala br",
)


def _looks_federal(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in _FEDERAL_KEYWORDS)


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
        "- Se o usuário quiser se identificar: IDENTIFICAÇÃO (contact_name e contact_email) e anonymous deve ser false.\n\n"
        "Orientações importantes para o registro:\n"
        "- Para acompanhar e receber a resposta, a pessoa precisa se identificar, deve-se perguntar se quer que seja em anonimato ou não (nome e e-mail).\n"
        "- As manifestações podem ser registradas sem identificação (anônimo), mas sem acompanhamento nem envio de resposta por e-mail.\n"
        "- Proteção ao denunciante: trate denúncias com sigilo da identidade.\n"
        "- Privacidade: oriente o usuário a NÃO colocar CPF, e-mail, data de nascimento etc. no texto do relato. Se aparecer, peça para remover e NÃO repita esses dados na resposta.\n"
        "- Se o assunto for do Governo Federal (ex.: INSS, Conecta SUS, gov.br), oriente a usar o sistema Fala BR.\n"
        "- Um assunto por registro: se houver dois temas diferentes, sugira criar dois registros.\n\n"
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
        "- Siga o passo a passo: 1) detalhes do fato (o quê/onde/quando/impacto) 2) definir tipo e assunto 3) complementar localização 4) anexos e descrições (A11y) 5) confirmar e gerar protocolo.\n"
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

    # Roteamento simples: assuntos do Governo Federal devem ir para o Fala BR.
    last_user_text = ""
    for m in reversed(req.messages):
        if m.role == "user":
            last_user_text = (m.content or "").strip()
            break

    combined = " ".join(
        [
            last_user_text,
            str(draft_dict.get("subject") or ""),
            str(draft_dict.get("subject_detail") or ""),
        ]
    )

    if _looks_federal(combined):
        return IzaChatResponse(
            model=OLLAMA_MODEL,
            assistant_message=(
                "Parece um assunto do Governo Federal (ex.: INSS, Conecta SUS, gov.br). "
                "O Participa DF é o canal de Ouvidoria para serviços do GDF. "
                "Para temas federais, use o sistema Fala BR. "
                "Se o seu caso for do DF, me diga qual órgão/serviço do DF está envolvido."
            ),
            intent="outro",
            draft_patch={},
            missing_required_fields=missing_req,
            missing_recommended_fields=missing_rec,
            can_submit=can_submit_now,
        )

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
    if not isinstance(draft_patch, dict):
        draft_patch = {}

    # Privacidade: se o modelo colocar dados pessoais no texto do relato, sanitize antes de retornar.
    privacy_removed: list[str] = []
    if isinstance(draft_patch.get("description_text"), str):
        sanitized, changed, removed = _sanitize_description_text(draft_patch.get("description_text") or "")
        if changed:
            draft_patch["description_text"] = sanitized
            privacy_removed = removed

    # Merge patch into draft (server-side truth)
    merged = {**draft_dict, **draft_patch}
    missing_req2, missing_rec2, can_submit2 = _compute_missing(merged)

    assistant_message = str(obj.get("assistant_message") or "").strip() or "Entendi."
    if privacy_removed:
        assistant_message = (
            assistant_message
            + "\n\nObservação: para proteger seus dados, removi automaticamente "
            + ", ".join(privacy_removed)
            + " do texto do relato. Se precisar informar contato, use a identificação."
        )
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
