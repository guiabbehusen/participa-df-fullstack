import { useCallback, useEffect, useRef, useState } from 'react'

import { izaChat, izaHealth, type IzaChatMessage, type IzaDraftPatch, type IzaIntent } from '@/services/api/iza'
import type { ManifestationCreatePayload, ManifestationKind } from '@/types/manifestation'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

export type { IzaIntent }

export type IzaBrainReply = {
  assistant_message: string
  intent: IzaIntent
  can_submit: boolean
  draft_patch?: IzaDraftPatch | null
  missing_required_fields?: string[]
  missing_recommended_fields?: string[]
  provider: 'ollama'
  model: string
}

type UseIzaBrainOptions = {
  /** tenta conectar no Ollama automaticamente ao abrir o widget */
  autoWarmUp?: boolean
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function fallbackIntent(text: string): IzaIntent {
  const t = normalize(text)
  if (/(^|\b)(oi|ola|bom dia|boa tarde|boa noite|eae)(\b|$)/.test(t)) return 'cumprimento'
  if (/(parabens|obrigad|gostei|excelente|otimo|maravilhos|elogio)/.test(t)) return 'elogio'
  if (/(roubo|furto|assalto|amea(c|ç)a|violencia|tiro|arma|vandalismo|barulho)/.test(t)) return 'segurança'
  if (/(hospital|posto|sus|remedio|medic|dengue|fila|vacina|atendimento)/.test(t)) return 'saúde'
  return 'denuncia_infraestrutura'
}

function kindFromIntent(intent: IzaIntent): ManifestationKind {
  switch (intent) {
    case 'saúde':
      return 'reclamacao'
    case 'segurança':
      return 'denuncia'
    case 'elogio':
      return 'elogio'
    case 'cumprimento':
      return 'solicitacao'
    case 'denuncia_infraestrutura':
    default:
      return 'solicitacao'
  }
}

function fallbackAssistant(text: string): IzaBrainReply {
  const intent = fallbackIntent(text)
  const kind = kindFromIntent(intent)

  const assistant_message =
    intent === 'cumprimento'
      ? 'Olá! Eu sou a IZA. Me diga em uma frase o que aconteceu e, se possível, onde e quando.'
      : intent === 'elogio'
        ? 'Entendi que você quer registrar um elogio. Você poderia dizer qual serviço e em qual local?'
        : intent === 'saúde'
          ? 'Entendi que é um tema de saúde. Me diga onde aconteceu e quando, por favor.'
          : intent === 'segurança'
            ? 'Entendi que é um tema de segurança. Me diga onde e quando ocorreu. Se houver risco imediato, procure os canais de emergência.'
            : 'Entendi que é infraestrutura. Para esse tipo de caso, uma foto ajuda muito. Você consegue dizer a localização e anexar uma imagem?'

  return {
    assistant_message,
    intent,
    can_submit: false,
    draft_patch: {
      kind,
      subject: intent === 'denuncia_infraestrutura' ? 'Infraestrutura urbana' : intent,
      needs_location: true,
      needs_time: true,
      needs_impact: true,
      needs_photo: intent === 'denuncia_infraestrutura',
    },
    provider: 'ollama',
    model: 'offline-fallback',
  }
}

/**
 * useIzaBrain (modo Ollama)
 * - Conecta no backend (/api/iza) que conversa com o Ollama local
 * - Retorna um patch de rascunho do formulário para auto-preenchimento
 * - Mantém fallback determinístico se o Ollama não estiver disponível
 */
export function useIzaBrain(options: UseIzaBrainOptions = {}) {
  const { autoWarmUp = true } = options

  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelStatusText, setModelStatusText] = useState('Pronto.')
  const [error, setError] = useState<string | null>(null)
  const [modelName, setModelName] = useState<string>('')
  const [isThinking, setIsThinking] = useState(false)

  const triedWarmUpRef = useRef(false)

  const warmUp = useCallback(async () => {
    setModelStatus('loading')
    setModelStatusText('Preparando assistente…')
    setError(null)

    try {
      const res = await izaHealth()
      if (res?.ok) {
        setModelStatus('ready')
        setModelStatusText('Assistente pronto.')
        setModelName(String(res?.model || 'ollama'))
        setError(null)
        return
      }
      setModelStatus('error')
      setModelStatusText('Modo compatível.')
      setError(String(res?.error || 'Assistente indisponível.'))
    } catch (e: any) {
      setModelStatus('error')
      setModelStatusText('Modo compatível.')
      setError(e?.message ? String(e.message) : 'Não consegui iniciar o assistente.')
    }
  }, [])

  useEffect(() => {
    if (!autoWarmUp) return
    if (triedWarmUpRef.current) return
    triedWarmUpRef.current = true
    warmUp().catch(() => {})
  }, [autoWarmUp, warmUp])

  const resetModel = useCallback(() => {
    setModelStatus('idle')
    setModelStatusText('Pronto.')
    setError(null)
    setModelName('')
    setIsThinking(false)
    triedWarmUpRef.current = false
  }, [])

  const chat = useCallback(
    async (messages: IzaChatMessage[], draft?: Partial<ManifestationCreatePayload>): Promise<IzaBrainReply> => {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

      setIsThinking(true)
      try {
        const res = await izaChat(messages, (draft as any) ?? undefined)
        setModelStatus('ready')
        setModelStatusText('Assistente pronto.')
        setModelName(res.model)
        setError(null)

        return {
          assistant_message: res.assistant_message,
          intent: res.intent,
          can_submit: res.can_submit,
          draft_patch: res.draft_patch ?? null,
          missing_required_fields: res.missing_required_fields ?? undefined,
          missing_recommended_fields: res.missing_recommended_fields ?? undefined,
          provider: 'ollama',
          model: res.model,
        }
      } catch (e: any) {
        // Se o Ollama falhar, volte ao fallback para manter o app funcional.
        setModelStatus('error')
        setModelStatusText('Modo compatível.')
        setError(e?.message ? String(e.message) : 'Falha ao chamar o assistente.')
        return fallbackAssistant(lastUser)
      } finally {
        setIsThinking(false)
      }
    },
    [],
  )

  return {
    modelStatus,
    modelStatusText,
    error,
    modelName,
    isThinking,
    warmUp,
    resetModel,
    chat,
  }
}
