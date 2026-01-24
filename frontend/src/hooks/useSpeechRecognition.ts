import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type SpeechStatus = 'idle' | 'listening' | 'error'

type Options = {
  lang?: string
  interimResults?: boolean
  continuous?: boolean
}

/**
 * Speech-to-Text (STT) via Web Speech API.
 *
 * - Não precisa de API keys.
 * - Em alguns navegadores, pode depender do serviço do próprio navegador (pode exigir internet).
 * - Fallback: caso não suporte, o app continua funcionando por texto.
 */
export function useSpeechRecognition(options: Options = {}) {
  const { lang = 'pt-BR', interimResults = true, continuous = false } = options

  const supported = useMemo(() => {
    if (typeof window === 'undefined') return false
    const w = window as any
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition)
  }, [])

  const recognitionRef = useRef<any | null>(null)

  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [interim, setInterim] = useState('')
  const [finalText, setFinalText] = useState('')
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toFriendlyError = useCallback((code?: string) => {
    const c = (code || '').toLowerCase()
    switch (c) {
      case 'not-allowed':
      case 'service-not-allowed':
        return 'Microfone bloqueado. Permita o acesso ao microfone no navegador.'
      case 'audio-capture':
        return 'Não encontrei um microfone. Verifique o dispositivo.'
      case 'network':
        return 'O reconhecimento de voz pode exigir internet neste navegador.'
      case 'no-speech':
        return 'Não ouvi sua voz. Tente falar novamente.'
      case 'aborted':
        return null
      default:
        return code ? `Não foi possível usar o microfone (${code}).` : 'Não foi possível usar o microfone.'
    }
  }, [])

  const start = useCallback(() => {
    if (!supported) return

    const w = window as any
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    const recognition = new Ctor()

    recognitionRef.current = recognition

    recognition.lang = lang
    recognition.interimResults = interimResults
    recognition.continuous = continuous
    recognition.maxAlternatives = 1

    setErrorCode(null)
    setError(null)
    setFinalText('')
    setInterim('')
    setStatus('listening')

    recognition.onresult = (event: any) => {
      let interimTranscript = ''
      let finalTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        const transcript = String(res[0]?.transcript || '')
        if (res.isFinal) finalTranscript += transcript
        else interimTranscript += transcript
      }

      if (interimTranscript) setInterim(interimTranscript.trim())
      if (finalTranscript) setFinalText((prev) => (prev ? `${prev} ${finalTranscript.trim()}` : finalTranscript.trim()))
    }

    recognition.onerror = (e: any) => {
      const code = e?.error ? String(e.error) : ''

      // Em fluxos "hands-free" a gente aborta o reconhecimento para evitar eco
      // (ex.: quando o TTS da IZA está falando). Alguns navegadores emitem "aborted".
      if (code === 'aborted' || code === 'no-speech') {
        setStatus('idle')
        setErrorCode(null)
        setError(null)
        return
      }

      setStatus('error')
      setErrorCode(code || null)
      setError(toFriendlyError(code) || 'Erro no reconhecimento de voz.')
    }

    recognition.onend = () => {
      // onend é chamado quando o reconhecimento finaliza naturalmente ou por stop()
      setStatus((prev) => (prev === 'error' ? 'error' : 'idle'))
      setInterim('')
    }

    try {
      recognition.start()
    } catch (e) {
      // Alguns navegadores lançam se start for chamado 2x
      setStatus('error')
      setErrorCode('start-failed')
      setError('Não foi possível iniciar o microfone. Tente novamente.')
    }
  }, [continuous, interimResults, lang, supported, toFriendlyError])

  const stop = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    try {
      rec.stop()
    } catch {
      // ignore
    }
  }, [])

  const abort = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec) return
    try {
      rec.abort()
    } catch {
      // ignore
    }
  }, [])

  const reset = useCallback(() => {
    setInterim('')
    setFinalText('')
    setErrorCode(null)
    setError(null)
    setStatus('idle')
  }, [])

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort?.()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
  }, [])

  return {
    supported,
    status,
    listening: status === 'listening',
    interim,
    finalText,
    error,
    errorCode,
    start,
    stop,
    abort,
    reset,
  }
}
