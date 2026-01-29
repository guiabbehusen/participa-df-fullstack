import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileAudio,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Mic,
  Send,
  Sparkles,
  Video as VideoIcon,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { createManifestation } from '@/services/api/manifestations'
import type { IzaChatMessage } from '@/services/api/iza'
import { saveDraft } from '@/services/storage/draft'
import type { ManifestationCreatePayload, ManifestationKind } from '@/types/manifestation'
import { useIzaBrain, type IzaIntent } from '@/hooks/useIzaBrain'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { useTts } from '@/hooks/useTts'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  meta?: {
    intent?: IzaIntent
    provider?: string
    model?: string
  }
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const KIND_SET = new Set<ManifestationKind>(['reclamacao', 'denuncia', 'sugestao', 'elogio', 'solicitacao'])
function coerceKind(v: unknown): ManifestationKind | undefined {
  if (typeof v !== 'string') return undefined
  const x = v.trim() as ManifestationKind
  return KIND_SET.has(x) ? x : undefined
}

const REQUIRES_ID = new Set<ManifestationKind>(['elogio', 'sugestao', 'solicitacao'])
function requiresIdentification(kind?: ManifestationKind) {
  return !!kind && REQUIRES_ID.has(kind)
}

function looksLikeEmail(email?: string) {
  if (!email) return false
  const e = email.trim()
  if (e.length < 5) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

function isReadyToSubmit(draft: Partial<ManifestationCreatePayload>) {
  const hasCore =
    !!draft.kind &&
    !!draft.subject &&
    draft.subject.trim().length >= 3 &&
    !!draft.subject_detail &&
    draft.subject_detail.trim().length >= 3

  const hasContent =
    !!(draft.description_text && draft.description_text.trim().length > 0) ||
    !!draft.audio_file ||
    !!draft.image_file ||
    !!draft.video_file

  // Acessibilidade: se anexar mídia, precisa descrição alternativa
  const audioOk = !draft.audio_file || !!(draft.audio_transcript && draft.audio_transcript.trim().length > 0)
  const imageOk = !draft.image_file || !!(draft.image_alt && draft.image_alt.trim().length > 0)
  const videoOk = !draft.video_file || !!(draft.video_description && draft.video_description.trim().length > 0)

  const idOk = (() => {
    if (!requiresIdentification(draft.kind)) return true
    if (draft.anonymous) return false
    if (!draft.contact_name || draft.contact_name.trim().length < 3) return false
    if (!looksLikeEmail(draft.contact_email)) return false
    return true
  })()

  return hasCore && hasContent && audioOk && imageOk && videoOk && idOk
}

function labelKind(kind?: ManifestationKind) {
  switch (kind) {
    case 'reclamacao':
      return 'Reclamação'
    case 'denuncia':
      return 'Denúncia'
    case 'sugestao':
      return 'Sugestão'
    case 'elogio':
      return 'Elogio'
    case 'solicitacao':
      return 'Solicitação'
    default:
      return '—'
  }
}

function labelField(field: string) {
  const map: Record<string, string> = {
    kind: 'Tipo de manifestação',
    subject: 'Assunto',
    subject_detail: 'Descreva o tema',
    description_text_or_attachment: 'Relato em texto ou anexo',
    description_text: 'Relato em texto',
    contact_name: 'Nome',
    contact_email: 'E-mail',
    anonymous: 'Envio anônimo',
    anonymous_must_be_false: 'Envio anônimo (não permitido)',
    image_alt: 'Texto alternativo da imagem',
    audio_transcript: 'Transcrição do áudio',
    video_description: 'Descrição do vídeo',
  }
  return map[field] || field
}

function stripFileName(name: string) {
  if (!name) return ''
  if (name.length <= 28) return name
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  const base = ext ? name.slice(0, -ext.length) : name
  return `${base.slice(0, 18)}…${ext}`
}

function draftSignature(d: Partial<ManifestationCreatePayload>) {
  // Assina o estado do rascunho sem serializar objetos File.
  // Isso permite habilitar um “Continuar” quando o usuário atualiza anexos/descrições
  // sem precisar digitar uma nova mensagem.
  return JSON.stringify({
    kind: d.kind,
    subject: d.subject,
    subject_detail: (d as any).subject_detail,
    description_text: d.description_text,
    anonymous: d.anonymous,
    contact_name: (d as any).contact_name,
    contact_email: (d as any).contact_email,
    contact_phone: (d as any).contact_phone,
    image_alt: (d as any).image_alt,
    audio_transcript: (d as any).audio_transcript,
    video_description: (d as any).video_description,
    has_image_file: Boolean((d as any).image_file),
    has_audio_file: Boolean((d as any).audio_file),
    has_video_file: Boolean((d as any).video_file),
  })
}

function buildDraftUpdateMessage(d: Partial<ManifestationCreatePayload>) {
  const parts: string[] = []

  if ((d as any).image_file) parts.push((d as any).image_alt?.trim() ? 'foto com descrição' : 'foto')
  if ((d as any).audio_file) parts.push((d as any).audio_transcript?.trim() ? 'áudio com transcrição' : 'áudio')
  if ((d as any).video_file) parts.push((d as any).video_description?.trim() ? 'vídeo com descrição' : 'vídeo')

  if (!parts.length) return 'Atualizei o rascunho do formulário.'

  // Mensagem curta para disparar a resposta da IZA sem o usuário ter que digitar.
  return `Pronto. Atualizei ${parts.join(', ')} no rascunho. O que falta agora?`
}

export function IzaChatWidget() {
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  // TTS (acessibilidade)
  const tts = useTts('pt-BR')
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('iza_tts_enabled') === 'true'
  })
  const [ttsRate, setTtsRate] = useState<number>(() => {
    if (typeof window === 'undefined') return 1
    const raw = window.localStorage.getItem('iza_tts_rate')
    const n = raw ? Number(raw) : 1
    return Number.isFinite(n) ? Math.max(0.85, Math.min(1.15, n)) : 1
  })

  // STT (voz)
  const speech = useSpeechRecognition({ lang: 'pt-BR', interimResults: true, continuous: false })
  const lastConsumedSpeechRef = useRef<string>('')
  const lastMicKickRef = useRef<number>(0)

  // Conversa por voz (mãos livres): STT -> LLM -> TTS -> STT...
  const [voiceChat, setVoiceChat] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('iza_voice_chat') === 'true'
  })

  const initialMessages = useMemo<ChatMessage[]>(
    () => [
      {
        id: uid(),
        role: 'assistant',
        text:
          'Olá! Eu sou a IZA. Eu posso te ajudar a preencher a manifestação com clareza. ' +
          'Você pode digitar ou conversar por voz. Se quiser, eu também posso ler minhas respostas em voz alta.',
      },
    ],
    [],
  )

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const messagesRef = useRef<ChatMessage[]>(initialMessages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const [draft, setDraft] = useState<Partial<ManifestationCreatePayload>>({})
  const lastSentDraftSigRef = useRef<string>(draftSignature({}))
  const [needs, setNeeds] = useState<{ photo?: boolean; location?: boolean; time?: boolean; impact?: boolean }>({})
  const [missingRequired, setMissingRequired] = useState<string[]>([])
  const [missingRecommended, setMissingRecommended] = useState<string[]>([])

  const [submitBusy, setSubmitBusy] = useState(false)
  const [protocol, setProtocol] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  // Scroll UX: só auto-rolar quando o usuário estiver no final.
  const [atBottom, setAtBottom] = useState(true)
  const [unseenCount, setUnseenCount] = useState(0)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const iza = useIzaBrain({ autoWarmUp: false })
  const isThinking = iza.isThinking

  // Draft panel (não mostrar logo no início para não confundir)
  const [draftOpen, setDraftOpen] = useState(false)

  // Attachments (UI no chat)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const audioInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)

  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)

  // Persistências
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('iza_tts_enabled', String(ttsEnabled))
    if (!ttsEnabled) tts.cancel()
  }, [tts, ttsEnabled])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('iza_tts_rate', String(ttsRate))
  }, [ttsRate])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('iza_voice_chat', String(voiceChat))
  }, [voiceChat])

  // Quando abrir, tenta conectar ao assistente e foca input.
  useEffect(() => {
    if (!open) return
    iza.warmUp().catch(() => {})
    const t = window.setTimeout(() => inputRef.current?.focus(), 160)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Ao abrir, leve o usuário para o final.
  useEffect(() => {
    if (!open) return
    window.setTimeout(() => {
      scrollToBottom('auto')
      setUnseenCount(0)
      setAtBottom(true)
    }, 60)
  }, [open, scrollToBottom])

  // Scroll: detecta se o usuário está no final.
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (!el) return

    const threshold = 64 // px
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      setAtBottom(nearBottom)
      if (nearBottom) setUnseenCount(0)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [open])

  // Auto-scroll apenas se o usuário estiver no final.
  useEffect(() => {
    if (!open) return
    if (atBottom) {
      scrollToBottom('smooth')
      setUnseenCount(0)
      return
    }
    setUnseenCount((c) => c + 1)
  }, [messages.length, open, atBottom, scrollToBottom])

  // Abrir painel de anexos automaticamente quando algum arquivo for selecionado
  useEffect(() => {
    if (!open) return
    if (draft.image_file || draft.audio_file || draft.video_file) {
      setAttachmentsOpen(true)
    }
  }, [open, draft.image_file, draft.audio_file, draft.video_file])

  // Limpa URL de preview ao desmontar
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
  }, [imagePreviewUrl])

  function close() {
    try {
      // stop() tende a ser mais “limpo” que abort()
      if (speech.listening) speech.stop()
    } catch {
      try {
        speech.abort()
      } catch {
        // ignore
      }
    }
    tts.cancel()
    setOpen(false)
  }

  const maybeStartListening = useCallback(() => {
    if (!open) return
    if (!voiceChat) return
    if (!speech.supported) return
    if (isThinking) return
    if (ttsEnabled && tts.speaking) return
    if (speech.listening) return

    // Evita loop agressivo (ex.: start->falha->retry em milissegundos)
    const now = Date.now()
    if (now - lastMicKickRef.current < 550) return
    lastMicKickRef.current = now

    // Erros fatais: não adianta tentar reiniciar automaticamente
    const fatal =
      speech.errorCode === 'not-allowed' ||
      speech.errorCode === 'service-not-allowed' ||
      speech.errorCode === 'audio-capture'

    if (fatal) return

    // Recupera de estados transitórios (ex.: start-failed logo após TTS / stop)
    if (speech.status === 'error' || speech.error) {
      speech.reset()
      return
    }

    speech.start()
  }, [
    open,
    voiceChat,
    speech.supported,
    speech.status,
    speech.error,
    speech.errorCode,
    isThinking,
    ttsEnabled,
    tts.speaking,
    speech.listening,
    speech.start,
    speech.reset,
  ])

  // Quando ativar conversa por voz, garanta TTS habilitado.
  useEffect(() => {
    if (!open) return
    if (!voiceChat) return
    if (tts.supported && !ttsEnabled) setTtsEnabled(true)
  }, [open, voiceChat, tts.supported, ttsEnabled])

  // Se desativar conversa por voz, pare o mic.
  useEffect(() => {
    if (!open) return
    if (voiceChat) return
    if (speech.listening) speech.abort()
  }, [open, voiceChat, speech.abort, speech.listening])

  // Consume STT
  useEffect(() => {
    if (!open) return
    if (speech.listening) return

    const txt = (speech.finalText || '').trim()
    if (!txt) return
    if (txt === lastConsumedSpeechRef.current) return

    lastConsumedSpeechRef.current = txt
    speech.reset()

    if (voiceChat) {
      void handleSendText(txt)
      return
    }

    // ditado: coloca no input p/ revisão
    setInput((prev) => (prev ? `${prev} ${txt}` : txt))
  }, [open, speech.finalText, speech.listening, voiceChat])

  // Em mãos-livres: quando terminar fala e não estiver pensando, volte a ouvir
  useEffect(() => {
    if (!open) return
    if (!voiceChat) return
    if (!speech.supported) return
    if (isThinking) return
    if (ttsEnabled && tts.speaking) return
    if (speech.listening) return
    maybeStartListening()
  }, [open, voiceChat, speech.supported, isThinking, ttsEnabled, tts.speaking, speech.listening, maybeStartListening])
  // Watchdog (mãos-livres): alguns navegadores encerram o reconhecimento após TTS/erros transitórios.
  // Mantém o microfone “sempre pronto” sem travar o app.
  useEffect(() => {
    if (!open) return
    if (!voiceChat) return
    if (!speech.supported) return

    const id = window.setInterval(() => {
      if (!open) return
      if (!voiceChat) return
      if (isThinking) return
      if (ttsEnabled && tts.speaking) return
      if (speech.listening) return
      maybeStartListening()
    }, 2000)

    return () => window.clearInterval(id)
  }, [open, voiceChat, speech.supported, isThinking, ttsEnabled, tts.speaking, speech.listening, maybeStartListening])



  function speakAssistant(text: string) {
    if (!ttsEnabled || !tts.supported) {
      window.setTimeout(() => maybeStartListening(), 150)
      return
    }

    // Evita eco: não escutar enquanto fala
    if (speech.listening) {
      try {
        speech.stop()
      } catch {
        try {
          speech.abort()
        } catch {
          // ignore
        }
      }
      // Limpa estados transitórios (ex.: 'aborted' / 'start-failed')
      speech.reset()
    }

    tts.speak(text, {
      rate: ttsRate,
      onEnd: () => {
        window.setTimeout(() => maybeStartListening(), 180)
      },
    })
  }

  function toApiMessages(nextMessages: ChatMessage[]) {
    // Mantém o histórico recente (um pouco maior) para reduzir perda de contexto.
    return nextMessages
      .filter((m) => (m.text || '').trim().length > 0)
      .slice(-28)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })) as IzaChatMessage[]
  }

  function applyDraftPatch(patch?: any) {
    if (!patch) return

    setNeeds((prev) => ({
      photo: patch.needs_photo ?? prev.photo,
      location: patch.needs_location ?? prev.location,
      time: patch.needs_time ?? prev.time,
      impact: patch.needs_impact ?? prev.impact,
    }))

    setDraft((prev) => {
      const next: Partial<ManifestationCreatePayload> = { ...prev }

      const kind = coerceKind(patch.kind)
      if (kind) next.kind = kind

      if (typeof patch.subject === 'string' && patch.subject.trim()) {
        next.subject = patch.subject.trim().slice(0, 120)
      }

      if (typeof patch.subject_detail === 'string' && patch.subject_detail.trim()) {
        next.subject_detail = patch.subject_detail.trim().slice(0, 220)
      }

      if (typeof patch.anonymous === 'boolean') next.anonymous = patch.anonymous

      if (typeof patch.contact_name === 'string' && patch.contact_name.trim()) {
        next.contact_name = patch.contact_name.trim().slice(0, 120)
      }
      if (typeof patch.contact_email === 'string' && patch.contact_email.trim()) {
        next.contact_email = patch.contact_email.trim().slice(0, 160)
      }
      if (typeof patch.contact_phone === 'string' && patch.contact_phone.trim()) {
        next.contact_phone = patch.contact_phone.trim().slice(0, 40)
      }

      if (typeof patch.description_text === 'string' && patch.description_text.trim()) {
        const t = patch.description_text.trim()
        const prev = (next.description_text || '').trim()

        // A IZA pode tanto:
        // 1) sugerir uma REESCRITA completa do relato (mais estruturado)
        // 2) sugerir um COMPLEMENTO curto
        // Aqui evitamos duplicação e mantemos o relato como um texto coeso.
        const looksStructured = /(^|\n)\s*(o\s*que|o\s*quê|onde|quando|impacto)\s*[:\-]/i.test(t)
        const isMuchLonger = prev ? t.length > prev.length + 120 : true

        if (!prev) {
          next.description_text = t
        } else if (looksStructured || isMuchLonger) {
          // substitui por uma versão mais completa
          next.description_text = t
        } else if (!prev.includes(t)) {
          // complementa apenas se não for repetição
          next.description_text = `${prev}\n\n${t}`
        }
      }

      // Acessibilidade: o modelo pode sugerir uma redação para o alt/transcrição/descrição
      if (typeof patch.image_alt === 'string' && patch.image_alt.trim()) {
        next.image_alt = patch.image_alt.trim().slice(0, 400)
      }
      if (typeof patch.audio_transcript === 'string' && patch.audio_transcript.trim()) {
        next.audio_transcript = patch.audio_transcript.trim().slice(0, 5000)
      }
      if (typeof patch.video_description === 'string' && patch.video_description.trim()) {
        next.video_description = patch.video_description.trim().slice(0, 800)
      }

      return next
    })
  }

  async function handleSendText(text: string) {
    const raw = text.trim()
    if (!raw || isThinking) return
    setSubmitError(null)
    setProtocol(null)

    const userMsg: ChatMessage = { id: uid(), role: 'user', text: raw }
    const pendingId = uid()
    const pendingMsg: ChatMessage = { id: pendingId, role: 'assistant', text: 'IZA está pensando…' }

    // Use ref para garantir histórico atualizado (evita perda de contexto em fluxos rápidos/voz)
    const current = messagesRef.current
    const historyForApi = toApiMessages([...current, userMsg])

    setMessages((prev) => [...prev, userMsg, pendingMsg])

    // Marque este estado do rascunho como “enviado ao assistente”.
    // Isso habilita o fluxo: anexar -> descrever -> clicar em “Continuar” (sem digitar).
    lastSentDraftSigRef.current = draftSignature(draft)

    const res = await iza.chat(historyForApi, draft)

    setMessages((prev) => {
      const copy = [...prev]
      const idx = copy.findIndex((m) => m.id === pendingId)
      if (idx >= 0) {
        copy[idx] = {
          id: pendingId,
          role: 'assistant',
          text: res.assistant_message,
          meta: { intent: res.intent, provider: res.provider, model: res.model },
        }
      }
      return copy
    })

    applyDraftPatch(res.draft_patch)

    if (Array.isArray(res.missing_required_fields)) setMissingRequired(res.missing_required_fields)
    if (Array.isArray(res.missing_recommended_fields)) setMissingRecommended(res.missing_recommended_fields)

    speakAssistant(res.assistant_message)
  }

  async function handleSend() {
    const text = input.trim()
    if (isThinking) return

    // Snapshot do estado atual (evita depender de valores memoizados)
    const hasAnyAttachmentNow = Boolean(draft.image_file || draft.audio_file || draft.video_file)
    const attachmentsA11yOkNow =
      (!draft.image_file || Boolean(draft.image_alt && draft.image_alt.trim().length >= 3)) &&
      (!draft.audio_file || Boolean(draft.audio_transcript && draft.audio_transcript.trim().length >= 3)) &&
      (!draft.video_file || Boolean(draft.video_description && draft.video_description.trim().length >= 3))

    // Fluxo normal: enviar mensagem digitada.
    if (text) {
      setInput('')
      await handleSendText(text)

      // Volta ao chat “normal” após enviar (mantém anexos no rascunho).
      if (attachmentsOpen && hasAnyAttachmentNow && attachmentsA11yOkNow) {
        setAttachmentsOpen(false)
      }

      return
    }

    // Fluxo de anexos: permitir “Continuar” após preencher a descrição/transcrição,
    // mesmo com o campo de mensagem vazio.
    if (canSendDraftUpdate) {
      await handleSendText(buildDraftUpdateMessage(draft))

      // Esconde o editor de anexos após confirmar (o arquivo continua anexado ao rascunho).
      setAttachmentsOpen(false)

      // Retorna foco ao campo de mensagem
      window.setTimeout(() => inputRef.current?.focus(), 80)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  const showTtsControls = tts.supported
  const showSpeechControls = speech.supported

  const draftReady = isReadyToSubmit(draft)

  const derivedMissingRequired = useMemo(() => {
    if (missingRequired.length) return missingRequired
    const req: string[] = []

    if (!draft.kind) req.push('kind')
    if (!draft.subject || draft.subject.trim().length < 3) req.push('subject')
    if (!draft.subject_detail || draft.subject_detail.trim().length < 3) req.push('subject_detail')

    const hasContent =
      !!(draft.description_text && draft.description_text.trim().length > 0) ||
      !!draft.audio_file ||
      !!draft.image_file ||
      !!draft.video_file
    if (!hasContent) req.push('description_text_or_attachment')

    if (requiresIdentification(draft.kind)) {
      if (draft.anonymous) req.push('anonymous')
      if (!draft.contact_name || draft.contact_name.trim().length < 3) req.push('contact_name')
      if (!looksLikeEmail(draft.contact_email)) req.push('contact_email')
    }

    if (draft.image_file && (!draft.image_alt || draft.image_alt.trim().length < 3)) req.push('image_alt')
    if (draft.audio_file && (!draft.audio_transcript || draft.audio_transcript.trim().length < 3)) req.push('audio_transcript')
    if (draft.video_file && (!draft.video_description || draft.video_description.trim().length < 3)) req.push('video_description')

    return req
  }, [draft, missingRequired])

  const derivedMissingRecommended = useMemo(() => {
    if (missingRecommended.length) return missingRecommended
    const rec: string[] = []
    if (needs.location) rec.push('location')
    if (needs.time) rec.push('time')
    if (needs.impact) rec.push('impact')
    if (needs.photo) rec.push('photo')
    return rec
  }, [missingRecommended, needs.impact, needs.location, needs.photo, needs.time])

  const draftSummary = useMemo(() => {
    const parts: string[] = []
    if (draft.kind) parts.push(`Tipo: ${labelKind(draft.kind)}`)
    if (draft.subject) parts.push(`Assunto: ${draft.subject}`)
    if (draft.subject_detail) parts.push(`Tema: ok`)
    if (draft.anonymous !== undefined) parts.push(`Anônimo: ${draft.anonymous ? 'sim' : 'não'}`)
    const len = (draft.description_text || '').trim().length
    if (len) parts.push(`Relato: ${len} caracteres`)
    if (draft.image_file) parts.push('Foto: anexada')
    if (draft.audio_file) parts.push('Áudio: anexado')
    if (draft.video_file) parts.push('Vídeo: anexado')
    if (requiresIdentification(draft.kind)) {
      parts.push(`Identificação: ${looksLikeEmail(draft.contact_email) ? 'ok' : 'pendente'}`)
    }
    return parts.join(' · ')
  }, [draft])

  const hasUserInteraction = useMemo(() => messages.some((m) => m.role === 'user'), [messages])

  const hasAnyDraftValue = useMemo(() => {
    return (
      !!draft.kind ||
      !!draft.subject ||
      !!draft.subject_detail ||
      !!draft.description_text ||
      draft.anonymous !== undefined ||
      !!draft.contact_name ||
      !!draft.contact_email ||
      !!draft.contact_phone ||
      !!draft.image_file ||
      !!draft.audio_file ||
      !!draft.video_file ||
      !!draft.image_alt ||
      !!draft.audio_transcript ||
      !!draft.video_description
    )
  }, [draft])

  // Attachment a11y status
  const imageAltMissing = !!draft.image_file && !(draft.image_alt && draft.image_alt.trim().length >= 3)
  const audioTranscriptMissing = !!draft.audio_file && !(draft.audio_transcript && draft.audio_transcript.trim().length >= 3)
  const videoDescMissing = !!draft.video_file && !(draft.video_description && draft.video_description.trim().length >= 3)

  const attachmentCount = (draft.image_file ? 1 : 0) + (draft.audio_file ? 1 : 0) + (draft.video_file ? 1 : 0)
  const hasAnyAttachment = attachmentCount > 0

  const showDraftSection = hasUserInteraction || hasAnyDraftValue || !!protocol || !!submitError

  async function submitNow() {
    setSubmitError(null)
    setProtocol(null)

    if (!draftReady) {
      setSubmitError('Complete o rascunho (Identificação, Tema e Relato) para enviar.')
      setDraftOpen(true)
      return
    }

    setSubmitBusy(true)
    try {
      const payload: ManifestationCreatePayload = {
        kind: draft.kind!,
        subject: draft.subject!,
        subject_detail: draft.subject_detail!,
        description_text: draft.description_text,
        anonymous: !!draft.anonymous,
        contact_name: draft.contact_name,
        contact_email: draft.contact_email,
        contact_phone: draft.contact_phone,
        audio_transcript: draft.audio_transcript,
        image_alt: draft.image_alt,
        video_description: draft.video_description,
        audio_file: draft.audio_file,
        image_file: draft.image_file,
        video_file: draft.video_file,
      }

      const res = await createManifestation(payload)
      setProtocol(res.protocol)

      const sla = res.initial_response_sla_days ?? 10
      const msg =
        `Protocolo gerado: ${res.protocol}. ` +
        `Prazo inicial de resposta: ${sla} dias. ` +
        `Você pode acompanhar em “Consultar protocolo”.`

      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', text: msg }])
      speakAssistant(msg)

      window.setTimeout(() => {
        navigate(`/protocolos/${res.protocol}`, {
          state: { fromSubmit: true, initialResponseSlaDays: sla },
        })
      }, 700)
    } catch (e: any) {
      setSubmitError(e?.message || 'Falha ao enviar. Verifique o backend e tente novamente.')
      setDraftOpen(true)
    } finally {
      setSubmitBusy(false)
    }
  }

  function applyToForm() {
    saveDraft({
      kind: draft.kind,
      subject: draft.subject,
      subject_detail: draft.subject_detail,
      description_text: draft.description_text,
      anonymous: draft.anonymous,
      contact_name: draft.contact_name,
      contact_email: draft.contact_email,
      contact_phone: draft.contact_phone,
      audio_transcript: draft.audio_transcript,
      image_alt: draft.image_alt,
      video_description: draft.video_description,
    })
    close()
    navigate('/manifestacoes/nova')
  }

  // Habilita “Continuar” quando o usuário atualiza anexos/descrições no painel,
  // mesmo sem digitar uma nova mensagem.
  const draftSig = useMemo(() => draftSignature(draft), [draft])
  const draftDirty = draftSig !== lastSentDraftSigRef.current

  const canSendDraftUpdate =
    !isThinking &&
    draftDirty &&
    !!(draft.image_file || draft.audio_file || draft.video_file) &&
    !imageAltMissing &&
    !audioTranscriptMissing &&
    !videoDescMissing

  const canSend = !isThinking && (input.trim().length > 0 || canSendDraftUpdate)

  const showQuickKinds = !draft.kind && !isThinking
  const showQuickSubject = (!draft.subject || draft.subject.trim().length < 3) && !!draft.kind && !isThinking
  const showQuickSubjectDetail = (!!draft.subject && !draft.subject_detail) && !isThinking

  // Attach handlers
  const addUserNote = useCallback((text: string) => {
    const msg: ChatMessage = { id: uid(), role: 'user', text }
    setMessages((prev) => {
      const next = [...prev, msg]
      // Mantém o ref sincronizado mesmo se o usuário clicar rápido em seguida.
      messagesRef.current = next
      return next
    })
  }, [])

  const setImageFile = useCallback(
    (file?: File) => {
      if (!file) return
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
      const url = URL.createObjectURL(file)
      setImagePreviewUrl(url)

      setDraft((prev) => ({
        ...prev,
        image_file: file,
        // preserve existing alt if user already typed
        image_alt: prev.image_alt,
      }))
      setAttachmentsOpen(true)
      addUserNote(`Anexei uma foto (${file.name}).`)
    },
    [addUserNote, imagePreviewUrl],
  )

  const setAudioFile = useCallback(
    (file?: File) => {
      if (!file) return
      setDraft((prev) => ({
        ...prev,
        audio_file: file,
        audio_transcript: prev.audio_transcript,
      }))
      setAttachmentsOpen(true)
      addUserNote(`Anexei um áudio (${file.name}).`)
    },
    [addUserNote],
  )

  const setVideoFile = useCallback(
    (file?: File) => {
      if (!file) return
      setDraft((prev) => ({
        ...prev,
        video_file: file,
        video_description: prev.video_description,
      }))
      setAttachmentsOpen(true)
      addUserNote(`Anexei um vídeo (${file.name}).`)
    },
    [addUserNote],
  )

  const removeImage = useCallback(() => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    setImagePreviewUrl(null)
    setDraft((prev) => ({ ...prev, image_file: undefined, image_alt: undefined }))
  }, [imagePreviewUrl])

  const removeAudio = useCallback(() => {
    setDraft((prev) => ({ ...prev, audio_file: undefined, audio_transcript: undefined }))
  }, [])

  const removeVideo = useCallback(() => {
    setDraft((prev) => ({ ...prev, video_file: undefined, video_description: undefined }))
  }, [])

  const attachmentHint = useMemo(() => {
    // Mensagem curta e útil; evita siglas.
    if (needs.photo && !draft.image_file) {
      return 'Uma foto pode ajudar. Use o ícone de câmera para anexar.'
    }
    if ((draft.image_file && imageAltMissing) || (draft.audio_file && audioTranscriptMissing) || (draft.video_file && videoDescMissing)) {
      return 'Para acessibilidade, descreva os anexos (isso é obrigatório quando houver arquivo).'
    }
    return null
  }, [needs.photo, draft.image_file, draft.audio_file, draft.video_file, imageAltMissing, audioTranscriptMissing, videoDescMissing])

  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setImageFile(f)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setAudioFile(f)
          e.currentTarget.value = ''
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setVideoFile(f)
          e.currentTarget.value = ''
        }}
      />

      {/* FAB */}
      <motion.button
        type="button"
        aria-label="Abrir chat da IZA"
        className="fixed bottom-6 right-6 z-[60] inline-flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--c-primary))] text-white shadow-[var(--shadow-elev-3)] ring-1 ring-[rgba(var(--c-primary),0.30)] focus-visible:outline-none"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          setOpen(true)
          setHelpOpen(false)
        }}
      >
        <span className="absolute -inset-2 -z-10 rounded-full bg-[rgba(var(--c-primary),0.18)] blur-md" aria-hidden="true" />
        <MessageCircle className="h-7 w-7" aria-hidden="true" />
        <span
          className="absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[rgb(var(--c-primary))] ring-1 ring-[rgba(var(--c-primary),0.25)]"
          aria-hidden="true"
        >
          <span className="h-2 w-2 rounded-full bg-[rgb(var(--c-success))]" />
        </span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
            />

            <motion.div
              role="dialog"
              aria-label="Chat com a IZA"
              className="fixed bottom-24 left-4 right-4 z-[61] flex h-[min(80vh,760px)] flex-col overflow-hidden rounded-2xl border border-[rgba(var(--c-border),0.85)] bg-[rgba(var(--c-surface),0.95)] shadow-[var(--shadow-elev-3)] backdrop-blur-md sm:left-auto sm:right-6 sm:w-[480px]"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-[rgba(var(--c-border),0.75)] bg-[linear-gradient(90deg,rgba(var(--c-primary),0.10),rgba(var(--c-success),0.08),rgba(var(--c-warning),0.08))] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/70 ring-1 ring-[rgba(var(--c-primary),0.22)]">
                      <img src="/brand/iza-1.png" alt="IZA" className="h-full w-full object-cover" loading="lazy" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-base font-extrabold text-[rgb(var(--c-text))]">IZA</p>
                      <p className="truncate text-xs text-[rgba(var(--c-text),0.72)]">Conte o que aconteceu — eu ajudo a preencher</p>
                    </div>
                  </div>

                  {iza.modelStatus === 'loading' && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-[rgba(var(--c-text),0.72)]" aria-live="polite">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>{iza.modelStatusText || 'Conectando…'}</span>
                    </div>
                  )}

                  {iza.modelStatus === 'error' && (
                    <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="text-xs font-semibold text-amber-900">
                        Não consegui iniciar o assistente agora. Vou continuar em modo básico para não travar.
                      </p>
                      {iza.error && <p className="mt-1 text-xs text-amber-900/80">Detalhe: {iza.error}</p>}
                      <div className="mt-2">
                        <Button type="button" variant="secondary" onClick={() => void iza.warmUp()}>
                          Tentar novamente
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    {showTtsControls && (
                      <Button
                        type="button"
                        variant="secondary"
                        title={ttsEnabled ? 'Desativar leitura em voz alta' : 'Ativar leitura em voz alta'}
                        aria-label={ttsEnabled ? 'Desativar leitura em voz alta' : 'Ativar leitura em voz alta'}
                        aria-pressed={ttsEnabled}
                        onClick={() => {
                          setTtsEnabled((v) => !v)
                          if (ttsEnabled) tts.cancel()
                        }}
                      >
                        {ttsEnabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                        <span className="hidden sm:inline">Ouvir</span>
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant={voiceChat ? 'default' : 'secondary'}
                      title={voiceChat ? 'Parar conversa por voz' : 'Conversar por voz'}
                      aria-label={voiceChat ? 'Parar conversa por voz' : 'Conversar por voz'}
                      aria-pressed={voiceChat}
                      onClick={() => {
                        if (!speech.supported) {
                          setMessages((prev) => [
                            ...prev,
                            {
                              id: uid(),
                              role: 'assistant',
                              text: 'Seu navegador não suporta conversa por voz. Você pode continuar digitando normalmente.',
                            },
                          ])
                          return
                        }

                        const next = !voiceChat
                        setVoiceChat(next)

                        if (next) {
                          if (tts.supported && !ttsEnabled) setTtsEnabled(true)
                          try {
                            tts.cancel()
                          } catch {
                            // ignore
                          }
                          lastConsumedSpeechRef.current = ''
                          speech.reset()
                          speech.start()
                        } else {
                          try {
                            speech.abort()
                          } catch {
                            // ignore
                          }
                        }
                      }}
                    >
                      <Mic className={`h-4 w-4 ${voiceChat ? 'animate-pulse' : ''}`} aria-hidden="true" />
                      <span className="hidden sm:inline">Conversar</span>
                    </Button>

                    <Button type="button" variant="ghost" aria-label="Fechar" onClick={close}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>

                  {showTtsControls && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]" htmlFor="iza-tts-rate">
                        Velocidade da voz
                      </label>
                      <input
                        id="iza-tts-rate"
                        type="range"
                        min={0.85}
                        max={1.15}
                        step={0.05}
                        value={ttsRate}
                        onChange={(e) => setTtsRate(Number(e.target.value))}
                        className="w-24"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Body (scroll) */}
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4" tabIndex={0}>
                {/* Ajuda / Quick actions */}
                <div className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.75)] p-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2"
                    onClick={() => setHelpOpen((v) => !v)}
                    aria-expanded={helpOpen}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[rgb(var(--c-primary))]" aria-hidden="true" />
                      <span className="text-sm font-extrabold text-[rgb(var(--c-text))]">Como usar a IZA</span>
                    </div>
                    {helpOpen ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                  </button>

                  {helpOpen && (
                    <div className="mt-3 space-y-3 text-sm text-[rgba(var(--c-text),0.80)]">
                      <p>
                        Escreva (ou fale) o que aconteceu. Eu organizo o rascunho e te aviso o que falta. Para anexos,
                        lembre: <span className="font-semibold">sempre precisa de descrição</span> (acessibilidade).
                      </p>

                      {showQuickKinds && (
                        <div>
                          <p className="text-xs font-extrabold text-[rgba(var(--c-text),0.75)]">Começar pelo tipo:</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(
                              [
                                ['reclamacao', 'Reclamação'],
                                ['denuncia', 'Denúncia'],
                                ['sugestao', 'Sugestão'],
                                ['elogio', 'Elogio'],
                                ['solicitacao', 'Solicitação'],
                              ] as const
                            ).map(([k, label]) => (
                              <Button
                                key={k}
                                type="button"
                                variant="secondary"
                                onClick={() => {
                                  applyDraftPatch({ kind: k })
                                  setMessages((prev) => [
                                    ...prev,
                                    { id: uid(), role: 'user', text: `Tipo: ${label}` },
                                    {
                                      id: uid(),
                                      role: 'assistant',
                                      text:
                                        requiresIdentification(k)
                                          ? 'Perfeito. Para esse tipo, preciso de identificação (nome e e-mail) para retorno. Qual é seu nome completo?'
                                          : 'Certo. Agora me diga o assunto principal (ex.: Infraestrutura, Saúde, Segurança).',
                                    },
                                  ])
                                }}
                              >
                                {label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {showQuickSubject && (
                        <div>
                          <p className="text-xs font-extrabold text-[rgba(var(--c-text),0.75)]">Sugestões de assunto:</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {['Infraestrutura', 'Saúde', 'Segurança', 'Educação', 'Transporte'].map((s) => (
                              <Button key={s} type="button" variant="secondary" onClick={() => applyDraftPatch({ subject: s })}>
                                {s}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {showQuickSubjectDetail && (
                        <div>
                          <p className="text-xs font-extrabold text-[rgba(var(--c-text),0.75)]">Dica:</p>
                          <p className="mt-1 text-sm text-[rgba(var(--c-text),0.80)]">
                            Descreva o tema em poucas palavras (mín. 3 caracteres). Ex.: “Buraco na Rua X”, “Poste apagado”, “Atendimento no posto”.
                          </p>
                        </div>
                      )}

                      {voiceChat && showSpeechControls && (
                        <div className="rounded-xl border border-[rgba(var(--c-primary),0.22)] bg-[rgba(var(--c-primary),0.06)] p-3">
                          <p className="text-xs font-extrabold text-[rgb(var(--c-text))]">Conversa por voz</p>
                          <p className="mt-1 text-xs text-[rgba(var(--c-text),0.75)]">
                            Quando você terminar de falar, eu envio automaticamente. Se eu estiver lendo em voz alta, eu volto a ouvir depois.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Mensagens */}
                <div className="mt-4 space-y-3">
                  {messages.map((m) => {
                    const isUser = m.role === 'user'
                    return (
                      <div key={m.id} className={isUser ? 'flex justify-end' : 'flex items-start gap-2'}>
                        {!isUser && (
                          <span
                            className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/70 ring-1 ring-[rgba(var(--c-primary),0.22)]"
                            aria-hidden="true"
                          >
                            <img src="/brand/iza-1.png" alt="" className="h-full w-full object-cover" loading="lazy" />
                          </span>
                        )}
                        <div
                          className={
                            isUser
                              ? 'max-w-[85%] rounded-2xl border border-[rgba(var(--c-primary),0.22)] bg-[rgba(var(--c-primary),0.10)] px-4 py-3 text-sm text-[rgb(var(--c-text))]'
                              : 'max-w-[85%] rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgb(var(--c-surface))] px-4 py-3 text-sm text-[rgb(var(--c-text))]'
                          }
                        >
                          <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

                          {!isUser && showTtsControls && (
                            <div className="mt-2 flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-9 px-3"
                                onClick={() => speakAssistant(m.text)}
                                aria-label="Ouvir esta mensagem em voz alta"
                              >
                                <Volume2 className="h-4 w-4" aria-hidden="true" />
                                <span className="text-xs font-semibold">Ouvir</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Se o usuário rolou para cima, não forçamos o scroll.
                    Mostramos um atalho claro para voltar ao final. */}
                {unseenCount > 0 && !atBottom && (
                  <div className="sticky bottom-2 z-10 mt-3 flex justify-center">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        scrollToBottom('smooth')
                        setUnseenCount(0)
                        setAtBottom(true)
                      }}
                    >
                      {unseenCount === 1 ? 'Nova mensagem · Ir para o final' : `${unseenCount} novas mensagens · Ir para o final`}
                    </Button>
                  </div>
                )}

                {/* Status (voz) */}
                {speech.interim && voiceChat && (
                  <div className="mt-4 rounded-xl border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.70)] p-3">
                    <p className="text-xs font-extrabold text-[rgb(var(--c-text))]">Ouvindo…</p>
                    <p className="mt-1 text-sm text-[rgba(var(--c-text),0.80)]">{speech.interim}</p>
                  </div>
                )}

                {speech.error && voiceChat && (
                  <div className="mt-3 rounded-xl border border-red-600/30 bg-red-600/10 p-3">
                    <p className="text-xs font-extrabold text-red-900">Não consegui usar o microfone</p>
                    <p className="mt-1 text-xs text-red-900/80">{speech.error}</p>
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          speech.reset()
                          speech.start()
                        }}
                      >
                        Tentar novamente
                      </Button>
                    </div>
                  </div>
                )}

                {/* Rascunho (só mostra depois que o usuário interagir para não confundir) */}
                {showDraftSection && (
                  <div className="mt-4">
                    <details
                      className="rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.85)] p-3"
                      open={draftOpen}
                      onToggle={(e) => setDraftOpen((e.currentTarget as HTMLDetailsElement).open)}
                    >
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Rascunho do formulário</p>
                            <p className="mt-1 text-xs text-[rgba(var(--c-text),0.70)]">{draftSummary || 'Ainda não preenchido'}</p>
                          </div>
                          {draftReady ? <Badge variant="success">Pronto para enviar</Badge> : <Badge variant="warning">Em construção</Badge>}
                        </div>
                      </summary>

                      <div className="mt-3 space-y-3">
                        {derivedMissingRequired.length > 0 && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                            <p className="text-xs font-extrabold text-amber-900">Faltam itens obrigatórios:</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {derivedMissingRequired.map((f) => (
                                <span
                                  key={f}
                                  className="rounded-full border border-amber-500/30 bg-white px-3 py-1 text-xs font-semibold text-amber-900"
                                >
                                  {labelField(f)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {derivedMissingRecommended.length > 0 && (
                          <div className="rounded-xl border border-[rgba(var(--c-primary),0.22)] bg-[rgba(var(--c-primary),0.06)] p-3">
                            <p className="text-xs font-extrabold text-[rgb(var(--c-text))]">Sugestões para fortalecer o relato:</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {derivedMissingRecommended.map((f) => (
                                <span
                                  key={f}
                                  className="rounded-full border border-[rgba(var(--c-primary),0.22)] bg-white px-3 py-1 text-xs font-semibold text-[rgb(var(--c-primary))]"
                                >
                                  {f === 'location'
                                    ? 'Local (onde)'
                                    : f === 'time'
                                      ? 'Quando'
                                      : f === 'impact'
                                        ? 'Impacto'
                                        : f === 'photo'
                                          ? 'Foto (se possível)'
                                          : f}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {protocol && (
                          <div className="rounded-xl border border-[rgba(var(--c-success),0.25)] bg-[rgba(var(--c-success),0.10)] p-3">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                              <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Protocolo: {protocol}</p>
                            </div>
                          </div>
                        )}

                        {submitError && (
                          <div className="rounded-xl border border-red-600/30 bg-red-600/10 p-3">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 text-red-700" aria-hidden="true" />
                              <p className="text-sm font-semibold text-red-900">{submitError}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="secondary" onClick={applyToForm}>
                            Aplicar no formulário
                          </Button>
                          <Button type="button" onClick={() => void submitNow()} disabled={submitBusy || !draftReady}>
                            {submitBusy ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                Enviando…
                              </>
                            ) : (
                              'Enviar e gerar protocolo'
                            )}
                          </Button>
                        </div>
                      </div>
                    </details>
                  </div>
                )}

                <div className="h-2" />
              </div>

              {/* Composer */}
              <div className="border-t border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.92)] p-3">
                {/* Attachments bar */}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className={`h-10 w-10 rounded-full p-0 ${needs.photo && !draft.image_file ? 'ring-2 ring-amber-400/60' : ''}`}
                      aria-label="Anexar foto"
                      title="Anexar foto"
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <ImageIcon className="h-5 w-5" aria-hidden="true" />
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 w-10 rounded-full p-0"
                      aria-label="Anexar áudio"
                      title="Anexar áudio"
                      onClick={() => audioInputRef.current?.click()}
                    >
                      <FileAudio className="h-5 w-5" aria-hidden="true" />
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 w-10 rounded-full p-0"
                      aria-label="Anexar vídeo"
                      title="Anexar vídeo"
                      onClick={() => videoInputRef.current?.click()}
                    >
                      <VideoIcon className="h-5 w-5" aria-hidden="true" />
                    </Button>

                    <button
                      type="button"
                      className={`ml-2 text-xs font-semibold ${hasAnyAttachment ? "text-[rgb(var(--c-primary))]" : "text-[rgba(var(--c-text),0.72)]"} underline underline-offset-2`}
                      onClick={() => setAttachmentsOpen((v) => !v)}
                      aria-expanded={attachmentsOpen}
                    >
                      {attachmentsOpen ? `Ocultar anexos${attachmentCount ? ` (${attachmentCount})` : ''}` : `Anexos${attachmentCount ? ` (${attachmentCount})` : ''}`}
                    </button>
                  </div>

                  {attachmentHint && (
                    <div className="hidden sm:block text-xs text-[rgba(var(--c-text),0.72)]">{attachmentHint}</div>
                  )}
                </div>

                {attachmentsOpen && (
                  <div className="mb-3 rounded-2xl border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.75)] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Anexos e acessibilidade</p>
                        <p className="mt-1 text-xs text-[rgba(var(--c-text),0.72)]">
                          Se você anexar arquivos, é obrigatório descrevê-los (para acessibilidade).
                        </p>
                      </div>
                      <div className="text-xs text-[rgba(var(--c-text),0.70)]">{draft.image_file || draft.audio_file || draft.video_file ? 'Em uso' : 'Opcional'}</div>
                    </div>

                    <div className="mt-3 space-y-3">
                      {/* Image */}
                      {draft.image_file && (
                        <div className="rounded-xl border border-[rgba(var(--c-border),0.70)] bg-white p-3">
                          <div className="flex items-start gap-3">
                            <div className="h-14 w-14 overflow-hidden rounded-xl border border-[rgba(var(--c-border),0.65)] bg-[rgba(var(--c-primary),0.06)]">
                              {imagePreviewUrl ? (
                                <img src={imagePreviewUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <ImageIcon className="h-6 w-6 text-[rgba(var(--c-text),0.55)]" aria-hidden="true" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-bold text-[rgb(var(--c-text))]">
                                  Foto: {stripFileName(draft.image_file.name)}
                                </p>
                                <Button type="button" variant="ghost" className="h-9 w-9 p-0" onClick={removeImage} aria-label="Remover foto">
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>

                              <label className="mt-2 block text-xs font-semibold text-[rgba(var(--c-text),0.75)]" htmlFor="iza-image-alt">
                                Descrição da foto (obrigatório)
                              </label>
                              <Textarea
                                id="iza-image-alt"
                                value={draft.image_alt || ''}
                                onChange={(e) => setDraft((prev) => ({ ...prev, image_alt: e.target.value }))}
                                rows={2}
                                className={imageAltMissing ? 'mt-1 border-red-500/60' : 'mt-1'}
                                placeholder='Ex.: “Foto de buraco na Rua X, em frente ao nº 120, com cones ao lado.”'
                              />
                              {imageAltMissing && (
                                <p className="mt-1 text-xs font-semibold text-red-700">A descrição da foto é obrigatória quando há anexo.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Audio */}
                      {draft.audio_file && (
                        <div className="rounded-xl border border-[rgba(var(--c-border),0.70)] bg-white p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[rgba(var(--c-border),0.65)] bg-[rgba(var(--c-primary),0.06)]">
                              <FileAudio className="h-6 w-6 text-[rgba(var(--c-text),0.55)]" aria-hidden="true" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-bold text-[rgb(var(--c-text))]">
                                  Áudio: {stripFileName(draft.audio_file.name)}
                                </p>
                                <Button type="button" variant="ghost" className="h-9 w-9 p-0" onClick={removeAudio} aria-label="Remover áudio">
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>

                              <label className="mt-2 block text-xs font-semibold text-[rgba(var(--c-text),0.75)]" htmlFor="iza-audio-transcript">
                                Transcrição do áudio (obrigatório)
                              </label>
                              <Textarea
                                id="iza-audio-transcript"
                                value={draft.audio_transcript || ''}
                                onChange={(e) => setDraft((prev) => ({ ...prev, audio_transcript: e.target.value }))}
                                rows={3}
                                className={audioTranscriptMissing ? 'mt-1 border-red-500/60' : 'mt-1'}
                                placeholder="Digite a transcrição do que foi falado."
                              />
                              {audioTranscriptMissing && (
                                <p className="mt-1 text-xs font-semibold text-red-700">A transcrição é obrigatória quando há anexo de áudio.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Video */}
                      {draft.video_file && (
                        <div className="rounded-xl border border-[rgba(var(--c-border),0.70)] bg-white p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[rgba(var(--c-border),0.65)] bg-[rgba(var(--c-primary),0.06)]">
                              <VideoIcon className="h-6 w-6 text-[rgba(var(--c-text),0.55)]" aria-hidden="true" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-bold text-[rgb(var(--c-text))]">
                                  Vídeo: {stripFileName(draft.video_file.name)}
                                </p>
                                <Button type="button" variant="ghost" className="h-9 w-9 p-0" onClick={removeVideo} aria-label="Remover vídeo">
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>

                              <label className="mt-2 block text-xs font-semibold text-[rgba(var(--c-text),0.75)]" htmlFor="iza-video-desc">
                                Descrição do vídeo (obrigatório)
                              </label>
                              <Textarea
                                id="iza-video-desc"
                                value={draft.video_description || ''}
                                onChange={(e) => setDraft((prev) => ({ ...prev, video_description: e.target.value }))}
                                rows={2}
                                className={videoDescMissing ? 'mt-1 border-red-500/60' : 'mt-1'}
                                placeholder='Ex.: “Vídeo mostrando poste apagado na esquina, à noite, por ~10s.”'
                              />
                              {videoDescMissing && (
                                <p className="mt-1 text-xs font-semibold text-red-700">A descrição do vídeo é obrigatória quando há anexo.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {!draft.image_file && !draft.audio_file && !draft.video_file && (
                        <div className="rounded-xl border border-dashed border-[rgba(var(--c-border),0.70)] bg-white p-3 text-sm text-[rgba(var(--c-text),0.72)]">
                          Você pode anexar <span className="font-semibold">foto</span>, <span className="font-semibold">áudio</span> ou <span className="font-semibold">vídeo</span> usando os botões acima.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Composer row */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label htmlFor="iza-input" className="sr-only">Mensagem</label>
                    <Textarea
                      id="iza-input"
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={voiceChat ? 'Conversa por voz ativa — fale normalmente…' : 'Digite aqui (ou use o microfone)…'}
                      rows={2}
                      className="min-h-[52px]"
                    />
                  </div>

                  {showSpeechControls && (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-label={speech.listening ? 'Parar microfone' : 'Iniciar microfone'}
                      onClick={() => {
                        if (speech.listening) speech.stop()
                        else speech.start()
                      }}
                    >
                      <Mic className={`h-4 w-4 ${speech.listening ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    </Button>
                  )}

                  <Button
                    type="button"
                    aria-label={input.trim().length > 0 ? 'Enviar mensagem' : canSendDraftUpdate ? 'Confirmar anexos e continuar' : 'Enviar'}
                    title={input.trim().length > 0 ? 'Enviar' : canSendDraftUpdate ? 'Continuar (anexos atualizados)' : 'Enviar'}
                    onClick={() => void handleSend()}
                    disabled={!canSend}
                  >
                    {input.trim().length > 0 ? (
                      <Send className="h-4 w-4" aria-hidden="true" />
                    ) : canSendDraftUpdate ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[rgba(var(--c-text),0.70)]">
                  <div className="flex items-center gap-2">
                    {voiceChat ? (
                      <span>Conversa por voz: {speech.listening ? 'ouvindo' : isThinking ? 'pensando' : 'pronta'}</span>
                    ) : (
                      <span>{speech.listening ? 'Microfone ligado' : 'Digite ou use o microfone'}</span>
                    )}
                  </div>

                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => {
                      inputRef.current?.focus()
                      scrollToBottom('smooth')
                      setUnseenCount(0)
                      setAtBottom(true)
                    }}
                  >
                    Ir para o final
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
