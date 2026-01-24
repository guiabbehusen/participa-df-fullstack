import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type SpeakOptions = {
  rate?: number
  pitch?: number
  volume?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: () => void
}

/**
 * Acessibilidade: Text-to-Speech via Web Speech API (sem API keys).
 *
 * Observações de compatibilidade:
 * - Alguns navegadores "engasgam" se chamarmos `cancel()` e `speak()` no mesmo tick.
 *   Por isso, agendamos o `speak()` com `setTimeout(..., 0)`.
 * - Em alguns cenários o `speechSynthesis` pode ficar "paused"; `resume()` ajuda.
 * - As vozes podem carregar assíncronas; usamos `voiceschanged` + escolha dinâmica.
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
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string, opts?: SpeakOptions) => {
      if (!supported) return
      const t = (text || '').trim()
      if (!t) return

      // Evita empilhar falas e destrava engines que ficam "presas"
      cancel()

      // Atualiza vozes (alguns navegadores só carregam após primeira interação)
      try {
        refreshVoices()
      } catch {
        // ignore
      }

      const utter = new SpeechSynthesisUtterance(t)
      utterRef.current = utter

      // Escolha de voz dinâmica (não depende apenas do estado)
      const vs = (() => {
        try {
          return window.speechSynthesis.getVoices()
        } catch {
          return []
        }
      })()
      const chosen = voice ?? pickBestVoice(vs)

      if (chosen) utter.voice = chosen
      utter.lang = chosen?.lang || defaultLang
      utter.rate = opts?.rate ?? 1
      utter.pitch = opts?.pitch ?? 1
      utter.volume = opts?.volume ?? 1

      utter.onstart = () => {
        setSpeaking(true)
        try {
          opts?.onStart?.()
        } catch {
          // ignore
        }
      }

      utter.onend = () => {
        setSpeaking(false)
        try {
          opts?.onEnd?.()
        } catch {
          // ignore
        }
      }

      utter.onerror = () => {
        setSpeaking(false)
        try {
          opts?.onError?.()
        } catch {
          // ignore
        }
      }

      // Alguns navegadores ficam pausados
      try {
        window.speechSynthesis.resume?.()
      } catch {
        // ignore
      }

      const doSpeak = () => {
        try {
          window.speechSynthesis.speak(utter)
        } catch {
          // ignore
        }
      }

      // Evita bug de "cancel + speak no mesmo tick" (alguns Windows/Chrome precisam de atraso maior)
      window.setTimeout(doSpeak, 120)

      // Fallback: se não iniciou (alguns engines ficam em estado pendente), tenta novamente.
      window.setTimeout(() => {
        try {
          if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
            window.speechSynthesis.speak(utter)
          }
        } catch {
          // ignore
        }
      }, 900)
    },
    [cancel, defaultLang, pickBestVoice, refreshVoices, supported, voice],
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
