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
 * - Usa as vozes instaladas no dispositivo/navegador.
 * - Funciona offline (desde que a voz esteja disponível localmente).
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

  const pickBestVoice = useCallback(
    (vs: SpeechSynthesisVoice[]) => {
      if (vs.length === 0) return null
      const norm = (s: string) => (s || '').toLowerCase()

      const exact = vs.find((v) => norm(v.lang) === norm(defaultLang))
      if (exact) return exact

      const ptbr = vs.find((v) => norm(v.lang).startsWith('pt-br'))
      if (ptbr) return ptbr

      const pt = vs.find((v) => norm(v.lang).startsWith('pt'))
      if (pt) return pt

      return vs[0] ?? null
    },
    [defaultLang],
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
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string, opts?: SpeakOptions) => {
      if (!supported) return
      const t = (text || '').trim()
      if (!t) return

      // Evita empilhar falas
      cancel()

      const utter = new SpeechSynthesisUtterance(t)
      utterRef.current = utter

      if (voice) utter.voice = voice
      utter.lang = voice?.lang || defaultLang
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

      window.speechSynthesis.speak(utter)
    },
    [cancel, defaultLang, supported, voice],
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
