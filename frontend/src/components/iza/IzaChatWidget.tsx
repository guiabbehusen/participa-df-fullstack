import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Mic,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { createManifestation } from '@/services/api/manifestations'
import { saveDraft } from '@/services/storage/draft'
import type { ManifestationCreatePayload, ManifestationKind } from '@/types/manifestation'
import { useIzaBrain, type IzaIntent } from '@/hooks/useIzaBrain'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { useTts } from '@/hooks/useTts'

type ChatRole = 'user' | 'iza'

type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  meta?: { intent?: IzaIntent; confidence?: number; usedFallback?: boolean; modelLabel?: string; silent?: boolean }
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function looksLikeLocation(text: string) {
  const t = normalize(text)
  return /(rua|avenida|av\.|quadra|lote|setor|bairro|cep|taguatinga|ceilandia|sobradinho|plano piloto|asa sul|asa norte|samambaia|gama)/.test(
    t,
  )
}

function looksLikeTime(text: string) {
  const t = normalize(text)
  return /(hoje|ontem|agora|manha|tarde|noite|\d{1,2}\/\d{1,2}(\/\d{2,4})?|\d{1,2}:\d{2})/.test(t)
}

function subjectFromIntent(intent: IzaIntent, userText: string): string | undefined {
  const t = normalize(userText)
  if (intent === 'denuncia_infraestrutura') {
    if (/buraco/.test(t)) return 'Buraco na via pública'
    if (/iluminacao|luz|poste/.test(t)) return 'Iluminação pública'
    if (/calcada/.test(t)) return 'Calçada / acessibilidade urbana'
    if (/esgoto|bueiro/.test(t)) return 'Esgoto / drenagem'
    return 'Infraestrutura urbana'
  }
  if (intent === 'saúde') return 'Saúde'
  if (intent === 'segurança') return 'Segurança'
  if (intent === 'elogio') return 'Elogio'
  return undefined
}

function kindFromIntent(intent: IzaIntent): ManifestationKind | undefined {
  switch (intent) {
    case 'denuncia_infraestrutura':
      return 'solicitacao'
    case 'saúde':
      return 'reclamacao'
    case 'segurança':
      return 'denuncia'
    case 'elogio':
      return 'elogio'
    default:
      return undefined
  }
}

function mergeDescription(prev: string | undefined, userText: string) {
  const t = userText.trim()
  if (!t) return prev

  // Se parece localização ou tempo, rotula (melhora leitura no protocolo)
  if (looksLikeLocation(t)) {
    return prev ? `${prev}\nLocal: ${t}` : `Local: ${t}`
  }
  if (looksLikeTime(t)) {
    return prev ? `${prev}\nQuando: ${t}` : `Quando: ${t}`
  }
  return prev ? `${prev}\nDetalhe: ${t}` : t
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
  const [localBusy, setLocalBusy] = useState(false)

  // Acessibilidade: leitura em voz alta (sem API keys)
  const tts = useTts('pt-BR')
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('iza_tts_enabled') === 'true'
  })
  const [ttsRate, setTtsRate] = useState<number>(() => {
    if (typeof window === 'undefined') return 1
    const raw = window.localStorage.getItem('iza_tts_rate')
    const n = raw ? Number(raw) : 1
    return Number.isFinite(n) ? Math.max(0.8, Math.min(1.2, n)) : 1
  })

  // Voz: Speech-to-Text (ditado)
  const speech = useSpeechRecognition({ lang: 'pt-BR', interimResults: true, continuous: false })
  const lastConsumedSpeechRef = useRef<string>('')

  const [voiceChat, setVoiceChat] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('iza_voice_chat') === 'true'
  })

  // "Boot" da conversa por voz: evita que o auto-start do STT capture o próprio TTS
  const [voiceBooting, setVoiceBooting] = useState(false)

  // Registro por áudio (mídia real)
  const [audioRecording, setAudioRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const [recordedAudio, setRecordedAudio] = useState<File | null>(null)

  const recordedAudioUrl = useMemo(() => {
    if (!recordedAudio) return null
    return URL.createObjectURL(recordedAudio)
  }, [recordedAudio])

  useEffect(() => {
    return () => {
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl)
    }
  }, [recordedAudioUrl])

  const iza = useIzaBrain({
    modelId: 'Xenova/nli-deberta-v3-xsmall',
    timeoutMs: 60000,
    minConfidence: 0.55,
  })

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: 'iza',
      text: 'Olá! Eu sou a IZA. Você pode digitar ou usar o microfone para ditar. Me conte em uma frase o que aconteceu.',
    },
  ])

  // Rascunho inteligente (para aplicar no formulário ou enviar direto)
  const [draft, setDraft] = useState<Partial<ManifestationCreatePayload>>({})
  const [submitBusy, setSubmitBusy] = useState(false)
  const [protocol, setProtocol] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const isThinking = iza.isThinking || localBusy
  const canSend = input.trim().length > 0 && !isThinking

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

  // Se o usuário ativar "Conversa por voz", garantir que a IZA possa falar (TTS)
  useEffect(() => {
    if (!open) return
    if (!voiceChat) return
    if (tts.supported && !ttsEnabled) setTtsEnabled(true)
  }, [open, tts.supported, ttsEnabled, voiceChat])

  // Ao desativar conversa por voz, pare o microfone imediatamente
  useEffect(() => {
    if (!open) return
    if (voiceChat) return
    if (speech.listening) speech.abort()
  }, [open, speech.abort, speech.listening, voiceChat])


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
    stopAudioRecording()
    setOpen(false)
  }

  function pushIza(text: string, meta?: ChatMessage['meta']) {
    setMessages((prev) => [...prev, { id: uid(), role: 'iza', text, meta }])

    // TTS: leitura em voz alta (acessibilidade).
    // Em "Conversa por voz", garantimos que o microfone não esteja capturando enquanto a IZA fala.
    if (ttsEnabled && tts.supported && !meta?.silent) {
      if (voiceChat && speech.listening) speech.abort()
      tts.speak(text, { rate: ttsRate })
    }
  }

  function applySuggestion(userText: string, intent: IzaIntent) {
    setDraft((prev) => {
      const next: Partial<ManifestationCreatePayload> = { ...prev }

      const kind = kindFromIntent(intent)
      if (kind && !next.kind) next.kind = kind

      const subject = subjectFromIntent(intent, userText)
      if (subject && (!next.subject || next.subject.trim().length < 3)) next.subject = subject

      // sempre melhora descrição
      next.description_text = mergeDescription(next.description_text, userText)

      return next
    })
  }

  async function handleSendText(text: string) {
    const raw = text.trim()
    if (!raw || isThinking) return

    setLocalBusy(true)

    const userMsg: ChatMessage = { id: uid(), role: 'user', text: raw }
    const pendingId = uid()
    const pendingMsg: ChatMessage = { id: pendingId, role: 'iza', text: 'IZA está pensando…' }

    setMessages((prev) => [...prev, userMsg, pendingMsg])

    const result = await iza.classifyMessage(raw)

    // atualiza o balão pendente com resposta real
    setMessages((prev) => {
      const copy = [...prev]
      const idx = copy.findIndex((m) => m.id === pendingId)
      if (idx >= 0) {
        copy[idx] = {
          id: pendingId,
          role: 'iza',
          text: result.reply,
          meta: {
            intent: result.intent,
            confidence: result.confidence,
            usedFallback: result.usedFallback,
            modelLabel: result.modelLabel,
          },
        }
      }
      return copy
    })

    // Atualiza rascunho com base no intent (e também usa suggestion do hook quando existir)
    applySuggestion(raw, result.intent)
    if (result.suggestion) {
      setDraft((prev) => ({
        ...prev,
        anonymous: result.suggestion?.anonymous ?? prev.anonymous,
        kind: prev.kind ?? result.suggestion?.kind,
        subject: prev.subject ?? result.suggestion?.subject,
      }))
    }

    setLocalBusy(false)

    // opcional: hands-free continua (o usuário só fala e o sistema envia)
    if (voiceChat) {
      // dica de continuidade por voz
      // (não dispara nada automaticamente aqui; o mic é controlado pelo usuário)
    }
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    await handleSendText(text)
  }

  // Consumir ditado quando terminar
  useEffect(() => {
    if (!open) return
    if (speech.listening) return

    const txt = (speech.finalText || '').trim()
    if (!txt) return
    if (txt === lastConsumedSpeechRef.current) return

    lastConsumedSpeechRef.current = txt
    speech.reset()

    if (voiceChat) {
      // Conversa por voz: envia direto (sem depender do textarea)
      void handleSendText(txt)
      return
    }

    // Ditado tradicional: coloca no input para o usuário revisar antes de enviar
    setInput((prev) => (prev ? `${prev} ${txt}` : txt))
  }, [open, speech.finalText, speech.listening, voiceChat])

  // Modo conversa por voz:
  // - Escuta -> processa -> fala (TTS) -> volta a escutar
  useEffect(() => {
    if (!open) return
    if (!voiceChat) return
    if (!speech.supported) return
    if (voiceBooting) return
    if (isThinking) return
    if (ttsEnabled && tts.speaking) return
    if (speech.listening) return

    // Start listening for the next turn
    speech.start()
  }, [open, voiceChat, speech.supported, speech.listening, voiceBooting, isThinking, ttsEnabled, tts.speaking, speech.start])



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
      ? { text: 'IA local pronta', variant: 'success' as const }
      : iza.modelStatus === 'loading'
        ? { text: 'Carregando IA', variant: 'warning' as const }
        : iza.modelStatus === 'error'
          ? { text: 'Modo compatível', variant: 'default' as const }
          : { text: 'IA local', variant: 'default' as const }

  const showTtsControls = tts.supported
  const showSpeechControls = speech.supported

  const draftReady = isReadyToSubmit(draft)

  const draftSummary = useMemo(() => {
    const parts: string[] = []
    if (draft.kind) parts.push(`Tipo: ${draft.kind}`)
    if (draft.subject) parts.push(`Assunto: ${draft.subject}`)
    if (draft.anonymous) parts.push('Anônimo: sim')
    if (draft.audio_file) parts.push('Áudio: anexado')
    return parts.join(' · ')
  }, [draft.anonymous, draft.audio_file, draft.kind, draft.subject])

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

      pushIza(`Protocolo gerado: ${res.protocol}. Você pode acompanhar em “Consultar protocolo”.`)
    } catch (e: any) {
      setSubmitError(e?.message || 'Falha ao enviar. Verifique o backend e tente novamente.')
    } finally {
      setSubmitBusy(false)
    }
  }

  function applyToForm() {
    // Persistir apenas campos textuais (arquivos não vão no rascunho por limites do browser)
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

  async function startAudioRecording() {
    setSubmitError(null)
    if (audioRecording) return

    if (!navigator.mediaDevices?.getUserMedia) {
      setSubmitError('Gravação de áudio indisponível neste navegador.')
      return
    }
    if (!window.MediaRecorder) {
      setSubmitError('MediaRecorder indisponível neste navegador.')
      return
    }

    try {
      // Para evitar sobreposição de voz
      tts.cancel()

      // Reseta transcript e inicia STT ao mesmo tempo
      speech.reset()
      speech.start()

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      audioChunksRef.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm'
        const blob = new Blob(audioChunksRef.current, { type: mime })
        const file = new File([blob], `manifestacao-${Date.now()}.webm`, { type: mime })
        setRecordedAudio(file)

        // encerra tracks do microfone
        try {
          mediaStreamRef.current?.getTracks()?.forEach((t) => t.stop())
        } catch {
          // ignore
        }
        mediaStreamRef.current = null
        mediaRecorderRef.current = null
        audioChunksRef.current = []
      }

      recorder.start()
      setAudioRecording(true)
    } catch {
      setSubmitError('Não foi possível acessar o microfone.')
      stopAudioRecording()
    }
  }

  function stopAudioRecording() {
    if (!audioRecording) return
    try {
      mediaRecorderRef.current?.stop()
    } catch {
      // ignore
    }
    try {
      speech.stop()
    } catch {
      // ignore
    }
    setAudioRecording(false)
  }

  // Quando terminar a gravação + transcrição, atualiza o rascunho com o áudio e transcrição
  useEffect(() => {
    if (!recordedAudio) return

    const transcript = (speech.finalText || '').trim()
    setDraft((prev) => ({
      ...prev,
      audio_file: recordedAudio,
      audio_transcript: transcript || prev.audio_transcript,
      // se ainda não há descrição, usa transcrição
      description_text: prev.description_text || transcript || prev.description_text,
    }))
  }, [recordedAudio, speech.finalText])

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
              className="fixed bottom-24 left-4 right-4 z-[61] max-h-[78vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/10 backdrop-blur-md shadow-glow sm:left-auto sm:right-6 sm:w-[440px]"
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
                        IA local de intenção · Voz (STT) · Leitura (TTS)
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={modelBadge.variant}>{modelBadge.text}</Badge>
                    {iza.runtimeWasmPaths && (
                      <Badge variant="default">
                        {iza.runtimeWasmPaths.includes('/vendor/xenova')
                          ? 'Runtime local'
                          : iza.runtimeWasmPaths.includes('http')
                            ? 'Runtime CDN'
                            : 'Runtime'}
                      </Badge>
                    )}
                    <Badge variant="info">Acessibilidade</Badge>
                    {showTtsControls && <Badge variant="default">TTS</Badge>}
                    {showSpeechControls && <Badge variant="default">Voz</Badge>}
                  </div>

                  {iza.modelStatus === 'loading' && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-200/70" aria-live="polite">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>{iza.modelStatusText || 'A IZA está calibrando os circuitos…'}</span>
                    </div>
                  )}

                  {iza.modelStatus === 'error' && (
                    <div className="mt-2 rounded-lg bg-amber-500/10 p-2 ring-1 ring-amber-400/20">
                      <p className="text-xs text-amber-100/90">
                        Não consegui inicializar a IA local. Vou continuar em modo compatível para não travar.
                      </p>
                      {iza.error && (
                        <p className="mt-1 break-words text-[11px] text-amber-100/80">Detalhe: {iza.error}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            iza.resetModel()
                            void iza.warmUp()
                          }}
                        >
                          Tentar novamente
                        </Button>
                      </div>
                    </div>
                  )}

                  {speech.error && (
                    <p className="mt-2 text-xs text-amber-100/90">
                      Voz: {speech.error}. Você ainda pode digitar normalmente.
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* TTS toggle */}
                  {showTtsControls && (
                    <>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10"
                        aria-label={ttsEnabled ? 'Desativar leitura em voz alta' : 'Ativar leitura em voz alta'}
                        aria-pressed={ttsEnabled}
                        onClick={() => {
                          setTtsEnabled((prev) => {
                            const next = !prev
                            if (next) tts.speak('Leitura em voz alta ativada.', { rate: ttsRate })
                            else tts.cancel()
                            return next
                          })
                        }}
                      >
                        {ttsEnabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
                      </button>

                      {ttsEnabled && tts.speaking && (
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10"
                          aria-label="Parar leitura"
                          onClick={() => tts.cancel()}
                        >
                          <Square className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10"
                    onClick={close}
                    aria-label="Fechar chat"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Voice + rascunho (diferencial de UX) */}
              <div className="border-b border-white/10 bg-slate-950/20 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-200/70">
                    {draftSummary ? (
                      <span className="inline-flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                        <span className="truncate">{draftSummary}</span>
                      </span>
                    ) : (
                      <span>Dica: conte o problema e eu monto um rascunho para você.</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {showSpeechControls && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-md bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 hover:bg-white/10"
                        onClick={() => {
                          const next = !voiceChat
                          setVoiceChat(next)

                          if (next) {
                            // 1) Garante TTS
                            if (tts.supported && !ttsEnabled) setTtsEnabled(true)

                            // 2) Evita eco: fala primeiro, escuta depois
                            setVoiceBooting(true)
                            try {
                              speech.abort()
                            } catch {
                              // ignore
                            }
                            tts.cancel()

                            const hint =
                              'Conversa por voz ativada. Fale normalmente. Eu vou responder em voz alta e montar o rascunho da sua manifestação.'

                            pushIza(hint, { silent: true })

                            if (tts.supported) {
                              tts.speak(hint, {
                                rate: ttsRate,
                                onEnd: () => {
                                  setVoiceBooting(false)
                                  // Só inicia se ainda estiver aberto e em modo voz
                                  try {
                                    speech.reset()
                                    speech.start()
                                  } catch {
                                    // ignore
                                  }
                                },
                                onError: () => setVoiceBooting(false),
                              })
                            } else {
                              setVoiceBooting(false)
                              try {
                                speech.reset()
                                speech.start()
                              } catch {
                                // ignore
                              }
                            }
                          } else {
                            setVoiceBooting(false)
                            try {
                              speech.abort()
                            } catch {
                              // ignore
                            }
                            tts.cancel()
                            pushIza('Conversa por voz desativada. Você pode digitar ou usar “Ditado”.', { silent: true })
                          }
                        }}
                        aria-pressed={voiceChat}
                        aria-label={voiceChat ? 'Desativar conversa por voz' : 'Ativar conversa por voz'}
                      >
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        {voiceChat ? (speech.listening ? 'Voz: Ouvindo…' : 'Voz: ON') : 'Voz: OFF'}
                      </button>
                    )}

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setDraft({})
                        setRecordedAudio(null)
                        setProtocol(null)
                        setSubmitError(null)
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Limpar rascunho
                    </Button>
                  </div>
                </div>

                {submitError && <p className="mt-2 text-xs text-amber-100/90">{submitError}</p>}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={applyToForm} disabled={!draft.kind || !draft.subject}>
                    Aplicar no formulário
                  </Button>

                  <Button type="button" onClick={submitNow} disabled={!draftReady || submitBusy}>
                    {submitBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    Enviar e gerar protocolo
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      close()
                      navigate('/protocolos/' + encodeURIComponent(protocol || ''))
                    }}
                    disabled={!protocol}
                  >
                    Consultar protocolo
                  </Button>
                </div>

                {recordedAudio && (
                  <div className="mt-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-200/70">
                        Áudio anexado (para registro por áudio). Transcrição: {draft.audio_transcript ? 'ok' : 'pendente'}
                      </p>
                      <button
                        type="button"
                        className="text-xs text-white/80 underline"
                        onClick={() => {
                          setRecordedAudio(null)
                          setDraft((p) => ({ ...p, audio_file: undefined, audio_transcript: p.audio_transcript }))
                        }}
                      >
                        Remover
                      </button>
                    </div>

                    <audio className="mt-2 w-full" controls src={recordedAudioUrl || undefined} />
                  </div>
                )}
              </div>

              {/* Messages */}
              <div ref={listRef} className="max-h-[40vh] space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((m) => {
                  const isUser = m.role === 'user'
                  const confidencePct = m.meta?.confidence != null ? Math.round(m.meta.confidence * 100) : null

                  return (
                    <div key={m.id} className={isUser ? 'flex justify-end' : 'flex justify-start'}>
                      <div
                        className={
                          isUser
                            ? 'max-w-[88%] rounded-2xl bg-blue-600 px-4 py-3 text-sm text-white shadow shadow-blue-600/20'
                            : 'max-w-[88%] rounded-2xl bg-slate-950/40 px-4 py-3 text-sm text-white ring-1 ring-white/10'
                        }
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>

                        {!isUser && m.meta?.intent && (
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="text-[11px] text-slate-200/70">
                              intenção: {m.meta.intent}
                              {confidencePct != null ? ` · ${confidencePct}%` : ''}
                              {m.meta.usedFallback ? ' · fallback' : ''}
                            </p>

                            {showTtsControls && (
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 rounded-md bg-white/5 px-2 py-1 text-[11px] text-white ring-1 ring-white/10 hover:bg-white/10"
                                onClick={() => tts.speak(m.text, { rate: ttsRate })}
                                aria-label="Ouvir esta mensagem"
                              >
                                <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Ouvir
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {isThinking && (
                  <p className="text-xs text-slate-200/70" aria-live="polite">
                    IZA está pensando…
                  </p>
                )}

                {speech.listening && (
                  <p className="text-xs text-slate-200/70" aria-live="polite">
                    Ouvindo… {speech.interim ? `“${speech.interim}”` : ''}
                  </p>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-white/10 bg-slate-950/30 px-4 py-3">
                <label htmlFor="iza-input" className="sr-only">
                  Digite sua mensagem
                </label>

                <Textarea
                  ref={inputRef}
                  id="iza-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={3}
                  placeholder="Ex.: Tem um buraco enorme na minha rua… (ou clique no microfone)"
                  className="min-h-[84px] resize-none"
                />

                {/* Controls */}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {showSpeechControls && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          if (speech.listening) speech.stop()
                          else {
                            // parar TTS para não competir com o mic
                            tts.cancel()
                            speech.reset()
                            speech.start()
                          }
                        }}
                        aria-label={speech.listening ? 'Parar ditado' : 'Iniciar ditado'}
                      >
                        <Mic className="h-4 w-4" aria-hidden="true" />
                        {speech.listening ? 'Parar' : 'Ditado'}
                      </Button>
                    )}

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (audioRecording) stopAudioRecording()
                        else void startAudioRecording()
                      }}
                      aria-label={audioRecording ? 'Parar gravação de áudio' : 'Gravar áudio para registro'}
                    >
                      <Paperclip className="h-4 w-4" aria-hidden="true" />
                      {audioRecording ? 'Parar gravação' : 'Registrar por áudio'}
                    </Button>
                  </div>

                  <Button type="button" onClick={handleSend} disabled={!canSend}>
                    {isThinking ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden="true" />
                    )}
                    Enviar
                  </Button>
                </div>

                {/* Hints */}
                <p className="mt-2 text-[11px] text-slate-200/60">
                  Atalho: diga “rua/bairro/cep” para localização e “hoje/ontem/horário” para tempo. A IZA formata isso no rascunho.
                </p>

                {!showSpeechControls && (
                  <p className="mt-2 text-[11px] text-slate-200/60">
                    Ditado indisponível neste navegador (use digitação).
                  </p>
                )}
              </div>

              {/* TTS fine-tuning */}
              {showTtsControls && ttsEnabled && (
                <div className="border-t border-white/10 bg-slate-950/20 px-4 py-2">
                  <label className="flex items-center justify-between gap-3 text-xs text-slate-200/70">
                    <span>Velocidade da voz</span>
                    <span className="tabular-nums">{ttsRate.toFixed(2)}x</span>
                  </label>
                  <input
                    type="range"
                    min={0.8}
                    max={1.2}
                    step={0.05}
                    value={ttsRate}
                    onChange={(e) => setTtsRate(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-500"
                    aria-label="Velocidade da leitura em voz alta"
                  />
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}