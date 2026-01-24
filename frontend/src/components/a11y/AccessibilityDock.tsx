import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Eye,
  EyeOff,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react'

import { useTts } from '@/hooks/useTts'

type A11yPrefs = {
  fontScale: number
  highContrast: boolean
  reduceMotion: boolean
}

const STORAGE_KEY = 'participa_df:a11y:v1'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function loadPrefs(): A11yPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { fontScale: 1, highContrast: false, reduceMotion: false }
    const parsed = JSON.parse(raw) as Partial<A11yPrefs>
    return {
      fontScale: typeof parsed.fontScale === 'number' ? parsed.fontScale : 1,
      highContrast: !!parsed.highContrast,
      reduceMotion: !!parsed.reduceMotion,
    }
  } catch {
    return { fontScale: 1, highContrast: false, reduceMotion: false }
  }
}

function savePrefs(prefs: A11yPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

function getReadableTextFromMain(): string {
  const main = document.getElementById('main')
  if (!main) return ''

  const h1 = main.querySelector('h1')?.textContent?.trim() || ''
  const ps = Array.from(main.querySelectorAll('p'))
    .map((p) => (p.textContent || '').trim())
    .filter(Boolean)
    .slice(0, 3)

  const blocks = [h1, ...ps].filter(Boolean)
  const text = blocks.join('. ')

  // Evita fala muito longa
  return text.length > 700 ? text.slice(0, 700).trim() + '…' : text
}

export function AccessibilityDock() {
  const [prefs, setPrefs] = useState<A11yPrefs>(() => loadPrefs())
  const tts = useTts('pt-BR')
  const [ttsHint, setTtsHint] = useState<string | null>(null)
  const canSpeak = useMemo(() => tts.supported, [tts.supported])

  const applyPrefs = useCallback((p: A11yPrefs) => {
    const root = document.documentElement
    root.style.setProperty('--font-scale', String(p.fontScale))
    root.classList.toggle('a11y-contrast', p.highContrast)
    root.classList.toggle('a11y-reduce-motion', p.reduceMotion)
  }, [])

  useEffect(() => {
    applyPrefs(prefs)
    savePrefs(prefs)
  }, [prefs, applyPrefs])

  useEffect(() => {
    // Encerra fala ao desmontar
    return () => {
      try {
        tts.cancel()
      } catch {
        // ignore
      }
    }
  }, [tts])

  const increaseFont = useCallback(() => {
    setPrefs((p) => ({ ...p, fontScale: clamp(Number((p.fontScale + 0.1).toFixed(2)), 1, 1.4) }))
  }, [])

  const decreaseFont = useCallback(() => {
    setPrefs((p) => ({ ...p, fontScale: clamp(Number((p.fontScale - 0.1).toFixed(2)), 0.95, 1.4) }))
  }, [])

  const toggleContrast = useCallback(() => {
    setPrefs((p) => ({ ...p, highContrast: !p.highContrast }))
  }, [])

  const toggleReduceMotion = useCallback(() => {
    setPrefs((p) => ({ ...p, reduceMotion: !p.reduceMotion }))
  }, [])

  const reset = useCallback(() => {
    setPrefs({ fontScale: 1, highContrast: false, reduceMotion: false })
  }, [])

  const readScreen = useCallback(() => {
    setTtsHint(null)

    if (!canSpeak) {
      setTtsHint('Leitura em voz alta não está disponível neste navegador.')
      return
    }

    // toggle: se estiver lendo, para.
    if (tts.speaking) {
      tts.cancel()
      return
    }

    const text = getReadableTextFromMain()
    const safeText = text?.trim()
    const toSpeak = safeText || 'Não encontrei conteúdo para ler nesta tela.'

    try {
      let watchdog: number | null = null

      watchdog = window.setTimeout(() => {
        // Se o `onstart` não disparou, a engine pode estar bloqueada/sem vozes.
        if (!tts.speaking) {
          setTtsHint(
            'Não consegui iniciar o áudio. Dica: verifique se o som do navegador está ativo e clique novamente.',
          )
        }
      }, 900)

      tts.speak(toSpeak, {
        rate: 1,
        onStart: () => {
          if (watchdog) window.clearTimeout(watchdog)
        },
        onError: () => {
          if (watchdog) window.clearTimeout(watchdog)
          setTtsHint('Não consegui reproduzir áudio. Verifique se o som do navegador/dispositivo está ativo.')
        },
      })
    } catch {
      setTtsHint('Não consegui iniciar a leitura em voz alta.')
    }
  }, [canSpeak, tts])

  return (
    <aside
      className="fixed bottom-4 left-4 z-[70] w-[min(18rem,calc(100vw-2rem))]"
      aria-label="Ferramentas de acessibilidade"
    >
      <div className="glass p-2">
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <p className="text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Acessibilidade</p>
          <p className="text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">WCAG 2.1 AA</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={increaseFont}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.22)]"
            aria-label="Aumentar tamanho do texto"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>A+</span>
          </button>

          <button
            type="button"
            onClick={decreaseFont}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.22)]"
            aria-label="Diminuir tamanho do texto"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
            <span>A-</span>
          </button>

          <button
            type="button"
            onClick={toggleContrast}
            className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.22)]"
            aria-label={prefs.highContrast ? 'Desativar alto contraste' : 'Ativar alto contraste'}
          >
            {prefs.highContrast ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{prefs.highContrast ? 'Alto contraste: ligado' : 'Alto contraste: desligado'}</span>
          </button>

          <button
            type="button"
            onClick={toggleReduceMotion}
            className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.22)]"
            aria-label={prefs.reduceMotion ? 'Ativar animações' : 'Reduzir animações'}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{prefs.reduceMotion ? 'Animações: reduzidas' : 'Animações: normais'}</span>
          </button>

          <button
            type="button"
            onClick={readScreen}
            className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.22)] disabled:opacity-60"
            disabled={!canSpeak}
            aria-label={tts.speaking ? 'Parar leitura em voz alta' : 'Ler esta tela em voz alta'}
          >
            {tts.speaking ? (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{tts.speaking ? 'Parar leitura' : 'Ler esta tela'}</span>
          </button>

          <button
            type="button"
            onClick={reset}
            className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.22)]"
            aria-label="Restaurar configurações padrão"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>Restaurar padrão</span>
          </button>
        </div>

        {ttsHint && (
          <p className="mt-2 px-2 text-xs leading-relaxed text-[rgba(var(--c-text),0.75)]" role="status">
            {ttsHint}
          </p>
        )}

        <p className="mt-2 px-2 text-xs leading-relaxed text-[rgba(var(--c-text),0.70)]">
          Dica: use <span className="font-semibold">Tab</span> para navegar. O foco é sempre visível.
        </p>
      </div>
    </aside>
  )
}
