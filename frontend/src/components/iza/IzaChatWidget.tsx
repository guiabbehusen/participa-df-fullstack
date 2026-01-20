import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Loader2, MessageCircle, Send, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { useIzaBrain, type IzaIntent } from '@/hooks/useIzaBrain'

type ChatRole = 'user' | 'iza'

type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  meta?: { intent?: IzaIntent; confidence?: number; usedFallback?: boolean }
}

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function mapIntentToPrefill(intent: IzaIntent) {
  switch (intent) {
    case 'denuncia_infraestrutura':
      return { kind: 'denuncia', subject: 'Infraestrutura' }
    case 'saúde':
      return { kind: 'reclamacao', subject: 'Saúde' }
    case 'segurança':
      return { kind: 'denuncia', subject: 'Segurança' }
    case 'elogio':
      return { kind: 'elogio', subject: 'Elogio' }
    default:
      return null
  }
}

export function IzaChatWidget() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [localBusy, setLocalBusy] = useState(false)

  const iza = useIzaBrain({
    modelId: 'Xenova/nli-deberta-v3-xsmall',
    timeoutMs: 25000,
    minConfidence: 0.5,
  })

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: uid(),
      role: 'iza',
      text: 'Olá! Eu sou a IZA. Eu rodo no seu dispositivo (sem API keys). Me conte em uma frase o que aconteceu.',
    },
  ])

  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const isThinking = iza.isThinking || localBusy
  const canSend = input.trim().length > 0 && !isThinking

  const lastAssistantMeta = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'iza' && messages[i].meta?.intent) return messages[i].meta
    }
    return null
  }, [messages])

  useEffect(() => {
    if (!open) return

    // aquece o modelo assim que abre (sem travar)
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
    setOpen(false)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isThinking) return

    setInput('')
    setLocalBusy(true)

    const userMsg: ChatMessage = { id: uid(), role: 'user', text }
    const pendingId = uid()
    const pendingMsg: ChatMessage = { id: pendingId, role: 'iza', text: 'IZA está pensando…' }

    setMessages((prev) => [...prev, userMsg, pendingMsg])

    const result = await iza.classifyMessage(text)

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
          },
        }
      }
      return copy
    })

    setLocalBusy(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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

  const quickPrefill = lastAssistantMeta?.intent ? mapIntentToPrefill(lastAssistantMeta.intent) : null

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
              className="fixed bottom-24 left-4 right-4 z-[61] max-h-[72vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/10 backdrop-blur-md shadow-glow sm:left-auto sm:right-6 sm:w-[420px]"
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
                      <p className="truncate text-xs text-slate-200/70">Triagem local · Sem API keys</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant={modelBadge.variant}>{modelBadge.text}</Badge>
                    <Badge variant="info">Acessibilidade</Badge>
                  </div>

                  {iza.modelStatus === 'loading' && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-200/70" aria-live="polite">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      <span>{iza.modelStatusText || 'A IZA está calibrando os circuitos…'}</span>
                    </div>
                  )}

                  {iza.modelStatus === 'error' && (
                    <p className="mt-2 text-xs text-amber-100/90">
                      O modelo não carregou. Continuarei em modo compatível (sem travar o app).
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-white ring-1 ring-white/10 hover:bg-white/10"
                  onClick={close}
                  aria-label="Fechar chat"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {/* Messages */}
              <div ref={listRef} className="max-h-[44vh] space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((m) => {
                  const isUser = m.role === 'user'
                  const confidencePct =
                    m.meta?.confidence != null ? Math.round(m.meta.confidence * 100) : null

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
                          <p className="mt-2 text-[11px] text-slate-200/70">
                            intenção: {m.meta.intent}
                            {confidencePct != null ? ` · ${confidencePct}%` : ''}
                            {m.meta.usedFallback ? ' · fallback' : ''}
                          </p>
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
              </div>

              {/* Quick actions */}
              {quickPrefill && (
                <div className="border-t border-white/10 bg-slate-950/20 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-200/70">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Posso abrir o formulário já preenchido.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        const qs = new URLSearchParams({
                          kind: quickPrefill.kind,
                          subject: quickPrefill.subject,
                        })
                        close()
                        navigate(`/manifestacoes/nova?${qs.toString()}`)
                      }}
                    >
                      Abrir formulário
                    </Button>
                  </div>
                </div>
              )}

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
                  placeholder="Ex.: Tem um buraco enorme na minha rua…"
                  className="min-h-[84px] resize-none"
                />

                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-200/60">
                    Dica: inclua “onde foi” e “quando” para melhor encaminhamento.
                  </p>

                  <Button type="button" onClick={handleSend} disabled={!canSend}>
                    {isThinking ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="h-4 w-4" aria-hidden="true" />
                    )}
                    Enviar
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
