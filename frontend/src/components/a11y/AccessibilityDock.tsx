import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Accessibility,
  Eye,
  EyeOff,
  Hand,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'

declare global {
  interface Window {
    VLibras?: { Widget: new (url: string) => unknown }
    __participa_vlibras_promise__?: Promise<void>
  }
}

type A11yPrefs = {
  fontScale: number
  highContrast: boolean
  reduceMotion: boolean
}

const STORAGE_KEY = 'participa_df:a11y:v1'
const DOCK_KEY = 'participa_df:a11y:dock_open:v1'

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

function loadDockOpen(): boolean {
  try {
    const raw = localStorage.getItem(DOCK_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

function saveDockOpen(open: boolean) {
  try {
    localStorage.setItem(DOCK_KEY, open ? '1' : '0')
  } catch {
    // ignore
  }
}

function normalizeWhitespace(s: string) {
  return (s || '').replace(/\s+/g, ' ').trim()
}

function sanitizeForTts(s: string) {
  return normalizeWhitespace(s)
    .replace(/https?:\/\/\S+/gi, 'link')
    .replace(/\bwww\.[^\s]+/gi, 'link')
    .replace(/[\u0000-\u001F]/g, ' ')
    .trim()
}

function getTextByIds(ids: string) {
  const out: string[] = []
  for (const id of ids.split(/\s+/g)) {
    const el = id ? document.getElementById(id) : null
    const txt = sanitizeForTts(el?.textContent || '')
    if (txt) out.push(txt)
  }
  return out.join('. ')
}

function findLabelForControl(control: HTMLElement) {
  // aria-label sempre vence
  const aria = sanitizeForTts(control.getAttribute('aria-label') || '')
  if (aria) return aria

  // aria-labelledby (pode ter múltiplos ids)
  const labelledBy = control.getAttribute('aria-labelledby')
  if (labelledBy) {
    const lbl = getTextByIds(labelledBy)
    if (lbl) return lbl
  }

  // label[for=id]
  const id = control.getAttribute('id')
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    const txt = sanitizeForTts(label?.textContent || '')
    if (txt) return txt
  }

  // input dentro de label
  const wrappingLabel = control.closest('label')
  const wrappingTxt = sanitizeForTts(wrappingLabel?.textContent || '')
  if (wrappingTxt) return wrappingTxt

  // placeholder como último recurso
  const placeholder = sanitizeForTts((control as any)?.placeholder || '')
  if (placeholder) return placeholder

  // texto do próprio elemento (ex: botão)
  const ownText = sanitizeForTts(control.textContent || '')
  if (ownText) return ownText

  return ''
}

function describeElementForTts(el: HTMLElement) {
  const tag = el.tagName.toLowerCase()
  const role = sanitizeForTts(el.getAttribute('role') || '')
  const required = el.getAttribute('aria-required') === 'true' || (el as any)?.required === true
  const invalid = el.getAttribute('aria-invalid') === 'true'

  const baseLabel = findLabelForControl(el)

  const describedBy = el.getAttribute('aria-describedby')
  const describedText = describedBy ? sanitizeForTts(getTextByIds(describedBy)) : ''
  const errorHint = invalid && describedText ? `. Atenção: ${describedText}.` : invalid ? '. Atenção: campo com erro.' : ''

  // Conteúdo adicional por tipo
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase()
    const input = el as HTMLInputElement

    if (type === 'file') {
      const count = input.files?.length ?? 0
      const req = required ? ', obrigatório' : ''
      const filesTxt =
        count === 0 ? 'Nenhum arquivo selecionado.' : count === 1 ? '1 arquivo selecionado.' : `${count} arquivos selecionados.`
      return sanitizeForTts(`${baseLabel}${req}. ${filesTxt}${errorHint}`)
    }

    if (type === 'checkbox' || type === 'radio') {
      const checked = input.checked || el.getAttribute('aria-checked') === 'true'
      const state = checked ? 'marcado' : 'não marcado'
      const req = required ? ', obrigatório' : ''
      return sanitizeForTts(`${baseLabel}. ${state}${req}.${errorHint}`)
    }

    if (type === 'password') {
      const req = required ? ', obrigatório' : ''
      return sanitizeForTts(`${baseLabel}. Campo de senha${req}.${errorHint}`)
    }

    const value = sanitizeForTts(input.value || '')
    if (!value) {
      const req = required ? ', obrigatório' : ''
      return sanitizeForTts(`${baseLabel}${req}.${errorHint}`)
    }

    // Evita ler texto muito longo: fala quantidade
    if (value.length > 120) {
      const req = required ? ', obrigatório' : ''
      return sanitizeForTts(`${baseLabel}${req}. Preenchido. Texto com ${value.length} caracteres.${errorHint}`)
    }

    const req = required ? ', obrigatório' : ''
    return sanitizeForTts(`${baseLabel}${req}. Valor: ${value}.${errorHint}`)
  }

  if (tag === 'textarea') {
    const ta = el as HTMLTextAreaElement
    const value = sanitizeForTts(ta.value || '')
    const req = required ? ', obrigatório' : ''
    if (!value) return sanitizeForTts(`${baseLabel}${req}.${errorHint}`)
    if (value.length > 220) {
      return sanitizeForTts(`${baseLabel}${req}. Preenchido. Texto com ${value.length} caracteres.${errorHint}`)
    }
    return sanitizeForTts(`${baseLabel}${req}. ${value}.${errorHint}`)
  }

  if (tag === 'select') {
    const sel = el as HTMLSelectElement
    const selected = sel.selectedOptions?.[0]?.textContent
    const selectedTxt = sanitizeForTts(selected || '')
    const req = required ? ', obrigatório' : ''
    if (selectedTxt) return sanitizeForTts(`${baseLabel}${req}. Selecionado: ${selectedTxt}.${errorHint}`)
    return sanitizeForTts(`${baseLabel}${req}.${errorHint}`)
  }

  // Links e botões
  if (tag === 'a') {
    const txt = baseLabel || sanitizeForTts((el as HTMLAnchorElement).href || '')
    return sanitizeForTts(`Link: ${txt}.${errorHint}`)
  }
  if (tag === 'button') {
    const txt = baseLabel || 'Botão'
    return sanitizeForTts(`${txt}.${errorHint}`)
  }

  // fallback genérico
  if (role) {
    const txt = baseLabel || role
    return sanitizeForTts(`${txt}.${errorHint}`)
  }

  return sanitizeForTts(baseLabel || el.textContent || '')
}

function getReadableTextFromFocus(lastFocus: HTMLElement | null, dockEl: HTMLElement | null) {
  const el = lastFocus || (document.activeElement as HTMLElement | null)
  if (!el) return ''

  // Não leia o próprio dock de acessibilidade
  if (dockEl && dockEl.contains(el)) return ''

  // Não leia o VLibras
  if (el.closest('div[vw].enabled, [vw-access-button], [vw-plugin-wrapper]')) return ''

  return describeElementForTts(el)
}

function findFirstFocusable(root: ParentNode): HTMLElement | null {
  const selector =
    'a[href]:not([tabindex="-1"]),button:not([disabled]):not([tabindex="-1"]),input:not([disabled]):not([tabindex="-1"]),textarea:not([disabled]):not([tabindex="-1"]),select:not([disabled]):not([tabindex="-1"]),[tabindex]:not([tabindex="-1"])'
  const el = (root as any).querySelector?.(selector) as HTMLElement | null
  return el ?? null
}

function ensureVlibrasInstalled(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.__participa_vlibras_promise__) return window.__participa_vlibras_promise__

  window.__participa_vlibras_promise__ = new Promise<void>((resolve, reject) => {
    try {
      // 1) Container do widget (markup do manual oficial)
      const existingContainer = document.querySelector('div[vw].enabled')
      if (!existingContainer) {
        const container = document.createElement('div')
        container.setAttribute('vw', '')
        container.className = 'enabled'

        const access = document.createElement('div')
        access.setAttribute('vw-access-button', '')
        access.className = 'active'

        const wrapper = document.createElement('div')
        wrapper.setAttribute('vw-plugin-wrapper', '')

        const top = document.createElement('div')
        top.className = 'vw-plugin-top-wrapper'

        wrapper.appendChild(top)
        container.appendChild(access)
        container.appendChild(wrapper)

        document.body.appendChild(container)
      }

      // 2) CSS: escondemos o botão padrão (vamos expor um botão próprio no dock)
      const styleId = 'participa-vlibras-style'
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style')
        style.id = styleId
        style.textContent = `
          /* O app oferece um botão próprio de Libras. Mantemos o botão oficial escondido. */
          [vw-access-button].active { display: none !important; }
          [vw-plugin-wrapper] { z-index: 80 !important; }
        `
        document.head.appendChild(style)
      }

      const init = () => {
        try {
          if (window.VLibras && typeof window.VLibras.Widget === 'function') {
            // eslint-disable-next-line no-new
            new window.VLibras.Widget('https://vlibras.gov.br/app')
          }
          resolve()
        } catch (e) {
          reject(e)
        }
      }

      // 3) Script
      const scriptId = 'vlibras-script'
      const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
      if (existingScript) {
        // já carregado ou em cache
        init()
        return
      }

      const script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js'
      script.async = true
      script.onload = () => init()
      script.onerror = () => reject(new Error('Não foi possível carregar o VLibras.'))
      document.body.appendChild(script)
    } catch (e) {
      reject(e)
    }
  })

  return window.__participa_vlibras_promise__
}

function splitForSpeech(text: string, maxLen = 220) {
  const clean = sanitizeForTts(text)
  if (!clean) return []
  if (clean.length <= maxLen) return [clean]

  // Quebra por pontuação primeiro
  const sentences = clean.match(/[^.!?]+[.!?]?/g) || [clean]
  const chunks: string[] = []
  let cur = ''

  const pushCur = () => {
    const t = cur.trim()
    if (t) chunks.push(t)
    cur = ''
  }

  for (const raw of sentences) {
    const s = raw.trim()
    if (!s) continue

    if (!cur) {
      if (s.length <= maxLen) {
        cur = s
        continue
      }
      // sentença gigante: quebra em pedaços
      for (let i = 0; i < s.length; i += maxLen) chunks.push(s.slice(i, i + maxLen))
      continue
    }

    if ((cur + ' ' + s).length <= maxLen) {
      cur = cur + ' ' + s
      continue
    }

    pushCur()
    if (s.length <= maxLen) cur = s
    else for (let i = 0; i < s.length; i += maxLen) chunks.push(s.slice(i, i + maxLen))
  }

  pushCur()
  return chunks
}

export function AccessibilityDock() {
  const [prefs, setPrefs] = useState<A11yPrefs>(() => loadPrefs())
  const [dockOpen, setDockOpen] = useState<boolean>(() => loadDockOpen())

  const [ttsHint, setTtsHint] = useState<string | null>(null)
  const [isReading, setIsReading] = useState(false)

  const [vlibrasLoading, setVlibrasLoading] = useState(false)
  const [vlibrasHint, setVlibrasHint] = useState<string | null>(null)

  const canSpeak = useMemo(() => {
    if (typeof window === 'undefined') return false
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  }, [])

  // Guarda o último elemento focado FORA do dock (para leitura por TAB/click).
  const lastFocusRef = useRef<HTMLElement | null>(null)

  // Captura o elemento que estava ativo no momento do clique (antes do button).
  const preClickActiveRef = useRef<HTMLElement | null>(null)

  // Ref do próprio dock, para ignorar focusin nele.
  const dockRef = useRef<HTMLElement | null>(null)

  // Cache de vozes
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const pickPtVoice = useCallback(() => {
    const voices = voicesRef.current
    if (!voices?.length) return undefined
    const pt = voices.find((v) => (v.lang || '').toLowerCase().startsWith('pt'))
    if (pt) return pt
    return voices[0]
  }, [])

  useEffect(() => {
    if (!canSpeak) return
    const update = () => {
      try {
        voicesRef.current = window.speechSynthesis.getVoices()
      } catch {
        voicesRef.current = []
      }
    }
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [canSpeak])

  useEffect(() => {
    const handler = (ev: FocusEvent) => {
      const target = ev.target as HTMLElement | null
      if (!target) return

      // Ignora foco no próprio dock de acessibilidade
      if (dockRef.current && dockRef.current.contains(target)) return

      // Ignora foco no VLibras (para não “roubar” o último foco útil do formulário)
      if (target.closest('div[vw].enabled, [vw-access-button], [vw-plugin-wrapper]')) return

      lastFocusRef.current = target
    }

    document.addEventListener('focusin', handler, true)
    return () => document.removeEventListener('focusin', handler, true)
  }, [])

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
    saveDockOpen(dockOpen)
  }, [dockOpen])

// VLibras: o manual recomenda inserir o markup + script no index.html.
// Aqui só ajustamos a posição e escondemos o botão padrão (usaremos nosso botão “Libras” acima do dock).
useEffect(() => {
  const styleId = 'participa-vlibras-overrides'
  if (document.getElementById(styleId)) return

  const style = document.createElement('style')
  style.id = styleId
style.textContent = `
    /* Esconde botão oficial */
    [vw-access-button] {
      position: fixed !important;
      left: -9999px !important;
      bottom: -9999px !important;
      right: auto !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* FORÇA O WIDGET PARA A DIREITA */
    [vw-plugin-wrapper] {
      left: auto !important;
      right: 16px !important;       /* distância da borda direita */
      bottom: 100px !important;     /* sobe um pouco para não sobrepor seu dock */
      top: auto !important;
      z-index: 95 !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25); /* opcional: sombra para destacar */
    }

    /* Opcional: quando o player estiver aberto */
    [vw-plugin-wrapper].active {   /* ou .vw-visible, dependendo da classe que aparece */
      right: 16px !important;
    }
  `
  document.head.appendChild(style)

  // Melhora acessibilidade do widget (aria-label no botão oficial)
  const t = window.setInterval(() => {
    const btn = document.querySelector('[vw-access-button]') as HTMLElement | null
    if (!btn) return
    btn.setAttribute('role', 'button')
    btn.setAttribute('tabindex', '0')
    btn.setAttribute('aria-label', 'Tradutor em Libras (VLibras)')
    window.clearInterval(t)
  }, 400)

  return () => {
    window.clearInterval(t)
    style.remove()
  }
}, [])

  const stopReading = useCallback(() => {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    } finally {
      setIsReading(false)
    }
  }, [])

  // Lê EM VOZ ALTA o que estiver em foco (TAB) — sem mexer no TTS do chat.
  
const readFocused = useCallback(() => {
  setTtsHint(null)

  if (!canSpeak) {
    setTtsHint('Leitura em voz alta não está disponível neste navegador.')
    return
  }

  // toggle: se estiver lendo, para.
  if (isReading) {
    stopReading()
    return
  }

  const dockEl = dockRef.current

  // 1) tenta ler o foco que existia antes do clique
  let targetText = getReadableTextFromFocus(preClickActiveRef.current, dockEl)

  // 2) fallback: último foco fora do dock
  if (!targetText) {
    targetText = getReadableTextFromFocus(lastFocusRef.current, dockEl)
  }

  // 3) fallback: tenta focar o primeiro campo do main e ler
  if (!targetText) {
    const main = document.getElementById('main') || document.querySelector('main') || document.body
    const candidate = findFirstFocusable(main)
    if (candidate) {
      try {
        candidate.focus({ preventScroll: true } as any)
      } catch {
        candidate.focus()
      }
      lastFocusRef.current = candidate
      targetText = describeElementForTts(candidate)
    }
  }

  // Se ainda estiver vazio, leia ao menos o título (evita “não funciona”).
  let toSpeak = sanitizeForTts(targetText || '')
  if (!toSpeak) {
    const title = sanitizeForTts(document.title || '')
    if (title) {
      toSpeak = `Página: ${title}. Use Tab para selecionar um campo e clique em "Ler em voz alta".`
    }
  }

  if (!toSpeak) {
    setTtsHint('Não encontrei um campo para ler. Use Tab para focar um campo e tente novamente.')
    return
  }

  try {
    // Fala curta e confiável: o item em foco (não a página inteira).
    const finalText = toSpeak.length > 360 ? `${toSpeak.slice(0, 360)}…` : toSpeak

    const u = new SpeechSynthesisUtterance(finalText)
    u.lang = 'pt-BR'
    u.rate = 1

    // Não forçamos voz específica (mais compatível). Se quiser, descomente:
    // const voice = pickPtVoice()
    // if (voice) u.voice = voice

    u.onend = () => setIsReading(false)
    u.onerror = () => {
      setIsReading(false)
      setTtsHint('Não consegui iniciar a leitura em voz alta. Verifique permissões de áudio e tente novamente.')
    }

    setIsReading(true)

    try {
      // alguns navegadores ficam “pausados” após interações anteriores
      if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    } catch {
      // ignore
    }

    window.speechSynthesis.speak(u)
  } catch {
    setIsReading(false)
    setTtsHint('Não consegui iniciar a leitura em voz alta.')
  }
}, [canSpeak, isReading, stopReading])

  // Garante captura do elemento antes do click (sem roubar o foco do formulário)
  const onReadMouseDown = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
    const active = document.activeElement as HTMLElement | null
    if (active && dockRef.current && !dockRef.current.contains(active)) {
      preClickActiveRef.current = active
    }
    // evita que o botão roube o foco do campo atual
    e.preventDefault()
  }, [])

  
const toggleVlibras = useCallback(() => {
  setVlibrasHint(null)

  const btn = document.querySelector('[vw-access-button]') as HTMLElement | null
  if (!btn) {
    setVlibrasHint(
      'VLibras não está disponível. Verifique se o trecho do VLibras foi adicionado no index.html e recarregue a página.',
    )
    return
  }

  const doClick = () => {
    try {
      btn.click()
    } catch {
      setVlibrasHint('Não consegui abrir o tradutor em Libras. Tente recarregar a página.')
    }
  }

  // Se o script ainda estiver carregando, aguarda um pouco.
  if (!window.VLibras || typeof window.VLibras.Widget !== 'function') {
    setVlibrasLoading(true)

    let tries = 0
    const interval = window.setInterval(() => {
      tries += 1
      if (window.VLibras && typeof window.VLibras.Widget === 'function') {
        window.clearInterval(interval)
        setVlibrasLoading(false)
        doClick()
        return
      }
      if (tries >= 20) {
        window.clearInterval(interval)
        setVlibrasLoading(false)
        setVlibrasHint('O VLibras está demorando para carregar. Verifique sua conexão e tente novamente.')
      }
    }, 250)

    return
  }

  doClick()
}, [])

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

  // Em desmontagem, para leitura (não interfere no chat: é o mesmo SpeechSynthesis global).
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // ignore
      }
    }
  }, [])

  // Quando recolhido, mantém botões flutuantes SEMPRE disponíveis:
  // 1) Libras (acima)  2) Acessibilidade (abaixo)
  if (!dockOpen) {
    return (
      <aside
        ref={dockRef as any}
        className="fixed bottom-4 left-4 z-[70] flex flex-col gap-2"
        aria-label="Ferramentas de acessibilidade"
      >
        <button
          type="button"
          onClick={toggleVlibras}
          className="glass inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.88)] shadow-[var(--shadow-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
          aria-label="Traduzir para Libras"
          title="Libras"
        >
          <Hand className="h-5 w-5 text-[rgb(var(--c-primary))]" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => setDockOpen(true)}
          className="glass inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.88)] shadow-[var(--shadow-elev-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
          aria-label="Abrir ferramentas de acessibilidade"
          title="Acessibilidade"
        >
          <Accessibility className="h-5 w-5 text-[rgb(var(--c-primary))]" aria-hidden="true" />
        </button>
      </aside>
    )
  }

  return (
    <aside
      ref={dockRef as any}
      className="fixed bottom-4 left-4 z-[70] w-[min(19rem,calc(100vw-2rem))]"
      aria-label="Ferramentas de acessibilidade"
    >
      <div className="glass p-2">
        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="min-w-0">
            <p className="text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Acessibilidade</p>
            <p className="text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">WCAG 2.1 AA</p>
          </div>

          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] text-[rgba(var(--c-text),0.85)] hover:bg-[rgba(var(--c-border),0.22)]"
            onClick={() => setDockOpen(false)}
            aria-label="Fechar ferramentas de acessibilidade"
            title="Fechar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Libras (VLibras) — widget acima dos demais controles */}
        <div className="px-2 pb-2">
          <button
            type="button"
            onClick={toggleVlibras}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.92)] px-3 py-2 text-left hover:bg-[rgba(var(--c-border),0.22)]"
            aria-label="Abrir tradutor em Libras"
          >
            <span className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(var(--c-primary),0.10)] text-[rgb(var(--c-primary))]">
                <Hand className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Libras</span>
                <span className="block text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">Ativar tradutor em Libras</span>
              </span>
            </span>

            <span className="text-xs font-bold text-[rgb(var(--c-primary))]">
              {vlibrasLoading ? 'Carregando…' : 'Abrir'}
            </span>
          </button>

          {vlibrasHint && (
            <p className="mt-2 text-xs leading-relaxed text-[rgba(var(--c-text),0.75)]" role="status">
              {vlibrasHint}
            </p>
          )}
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
            onMouseDown={onReadMouseDown}
            onClick={readFocused}
            className="col-span-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.22)] disabled:opacity-60"
            disabled={!canSpeak}
            aria-label={isReading ? 'Parar leitura em voz alta' : 'Ler em voz alta o campo em foco'}
          >
            {isReading ? (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{isReading ? 'Parar leitura' : 'Ler em voz alta'}</span>
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
          Dica: a leitura em voz alta prioriza o <span className="font-semibold">campo em foco</span>. Use{' '}
          <span className="font-semibold">Tab</span> para navegar e clique em{' '}
          <span className="font-semibold">Ler em voz alta</span>.
        </p>
      </div>
    </aside>
  )
}
