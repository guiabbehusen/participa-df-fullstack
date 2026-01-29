import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type SpeakOptions = {
  rate?: number
  pitch?: number
  volume?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: () => void
}

function normalizeWhitespace(s: string) {
  return (s || '').replace(/\s+/g, ' ').trim()
}

/**
 * Divide textos longos em blocos menores para maior compatibilidade do Web Speech API.
 * Alguns engines falham (onerror) com textos longos em uma única utterance.
 */
function splitIntoChunks(text: string, maxLen: number) {
  const t = normalizeWhitespace(text)
  if (!t) return [] as string[]

  // Quebra por pontuação (preservando o final da frase quando possível)
  const sentenceMatches = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)
  const sentences = (sentenceMatches && sentenceMatches.length > 0 ? sentenceMatches : [t]).map((s) =>
    s.trim(),
  )

  const chunks: string[] = []
  let current = ''

  const pushCurrent = () => {
    const c = current.trim()
    if (c) chunks.push(c)
    current = ''
  }

  const pushLongSentence = (s: string) => {
    // Se ainda for muito longo, quebra por palavras.
    const words = s.split(' ')
    let buf = ''
    for (const w of words) {
      const next = buf ? `${buf} ${w}` : w
      if (next.length <= maxLen) {
        buf = next
        continue
      }
      if (buf) chunks.push(buf)

      // Palavra enorme (raro): força corte
      if (w.length > maxLen) {
        chunks.push(w.slice(0, maxLen))
        buf = w.slice(maxLen)
      } else {
        buf = w
      }
    }
    if (buf) chunks.push(buf)
  }

  for (const sentence of sentences) {
    if (!sentence) continue
    if (sentence.length > maxLen) {
      pushCurrent()
      pushLongSentence(sentence)
      continue
    }

    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length <= maxLen) {
      current = candidate
    } else {
      pushCurrent()
      current = sentence
    }
  }

  pushCurrent()
  return chunks
}

/**
 * Acessibilidade: Text-to-Speech via Web Speech API (sem API keys).
 *
 * Estratégia de robustez:
 * - Texto longo vira chunks menores
 * - Chunks são falados em sequência (um por vez), evitando erros em alguns browsers
 *   que falham quando enfileiramos muitas utterances de uma vez.
 */
export function useTts(defaultLang: string = 'pt-BR') {
  const supported = useMemo(() => {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window
    )
  }, [])

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [speaking, setSpeaking] = useState(false)

  const utterRef = useRef<SpeechSynthesisUtterance | null>(null)

  // Token para invalidar execuções anteriores (cancel / novo speak)
  const tokenRef = useRef(0)

  const norm = useCallback((s: string) => (s || '').toLowerCase(), [])

  const pickBestVoice = useCallback(
    (vs: SpeechSynthesisVoice[]) => {
      if (vs.length === 0) return null

      // Preferência: pt-BR exato
      const exact = vs.find((v) => norm(v.lang) === norm(defaultLang))
      if (exact) return exact

      // pt-BR (prefixo)
      const ptbr = vs.find((v) => norm(v.lang).startsWith('pt-br'))
      if (ptbr) return ptbr

      // pt (qualquer)
      const pt = vs.find((v) => norm(v.lang).startsWith('pt'))
      if (pt) return pt

      return vs[0] ?? null
    },
    [defaultLang, norm],
  )

  const refreshVoices = useCallback(() => {
    if (!supported) return
    const vs = window.speechSynthesis.getVoices()
    setVoices(vs)
    setVoice((prev) => prev ?? pickBestVoice(vs))
  }, [pickBestVoice, supported])

  useEffect(() => {
    if (!supported) return

    refreshVoices()

    const handler = () => refreshVoices()
    window.speechSynthesis.addEventListener('voiceschanged', handler)

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler)
    }
  }, [refreshVoices, supported])

  const cancel = useCallback(() => {
    if (!supported) return
    tokenRef.current += 1
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
    utterRef.current = null
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string, opts?: SpeakOptions) => {
      if (!supported) return

      const t = normalizeWhitespace(text)
      if (!t) return

      // invalida qualquer fala anterior
      tokenRef.current += 1
      const token = tokenRef.current

      // Atualiza vozes (alguns navegadores carregam após primeira interação)
      try {
        refreshVoices()
      } catch {
        // ignore
      }

      // Interrompe fila anterior para não empilhar
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel()
        }
      } catch {
        // ignore
      }

      const vs = (() => {
        try {
          return window.speechSynthesis.getVoices()
        } catch {
          return [] as SpeechSynthesisVoice[]
        }
      })()

      const chosen = voice ?? pickBestVoice(vs)

      // chunks menores: melhor compatibilidade e menos falhas
      const chunks = splitIntoChunks(t, 220)
      if (chunks.length === 0) return

      let started = false
      let finished = false

      const safeStart = () => {
        if (started) return
        started = true
        setSpeaking(true)
        try {
          opts?.onStart?.()
        } catch {
          // ignore
        }
      }

      const safeEnd = () => {
        if (finished) return
        finished = true
        setSpeaking(false)
        try {
          opts?.onEnd?.()
        } catch {
          // ignore
        }
      }

      const safeError = () => {
        if (finished) return
        finished = true
        setSpeaking(false)
        try {
          window.speechSynthesis.cancel()
        } catch {
          // ignore
        }
        try {
          opts?.onError?.()
        } catch {
          // ignore
        }
      }

      const speakChunk = (idx: number) => {
        if (token !== tokenRef.current) return // cancelado/novo speak
        const chunk = chunks[idx]
        if (!chunk) {
          safeEnd()
          return
        }

        const utter = new SpeechSynthesisUtterance(chunk)
        if (chosen) utter.voice = chosen
        utter.lang = chosen?.lang || defaultLang
        utter.rate = opts?.rate ?? 1
        utter.pitch = opts?.pitch ?? 1
        utter.volume = opts?.volume ?? 1

        utter.onstart = () => {
          if (idx === 0) safeStart()
          // se iniciou no meio (raro), ainda garante state
          if (!started) safeStart()
        }

        utter.onend = () => {
          if (token !== tokenRef.current) return
          if (idx < chunks.length - 1) {
            speakChunk(idx + 1)
          } else {
            safeEnd()
          }
        }

        utter.onerror = () => {
          if (token !== tokenRef.current) return
          safeError()
        }

        utterRef.current = utter

        // Alguns navegadores ficam pausados
        try {
          window.speechSynthesis.resume?.()
        } catch {
          // ignore
        }

        try {
          window.speechSynthesis.speak(utter)
        } catch {
          safeError()
        }
      }

      // IMPORTANTE: não usar setTimeout antes do primeiro speak (user activation)
      speakChunk(0)
    },
    [defaultLang, pickBestVoice, refreshVoices, supported, voice],
  )

  const setVoiceByName = useCallback(
    (name: string) => {
      const v = voices.find((vv) => vv.name === name)
      if (v) setVoice(v)
    },
    [voices],
  )

  return {
    supported,
    voices,
    voice,
    speaking,
    refreshVoices,
    setVoiceByName,
    speak,
    cancel,
  }
}
