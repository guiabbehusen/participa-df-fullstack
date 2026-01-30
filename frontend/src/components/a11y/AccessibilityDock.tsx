import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Accessibility,
  Activity,
  BookOpenText,
  EarOff,
  Eye,
  EyeOff,
  Hand,
  Keyboard,
  Minus,
  Moon,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  Sun,
  Target,
  Type,
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

type ThemeMode = 'system' | 'light' | 'dark'
type CursorMode = 'default' | 'black' | 'white'
type LineHeightMode = 'compact' | 'normal' | 'relaxed' | 'extra'

type A11yPrefs = {
  // Texto
  fontScale: number
  lineHeight: LineHeightMode

  // Cores
  theme: ThemeMode
  highContrast: boolean
  mono: boolean

  // Perfis
  profileLowVision: boolean
  profileMotor: boolean
  profileDaltonism: boolean
  profileEpilepsy: boolean
  profileAdhd: boolean
  profileDyslexia: boolean
  profileDeaf: boolean

  // Ferramentas
  reduceMotion: boolean
  readingMask: boolean
  keyboardMenu: boolean
  smartNav: boolean
  cursor: CursorMode
  cursorThick: boolean

  // Som
  muteSite: boolean
  hoverReader: boolean
}

const STORAGE_KEY = 'participa_df:a11y:v2'
const LEGACY_STORAGE_KEY = 'participa_df:a11y:v1'
const DOCK_KEY = 'participa_df:a11y:dock_open:v1'
const LOWVISION_PREV_KEY = 'participa_df:a11y:lowvision_prev:v1'
const STYLE_ID = 'participa-df-a11y-global-style'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
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

function defaultPrefs(): A11yPrefs {
  return {
    fontScale: 1,
    lineHeight: 'normal',
    theme: 'system',
    highContrast: false,
    mono: false,

    profileLowVision: false,
    profileMotor: false,
    profileDaltonism: false,
    profileEpilepsy: false,
    profileAdhd: false,
    profileDyslexia: false,
    profileDeaf: false,

    reduceMotion: false,
    readingMask: false,
    keyboardMenu: false,
    smartNav: false,
    cursor: 'default',
    cursorThick: false,

    muteSite: false,
    hoverReader: false,
  }
}

function coerceLineHeight(v: unknown): LineHeightMode {
  if (v === 'compact' || v === 'normal' || v === 'relaxed' || v === 'extra') return v
  return 'normal'
}

function coerceTheme(v: unknown): ThemeMode {
  if (v === 'system' || v === 'light' || v === 'dark') return v
  return 'system'
}

function coerceCursor(v: unknown): CursorMode {
  if (v === 'default' || v === 'black' || v === 'white') return v
  return 'default'
}

function loadPrefs(): A11yPrefs {
  const base = defaultPrefs()

  // 1) tenta v2
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<A11yPrefs>
      return {
        ...base,
        fontScale: typeof parsed.fontScale === 'number' ? clamp(parsed.fontScale, 0.85, 2) : base.fontScale,
        lineHeight: coerceLineHeight(parsed.lineHeight),
        theme: coerceTheme(parsed.theme),
        highContrast: !!parsed.highContrast,
        mono: !!parsed.mono,

        profileLowVision: !!parsed.profileLowVision,
        profileMotor: !!parsed.profileMotor,
        profileDaltonism: !!parsed.profileDaltonism,
        profileEpilepsy: !!parsed.profileEpilepsy,
        profileAdhd: !!parsed.profileAdhd,
        profileDyslexia: !!parsed.profileDyslexia,
        profileDeaf: !!parsed.profileDeaf,

        reduceMotion: !!parsed.reduceMotion,
        readingMask: !!parsed.readingMask,
        keyboardMenu: !!parsed.keyboardMenu,
        smartNav: !!parsed.smartNav,
        cursor: coerceCursor(parsed.cursor),
        cursorThick: !!parsed.cursorThick,

        muteSite: !!(parsed as any).muteSite,
        hoverReader: !!(parsed as any).hoverReader,
      }
    }
  } catch {
    // ignore
  }

  // 2) migra do v1 (antigo: fontScale/highContrast/reduceMotion)
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy) {
      const parsed = JSON.parse(legacy) as any
      const migrated: A11yPrefs = {
        ...base,
        fontScale: typeof parsed.fontScale === 'number' ? clamp(parsed.fontScale, 0.85, 2) : 1,
        highContrast: !!parsed.highContrast,
        reduceMotion: !!parsed.reduceMotion,
      }
      return migrated
    }
  } catch {
    // ignore
  }

  return base
}

function savePrefs(prefs: A11yPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore
  }
}

function ensureGlobalStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
/* =========================================================
   Participa DF — Acessibilidade (Perfis + Ferramentas)
   - Objetivo: WCAG 2.1 AA com perfis (Baixa Visão, etc.)
   - Estratégia: classes no <html> + overrides com !important
   ========================================================= */

:root{
  --font-scale: 1;
  --a11y-line-height: 1.5;
  --a11y-letter-spacing: 0em;
  --a11y-word-spacing: 0em;

  /* tokens brand (aprox) */
  --a11y-brand-blue: 0 113 188; /* #0071BC */
  --a11y-brand-yellow: 255 214 10; /* #FFD60A */
}

/* Escala de texto via rem (zoom sem quebrar layout quando combinado com regras abaixo) */
html { font-size: calc(16px * var(--font-scale, 1)); }

/* Espaçamento de leitura */
body{
  line-height: var(--a11y-line-height, 1.5);
  letter-spacing: var(--a11y-letter-spacing, 0em);
  word-spacing: var(--a11y-word-spacing, 0em);
}


/* =========================================================
   Espaçamento de linhas (corrige utilitários Tailwind leading-*)
   - Muitos trechos usam leading-relaxed/leading-tight etc.
   - Esses utilitários definem line-height no elemento e vencem o body.
   - Aqui, quando o usuário escolhe um modo de espaçamento, forçamos o line-height.
   ========================================================= */

html[data-a11y-lineheight="compact"] :where(p, li, dt, dd, blockquote, label, small, caption, button, a, textarea),
html[data-a11y-lineheight="relaxed"] :where(p, li, dt, dd, blockquote, label, small, caption, button, a, textarea),
html[data-a11y-lineheight="extra"] :where(p, li, dt, dd, blockquote, label, small, caption, button, a, textarea){
  line-height: var(--a11y-line-height, 1.5) !important;
}

/* Sobrescreve utilitários Tailwind leading-* onde existirem */
html[data-a11y-lineheight="compact"] :where([class*="leading-"]),
html[data-a11y-lineheight="relaxed"] :where([class*="leading-"]),
html[data-a11y-lineheight="extra"] :where([class*="leading-"]){
  line-height: var(--a11y-line-height, 1.5) !important;
}


/* Focus ring sempre visível (especialmente para navegação por teclado) */
:focus-visible{
  outline: 3px solid rgba(var(--a11y-brand-blue), 0.85);
  outline-offset: 3px;
}
html.a11y-motor :focus-visible{
  outline: 4px solid rgba(var(--a11y-brand-yellow), 0.95) !important;
  outline-offset: 4px !important;
}

/* Alvos maiores ajudam motor/baixa visão */
html.a11y-motor :where(button, a, input, select, textarea, [role="button"], [role="link"]){
  min-height: 44px;
}

/* Redução de estímulos (epilepsia / reduce motion) */
html.a11y-reduce-motion *, html.a11y-epilepsy *{
  animation: none !important;
  transition: none !important;
  scroll-behavior: auto !important;
}

/* Modo Monocromático */
html.a11y-mono #root{
  filter: grayscale(1) contrast(1.1);
}

/* Daltonismo: reduz saturação e aumenta contraste levemente */
html.a11y-daltonism #root{
  filter: saturate(0.65) contrast(1.08);
}

/* Tema escuro (não é alto contraste, é confortável) */
html.a11y-theme-dark{
  color-scheme: dark;
}
html.a11y-theme-dark body{
  background: #0b1220 !important;
  color: rgba(255,255,255,0.92) !important;
}

/* Tema claro (força clareza) */
html.a11y-theme-light{
  color-scheme: light;
}
html.a11y-theme-light body{
  background: #ffffff !important;
  color: rgb(15 23 42) !important;
}

/* Alto contraste: garante contraste em TODA a UI (corrige textos que ficavam “apagados” na Home) */
html.a11y-contrast{
  color-scheme: dark;
  --c-text: 255 255 255;
  --c-surface: 0 0 0;
  --c-border: 255 255 255;
  --c-primary: 255 214 10;
}
html.a11y-contrast body{
  background: #000 !important;
  color: #fff !important;
}
html.a11y-contrast #root{
  background: #000 !important;
  background-image: none !important;
}
html.a11y-contrast :where(h1,h2,h3,h4,h5,h6,p,span,li,div,label,small,strong,em,dt,dd,th,td,caption){
  color: #fff !important;
}
html.a11y-contrast :where(a){
  color: rgb(var(--a11y-brand-yellow)) !important;
  text-decoration: underline !important;
  text-underline-offset: 3px;
}
/* Links com aparência de botão (CTAs) devem manter alto contraste */
html.a11y-contrast :where(a[role="button"],a[class*="bg-"],a[class*="button"],a[class*="btn"]){
  background-color: rgba(0,0,0,0.92) !important;
  color: #fff !important;
  border: 1px solid rgba(255,255,255,0.75) !important;
  text-decoration: none !important;
}
html.a11y-contrast :where(button,[role="button"],input,textarea,select){
  background-color: rgba(0,0,0,0.92) !important;
  color: #fff !important;
  border-color: rgba(255,255,255,0.75) !important;
}
html.a11y-contrast :where(.badge,[class*="badge"],[data-badge]){
  background-color: #000 !important;
  color: #fff !important;
  border: 1px solid rgba(255,255,255,0.75) !important;
}
html.a11y-contrast ::placeholder{
  color: rgba(255,255,255,0.78) !important;
}
html.a11y-contrast :where([class*="text-slate-"],[class*="text-gray-"],[class*="text-zinc-"],[class*="text-neutral-"]){
  color: #fff !important;
}

/* Ajuste específico (Home): "chip" do hero pode estar em superfície clara (texto precisa ser escuro) */
html.a11y-contrast :where(main .chip, main .chip *):not(svg){
  color: rgb(var(--a11y-brand-yellow)) !important;
}
html.a11y-contrast :where(main .chip){
  background-color: #000 !important;
  border-color: rgba(255,255,255,0.78) !important;
}

/* Normaliza fundos claros de Tailwind para manter contraste */
html.a11y-contrast :where(.bg-white,.bg-slate-50,.bg-slate-100,.bg-gray-50,.bg-gray-100,.bg-zinc-50,.bg-zinc-100,.bg-neutral-50,.bg-neutral-100){
  background-color: #000 !important;
}

/* Também cobre utilitários Tailwind com opacidade (ex: bg-white/70) */
html.a11y-contrast :where([class*="bg-white/"],[class*="bg-slate-"],[class*="bg-gray-"],[class*="bg-zinc-"],[class*="bg-neutral-"],[class*="bg-["]){
  background-color: #000 !important;
  background-image: none !important;
}

/* Normaliza bordas claras de Tailwind */
html.a11y-contrast :where(.border-white,.border-slate-200,.border-gray-200,.border-zinc-200,.border-neutral-200,.border-slate-300,.border-gray-300,.border-zinc-300,.border-neutral-300){
  border-color: rgba(255,255,255,0.78) !important;
}


/* Remove gradientes/“meshes” em alto contraste para garantir legibilidade */
html.a11y-contrast :where([class*="bg-gradient"],[class*="from-"],[class*="via-"],[class*="to-"]){
  background-image: none !important;
}
html.a11y-contrast :where([class*="backdrop-"]){
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}

/* Glassmorphism: em modos de alto contraste/baixa visão, vira superfície sólida (evita texto branco sobre fundo claro translúcido) */
html.a11y-contrast :where(.glass){
  background-color: #000 !important;
  background-image: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border-color: rgba(255,255,255,0.78) !important;
}


/* Alto contraste (Ferramentas > Cores): na área principal do site, as superfícies "glass" viram fundo claro com texto preto
   (evita texto branco estourado e melhora a leitura do hero e dos cards principais) */
html.a11y-contrast:not(.a11y-lowvision) :where(main .glass){
  background-color: #fff !important;
  border-color: rgba(0,0,0,0.80) !important;
}
html.a11y-contrast:not(.a11y-lowvision) :where(main .glass, main .glass *):not([vw]):not([vw] *):not(svg){
  color: #000 !important;
}
html.a11y-contrast:not(.a11y-lowvision) :where(main .glass a){
  color: #000 !important;
  text-decoration: underline !important;
  text-underline-offset: 3px;
}
html.a11y-contrast:not(.a11y-lowvision) :where(main .glass a[role="button"], main .glass a[class*="bg-"], main .glass a[class*="btn"], main .glass button, main .glass [role="button"]){
  background-color: rgb(var(--a11y-brand-yellow)) !important;
  color: #000 !important;
  border: 1px solid rgba(0,0,0,0.85) !important;
  text-decoration: none !important;
}

html.a11y-contrast :where(.glass)::before,
html.a11y-contrast :where(.glass)::after{
  background: none !important;
  filter: none !important;
}

/* Ajuste fino (Alto Contraste): reduz “branco estourado” e garante leitura no topo da Home */
html.a11y-contrast :where(main h1, main h2, main h3){
  color: rgb(var(--a11y-brand-yellow)) !important;
}

/* Home (título principal): Balancer pode envolver texto em spans.
   Em alto contraste, garantimos cor escura para evitar ficar branco “estourado” em superfícies claras. */
html.a11y-contrast main h1.text-slate-900,
html.a11y-contrast main h1.text-slate-900 *:not(svg){
  color: rgb(15 23 42) !important;
}

html.a11y-contrast :where(main p){
  color: rgba(255,255,255,0.92) !important;
}
html.a11y-contrast :where(main p.text-slate-700, main .text-slate-700){
  color: rgb(var(--a11y-brand-yellow)) !important;
}
html.a11y-contrast :where(main p.text-slate-600, main .text-slate-600, main p.text-slate-800, main .text-slate-800){
  color: rgb(var(--a11y-brand-yellow)) !important;
}
/* Destaques (cards/labels) no topo: evita depender só de branco */
html.a11y-contrast :where(main [class*="font-semibold"], main [class*="font-bold"], main [class*="font-extrabold"]):not(a):not(button){
  color: rgb(var(--a11y-brand-yellow)) !important;
}

/* Baixa visão: contraste + zoom + layout em coluna única (evita “quebrar”) */
html.a11y-lowvision{
  color-scheme: dark;
  --c-text: 255 214 10;
  --c-surface: 0 0 0;
  --c-border: 255 255 255;
  --c-primary: 255 214 10;
}
html.a11y-lowvision body{
  background: #000 !important;
}

html.a11y-lowvision :where(.glass){
  background-color: #000 !important;
  background-image: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  border-color: rgba(255,255,255,0.78) !important;
}
html.a11y-lowvision :where(h1,h2,h3,h4,h5,h6){
  color: #fff !important;
}
html.a11y-lowvision :where(p,span,li,div,label,small,dt,dd){
  color: rgb(var(--a11y-brand-yellow)) !important;
}

/* Callout de ajuda (formulário): mantém texto branco para máxima legibilidade */
html.a11y-lowvision :where(main .glass.max-w-md p, main .glass.max-w-md p *):not(svg){
  color: #fff !important;
}

html.a11y-lowvision :where(a){
  color: #ffffff !important;
  text-decoration: underline !important;
  text-underline-offset: 3px;
}
html.a11y-lowvision ::placeholder{
  color: rgba(255,255,255,0.80) !important;
}
/* evita colunas múltiplas com zoom alto */
html.a11y-lowvision :where(#root .grid){
  grid-template-columns: 1fr !important;
}

/* Normaliza fundos claros para baixa visão */
html.a11y-lowvision :where(.bg-white,.bg-slate-50,.bg-slate-100,.bg-gray-50,.bg-gray-100,.bg-zinc-50,.bg-zinc-100,.bg-neutral-50,.bg-neutral-100){
  background-color: #000 !important;
}
html.a11y-lowvision :where([class*="text-slate-"],[class*="text-gray-"],[class*="text-zinc-"],[class*="text-neutral-"]){
  color: rgb(var(--a11y-brand-yellow)) !important;
}
/* garante quebra de texto para não “estourar” */
html.a11y-lowvision :where(#root){
  overflow-wrap: anywhere;
  word-break: break-word;
}

/* Dislexia: fonte amigável + espaçamentos */
html.a11y-dyslexia body{
  font-family: Verdana, Arial, system-ui !important;
  --a11y-letter-spacing: 0.04em;
  --a11y-word-spacing: 0.12em;
  --a11y-line-height: 1.85;
}
`
  document.head.appendChild(style)
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
  const aria = sanitizeForTts(control.getAttribute('aria-label') || '')
  if (aria) return aria

  const labelledBy = control.getAttribute('aria-labelledby')
  if (labelledBy) {
    const lbl = getTextByIds(labelledBy)
    if (lbl) return lbl
  }

  const id = control.getAttribute('id')
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    const txt = sanitizeForTts(label?.textContent || '')
    if (txt) return txt
  }

  const wrappingLabel = control.closest('label')
  const wrappingTxt = sanitizeForTts(wrappingLabel?.textContent || '')
  if (wrappingTxt) return wrappingTxt

  const placeholder = sanitizeForTts((control as any)?.placeholder || '')
  if (placeholder) return placeholder

  const ownText = sanitizeForTts(control.textContent || '')
  if (ownText) return ownText

  return ''
}

function describeElementForTts(el: HTMLElement) {
  const tag = el.tagName.toLowerCase()
  const required = el.getAttribute('aria-required') === 'true' || (el as any)?.required === true
  const invalid = el.getAttribute('aria-invalid') === 'true'

  const baseLabel = findLabelForControl(el)

  const describedBy = el.getAttribute('aria-describedby')
  const describedText = describedBy ? sanitizeForTts(getTextByIds(describedBy)) : ''
  const errorHint = invalid && describedText ? `. Atenção: ${describedText}.` : invalid ? '. Atenção: campo com erro.' : ''

  if (tag === 'input') {
    const input = el as HTMLInputElement
    const type = (input.type || 'text').toLowerCase()

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

    const value = sanitizeForTts(input.value || '')
    const req = required ? ', obrigatório' : ''
    if (!value) return sanitizeForTts(`${baseLabel}${req}.${errorHint}`)
    if (value.length > 140) return sanitizeForTts(`${baseLabel}${req}. Preenchido. Texto com ${value.length} caracteres.${errorHint}`)
    return sanitizeForTts(`${baseLabel}${req}. Valor: ${value}.${errorHint}`)
  }

  if (tag === 'textarea') {
    const ta = el as HTMLTextAreaElement
    const value = sanitizeForTts(ta.value || '')
    const req = required ? ', obrigatório' : ''
    if (!value) return sanitizeForTts(`${baseLabel}${req}.${errorHint}`)
    if (value.length > 240) return sanitizeForTts(`${baseLabel}${req}. Preenchido. Texto com ${value.length} caracteres.${errorHint}`)
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

  if (tag === 'a') {
    const txt = baseLabel || sanitizeForTts((el as HTMLAnchorElement).href || '')
    return sanitizeForTts(`Link: ${txt}.${errorHint}`)
  }

  if (tag === 'button') {
    const txt = baseLabel || 'Botão'
    return sanitizeForTts(`${txt}.${errorHint}`)
  }

  return sanitizeForTts(baseLabel || el.textContent || '')
}

function ensureVlibrasInstalled(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.__participa_vlibras_promise__) return window.__participa_vlibras_promise__

  window.__participa_vlibras_promise__ = new Promise<void>((resolve, reject) => {
    try {
      // Container do widget (markup do manual oficial). Se já existir no index.html, não duplica.
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

      // CSS: mantém o botão padrão escondido (a UI do app oferece o próprio botão)
      const styleId = 'participa-vlibras-style'
      if (!document.getElementById(styleId)) {
        const st = document.createElement('style')
        st.id = styleId
        st.textContent = `
          /* Mantém apenas o botão do app (evita 2 botões na tela) */
          [vw-access-button]{
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }
        `
        document.head.appendChild(st)
      }

      // Script
      const src = 'https://vlibras.gov.br/app/vlibras-plugin.js'
      const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null

      const onReady = () => {
        try {
          if (window.VLibras?.Widget) {
            // @ts-expect-error - lib expõe global
            new window.VLibras.Widget('https://vlibras.gov.br/app')
            resolve()
          } else {
            reject(new Error('VLibras não disponível no window.'))
          }
        } catch (e) {
          reject(e as Error)
        }
      }

      if (existing) {
        // Se o index.html já inseriu o script, evitamos reinicializar (previne duplicar o widget).
        resolve()
        return
      }

      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => onReady()
      script.onerror = () => reject(new Error('Falha ao carregar o script do VLibras.'))
      document.body.appendChild(script)
    } catch (e) {
      reject(e as Error)
    }
  })

  return window.__participa_vlibras_promise__
}

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  icon,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description: string
  icon: ReactNode
}) {
  return (
    <div
      className={[
        'grid grid-cols-[auto,1fr,auto] items-start gap-3 rounded-2xl border px-3 py-3 shadow-[var(--shadow-elev-1)] transition',
        checked
          ? 'border-[rgba(var(--c-primary),0.55)] bg-[rgba(var(--c-primary),0.06)]'
          : 'border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.78)]',
      ].join(' ')}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={[
            'inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-[rgba(var(--c-border),0.70)] [&>svg]:h-5 [&>svg]:w-5',
            checked
              ? 'bg-[rgba(var(--c-primary),0.14)] text-[rgb(var(--c-primary))]'
              : 'bg-[rgba(var(--c-surface),0.92)] text-[rgba(var(--c-text),0.75)]',
          ].join(' ')}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-extrabold tracking-wide text-[rgb(var(--c-text))]">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[rgba(var(--c-text),0.72)]">{description}</p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative self-center h-7 w-12 flex-none rounded-full border overflow-hidden',
          checked
            ? 'border-[rgba(var(--c-primary),0.55)] bg-[rgba(var(--c-primary),0.75)]'
            : 'border-[rgba(var(--c-border),0.85)] bg-[rgba(var(--c-surface),0.90)]',
        ].join(' ')}
      >
        <span className="sr-only">{checked ? 'Desativar' : 'Ativar'} {label}</span>
        <span
  className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_6px_18px_rgba(0,0,0,0.25)] transition-[left] duration-200"
  style={{ left: checked ? 'calc(100% - 1.5rem - 0.125rem)' : '0.125rem', willChange: 'left' }}
/>
</button>
    </div>
  )
}

function ToolCard({
  active,
  onClick,
  label,
  icon,
  description,
}: {
  active?: boolean
  onClick: () => void
  label: string
  icon: ReactNode
  description?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex min-h-[92px] w-full flex-col items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-center',
        'bg-[rgba(var(--c-surface),0.82)] hover:bg-[rgba(var(--c-border),0.18)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.45)]',
        active
          ? 'border-[rgba(var(--c-primary),0.75)] shadow-[0_10px_30px_rgba(0,0,0,0.10)]'
          : 'border-[rgba(var(--c-border),0.80)]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-flex h-10 w-10 items-center justify-center rounded-2xl',
          active ? 'bg-[rgba(var(--c-primary),0.14)] text-[rgb(var(--c-primary))]' : 'bg-[rgba(var(--c-border),0.16)] text-[rgba(var(--c-text),0.75)]',
        ].join(' ')}
      >
        {icon}
      </span>
      <span className="text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">{label}</span>
      {description ? (
        <span className="text-[10px] font-semibold leading-snug text-[rgba(var(--c-text),0.65)]">{description}</span>
      ) : null}
    </button>
  )
}

function CursorHalo({
  enabled,
  color,
  thick,
}: {
  enabled: boolean
  color: 'black' | 'white'
  thick: boolean
}) {
  const haloRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return

    const size = thick ? 54 : 44
    const border = thick ? 4 : 3
    const bg = color === 'white' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'
    const stroke = color === 'white' ? 'rgba(255,255,255,0.92)' : 'rgba(10,10,10,0.92)'

    const el = haloRef.current
    if (!el) return

    el.style.width = `${size}px`
    el.style.height = `${size}px`
    el.style.borderWidth = `${border}px`
    el.style.background = bg
    el.style.borderColor = stroke

    const move = (x: number, y: number) => {
      el.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0)`
    }

    const onMove = (ev: MouseEvent) => {
      const x = ev.clientX
      const y = ev.clientY

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => move(x, y))
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [enabled, color, thick])

  if (!enabled) return null

  return (
    <div
      aria-hidden="true"
      ref={haloRef}
      className="pointer-events-none fixed left-0 top-0 z-[69] rounded-full border shadow-[0_10px_40px_rgba(0,0,0,0.18)]"
      style={{ transform: 'translate3d(-9999px,-9999px,0)' }}
    />
  )
}

function ReadingMask({ enabled }: { enabled: boolean }) {
  const [y, setY] = useState<number>(() => (typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.35) : 240))
  const yRef = useRef<number>(y)
  yRef.current = y

  useEffect(() => {
    if (!enabled) return

    let raf = 0
    const band = 160

    const update = (nextY: number) => {
      setY(clamp(Math.round(nextY), band / 2, window.innerHeight - band / 2))
    }

    const onMove = (ev: MouseEvent) => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => update(ev.clientY))
    }

    const onFocus = (ev: FocusEvent) => {
      const t = ev.target as HTMLElement | null
      if (!t) return
      const rect = t.getBoundingClientRect()
      const center = rect.top + rect.height / 2
      update(center)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('focusin', onFocus, true)

    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('focusin', onFocus, true)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [enabled])

  if (!enabled) return null

  const bandHeight = 160
  const topH = Math.max(0, y - bandHeight / 2)
  const bottomTop = y + bandHeight / 2

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[55]">
      <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: topH }} />
      <div className="absolute inset-x-0 bg-black/0" style={{ top: topH, height: bandHeight }} />
      <div className="absolute inset-x-0 bottom-0 bg-black/55" style={{ top: bottomTop }} />
    </div>
  )
}

function slugify(s: string) {
  return (s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

type HeadingItem = { id: string; label: string; level: number }

function collectHeadings(): HeadingItem[] {
  const main = document.querySelector('main') || document.getElementById('root') || document.body
  const nodes = Array.from(main.querySelectorAll('h1, h2, h3')) as HTMLElement[]
  const out: HeadingItem[] = []

  const used = new Set<string>()
  for (const el of nodes) {
    const label = sanitizeForTts(el.textContent || '')
    if (!label) continue
    let id = el.id
    if (!id) {
      const slug = slugify(label)
      let candidate = slug || 'secao'
      let i = 1
      while (used.has(candidate) || document.getElementById(candidate)) {
        i += 1
        candidate = `${slug || 'secao'}-${i}`
      }
      el.id = candidate
      id = candidate
    }
    used.add(id)
    const level = el.tagName.toLowerCase() === 'h1' ? 1 : el.tagName.toLowerCase() === 'h2' ? 2 : 3
    out.push({ id, label, level })
  }
  return out.slice(0, 18)
}

function HeadingIndex({
  enabled,
  onJump,
}: {
  enabled: boolean
  onJump: (id: string) => void
}) {
  const [items, setItems] = useState<HeadingItem[]>([])

  useEffect(() => {
  if (!enabled) return

  let raf = 0
  const update = () => {
    window.cancelAnimationFrame(raf)
    raf = window.requestAnimationFrame(() => {
      setItems(collectHeadings())
    })
  }
  update()

  const obs = new MutationObserver(() => update())
  obs.observe(document.getElementById('root') || document.body, { subtree: true, childList: true })

  return () => {
    obs.disconnect()
    window.cancelAnimationFrame(raf)
  }
}, [enabled])

  if (!enabled) return null

  if (!items.length) {
    return (
      <div className="mt-3 rounded-2xl border border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.78)] p-3">
        <p className="text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Índice da página</p>
        <p className="mt-1 text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">
          Não encontrei títulos nesta tela. Dica: use a ferramenta <span className="font-semibold">Atalhos</span> ou navegue com <span className="font-semibold">Tab</span>.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-3 rounded-2xl border border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.78)] p-3">
      <p className="text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Índice da página</p>
      <p className="mt-1 text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">Use para pular rapidamente entre seções.</p>

      <div className="mt-2 max-h-44 overflow-auto pr-1 overscroll-contain">
        <ul className="space-y-1">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => onJump(it.id)}
                className={[
                  'w-full rounded-xl border border-transparent px-2 py-1.5 text-left text-xs font-semibold',
                  'text-[rgba(var(--c-text),0.88)] hover:bg-[rgba(var(--c-border),0.20)]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]',
                ].join(' ')}
                style={{ paddingLeft: it.level === 1 ? 8 : it.level === 2 ? 14 : 20 }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

type JumpTarget = { id: string; label: string; key: string }

function buildJumpTargets(): JumpTarget[] {
  const main = document.querySelector('main') || document.getElementById('root') || document.body
  const candidates = Array.from(main.querySelectorAll('section[id], h2[id], h1[id]')) as HTMLElement[]
  const out: JumpTarget[] = [{ id: 'top', label: 'Topo da página', key: '1' }]

  let k = 2
  for (const el of candidates) {
    if (k > 9) break
    const id = el.id
    const label = sanitizeForTts(el.getAttribute('aria-label') || el.textContent || '')
    if (!id || !label) continue
    if (out.some((t) => t.id === id)) continue
    out.push({ id, label: label.length > 36 ? `${label.slice(0, 36)}…` : label, key: String(k) })
    k += 1
  }
  return out
}

function KeyboardMenu({
  enabled,
  onJump,
}: {
  enabled: boolean
  onJump: (id: string) => void
}) {
  const [targets, setTargets] = useState<JumpTarget[]>([])

  useEffect(() => {
    if (!enabled) return
    const update = () => setTargets(buildJumpTargets())
    update()

    const obs = new MutationObserver(() => update())
    obs.observe(document.getElementById('root') || document.body, { subtree: true, childList: true })
    return () => obs.disconnect()
  }, [enabled])

  useEffect(() => {
  if (!enabled) return

  const extractDigit = (ev: KeyboardEvent): string | null => {
    const c = ev.code || ''
    if (/^Digit[1-9]$/.test(c)) return c.replace('Digit', '')
    if (/^Numpad[1-9]$/.test(c)) return c.replace('Numpad', '')
    if (/^[1-9]$/.test(ev.key)) return ev.key
    const sup: Record<string, string> = { '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }
    return sup[ev.key] || null
  }

  const onKey = (ev: KeyboardEvent) => {
    const t = ev.target as HTMLElement | null
    const typing =
      t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t as any).isContentEditable)

    const altGraph = (ev as any).getModifierState?.('AltGraph') ?? false
    if (!ev.altKey && !altGraph) return

    const digit = extractDigit(ev)
    if (!digit) return

    // Se estiver digitando e for AltGraph/Ctrl+Alt (ex: @, caracteres especiais), não intercepta.
    if (typing && (altGraph || ev.ctrlKey)) return

    const target = targets.find((x) => x.key === digit)
    if (!target) return

    ev.preventDefault()
    ev.stopPropagation()
    onJump(target.id)
  }

  // capture=true para funcionar mesmo quando algum componente intercepta keydown
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}, [enabled, targets, onJump])

  if (!enabled) return null
  if (!targets.length) return null

  return (
    <div className="fixed bottom-4 left-[4.75rem] z-[70] w-[min(18rem,calc(100vw-6rem))]">
      <div className="glass p-2">
        <p className="px-1 text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Atalhos (Alt + número)</p>
        <ul className="mt-2 space-y-1">
          {targets.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => onJump(t.id)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.90)] px-3 py-2 text-left hover:bg-[rgba(var(--c-border),0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
              >
                <span className="text-xs font-semibold text-[rgba(var(--c-text),0.90)]">{t.label}</span>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(var(--c-primary),0.12)] text-xs font-extrabold text-[rgb(var(--c-primary))]">
                  {t.key}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1 text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">
          Dica: use Tab para navegar. Use Alt+1 para voltar ao topo.
        </p>
      </div>
    </div>
  )
}

export function AccessibilityDock() {
  const [prefs, setPrefs] = useState<A11yPrefs>(() => loadPrefs())
  const [dockOpen, setDockOpen] = useState(() => loadDockOpen())
  const [tab, setTab] = useState<'texto' | 'cores' | 'navegacao' | 'som'>('cores')

  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null)

  // Porta os overlays no <body> para evitar problemas com filtros CSS (ex: daltonismo/mono) afetando elementos fixed
  useEffect(() => {
    if (typeof document === 'undefined') return
    let el = document.getElementById('participa-a11y-portal') as HTMLElement | null
    if (!el) {
      el = document.createElement('div')
      el.id = 'participa-a11y-portal'
      document.body.appendChild(el)
    }
    setPortalEl(el)
  }, [])


  const dockRef = useRef<HTMLElement | null>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)
  const preClickActiveRef = useRef<HTMLElement | null>(null)
  const adhdMaskOwnedRef = useRef<boolean>(false)

  const [isReading, setIsReading] = useState(false)
  const [ttsHint, setTtsHint] = useState<string | null>(null)

  const [vlibrasLoading, setVlibrasLoading] = useState(false)
  const [vlibrasHint, setVlibrasHint] = useState<string | null>(null)

  const canSpeak = useMemo(() => {
    if (typeof window === 'undefined') return false
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  }, [])

  // Guardar estado anterior ao ativar perfis (para voltar ao normal de forma previsível)
  const lowVisionPrevRef = useRef<{ fontScale: number; highContrast: boolean; cursor: CursorMode; cursorThick: boolean } | null>(null)
  const epilepsyPrevRef = useRef<{ reduceMotion: boolean } | null>(null)

  useEffect(() => {
    ensureGlobalStyles()
  }, [])

  // Captura foco útil (fora do dock e do VLibras)
  useEffect(() => {
    const handler = (ev: FocusEvent) => {
      const target = ev.target as HTMLElement | null
      if (!target) return

      if (dockRef.current && dockRef.current.contains(target)) return
      if (target.closest('div[vw].enabled, [vw-access-button], [vw-plugin-wrapper]')) return

      lastFocusRef.current = target
    }

    document.addEventListener('focusin', handler, true)
    return () => document.removeEventListener('focusin', handler, true)
  }, [])

  // Aplica classes no <html>
  const applyPrefs = useCallback((p: A11yPrefs) => {
    const root = document.documentElement

    // Font scale efetivo (baixa visão força ao menos 200%)
    const effectiveScale = p.profileLowVision ? Math.max(p.fontScale, 2) : p.fontScale

    // line-height por modo
    const lh =
      p.lineHeight === 'compact'
        ? 1.35
        : p.lineHeight === 'relaxed'
          ? 1.85
          : p.lineHeight === 'extra'
            ? 2.05
            : 1.5

    root.style.setProperty('--font-scale', String(effectiveScale))
    root.style.setProperty('--a11y-line-height', String(lh))

    // Permite CSS sobrescrever utilitários Tailwind `leading-*` quando o usuário escolhe espaçamento
    root.setAttribute('data-a11y-lineheight', p.lineHeight)

    // Temas
    root.classList.toggle('a11y-theme-dark', p.theme === 'dark')
    root.classList.toggle('a11y-theme-light', p.theme === 'light')

    // Alto contraste: também é forçado em baixa visão
    root.classList.toggle('a11y-contrast', p.highContrast || p.profileLowVision)

    // Perfis
    root.classList.toggle('a11y-lowvision', p.profileLowVision)
    root.classList.toggle('a11y-motor', p.profileMotor)
    root.classList.toggle('a11y-daltonism', p.profileDaltonism)
    root.classList.toggle('a11y-epilepsy', p.profileEpilepsy)
    root.classList.toggle('a11y-dyslexia', p.profileDyslexia)
    root.classList.toggle('a11y-deaf', p.profileDeaf)

    // Ferramentas
    const reduce = p.reduceMotion || p.profileEpilepsy
    root.classList.toggle('a11y-reduce-motion', reduce)
    root.classList.toggle('a11y-mono', p.mono)
    root.classList.toggle('a11y-adhd', p.readingMask || p.profileAdhd)
    root.classList.toggle('a11y-mute', p.muteSite)

    // Cursor halo (não mexe no cursor do sistema: adiciona “aura” visível)
    root.classList.toggle('a11y-cursor-halo', p.cursor !== 'default' || p.profileLowVision)
  }, [])

  useEffect(() => {
    applyPrefs(prefs)
    savePrefs(prefs)
  }, [prefs, applyPrefs])

  useEffect(() => {
    saveDockOpen(dockOpen)
  }, [dockOpen])

  // Segurança / Som: por padrão, evita autoplay (bom para deficiência auditiva e epilepsia)
  // + Silenciar sons do site (muta áudio/vídeo e bloqueia TTS quando ativado)
  useEffect(() => {
    const tagMutedByA11y = (el: HTMLMediaElement) => {
      try {
        const ds = (el as any).dataset as DOMStringMap | undefined
        if (!ds) return
        if (ds.a11yMuted === '1') return
        ds.a11yMuted = '1'
        ds.a11yPrevMuted = el.muted ? '1' : '0'
        ds.a11yPrevVolume = String(typeof (el as any).volume === 'number' ? (el as any).volume : 1)
      } catch {
        // ignore
      }
    }

    const restoreMutedByA11y = (el: HTMLMediaElement) => {
      try {
        const ds = (el as any).dataset as DOMStringMap | undefined
        if (!ds) return
        if (ds.a11yMuted !== '1') return

        const prevMuted = ds.a11yPrevMuted === '1'
        const prevVol = Number.parseFloat(ds.a11yPrevVolume || '1')
        // Só restaura quando não há outro motivo para manter mudo
        if (!prefs.profileDeaf) {
          el.muted = prevMuted
          if (!Number.isNaN(prevVol)) el.volume = clamp(prevVol, 0, 1)
        }
        delete (ds as any).a11yMuted
        delete (ds as any).a11yPrevMuted
        delete (ds as any).a11yPrevVolume
      } catch {
        // ignore
      }
    }

    const applyMediaRules = () => {
      try {
        const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[]
        const audios = Array.from(document.querySelectorAll('audio')) as HTMLAudioElement[]

        for (const v of videos) {
          const isAutoplay = v.autoplay || v.hasAttribute('autoplay')

          // Epilepsia/segurança: remove autoplay e pausa
          if (prefs.profileEpilepsy || isAutoplay) {
            v.autoplay = false
            v.removeAttribute('autoplay')
            v.pause?.()
          }

          // Deficiência auditiva: evita som automático
          if (prefs.profileDeaf) {
            v.muted = true
            v.volume = 0
          }

          // Silenciar sons do site: muta e guarda estado anterior para restauração
          if (prefs.muteSite) {
            tagMutedByA11y(v)
            v.muted = true
            v.volume = 0
          } else {
            restoreMutedByA11y(v)
          }

          // Se houver track, tenta mostrar legendas
          if (prefs.profileDeaf && v.textTracks) {
            for (const t of Array.from(v.textTracks)) {
              try {
                t.mode = 'showing'
              } catch {
                // ignore
              }
            }
          }
        }

        for (const a of audios) {
          const isAutoplay = a.autoplay || a.hasAttribute('autoplay')

          // Evita autoplay
          if (isAutoplay) {
            a.autoplay = false
            a.removeAttribute('autoplay')
            a.pause?.()
          }

          if (prefs.profileDeaf) {
            a.muted = true
            a.volume = 0
          }

          if (prefs.muteSite) {
            tagMutedByA11y(a)
            a.muted = true
            a.volume = 0
          } else {
            restoreMutedByA11y(a)
          }
        }
      } catch {
        // ignore
      }
    }

    applyMediaRules()

    // Se novos elementos <audio>/<video> aparecerem, aplica as mesmas regras.
    const obs = new MutationObserver(() => applyMediaRules())
    obs.observe(document.body, { childList: true, subtree: true })

    // Se algum áudio/vídeo tentar tocar enquanto o site está silenciado, garante mudo.
    const onPlay = (ev: Event) => {
      if (!prefs.muteSite) return
      const t = ev.target as any
      const el = (t && (t.tagName === 'AUDIO' || t.tagName === 'VIDEO')) ? (t as HTMLMediaElement) : null
      if (!el) return
      tagMutedByA11y(el)
      el.muted = true
      try {
        ;(el as any).volume = 0
      } catch {
        // ignore
      }
    }
    document.addEventListener('play', onPlay, true)

    return () => {
      obs.disconnect()
      document.removeEventListener('play', onPlay, true)
    }
  }, [prefs.profileDeaf, prefs.profileEpilepsy, prefs.muteSite])

  
  // Silenciar sons: além de áudio/vídeo, também bloqueia TTS (SpeechSynthesis) quando ativado.
  // Isso evita que outras partes do app “falem” enquanto o usuário estiver no modo silencioso.
  const originalSpeakRef = useRef<((utterance: SpeechSynthesisUtterance) => void) | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) return

    const synthAny = window.speechSynthesis as any

    if (!originalSpeakRef.current) {
      try {
        originalSpeakRef.current = synthAny.speak?.bind(window.speechSynthesis)
      } catch {
        originalSpeakRef.current = synthAny.speak
      }
    }

    if (prefs.muteSite) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // ignore
      }
      try {
        synthAny.speak = () => {}
      } catch {
        // ignore
      }
    } else if (originalSpeakRef.current) {
      try {
        synthAny.speak = originalSpeakRef.current
      } catch {
        // ignore
      }
    }

    return () => {
      if (originalSpeakRef.current) {
        try {
          synthAny.speak = originalSpeakRef.current
        } catch {
          // ignore
        }
      }
    }
  }, [prefs.muteSite])

// ====== Leitor de texto (ao passar o mouse) ======
  const pickPtVoice = useCallback(() => {
    try {
      const voices = window.speechSynthesis.getVoices()
      const pt = voices.find((v) => (v.lang || '').toLowerCase().startsWith('pt'))
      return pt || voices[0]
    } catch {
      return undefined
    }
  }, [])

  const stopReading = useCallback(() => {
    try {
      window.speechSynthesis.cancel()
    } catch {
      // ignore
    }
    setIsReading(false)
  }, [])

  // Se o modo silencioso for ativado, interrompe qualquer fala em andamento
  useEffect(() => {
    if (prefs.muteSite) stopReading()
  }, [prefs.muteSite, stopReading])

  const speakText = useCallback(
    (raw: string) => {
      if (!canSpeak) return
      if (prefs.muteSite) {
        setIsReading(false)
        return
      }

      const text = sanitizeForTts(raw)
      if (!text) return

      try {
        window.speechSynthesis.cancel()

        const voice = pickPtVoice()
        const utter = new SpeechSynthesisUtterance(text)
        utter.lang = voice?.lang || 'pt-BR'
        if (voice) utter.voice = voice
        utter.rate = 1
        utter.pitch = 1

        utter.onend = () => setIsReading(false)
        utter.onerror = () => {
          setIsReading(false)
          setTtsHint('Não consegui reproduzir áudio. Verifique se o som do dispositivo/navegador está ativo.')
        }

        setIsReading(true)
        window.speechSynthesis.speak(utter)
      } catch {
        setIsReading(false)
        setTtsHint('Não consegui iniciar a leitura. Tente novamente.')
      }
    },
    [canSpeak, pickPtVoice, prefs.muteSite],
  )

  const hoverTimerRef = useRef<number | null>(null)
  const lastHoverKeyRef = useRef<string>('')

  useEffect(() => {
    // Desativado
    if (!prefs.hoverReader) {
      setTtsHint(null)
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
      return
    }

    // Sem suporte
    if (!canSpeak) {
      setTtsHint('Seu navegador não suporta leitura em voz alta.')
      return
    }

    // Silenciado
    if (prefs.muteSite) {
      setTtsHint('O site está no modo silencioso. Desative “Silenciar sons” para usar o leitor de texto.')
      return
    }

    setTtsHint('Ativo: passe o mouse sobre um texto, botão ou campo para ouvir.')

    const shouldIgnore = (el: HTMLElement) => {
      if (dockRef.current && dockRef.current.contains(el)) return true
      if (el.closest('div[vw].enabled, [vw-access-button], [vw-plugin-wrapper]')) return true

      // Evita ler o próprio menu flutuante/overlays e o chat da IZA
      if (el.closest('[data-a11y-overlay="true"]')) return true
      if (el.closest('[data-iza-chat], [data-iza-chat-widget], #iza-chat, #iza-chat-widget')) return true

      return false
    }

    const findReadable = (start: HTMLElement | null): HTMLElement | null => {
      let el: HTMLElement | null = start
      for (let i = 0; i < 6 && el; i += 1) {
        if (shouldIgnore(el)) return null

        const tag = el.tagName.toLowerCase()

        // ignora elementos puramente visuais
        if (tag === 'svg' || tag === 'path' || tag === 'g') {
          el = el.parentElement
          continue
        }

        if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'a' || tag === 'label') {
          return el
        }

        if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6' || tag === 'p' || tag === 'li') {
          return el
        }

        const aria = sanitizeForTts(el.getAttribute('aria-label') || '')
        const txt = aria || sanitizeForTts(el.textContent || '')
        if (txt.length >= 12) return el

        el = el.parentElement
      }
      return null
    }

    const textFor = (el: HTMLElement) => {
      const tag = el.tagName.toLowerCase()
      const isControl = tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button' || tag === 'a' || tag === 'label'
      const raw = isControl ? describeElementForTts(el) : el.getAttribute('aria-label') || el.textContent || ''
      const txt = sanitizeForTts(raw)
      if (!txt) return ''

      if (txt.length > 320) return `${txt.slice(0, 280)}…`
      return txt
    }

    const scheduleSpeak = (el: HTMLElement) => {
      const txt = textFor(el)
      if (!txt || txt.length < 2) return

      const key = `${el.tagName}|${el.id || ''}|${txt}`
      if (key === lastHoverKeyRef.current) return

      lastHoverKeyRef.current = key

      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = window.setTimeout(() => {
        speakText(txt)
      }, 220)
    }

    const onOver = (ev: Event) => {
      const t = ev.target as HTMLElement | null
      if (!t) return
      const el = findReadable(t)
      if (!el) return
      scheduleSpeak(el)
    }

    document.addEventListener('mouseover', onOver, true)

    return () => {
      document.removeEventListener('mouseover', onOver, true)
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
    }
  }, [prefs.hoverReader, prefs.muteSite, canSpeak, speakText])


  // ====== VLibras ======
  const toggleVlibras = useCallback(async () => {
    setVlibrasHint(null)
    setVlibrasLoading(true)
    try {
      await ensureVlibrasInstalled()

      // tenta “clicar” no botão padrão do VLibras (mesmo escondido)
      const access = document.querySelector('[vw-access-button]') as HTMLElement | null
      if (access) {
        access.click()
      } else {
        // fallback: tenta clicar em algo dentro do container
        const container = document.querySelector('div[vw].enabled') as HTMLElement | null
        const inner = container?.querySelector('div,button') as HTMLElement | null
        inner?.click?.()
      }
    } catch {
      setVlibrasHint('Não foi possível carregar o VLibras. Verifique sua conexão.')
    } finally {
      setVlibrasLoading(false)
    }
  }, [])

  // ====== Ações de ajustes ======
  const increaseFont = useCallback(() => {
    setPrefs((p) => ({ ...p, fontScale: clamp(p.fontScale + 0.1, 0.85, 2) }))
  }, [])

  const decreaseFont = useCallback(() => {
    setPrefs((p) => ({ ...p, fontScale: clamp(p.fontScale - 0.1, 0.85, 2) }))
  }, [])

  const toggleContrast = useCallback(() => {
    setPrefs((p) => ({ ...p, highContrast: !p.highContrast }))
  }, [])

  const toggleReduceMotion = useCallback(() => {
    setPrefs((p) => ({ ...p, reduceMotion: !p.reduceMotion }))
  }, [])

  const setTheme = useCallback((theme: ThemeMode) => {
    setPrefs((p) => ({ ...p, theme }))
  }, [])

  const toggleMono = useCallback(() => {
    setPrefs((p) => ({ ...p, mono: !p.mono }))
  }, [])

  const setCursor = useCallback((cursor: CursorMode) => {
    setPrefs((p) => ({ ...p, cursor }))
  }, [])

  const toggleCursorThick = useCallback(() => {
    setPrefs((p) => ({ ...p, cursorThick: !p.cursorThick }))
  }, [])

  const setLineHeight = useCallback((lineHeight: LineHeightMode) => {
    setPrefs((p) => ({ ...p, lineHeight }))
  }, [])

  const toggleKeyboardMenu = useCallback(() => {
    setPrefs((p) => ({ ...p, keyboardMenu: !p.keyboardMenu }))
  }, [])

  const toggleSmartNav = useCallback(() => {
    setPrefs((p) => ({ ...p, smartNav: !p.smartNav }))
  }, [])

  const toggleReadingMask = useCallback(() => {
    setPrefs((p) => ({ ...p, readingMask: !p.readingMask }))
  }, [])


  // ====== Perfis ======
  const toggleLowVision = useCallback((next: boolean) => {
  setPrefs((p) => {
    if (next) {
      const prev = { fontScale: p.fontScale, highContrast: p.highContrast, cursor: p.cursor, cursorThick: p.cursorThick }
      lowVisionPrevRef.current = prev
      try {
        localStorage.setItem(LOWVISION_PREV_KEY, JSON.stringify(prev))
      } catch {
        // ignore
      }

      return {
        ...p,
        profileLowVision: true,
        highContrast: true,
        fontScale: Math.max(p.fontScale, 2),
        cursor: p.cursor === 'default' ? 'white' : p.cursor,
        cursorThick: true,
      }
    }

    // Restaura preferências anteriores mesmo após refresh (prev fica em localStorage).
    let prev = lowVisionPrevRef.current as any
    if (!prev) {
      try {
        const raw = localStorage.getItem(LOWVISION_PREV_KEY)
        if (raw) prev = JSON.parse(raw)
      } catch {
        // ignore
      }
    }

    lowVisionPrevRef.current = null
    try {
      localStorage.removeItem(LOWVISION_PREV_KEY)
    } catch {
      // ignore
    }

    return {
      ...p,
      profileLowVision: false,
      // Se não houver snapshot, volta ao padrão (1.0) para garantir que o zoom desative imediatamente.
      fontScale: typeof prev?.fontScale === 'number' ? clamp(prev.fontScale, 0.85, 2) : 1,
      highContrast: typeof prev?.highContrast === 'boolean' ? prev.highContrast : false,
      cursor: prev?.cursor ? coerceCursor(prev.cursor) : p.cursor,
      cursorThick: typeof prev?.cursorThick === 'boolean' ? prev.cursorThick : p.cursorThick,
    }
  })
}, [])

  const toggleEpilepsyProfile = useCallback((next: boolean) => {
    setPrefs((p) => {
      if (next) {
        epilepsyPrevRef.current = { reduceMotion: p.reduceMotion }
        return { ...p, profileEpilepsy: true, reduceMotion: true }
      }
      const prev = epilepsyPrevRef.current
      epilepsyPrevRef.current = null
      return { ...p, profileEpilepsy: false, reduceMotion: prev?.reduceMotion ?? p.reduceMotion }
    })
  }, [])

  const toggleAdhdProfile = useCallback((next: boolean) => {
  setPrefs((p) => {
    if (next) {
      // Se a máscara ainda não estava ativa, marcamos que foi o perfil que a ligou,
      // para conseguirmos desfazer ao desativar o perfil.
      if (!p.readingMask) adhdMaskOwnedRef.current = true
      return { ...p, profileAdhd: true, readingMask: true }
    }

    // Ao desativar o perfil, desfaz a máscara somente se foi habilitada pelo próprio perfil.
    const shouldDisableMask = adhdMaskOwnedRef.current
    adhdMaskOwnedRef.current = false
    return { ...p, profileAdhd: false, readingMask: shouldDisableMask ? false : p.readingMask }
  })
}, [])

  const reset = useCallback(() => {
    setPrefs(defaultPrefs())
    setTab('cores')
    setTtsHint(null)
    setVlibrasHint(null)
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  const onJump = useCallback((id: string) => {
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // tenta focar um item focável dentro
    const focusable =
      (el.querySelector('a[href],button,input,textarea,select,[tabindex]:not([tabindex="-1"])') as HTMLElement | null) || el
    focusable?.focus?.()
  }, [])

  // Cursor halo e máscara: ativação baseada em prefs
  const haloEnabled = prefs.profileLowVision || prefs.cursor !== 'default'
  const haloColor = prefs.profileLowVision ? 'white' : prefs.cursor === 'black' ? 'black' : prefs.cursor === 'white' ? 'white' : 'white'
  const haloThick = prefs.cursorThick || prefs.profileLowVision

  // ====== UI ======
  // Conteúdo renderizado (em portal) — mantém elementos fixed estáveis mesmo com filtros CSS no app (ex: daltonismo/mono)
  const overlay = (
    <>
      <CursorHalo enabled={haloEnabled} color={haloColor} thick={haloThick} />
      <ReadingMask enabled={prefs.readingMask || prefs.profileAdhd} />
      <KeyboardMenu enabled={prefs.keyboardMenu} onJump={onJump} />

      {!dockOpen ? (
        <aside data-a11y-overlay="true" className="fixed bottom-4 left-4 z-[70] flex flex-col gap-2" aria-label="Ferramentas de acessibilidade">
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
      ) : (
        <aside data-a11y-overlay="true"
                ref={dockRef as any}
                className="fixed bottom-4 left-4 z-[70] w-[min(760px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] max-h-[85vh]"
                aria-label="Ferramentas de acessibilidade"
              >
                <div className="glass p-3 max-h-[85vh] overflow-auto">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Acessibilidade</p>
                      <p className="text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">WCAG 2.1 AA • Perfis e ferramentas</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-2 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-2 text-xs font-bold text-[rgba(var(--c-text),0.88)] hover:bg-[rgba(var(--c-border),0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        Restaurar
                      </button>

                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] text-[rgba(var(--c-text),0.85)] hover:bg-[rgba(var(--c-border),0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
                        onClick={() => setDockOpen(false)}
                        aria-label="Fechar ferramentas de acessibilidade"
                        title="Fechar"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[1fr,1.15fr]">
                    {/* COLUNA ESQUERDA — PERFIS */}
                    <section className="rounded-3xl border border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.62)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Perfis</p>
                        <p className="text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">Ative conforme sua necessidade</p>
                      </div>

                      <div className="mt-2 space-y-2">
                        <ToggleSwitch
                          checked={prefs.profileLowVision}
                          onChange={toggleLowVision}
                          label="Baixa visão"
                          description="Aumenta contraste, amplia texto (200%) e reforça o cursor para facilitar a leitura."
                          icon={<Eye className="h-4 w-4" aria-hidden="true" />}
                        />

                        <ToggleSwitch
                          checked={prefs.profileMotor}
                          onChange={(next) => { setPrefs((p) => ({ ...p, profileMotor: next })) }}
                          label="Habilidades motoras"
                          description="Foco no teclado: anel de foco reforçado e alvos interativos maiores."
                          icon={<Keyboard className="h-4 w-4" aria-hidden="true" />}
                        />

                        <ToggleSwitch
                          checked={prefs.profileDaltonism}
                          onChange={(next) => { setPrefs((p) => ({ ...p, profileDaltonism: next })) }}
                          label="Daltonismo"
                          description="Reduz saturação e aumenta contraste. Prefira ícones e texto, não só cor."
                          icon={<Palette className="h-4 w-4" aria-hidden="true" />}
                        />

                        <ToggleSwitch
                          checked={prefs.profileEpilepsy}
                          onChange={toggleEpilepsyProfile}
                          label="Epilepsia / sensibilidade"
                          description="Reduz movimentos e pausa autoplay para diminuir estímulos visuais."
                          icon={<Activity className="h-4 w-4" aria-hidden="true" />}
                        />

                        <ToggleSwitch
                          checked={prefs.profileAdhd}
                          onChange={toggleAdhdProfile}
                          label="TDAH"
                          description="Ativa máscara de leitura para reduzir distrações periféricas."
                          icon={<Target className="h-4 w-4" aria-hidden="true" />}
                        />

                        <ToggleSwitch
                          checked={prefs.profileDyslexia}
                          onChange={(next) => { setPrefs((p) => ({ ...p, profileDyslexia: next })) }}
                          label="Dislexia"
                          description="Fonte amigável, espaçamento ampliado e linha mais confortável."
                          icon={<BookOpenText className="h-4 w-4" aria-hidden="true" />}
                        />

                        <ToggleSwitch
                          checked={prefs.profileDeaf}
                          onChange={(next) => { setPrefs((p) => ({ ...p, profileDeaf: next })) }}
                          label="Deficiência auditiva"
                          description="Evita sons automáticos e tenta ativar legendas em vídeos quando existirem."
                          icon={<EarOff className="h-4 w-4" aria-hidden="true" />}
                        />
                      </div>

                      {/* Libras */}
                      <div className="mt-3 rounded-2xl border border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.78)] p-3">
                        <button
                          type="button"
                          onClick={toggleVlibras}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-2 text-left hover:bg-[rgba(var(--c-border),0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
                          aria-label="Abrir tradutor em Libras"
                        >
                          <span className="flex items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(var(--c-primary),0.10)] text-[rgb(var(--c-primary))]">
                              <Hand className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Libras</span>
                              <span className="block text-[10px] font-semibold text-[rgba(var(--c-text),0.70)]">
                                {vlibrasLoading ? 'Carregando…' : 'Ativar tradutor em Libras'}
                              </span>
                            </span>
                          </span>

                          <span className="text-xs font-bold text-[rgb(var(--c-primary))]">{vlibrasLoading ? '…' : 'Abrir'}</span>
                        </button>

                        {vlibrasHint && (
                          <p className="mt-2 text-xs leading-relaxed text-[rgba(var(--c-text),0.75)]" role="status">
                            {vlibrasHint}
                          </p>
                        )}
                      </div>
                    </section>

                    {/* COLUNA DIREITA — FERRAMENTAS */}
                    <section className="rounded-3xl border border-[rgba(var(--c-border),0.80)] bg-[rgba(var(--c-surface),0.62)] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-extrabold tracking-wide text-[rgb(var(--c-text))]">Ferramentas</p>

                        <div className="flex items-center gap-1 rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.92)] p-1">
                          {(
                            [
                              { id: 'texto', label: 'Texto', icon: <Type className="h-4 w-4" aria-hidden="true" /> },
                              { id: 'cores', label: 'Cores', icon: <Palette className="h-4 w-4" aria-hidden="true" /> },
                              { id: 'navegacao', label: 'Navegação', icon: <Keyboard className="h-4 w-4" aria-hidden="true" /> },
                              { id: 'som', label: 'Som', icon: <Volume2 className="h-4 w-4" aria-hidden="true" /> },
                            ] as const
                          ).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setTab(t.id)}
                              className={[
                                'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold tracking-wide',
                                tab === t.id ? 'bg-[rgba(var(--c-primary),0.14)] text-[rgb(var(--c-primary))]' : 'text-[rgba(var(--c-text),0.75)] hover:bg-[rgba(var(--c-border),0.18)]',
                              ].join(' ')}
                              aria-current={tab === t.id ? 'page' : undefined}
                            >
                              {t.icon}
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Conteúdo da aba */}
                      {tab === 'texto' && (
                        <div className="mt-3">
                          <div className="grid grid-cols-2 gap-2">
                            <ToolCard
                              onClick={increaseFont}
                              label="Aumentar"
                              icon={<Plus className="h-5 w-5" aria-hidden="true" />}
                              description="A+"
                            />
                            <ToolCard
                              onClick={decreaseFont}
                              label="Diminuir"
                              icon={<Minus className="h-5 w-5" aria-hidden="true" />}
                              description="A-"
                            />
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <ToolCard
                              active={prefs.lineHeight === 'normal'}
                              onClick={() => setLineHeight('normal')}
                              label="Padrão"
                              icon={<Type className="h-5 w-5" aria-hidden="true" />}
                              description="Linha normal"
                            />
                            <ToolCard
                              active={prefs.lineHeight === 'relaxed'}
                              onClick={() => setLineHeight('relaxed')}
                              label="Espaçado"
                              icon={<Type className="h-5 w-5" aria-hidden="true" />}
                              description="Linha maior"
                            />
                            <ToolCard
                              active={prefs.lineHeight === 'extra'}
                              onClick={() => setLineHeight('extra')}
                              label="Extra"
                              icon={<Type className="h-5 w-5" aria-hidden="true" />}
                              description="Para leitura"
                            />
                            <ToolCard
                              active={prefs.fontScale >= 1.9}
                              onClick={() => { setPrefs((p) => ({ ...p, fontScale: 2 })) }}
                              label="Zoom 200%"
                              icon={<Eye className="h-5 w-5" aria-hidden="true" />}
                              description="Sem quebrar"
                            />
                          </div>

                          <p className="mt-3 text-xs leading-relaxed text-[rgba(var(--c-text),0.72)]">
                            Dica: o zoom funciona ajustando <span className="font-semibold">rem</span>. Se necessário, o modo{' '}
                            <span className="font-semibold">Baixa visão</span> também reorganiza o layout em 1 coluna.
                          </p>
                        </div>
                      )}

                      {tab === 'cores' && (
                        <div className="mt-3">
                          <div className="grid grid-cols-2 gap-2">
                            <ToolCard
                              active={prefs.theme === 'light'}
                              onClick={() => setTheme('light')}
                              label="Claro"
                              icon={<Sun className="h-5 w-5" aria-hidden="true" />}
                              description="Mais brilho"
                            />
                            <ToolCard
                              active={prefs.theme === 'dark'}
                              onClick={() => setTheme('dark')}
                              label="Escuro"
                              icon={<Moon className="h-5 w-5" aria-hidden="true" />}
                              description="Menos fadiga"
                            />
                            <ToolCard
                              active={prefs.highContrast || prefs.profileLowVision}
                              onClick={toggleContrast}
                              label="Alto contraste"
                              icon={prefs.highContrast || prefs.profileLowVision ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                              description="Legibilidade"
                            />
                            <ToolCard
                              active={prefs.mono}
                              onClick={toggleMono}
                              label="Monocromático"
                              icon={<Palette className="h-5 w-5" aria-hidden="true" />}
                              description="Sem cores"
                            />
                          </div>

                          <p className="mt-3 text-xs leading-relaxed text-[rgba(var(--c-text),0.72)]">
                            O modo <span className="font-semibold">Alto contraste</span> força contraste em textos e botões para corrigir trechos que ficam apagados.
                          </p>
                        </div>
                      )}

                      {tab === 'navegacao' && (
                        <div className="mt-3">
                          <div className="grid grid-cols-2 gap-2">
                            <ToolCard
                              active={prefs.keyboardMenu}
                              onClick={toggleKeyboardMenu}
                              label="Atalhos"
                              icon={<Keyboard className="h-5 w-5" aria-hidden="true" />}
                              description="Alt + 1…9"
                            />
                            <ToolCard
                              active={prefs.smartNav}
                              onClick={toggleSmartNav}
                              label="Índice"
                              icon={<BookOpenText className="h-5 w-5" aria-hidden="true" />}
                              description="Cabeçalhos"
                            />
                            <ToolCard
                              active={prefs.cursor === 'black'}
                              onClick={() => setCursor(prefs.cursor === 'black' ? 'default' : 'black')}
                              label="Cursor preto"
                              icon={<Target className="h-5 w-5" aria-hidden="true" />}
                              description="Aumenta visibilidade"
                            />
                            <ToolCard
                              active={prefs.cursor === 'white'}
                              onClick={() => setCursor(prefs.cursor === 'white' ? 'default' : 'white')}
                              label="Cursor branco"
                              icon={<Target className="h-5 w-5" aria-hidden="true" />}
                              description="Aumenta visibilidade"
                            />
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <ToolCard
                              active={prefs.reduceMotion || prefs.profileEpilepsy}
                              onClick={toggleReduceMotion}
                              label="Reduzir movimentos"
                              icon={<Sparkles className="h-5 w-5" aria-hidden="true" />}
                              description="Menos estímulo"
                            />
                            <ToolCard
                              active={prefs.readingMask || prefs.profileAdhd}
                              onClick={toggleReadingMask}
                              label="Máscara de leitura"
                              icon={<Target className="h-5 w-5" aria-hidden="true" />}
                              description="Concentração"
                            />
                          </div>

                          <HeadingIndex enabled={prefs.smartNav} onJump={onJump} />

                          <p className="mt-3 text-xs leading-relaxed text-[rgba(var(--c-text),0.72)]">
                            Dica: para navegação sem mouse, use <span className="font-semibold">Tab</span> e{' '}
                            <span className="font-semibold">Shift+Tab</span>. O anel de foco fica mais forte no perfil motor.
                          </p>
                        </div>
                      )}

                      {tab === 'som' && (
                        <div className="mt-3">
                          <div className="space-y-2">
                            <ToggleSwitch
                              checked={prefs.muteSite}
                              onChange={(next) => setPrefs((p) => ({ ...p, muteSite: next }))}
                              label="Silenciar sons"
                              description="Desativa sons do site (áudios, vídeos e falas)."
                              icon={<VolumeX className="h-4 w-4" aria-hidden="true" />}
                            />

                            <ToggleSwitch
                              checked={prefs.hoverReader}
                              onChange={(next) => setPrefs((p) => ({ ...p, hoverReader: next }))}
                              label="Leitor de texto"
                              description="Ao passar o mouse, lê o conteúdo do item destacado."
                              icon={<Volume2 className="h-4 w-4" aria-hidden="true" />}
                            />
                          </div>

                          {isReading ? (
                            <button
                              type="button"
                              onClick={stopReading}
                              className="mt-2 flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.90)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]"
                              aria-label="Parar leitura"
                            >
                              <VolumeX className="h-4 w-4" aria-hidden="true" />
                              <span>Parar leitura</span>
                            </button>
                          ) : null}

                          {ttsHint && (
                            <p className="mt-2 text-xs leading-relaxed text-[rgba(var(--c-text),0.78)]" role="status">
                              {ttsHint}
                            </p>
                          )}

                          <p className="mt-3 text-xs leading-relaxed text-[rgba(var(--c-text),0.72)]">
                            Dica: ative o <span className="font-semibold">Leitor de texto</span> e passe o mouse sobre títulos, botões e trechos do formulário.
                          </p>
                        </div>
                      )}                    </section>
                  </div>
                </div>
              </aside>
      )}
    </>
  )

  if (!portalEl) return null
  return createPortal(overlay, portalEl)
}
