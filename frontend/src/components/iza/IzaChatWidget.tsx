import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Mic,
  Send,
  Sparkles,
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

function isReadyToSubmit(draft: Partial<ManifestationCreatePayload>) {
  const hasCore = !!draft.kind && !!draft.subject && draft.subject.trim().length >= 3
  const hasContent = !!draft.description_text || !!draft.audio_file || !!draft.image_file || !!draft.video_file
  const audioOk = !draft.audio_file || !!(draft.audio_transcript && draft.audio_transcript.trim().length > 0)
  return hasCore && hasContent && audioOk
}

export function IzaChatWidget() {
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')

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

  // Conversa por voz (hands-free): STT -> LLM -> TTS -> STT...
  const [voiceChat, setVoiceChat] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('iza_voice_chat') === 'true'
  })

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: 'assistant',
      text: 'Olá! Eu sou a IZA. Posso te ajudar a registrar uma manifestação. Me conte o que aconteceu, onde e quando — você pode digitar ou falar.',
    },
  ])

  const [draft, setDraft] = useState<Partial<ManifestationCreatePayload>>({})
  const [needs, setNeeds] = useState<{ photo?: boolean; location?: boolean; time?: boolean }>({})

  const [submitBusy, setSubmitBusy] = useState(false)
  const [protocol, setProtocol] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const iza = useIzaBrain({ autoWarmUp: false })
  const isThinking = iza.isThinking

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

  // Quando abrir, tenta conectar ao Ollama e foca input.
  useEffect(() => {
    if (!open) return
    iza.warmUp().catch(() => {})
    const t = window.setTimeout(() => inputRef.current?.focus(), 140)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open])

  function close() {
    try {
      speech.abort()
    } catch {
      // ignore
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
    speech.start()
  }, [open, voiceChat, speech.supported, speech.listening, speech.start, isThinking, ttsEnabled, tts.speaking])

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

  function speakAssistant(text: string) {
    if (!ttsEnabled || !tts.supported) {
      // Mesmo sem TTS, em modo voz a gente tenta voltar a ouvir.
      window.setTimeout(() => maybeStartListening(), 150)
      return
    }

    // Evita eco: não escutar enquanto fala
    if (speech.listening) speech.abort()

    tts.speak(text, {
      rate: ttsRate,
      onEnd: () => {
        window.setTimeout(() => maybeStartListening(), 180)
      },
    })
  }

  function toApiMessages(nextMessages: ChatMessage[]) {
    // Removemos mensagens vazias e mantemos o histórico recente.
    return nextMessages
      .filter((m) => (m.text || '').trim().length > 0)
      .slice(-18)
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
    }))

    setDraft((prev) => {
      const next: Partial<ManifestationCreatePayload> = { ...prev }

      const kind = coerceKind(patch.kind)
      if (kind) next.kind = kind

      if (typeof patch.subject === 'string' && patch.subject.trim()) {
        next.subject = patch.subject.trim().slice(0, 120)
      }

      if (typeof patch.anonymous === 'boolean') next.anonymous = patch.anonymous

      if (typeof patch.description_text === 'string' && patch.description_text.trim()) {
        const t = patch.description_text.trim()
        if (!next.description_text) next.description_text = t
        else if (!next.description_text.includes(t)) next.description_text = `${next.description_text}\n\n${t}`
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

    // Otimista: adiciona mensagens
    setMessages((prev) => [...prev, userMsg, pendingMsg])

    const historyForApi = toApiMessages([...messages, userMsg])

    const res = await iza.chat(historyForApi, draft)

    // Atualiza mensagem pendente
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

    // Fala em voz alta (se habilitado)
    speakAssistant(res.assistant_message)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    await handleSendText(text)
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

  const modelBadge =
    iza.modelStatus === 'ready'
      ? { text: 'LLM pronta (Ollama)', variant: 'success' as const }
      : iza.modelStatus === 'loading'
        ? { text: 'Conectando…', variant: 'warning' as const }
        : iza.modelStatus === 'error'
          ? { text: 'Modo compatível', variant: 'default' as const }
          : { text: 'IZA', variant: 'default' as const }

  const showTtsControls = tts.supported
  const showSpeechControls = speech.supported

  const draftReady = isReadyToSubmit(draft)

  const draftSummary = useMemo(() => {
    const parts: string[] = []
    if (draft.kind) parts.push(`Tipo: ${draft.kind}`)
    if (draft.subject) parts.push(`Assunto: ${draft.subject}`)
    if (draft.anonymous) parts.push('Anônimo: sim')
    if (needs.photo) parts.push('Sugere foto')
    if (needs.location) parts.push('Falta local')
    if (needs.time) parts.push('Falta quando')
    return parts.join(' · ')
  }, [draft.anonymous, draft.kind, draft.subject, needs.location, needs.photo, needs.time])

  async function submitNow() {
    setSubmitError(null)
    setProtocol(null)

    if (!draftReady) {
      setSubmitError('Complete o rascunho (tipo, assunto e relato) para enviar.')
      return
    }

    setSubmitBusy(true)
    try {
      const payload: ManifestationCreatePayload = {
        kind: draft.kind!,
        subject: draft.subject!,
        description_text: draft.description_text,
        anonymous: !!draft.anonymous,
        audio_transcript: draft.audio_transcript,
        image_alt: draft.image_alt,
        video_description: draft.video_description,
        audio_file: draft.audio_file,
        image_file: draft.image_file,
        video_file: draft.video_file,
      }

      const res = await createManifestation(payload)
      setProtocol(res.protocol)

      const msg = `Protocolo gerado: ${res.protocol}. Você pode acompanhar em “Consultar protocolo”.`
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', text: msg }])
      speakAssistant(msg)
    } catch (e: any) {
      setSubmitError(e?.message || 'Falha ao enviar. Verifique o backend e tente novamente.')
    } finally {
      setSubmitBusy(false)
    }
  }

  function applyToForm() {
    saveDraft({
      kind: draft.kind,
      subject: draft.subject,
      description_text: draft.description_text,
      anonymous: draft.anonymous,
      audio_transcript: draft.audio_transcript,
      image_alt: draft.image_alt,
      video_description: draft.video_description,
    })
    close()
    navigate('/manifestacoes/nova')
  }

  const canSend = input.trim().length > 0 && !isThinking

  return (
    <>
      {/* FAB */}
      <motion.button
        type="button"
        aria-label="Abrir chat da IZA"
        className="fixed bottom-6 right-6 z-[60] inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-white/10 focus-visible:outline-none"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen(true)}
      >
        <span className="absolute -inset-2 -z-10 rounded-full bg-blue-600/20 blur-md" aria-hidden="true" />
        <MessageCircle className="h-6 w-6" aria-hidden="true" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[60] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
            />

            <motion.div
              role="dialog"
              aria-label="Chat com a IZA"
              className="fixed bottom-24 left-4 right-4 z-[61] max-h-[78vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/10 backdrop-blur-md shadow-glow sm:left-auto sm:right-6 sm:w-[460px]"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-slate-950/30 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/10">
                      <Bot className="h-4 w-4 text-white" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">IZA · Assistente</p>
                      <p className="truncate text-xs text-slate-200/70">
                        LLM local via Ollama · Voz (STT) · Leitura (TTS)
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={modelBadge.variant}>{modelBadge.text}</Badge>
                    <Badge variant="info">Acessibilidade</Badge>
                    {showTtsControls && <Badge variant="default">TTS</Badge>}
                    {showSpeechControls && <Badge variant="default">Voz</Badge>}
                  </div>

                  {iza.modelStatus === 'loading' && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-200/70" aria-live="polite">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>{iza.modelStatusText || 'Conectando…'}</span>
                    </div>
                  )}

                  {iza.modelStatus === 'error' && (
                    <div className="mt-2 rounded-lg bg-amber-500/10 p-2 ring-1 ring-amber-400/20">
                      <p className="text-xs text-amber-100">
                        Não consegui usar o Ollama agora. Vou continuar em modo compatível.
                      </p>
                      {iza.error && <p className="mt-1 text-xs text-amber-100/80">Detalhe: {iza.error}</p>}
                      <div className="mt-2 flex gap-2">
                        <Button variant="secondary" type="button" onClick={() => iza.warmUp()}>
                          Tentar novamente
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    type="button"
                    aria-label={ttsEnabled ? 'Desativar leitura em voz alta' : 'Ativar leitura em voz alta'}
                    onClick={() => setTtsEnabled((v) => !v)}
                  >
                    {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </Button>

                  <Button variant="ghost" type="button" aria-label="Fechar" onClick={close}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Messages */}
              <div ref={listRef} className="max-h-[46vh] overflow-y-auto px-4 py-3">
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                      <div
                        className={
                          m.role === 'user'
                            ? 'max-w-[86%] rounded-2xl bg-blue-600 px-4 py-3 text-sm text-white shadow shadow-blue-600/20'
                            : 'max-w-[86%] rounded-2xl bg-white/10 px-4 py-3 text-sm text-slate-50 ring-1 ring-white/10'
                        }
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                        {m.role === 'assistant' && m.meta?.intent && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="default">
                              <Sparkles className="h-3 w-3" aria-hidden="true" />
                              {m.meta.intent}
                            </Badge>
                            {m.meta.model && <Badge variant="default">{m.meta.model}</Badge>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {isThinking && (
                    <div className="flex items-center gap-2 text-xs text-slate-200/70" aria-live="polite">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>IZA está pensando…</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Draft / Actions */}
              <div className="border-t border-white/10 bg-slate-950/20 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-50">Rascunho</p>
                    <p className="mt-0.5 truncate text-xs text-slate-200/70">
                      {draftSummary || 'Ainda não tenho informações suficientes.'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={draftReady ? 'success' : 'warning'}>
                      {draftReady ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Pronto para enviar
                        </>
                      ) : (
                        'Em preenchimento'
                      )}
                    </Badge>
                  </div>
                </div>

                {submitError && (
                  <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                    {submitError}
                  </div>
                )}

                {protocol && (
                  <div className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                    Protocolo gerado: <span className="font-semibold">{protocol}</span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" type="button" onClick={applyToForm}>
                    Abrir formulário
                  </Button>
                  <Button type="button" disabled={!draftReady || submitBusy} onClick={() => void submitNow()}>
                    {submitBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Enviar e gerar protocolo
                  </Button>
                </div>

                {/* Composer */}
                <div className="mt-4 flex items-end gap-2">
                  <div className="flex-1">
                    <Textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKeyDown}
                      rows={2}
                      placeholder={voiceChat ? 'Fale ou digite… (Conversa por voz ativada)' : 'Digite sua mensagem…'}
                      aria-label="Mensagem"
                    />

                    {speech.interim && voiceChat && (
                      <p className="mt-1 text-xs text-slate-200/60" aria-live="polite">
                        Ouvindo: {speech.interim}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      variant="secondary"
                      type="button"
                      aria-label={voiceChat ? 'Desativar conversa por voz' : 'Ativar conversa por voz'}
                      onClick={() => setVoiceChat((v) => !v)}
                      disabled={!showSpeechControls}
                    >
                      <Sparkles className="h-4 w-4" />
                      Voz
                    </Button>

                    <Button
                      variant="secondary"
                      type="button"
                      aria-label={speech.listening ? 'Parar microfone' : 'Falar agora'}
                      onClick={() => {
                        if (!showSpeechControls) return
                        if (speech.listening) speech.stop()
                        else speech.start()
                      }}
                      disabled={!showSpeechControls || isThinking}
                    >
                      <Mic className="h-4 w-4" />
                      {speech.listening ? 'Parar' : 'Falar'}
                    </Button>

                    <Button type="button" onClick={() => void handleSend()} disabled={!canSend}>
                      <Send className="h-4 w-4" />
                      Enviar
                    </Button>
                  </div>
                </div>

                {/* TTS rate */}
                {showTtsControls && (
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-200/70">Velocidade da voz</p>
                    <input
                      type="range"
                      min={0.85}
                      max={1.15}
                      step={0.05}
                      value={ttsRate}
                      onChange={(e) => setTtsRate(Number(e.target.value))}
                      className="w-40"
                      aria-label="Velocidade da voz"
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
