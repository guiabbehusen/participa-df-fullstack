import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form'
import { Camera, Mic, RotateCcw, Square, Upload, Video, X } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

export type MediaAttachmentMode = 'image' | 'audio' | 'video'

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let u = 0
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024
    u += 1
  }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`
}

function extFromMime(mime: string, mode: MediaAttachmentMode) {
  const m = (mime || '').toLowerCase()
  if (mode === 'image') {
    if (m.includes('png')) return 'png'
    if (m.includes('webp')) return 'webp'
    if (m.includes('gif')) return 'gif'
    return 'jpg'
  }
  if (mode === 'audio') {
    if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
    if (m.includes('wav')) return 'wav'
    if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a'
    return 'webm'
  }
  // video
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('quicktime') || m.includes('mov')) return 'mov'
  return 'webm'
}

function chooseMime(mode: MediaAttachmentMode) {
  if (typeof window === 'undefined') return ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MR: any = (window as any).MediaRecorder
  if (!MR?.isTypeSupported) return ''

  const audioCandidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ]
  const videoCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]

  const list = mode === 'audio' ? audioCandidates : videoCandidates
  const found = list.find((t) => MR.isTypeSupported(t))
  return found || ''
}

function safeFirstFile(v: unknown): File | undefined {
  if (!v) return undefined
  if (v instanceof File) return v
  const anyV: any = v as any
  if (typeof FileList !== 'undefined' && v instanceof FileList) return v.item(0) || undefined
  if (Array.isArray(anyV) && anyV[0] instanceof File) return anyV[0]
  if (anyV?.[0] instanceof File) return anyV[0]
  return undefined
}

type Props<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>

  mode: MediaAttachmentMode
  accept: string
  capture?: string

  selectLabel?: string
  recordLabel?: string

  /** Quando o usuário anexar/gravar, opcionalmente focar este id (ex.: campo de descrição/alt/transcrição). */
  afterPickFocusId?: string

  disabled?: boolean
  embedded?: boolean
  className?: string
}

export function MediaAttachmentField<T extends FieldValues>({
  control,
  name,
  mode,
  accept,
  capture,
  selectLabel,
  recordLabel,
  afterPickFocusId,
  disabled,
  embedded,
  className,
}: Props<T>) {
  const { field } = useController({ control, name })
  const file = useMemo(() => safeFirstFile(field.value), [field.value])

  const pickRef = useRef<HTMLInputElement | null>(null)
  const captureRef = useRef<HTMLInputElement | null>(null)

  const previewUrlRef = useRef<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [recError, setRecError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<number | null>(null)

  const liveVideoRef = useRef<HTMLVideoElement | null>(null)

  const icon = mode === 'image' ? Camera : mode === 'audio' ? Mic : Video
  const Icon = icon

  const _selectLabel = selectLabel || 'Escolher arquivo'
  const _recordLabel = recordLabel || (mode === 'image' ? 'Tirar foto' : 'Gravar')

  // Preview URL lifecycle
  useEffect(() => {
    if (!file) {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      setPreviewUrl(null)
      return
    }

    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setPreviewUrl(url)

    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [file])

  function focusAfterPick() {
    if (!afterPickFocusId) return
    window.setTimeout(() => {
      const el = document.getElementById(afterPickFocusId) as HTMLElement | null
      el?.focus?.()
    }, 50)
  }

  function clearFile() {
    field.onChange(undefined)
  }

  function onPickInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setRecError(null)
      field.onChange(f)
      focusAfterPick()
    }
    // permite selecionar o mesmo arquivo novamente
    e.target.value = ''
  }

  function stopStream() {
    streamRef.current?.getTracks?.().forEach((t) => t.stop())
    streamRef.current = null
    if (liveVideoRef.current) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(liveVideoRef.current as any).srcObject = null
      } catch {
        // ignore
      }
    }
  }

  function stopTick() {
    if (tickRef.current) window.clearInterval(tickRef.current)
    tickRef.current = null
  }

  function resetRecorderState() {
    stopTick()
    setRecSeconds(0)
    setRecording(false)
    recorderRef.current = null
    chunksRef.current = []
    stopStream()
  }

  async function startRecording() {
    setRecError(null)

    // Para imagem: preferimos abrir diretamente o “capturar” do dispositivo (camera).
    if (mode === 'image') {
      captureRef.current?.click()
      return
    }

    const hasMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    const hasRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window

    // Fallback (mobile): input com capture abre o gravador do sistema
    if (!hasMedia || !hasRecorder) {
      captureRef.current?.click()
      return
    }

    try {
      const constraints: MediaStreamConstraints =
        mode === 'audio'
          ? { audio: true }
          : { audio: true, video: { facingMode: 'environment' } }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      if (mode === 'video' && liveVideoRef.current) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(liveVideoRef.current as any).srcObject = stream
          await liveVideoRef.current.play()
        } catch {
          // ignore autoplay issues
        }
      }

      const mimeType = chooseMime(mode)
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      chunksRef.current = []
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      recorder.onstop = () => {
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || undefined })
          const ext = extFromMime(blob.type || recorder.mimeType || '', mode)
          const filename = `${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`
          const f = new File([blob], filename, { type: blob.type || recorder.mimeType || undefined })
          field.onChange(f)
          focusAfterPick()
        } catch (e) {
          setRecError('Não consegui finalizar a gravação. Tente novamente.')
        } finally {
          resetRecorderState()
        }
      }

      recorderRef.current = recorder
      recorder.start()

      setRecording(true)
      setRecSeconds(0)
      tickRef.current = window.setInterval(() => setRecSeconds((s) => s + 1), 1000)
    } catch (e: any) {
      resetRecorderState()
      const msg = e?.name === 'NotAllowedError'
        ? 'Permissão negada. Autorize o uso do microfone/câmera para gravar.'
        : 'Não consegui iniciar a gravação. Verifique o dispositivo e tente novamente.'
      setRecError(msg)
    }
  }

  function stopRecording() {
    try {
      recorderRef.current?.stop()
    } catch {
      resetRecorderState()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        resetRecorderState()
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shellClass = embedded
    ? 'p-0'
    : 'rounded-xl border border-[rgba(var(--c-border),0.85)] bg-[rgba(var(--c-surface),0.65)] p-3'

  return (
    <div className={cn('mt-3', className)}>
      {/* Inputs invisíveis */}
      <input
        ref={pickRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={onPickInputChange}
        disabled={disabled}
      />
      <input
        ref={captureRef}
        type="file"
        accept={accept}
        // `capture` é um hint (especialmente em mobile) para abrir câmera/gravador.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        capture={capture}
        className="sr-only"
        onChange={onPickInputChange}
        disabled={disabled}
      />

      <div className={cn(shellClass)}>
        <div className="flex flex-wrap items-center gap-2">
          {!embedded && (
            <div className="flex items-center gap-2">
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(var(--c-primary),0.12)] text-[rgb(var(--c-primary))]"
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="text-sm font-semibold text-[rgb(var(--c-text))]">
                {mode === 'image' ? 'Imagem' : mode === 'audio' ? 'Áudio' : 'Vídeo'}
              </div>
            </div>
          )}

          <div className={cn(embedded ? '' : 'ml-auto', 'flex flex-wrap gap-2')}>
            <Button
              type="button"
              variant="secondary"
              className="h-10 px-3 py-2 text-sm"
              onClick={() => pickRef.current?.click()}
              disabled={disabled || recording}
              aria-label={_selectLabel}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {_selectLabel}
            </Button>

            <Button
              type="button"
              variant="secondary"
              className={cn('h-10 px-3 py-2 text-sm', recording && 'bg-red-600/12 text-red-700')}
              onClick={recording ? stopRecording : startRecording}
              disabled={disabled}
              aria-pressed={recording}
              aria-label={recording ? 'Parar gravação' : _recordLabel}
            >
              {recording ? <Square className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
              {recording ? 'Parar' : _recordLabel}
            </Button>

            {file && !recording && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 px-3 py-2 text-sm"
                onClick={() => {
                  setRecError(null)
                  clearFile()
                }}
                aria-label="Remover anexo"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Remover
              </Button>
            )}

            {!file && !recording && recError && (
              <Button
                type="button"
                variant="ghost"
                className="h-10 px-3 py-2 text-sm"
                onClick={() => setRecError(null)}
                aria-label="Fechar aviso"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Fechar
              </Button>
            )}
          </div>
        </div>

        {/* Status / erros */}
        <div className="mt-2">
          {recError && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {recError}
            </p>
          )}

          {recording && (
            <p className="text-xs font-semibold text-[rgb(var(--c-text))]" aria-live="polite">
              Gravando… {recSeconds}s
            </p>
          )}

          {!file && !recording && !recError && (
            <p className="text-xs text-[rgba(var(--c-text),0.70)]">
              Você pode escolher um arquivo do aparelho ou gravar agora.
            </p>
          )}

          {file && !recording && (
            <div className="mt-2 rounded-lg border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.70)] p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[rgb(var(--c-text))]">{file.name}</p>
                  <p className="text-[11px] text-[rgba(var(--c-text),0.70)]">{formatBytes(file.size)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 px-2 py-2 text-xs"
                  onClick={() => pickRef.current?.click()}
                  aria-label="Trocar arquivo"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Trocar
                </Button>
              </div>

              {previewUrl && mode === 'image' && (
                <img
                  src={previewUrl}
                  alt="Prévia da imagem anexada"
                  className="mt-2 max-h-44 w-full rounded-md object-contain"
                />
              )}

              {previewUrl && mode === 'audio' && (
                <audio className="mt-2 w-full" controls src={previewUrl}>
                  Seu navegador não suporta reprodução de áudio.
                </audio>
              )}

              {previewUrl && mode === 'video' && (
                <video className="mt-2 w-full rounded-md" controls src={previewUrl}>
                  Seu navegador não suporta reprodução de vídeo.
                </video>
              )}
            </div>
          )}

          {recording && mode === 'video' && (
            <div className="mt-3 rounded-lg border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.70)] p-2">
              <p className="text-[11px] font-semibold text-[rgba(var(--c-text),0.80)]">Prévia ao vivo</p>
              <video
                ref={liveVideoRef}
                className="mt-2 w-full rounded-md"
                muted
                playsInline
                autoPlay
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
