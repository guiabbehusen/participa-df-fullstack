import { useCallback, useEffect, useRef, useState } from 'react'

import { izaChat, izaHealth, type IzaChatMessage, type IzaDraftPatch, type IzaIntent } from '@/services/api/iza'
import type { ManifestationCreatePayload } from '@/types/manifestation'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

type IzaMode = 'online' | 'simulated'

export type IzaBrainReply = {
  provider: 'ollama' | 'simulated'
  model: string
  assistant_message: string
  intent: IzaIntent
  draft_patch: IzaDraftPatch
  missing_required_fields: string[]
  missing_recommended_fields: string[]
  can_submit: boolean
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
    promise.then(resolve, reject).finally(() => window.clearTimeout(t))
  })
}

function normalizeText(s: string) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(text: string, needles: string[]) {
  for (const n of needles) {
    if (text.includes(n)) return true
  }
  return false
}

function looksLikeDraftUpdateMessage(text: string) {
  const t = normalizeText(text)
  return t.startsWith('atualizei os anexos no rascunho') || t.startsWith('atualizei o rascunho')
}

function lastUserText(messages: IzaChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'user') return (m.content || '').trim()
  }
  return ''
}

// ---- Intent & Kind inference (offline simulation) ----
function fallbackIntent(text: string): IzaIntent {
  const t = normalizeText(text)

  if (includesAny(t, ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'e aí', 'hello'])) {
    return 'cumprimento'
  }

  // Elogio
  if (includesAny(t, ['elogio', 'parabens', 'parabéns', 'muito bom', 'otimo', 'ótimo', 'excelente', 'agradeco', 'agradeço'])) {
    return 'elogio'
  }

  // Segurança
  if (
    includesAny(t, [
      'assalto',
      'roubo',
      'furto',
      'violencia',
      'violência',
      'ameaça',
      'ameaca',
      'crime',
      'arma',
      'tiro',
      'drogas',
      'trafico',
      'tráfico',
      'policia',
      'polícia',
    ])
  ) {
    return 'segurança'
  }

  // Saúde
  if (includesAny(t, ['saude', 'saúde', 'hospital', 'posto', 'ubs', 'upa', 'consulta', 'medico', 'médico', 'vacina', 'atendimento', 'fila'])) {
    return 'saúde'
  }

  // Infraestrutura
  if (
    includesAny(t, [
      'buraco',
      'rua',
      'asfalto',
      'pavimentacao',
      'pavimentação',
      'calcada',
      'calçada',
      'poste',
      'iluminacao',
      'iluminação',
      'sem luz',
      'bueiro',
      'esgoto',
      'lixo',
      'entulho',
      'tapa buraco',
    ])
  ) {
    return 'denuncia_infraestrutura'
  }

  return 'cumprimento'
}

function inferKindFromText(text: string): ManifestationCreatePayload['kind'] {
  const t = normalizeText(text)

  if (includesAny(t, ['denuncia', 'denúncia', 'corrupcao', 'corrupção', 'irregularidade', 'fraude', 'desvio', 'assedio', 'assédio', 'abuso'])) {
    return 'denuncia'
  }

  if (includesAny(t, ['elogio', 'parabens', 'parabéns', 'agradeco', 'agradeço', 'obrigado', 'obrigada'])) {
    return 'elogio'
  }

  if (includesAny(t, ['sugestao', 'sugestão', 'sugiro', 'poderia', 'seria bom', 'recomendo'])) {
    return 'sugestao'
  }

  if (includesAny(t, ['solicito', 'solicitacao', 'solicitação', 'preciso', 'quero solicitar', 'gostaria de solicitar', 'por favor', 'peço'])) {
    return 'solicitacao'
  }

  // fallback
  return 'reclamacao'
}

function inferSubjectAndDetail(text: string): { subject: string; detail: string } {
  const t = normalizeText(text)

  // Infra
  if (includesAny(t, ['buraco', 'asfalto', 'pavimentacao', 'pavimentação', 'tapa buraco'])) {
    return { subject: 'Infraestrutura', detail: 'Buraco na via / pavimentação' }
  }
  if (includesAny(t, ['poste', 'iluminacao', 'iluminação', 'sem luz', 'lampada', 'lâmpada', 'apagado'])) {
    return { subject: 'Infraestrutura', detail: 'Iluminação pública' }
  }
  if (includesAny(t, ['lixo', 'entulho', 'limpeza', 'coleta'])) {
    return { subject: 'Infraestrutura', detail: 'Limpeza urbana' }
  }
  if (includesAny(t, ['calcada', 'calçada', 'rampa', 'acessibilidade'])) {
    return { subject: 'Infraestrutura', detail: 'Calçadas / acessibilidade urbana' }
  }

  // Saúde
  if (includesAny(t, ['hospital', 'posto', 'ubs', 'upa', 'atendimento', 'consulta', 'medico', 'médico', 'fila', 'exame'])) {
    return { subject: 'Saúde', detail: 'Atendimento em unidade de saúde' }
  }

  // Segurança
  if (includesAny(t, ['assalto', 'roubo', 'furto', 'violencia', 'violência', 'ameaça', 'ameaca', 'drogas', 'trafico', 'tráfico', 'policia', 'polícia'])) {
    return { subject: 'Segurança', detail: 'Ocorrência / policiamento' }
  }

  // Educação
  if (includesAny(t, ['escola', 'professor', 'merenda', 'matricula', 'matrícula', 'creche', 'aula'])) {
    return { subject: 'Educação', detail: 'Serviço/atendimento escolar' }
  }

  // Elogio
  if (includesAny(t, ['elogio', 'parabens', 'parabéns'])) {
    return { subject: 'Elogio', detail: 'Elogio ao serviço' }
  }

  return { subject: 'Outro', detail: 'Assunto não especificado' }
}

function hasLocationHints(text: string) {
  const t = normalizeText(text)
  return includesAny(t, ['rua ', 'avenida', 'av ', 'quadra', 'lote', 'setor', 'bairro', 'cep', 'regiao', 'região', 'ra ', 'em frente', 'proximo', 'próximo'])
}

function hasTimeHints(text: string) {
  const t = normalizeText(text)
  return (
    includesAny(t, ['hoje', 'ontem', 'amanha', 'amanhã', 'segunda', 'terca', 'terça', 'quarta', 'quinta', 'sexta', 'sabado', 'sábado', 'domingo']) ||
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(t) ||
    /\b\d{1,2}:\d{2}\b/.test(t)
  )
}

function hasImpactHints(text: string) {
  const t = normalizeText(text)
  return includesAny(t, ['perigo', 'perigoso', 'risco', 'acidente', 'atrapalha', 'dificulta', 'impacto', 'prejudica', 'prejudicando'])
}

function simulateIzaReply(messages: IzaChatMessage[], draft: Partial<ManifestationCreatePayload>): IzaBrainReply {
  const lastUser = lastUserText(messages)
  const analysisText = normalizeText(`${draft?.description_text || ''} ${looksLikeDraftUpdateMessage(lastUser) ? '' : lastUser}`)

  const intent = fallbackIntent(analysisText)
  const inferredKind = inferKindFromText(analysisText)
  const { subject, detail } = inferSubjectAndDetail(analysisText)

  const hasImage = !!draft?.image_file
  const hasAudio = !!draft?.audio_file
  const hasVideo = !!draft?.video_file

  const needsPhoto = subject === 'Infraestrutura' && !hasImage && !hasVideo
  const needsLocation = !hasLocationHints(analysisText)
  const needsTime = !hasTimeHints(analysisText)
  const needsImpact = !hasImpactHints(analysisText)

  const patch: IzaDraftPatch = {
    // Sinalizadores de checklist (UX)
    needs_photo: needsPhoto,
    needs_location: needsLocation,
    needs_time: needsTime,
    needs_impact: needsImpact,
  }

  // Só sugere tipo/assunto/tema se ainda não foram escolhidos
  if (!draft?.kind) patch.kind = inferredKind
  if (!draft?.subject || draft.subject.trim().length < 3) patch.subject = subject
  if (!draft?.subject_detail || draft.subject_detail.trim().length < 3) patch.subject_detail = detail

  // Anexa o relato do usuário ao rascunho (sem sobrescrever, a UI faz append/dedup)
  if (lastUser && !looksLikeDraftUpdateMessage(lastUser)) {
    patch.description_text = lastUser
  }

  const missingRecommended: string[] = []
  if (needsLocation) missingRecommended.push('local')
  if (needsTime) missingRecommended.push('quando')
  if (needsImpact) missingRecommended.push('impacto')
  if (needsPhoto) missingRecommended.push('foto/vídeo')

  // Mensagem do assistente (simulada)
  let assistant_message = ''

  if (intent === 'cumprimento') {
    assistant_message =
      'Oi! Eu sou a IZA. Me conte o que aconteceu (o quê, onde e quando) e, se tiver, anexe foto, vídeo ou áudio. Eu organizo o relato e preencho o formulário.'
  } else if (intent === 'elogio') {
    assistant_message =
      'Que bom! Para registrar seu elogio, me diga qual órgão/serviço você quer elogiar, onde foi e quando aconteceu. Se quiser acompanhar a resposta depois, é necessário se identificar.'
  } else if (intent === 'saúde') {
    assistant_message =
      'Entendi que é um tema de saúde. Você pode me dizer qual unidade/serviço, onde foi, quando ocorreu e como isso te afetou? Se tiver documento, foto ou áudio, pode anexar.'
  } else if (intent === 'segurança') {
    assistant_message =
      'Entendi que é um tema de segurança. Para ajudar no encaminhamento, informe o local, quando ocorreu e qualquer referência importante. Se houver prova (foto, vídeo ou documento), você pode anexar.'
  } else {
    // Infraestrutura
    if (needsPhoto) {
      assistant_message =
        'Entendi que é um tema de infraestrutura. Uma foto ou vídeo ajuda muito. Você consegue anexar? Se preferir, descreva o local com pontos de referência (rua, número, bairro/RA).'
    } else if (hasImage && !draft?.image_alt) {
      assistant_message =
        'Recebi a imagem. Para acessibilidade, me diga uma descrição curta do que aparece na foto (ex.: “Foto de buraco na Rua X, em frente ao nº 120”).'
    } else if (hasAudio && !draft?.audio_transcript) {
      assistant_message =
        'Recebi o áudio. Para acessibilidade, preciso de uma transcrição. Você pode confirmar o texto (ou ajustar se necessário) antes de enviar?'
    } else if (hasVideo && !draft?.video_description) {
      assistant_message =
        'Recebi o vídeo. Para acessibilidade, preciso de uma descrição curta do que ele mostra (ex.: “Vídeo mostrando poste apagado na esquina, à noite, por ~10s”).'
    } else {
      const asks: string[] = []
      if (needsLocation) asks.push('onde aconteceu (rua, número, bairro/RA e referência)')
      if (needsTime) asks.push('quando ocorreu (data/horário)')
      if (needsImpact) asks.push('qual foi o impacto (risco, acidentes, prejuízo)')

      assistant_message =
        asks.length > 0 ? `Certo. Para concluir, me diga ${asks.join(', ')}.` : 'Perfeito. Se quiser, revise o tipo/assunto sugeridos e confirme para gerar o protocolo.'
    }
  }

  const can_submit = Boolean(
    (draft?.kind || patch.kind) &&
      (draft?.subject || patch.subject) &&
      (draft?.subject_detail || patch.subject_detail) &&
      ((draft?.description_text && draft.description_text.trim().length >= 3) || hasImage || hasAudio || hasVideo)
  )

  return {
    provider: 'simulated',
    model: 'simulacao-local',
    assistant_message,
    intent,
    draft_patch: patch,
    missing_required_fields: [],
    missing_recommended_fields: missingRecommended,
    can_submit,
  }
}

export function useIzaBrain({ autoWarmUp = true }: { autoWarmUp?: boolean } = {}) {
  const [mode, setMode] = useState<IzaMode>('simulated')

  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelStatusText, setModelStatusText] = useState<string>('')
  const [modelName, setModelName] = useState<string>('Simulação')
  const [error, setError] = useState<string | null>(null)
  const [isThinking, setIsThinking] = useState(false)

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const warmUp = useCallback(async () => {
    // Mesmo que falhe, não quebramos o app: caímos em simulação.
    setModelStatus('loading')
    setModelStatusText('Conectando ao assistente…')
    setError(null)

    try {
      const health = await withTimeout(izaHealth(), 1400, 'health')
      if (!mountedRef.current) return

      if (health?.ok && health?.ollama) {
        setMode('online')
        setModelName(health.model || 'Ollama')
        setModelStatus('ready')
        setModelStatusText('')
        setError(null)
        return
      }

      // Backend responde, mas o modelo/serviço não está disponível.
      setMode('simulated')
      setModelName('Simulação')
      setModelStatus('ready')
      setModelStatusText('')
      setError(health?.error || null)
    } catch {
      if (!mountedRef.current) return
      setMode('simulated')
      setModelName('Simulação')
      setModelStatus('ready')
      setModelStatusText('')
      setError(null)
    }
  }, [])

  useEffect(() => {
    if (!autoWarmUp) return
    warmUp().catch(() => {})
  }, [autoWarmUp, warmUp])

  const resetModel = useCallback(() => {
    // Volta para o estado inicial (simulação) e deixa o warmUp tentar novamente quando abrir.
    setMode('simulated')
    setModelName('Simulação')
    setModelStatus('idle')
    setModelStatusText('')
    setError(null)
  }, [])

  const chat = useCallback(
    async (messages: IzaChatMessage[], draft: Partial<ManifestationCreatePayload>): Promise<IzaBrainReply> => {
      setIsThinking(true)
      try {
        if (mode === 'online') {
          try {
            const res = await izaChat(messages, draft)
            return {
              ...res,
              provider: 'ollama',
              model: res.model || modelName || 'Ollama',
            }
          } catch {
            // Cai para simulação sem travar a experiência.
            if (mountedRef.current) {
              setMode('simulated')
              setModelName('Simulação')
              setModelStatus('ready')
              setModelStatusText('')
              setError(null)
            }
            return simulateIzaReply(messages, draft)
          }
        }

        return simulateIzaReply(messages, draft)
      } finally {
        if (mountedRef.current) setIsThinking(false)
      }
    },
    [mode, modelName]
  )

  return {
    mode,
    modelStatus,
    modelStatusText,
    modelName,
    error,
    isThinking,
    warmUp,
    resetModel,
    chat,
  }
}
