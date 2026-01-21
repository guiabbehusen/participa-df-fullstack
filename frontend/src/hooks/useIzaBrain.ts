import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ManifestationKind } from '@/types/manifestation'

export type IzaIntent =
  | 'denuncia_infraestrutura'
  | 'saúde'
  | 'segurança'
  | 'elogio'
  | 'cumprimento'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

type WorkerOutMessage =
  | { type: 'MODEL_STATUS'; payload: any }
  | { type: 'MODEL_READY'; payload?: { wasmPaths?: string } }
  | { type: 'CLASSIFY_RESULT'; payload: { id: number; output: any } }
  | { type: 'ERROR'; payload: { message: string; where: 'init' | 'classify' } }

type UseIzaBrainOptions = {
  modelId?: string
  minConfidence?: number
  timeoutMs?: number
}

export type IzaFormSuggestion = {
  kind?: ManifestationKind
  subject?: string
  anonymous?: boolean
  needsPhoto?: boolean
  needsLocation?: boolean
  needsTime?: boolean
}

export type IzaClassifyResult = {
  intent: IzaIntent
  confidence: number
  reply: string
  usedFallback: boolean
  modelLabel?: string
  suggestion?: IzaFormSuggestion
  raw?: unknown
}

/**
 * Labels descritivos (em PT-BR) melhoram muito zero-shot.
 * A gente mapeia o label vencedor -> intent interno.
 */
const INTENT_LABELS: Array<{ intent: IzaIntent; label: string }> = [
  {
    intent: 'denuncia_infraestrutura',
    label: 'Infraestrutura urbana (buraco, asfalto, calçada, iluminação, poste, esgoto, bueiro)',
  },
  { intent: 'saúde', label: 'Saúde (posto, hospital, atendimento, fila, medicamentos, vacina)' },
  { intent: 'segurança', label: 'Segurança (violência, roubo, furto, ameaça, vandalismo, barulho)' },
  { intent: 'elogio', label: 'Elogio (feedback positivo, agradecimento, elogiar serviço)' },
  { intent: 'cumprimento', label: 'Cumprimento / ajuda geral (oi, olá, preciso de ajuda)' },
]

const LABEL_TO_INTENT = new Map(INTENT_LABELS.map((x) => [x.label, x.intent]))
const MODEL_LABELS = INTENT_LABELS.map((x) => x.label)

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function detectAnonymous(text: string): boolean | undefined {
  const t = normalize(text)
  if (/(anonim|sem me identificar|nao quero me identificar|prefiro nao me identificar)/.test(t)) return true
  if (/(pode me identificar|nao precisa ser anonimo|pode ser publico)/.test(t)) return false
  return undefined
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

function fallbackIntent(text: string): { intent: IzaIntent; confidence: number } {
  const t = normalize(text)

  if (/(^|\b)(oi|ola|bom dia|boa tarde|boa noite|eae)(\b|$)/.test(t)) {
    return { intent: 'cumprimento', confidence: 0.78 }
  }

  if (/(parabens|obrigad|gostei|excelente|otimo|maravilhos|elogio)/.test(t)) {
    return { intent: 'elogio', confidence: 0.74 }
  }

  if (/(roubo|furto|assalto|amea(c|ç)a|violencia|tiro|arma|vandalismo|barulho)/.test(t)) {
    return { intent: 'segurança', confidence: 0.72 }
  }

  if (/(hospital|posto|sus|remedio|medic|dengue|fila|vacina|atendimento)/.test(t)) {
    return { intent: 'saúde', confidence: 0.68 }
  }

  if (/(buraco|asfalto|iluminacao|luz|calcada|esgoto|bueiro|sinalizacao|poste)/.test(t)) {
    return { intent: 'denuncia_infraestrutura', confidence: 0.72 }
  }

  return { intent: 'denuncia_infraestrutura', confidence: 0.52 }
}

function suggestionFor(intent: IzaIntent, text: string): IzaFormSuggestion {
  const anon = detectAnonymous(text)
  const needLocation = !looksLikeLocation(text)
  const needTime = !looksLikeTime(text)

  switch (intent) {
    case 'denuncia_infraestrutura':
      return {
        kind: 'solicitacao',
        subject: 'Infraestrutura urbana',
        anonymous: anon,
        needsPhoto: /buraco|poste|luz|iluminacao|calcada|asfalto|bueiro|esgoto/i.test(text),
        needsLocation: needLocation,
        needsTime: needTime,
      }
    case 'saúde':
      return {
        kind: 'reclamacao',
        subject: 'Saúde',
        anonymous: anon,
        needsLocation: needLocation,
        needsTime: needTime,
      }
    case 'segurança':
      return {
        kind: 'denuncia',
        subject: 'Segurança',
        anonymous: anon,
        needsLocation: needLocation,
        needsTime: needTime,
      }
    case 'elogio':
      return {
        kind: 'elogio',
        subject: 'Elogio',
        anonymous: anon,
        needsLocation: needLocation,
        needsTime: needTime,
      }
    case 'cumprimento':
    default:
      return { anonymous: anon }
  }
}

function replyFor(intent: IzaIntent, confidence: number, suggestion: IzaFormSuggestion) {
  const pct = Math.round(confidence * 100)

  const askBits: string[] = []
  if (suggestion.needsLocation) askBits.push('onde aconteceu (rua/bairro/ponto de referência)')
  if (suggestion.needsTime) askBits.push('quando ocorreu (data/horário aproximados)')

  const ask = askBits.length ? `\n\nPara encaminhar bem, me diga ${askBits.join(' e ')}.` : ''

  switch (intent) {
    case 'cumprimento':
      return 'Olá! Eu sou a IZA. Fale em uma frase o que aconteceu (ou clique no microfone para ditar).'

    case 'elogio':
      return `Identifiquei um elogio (confiança ${pct}%). Você quer registrar oficialmente?${ask}`

    case 'saúde':
      return `Entendi que é um tema de saúde (confiança ${pct}%).${ask}\n\nSe tiver documentos/fotos (ex.: fila, aviso), anexar ajuda.`

    case 'segurança':
      return `Entendi que é um tema de segurança (confiança ${pct}%).${ask}\n\nSe houver risco imediato, procure os canais de emergência. Aqui eu ajudo no registro.`

    case 'denuncia_infraestrutura':
    default:
      if (confidence >= 0.5 && suggestion.needsPhoto) {
        return `Entendi que é infraestrutura (confiança ${pct}%). Para esse tipo de caso, uma foto ajuda muito. Você consegue anexar uma imagem?${ask}`
      }
      return `Entendi que é infraestrutura (confiança ${pct}%).${ask}\n\nSe tiver foto/vídeo, anexar melhora o encaminhamento.`
  }
}

function parseZeroShot(output: any): { label: string; score: number; labels: string[]; scores: number[] } | null {
  if (!output) return null
  const o = Array.isArray(output) ? output[0] : output

  const labels: string[] = Array.isArray(o?.labels) ? o.labels : []
  const scores: number[] = Array.isArray(o?.scores) ? o.scores : []

  if (!labels.length || !scores.length) return null

  return { label: String(labels[0]), score: Number(scores[0] ?? 0), labels, scores }
}

export function useIzaBrain(options: UseIzaBrainOptions = {}) {
  const { modelId = 'Xenova/nli-deberta-v3-xsmall', minConfidence = 0.55, timeoutMs = 12000 } = options

  const [modelStatus, setModelStatus] = useState<ModelStatus>('idle')
  const [modelProgress, setModelProgress] = useState<number | null>(null)
  const [modelStatusText, setModelStatusText] = useState('Pronto para iniciar.')
  const [error, setError] = useState<string | null>(null)
  const [runtimeWasmPaths, setRuntimeWasmPaths] = useState<string | null>(null)
  const [isThinking, setIsThinking] = useState(false)

  const modelStatusRef = useRef<ModelStatus>('idle')
  useEffect(() => {
    modelStatusRef.current = modelStatus
  }, [modelStatus])

  const workerRef = useRef<Worker | null>(null)
  const initPromiseRef = useRef<Promise<void> | null>(null)

  const seqRef = useRef(0)
  const pendingRef = useRef(new Map<number, { resolve: (o: unknown) => void; reject: (e: Error) => void }>())

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current

    // Worker classic (arquivo estático em /public/workers). Isso evita problemas de bundler
    // com ONNX Runtime/transformers e melhora compatibilidade em dev/prod.
    const worker = new Worker('/workers/iza.worker.js')
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data

      if (msg.type === 'MODEL_STATUS') {
        const payload = msg.payload as any

        if (typeof payload?.progress === 'number') {
          setModelProgress(Math.max(0, Math.min(1, payload.progress)))
        }

        if (typeof payload?.status === 'string') {
          const s = payload.status
          if (s === 'initiate') setModelStatusText('Preparando…')
          else if (s === 'download') setModelStatusText('Baixando modelo…')
          else if (s === 'progress') setModelStatusText('Carregando…')
          else if (s === 'done') setModelStatusText('Finalizando…')
          else setModelStatusText('Preparando…')
        }
        return
      }

      if (msg.type === 'MODEL_READY') {
        const wp = (msg as any).payload?.wasmPaths
        if (wp) setRuntimeWasmPaths(String(wp))
        setModelStatus('ready')
        setModelProgress(null)
        setModelStatusText('IZA pronta.')
        setError(null)
        return
      }

      if (msg.type === 'CLASSIFY_RESULT') {
        const { id, output } = msg.payload
        const pending = pendingRef.current.get(id)
        if (pending) {
          pendingRef.current.delete(id)
          pending.resolve(output)
        }
        return
      }

      if (msg.type === 'ERROR') {
        const message = msg.payload?.message || 'Falha ao carregar o modelo.'
        setModelStatus('error')
        setError(message)
        setModelProgress(null)
        setModelStatusText('Modo compatível ativado.')
        return
      }
    }

    worker.onerror = (ev) => {
      // ErrorEvent.message costuma trazer detalhe útil (ex.: falha ao carregar script/asset)
      const msg = (ev as ErrorEvent)?.message || 'Falha ao iniciar o Worker da IZA.'
      setModelStatus('error')
      setError(msg)
      setModelStatusText('Modo compatível ativado.')
    }

    return worker
  }, [])

  const warmUp = useCallback(async () => {
    if (modelStatusRef.current === 'ready') return
    if (initPromiseRef.current) return initPromiseRef.current

    setModelStatus('loading')
    setModelStatusText('A IZA está calibrando os circuitos…')
    setError(null)
    setModelProgress(null)

    const worker = ensureWorker()

    initPromiseRef.current = new Promise<void>((resolve) => {
      // Em vez de marcar erro por timeout, apenas damos um "aviso de lentidão".
      // O modelo pode demorar na 1ª vez (download + cache).
      const slowTimer = window.setTimeout(() => {
        setModelStatusText(
          'Primeira carga do modelo pode demorar. Você pode continuar — eu uso modo compatível até finalizar.',
        )
      }, timeoutMs)

      const onReady = (event: MessageEvent<WorkerOutMessage>) => {
        const msg = event.data
        if (msg.type === 'MODEL_READY' || msg.type === 'ERROR') {
          window.clearTimeout(slowTimer)
          worker.removeEventListener('message', onReady as any)
          resolve()
        }
      }

      worker.addEventListener('message', onReady as any)
      worker.postMessage({ type: 'INIT', payload: { modelId } })
    })

    return initPromiseRef.current
  }, [ensureWorker, modelId, timeoutMs])

  const classifyMessage = useCallback(
    async (text: string): Promise<IzaClassifyResult> => {
      const raw = text.trim()
      if (!raw) {
        return {
          intent: 'cumprimento',
          confidence: 0.5,
          reply: 'Me diga em poucas palavras o que aconteceu, por favor.',
          usedFallback: true,
        }
      }

      // Se o modelo falhou, usa fallback determinístico.
      if (modelStatusRef.current === 'error') {
        const fb = fallbackIntent(raw)
        const sug = suggestionFor(fb.intent, raw)
        return {
          intent: fb.intent,
          confidence: fb.confidence,
          reply: replyFor(fb.intent, fb.confidence, sug),
          usedFallback: true,
          suggestion: sug,
        }
      }

      setIsThinking(true)
      try {
        // Tenta usar IA local sem travar: espera um pouco; se ainda não estiver pronta, cai para modo compatível.
        await Promise.race([warmUp().catch(() => {}), new Promise((r) => window.setTimeout(r, 2200))])

        if (modelStatusRef.current === 'error') {
          const fb = fallbackIntent(raw)
          const sug = suggestionFor(fb.intent, raw)
          return {
            intent: fb.intent,
            confidence: fb.confidence,
            reply: replyFor(fb.intent, fb.confidence, sug),
            usedFallback: true,
            suggestion: sug,
          }
        }


        if (modelStatusRef.current !== 'ready') {
          const fb = fallbackIntent(raw)
          const sug = suggestionFor(fb.intent, raw)
          return {
            intent: fb.intent,
            confidence: fb.confidence,
            reply:
              replyFor(fb.intent, fb.confidence, sug) +
              '\n\n(Estou carregando meu modelo local — assim que terminar, minhas classificações ficam mais precisas.)',
            usedFallback: true,
            suggestion: sug,
          }
        }

        const worker = ensureWorker()
        const id = ++seqRef.current

        const output = await new Promise<unknown>((resolve, reject) => {
          const t = window.setTimeout(() => {
            pendingRef.current.delete(id)
            reject(new Error('Timeout na classificação.'))
          }, 15000)

          pendingRef.current.set(id, {
            resolve: (o) => {
              window.clearTimeout(t)
              resolve(o)
            },
            reject: (e) => {
              window.clearTimeout(t)
              reject(e)
            },
          })

          worker.postMessage({ type: 'CLASSIFY', payload: { id, text: raw, labels: MODEL_LABELS } })
        })

        const parsed = parseZeroShot(output)

        if (parsed) {
          const modelLabel = parsed.label
          const topScore = Math.max(0, Math.min(1, parsed.score || 0))
          const mapped = LABEL_TO_INTENT.get(modelLabel)
          const intent = mapped ?? 'denuncia_infraestrutura'

          // Se a confiança é baixa, conduza para esclarecimento (evita parecer aleatório)
          const effectiveIntent: IzaIntent = topScore >= minConfidence ? intent : 'cumprimento'
          const sug = suggestionFor(effectiveIntent, raw)

          return {
            intent: effectiveIntent,
            confidence: topScore,
            reply: replyFor(effectiveIntent, topScore, sug),
            usedFallback: false,
            modelLabel,
            suggestion: sug,
            raw: output,
          }
        }

        // Se não conseguir parsear (mudança de formato), fallback.
        const fb = fallbackIntent(raw)
        const sug = suggestionFor(fb.intent, raw)
        return {
          intent: fb.intent,
          confidence: fb.confidence,
          reply: replyFor(fb.intent, fb.confidence, sug),
          usedFallback: true,
          suggestion: sug,
          raw: output,
        }
      } catch (err) {
        const fb = fallbackIntent(raw)
        const sug = suggestionFor(fb.intent, raw)
        return {
          intent: fb.intent,
          confidence: fb.confidence,
          reply: replyFor(fb.intent, fb.confidence, sug),
          usedFallback: true,
          suggestion: sug,
          raw: err,
        }
      } finally {
        setIsThinking(false)
      }
    },
    [ensureWorker, minConfidence, warmUp],
  )

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      pendingRef.current.clear()
    }
  }, [])


  const resetModel = useCallback(() => {
    // Termina worker e limpa estado para permitir "retry" real
    workerRef.current?.terminate()
    workerRef.current = null
    initPromiseRef.current = null
    pendingRef.current.clear()
    seqRef.current = 0

    setModelStatus('idle')
    setModelProgress(null)
    setModelStatusText('Pronto para iniciar.')
    setError(null)
    setRuntimeWasmPaths(null)
    setIsThinking(false)
  }, [])

  return {
    modelStatus,
    modelProgress,
    modelStatusText,
    error,
    runtimeWasmPaths,
    isThinking,
    warmUp,
    resetModel,
    classifyMessage,
  }
}
