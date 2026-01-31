import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react'

import type { ManifestationCreatePayload, ManifestationKind } from '@/types/manifestation'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { ErrorSummary } from '@/components/a11y/ErrorSummary'
import { FormStepper, type FormStep } from '@/components/a11y/FormStepper'
import { MediaAttachmentField } from '@/components/attachments/MediaAttachmentField'
import { RegistrationGuidelines } from '@/components/guides/RegistrationGuidelines'
import { createManifestation } from '@/services/api/manifestations'
import { izaChat } from '@/services/api/iza'
import { clearDraft, loadDraft, saveDraft } from '@/services/storage/draft'

const MAX_ATTACHMENT_MB = 25
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024

function firstFile(v: unknown): File | undefined {
  if (!v) return undefined
  if (v instanceof File) return v
  const anyV: any = v as any
  if (typeof FileList !== 'undefined' && v instanceof FileList) return v.item(0) || undefined
  if (Array.isArray(anyV) && anyV[0] instanceof File) return anyV[0]
  if (anyV?.[0] instanceof File) return anyV[0]
  return undefined
}

function detectSensitiveInNarrative(text: string) {
  const t = (text || '').trim()
  if (!t) return [] as string[]

  const hits: string[] = []

  // CPF (com ou sem pontuação)
  if (/\b\d{3}\.?(\d{3})\.?(\d{3})-?\d{2}\b/.test(t)) hits.push('CPF')

  // e-mail
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t)) hits.push('E-mail')

  // Datas (pode indicar data de nascimento)
  if (/\b\d{2}[/-]\d{2}[/-]\d{4}\b/.test(t)) hits.push('Data')

  // Telefone (padrões comuns BR)
  if (/\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}\b/.test(t)) hits.push('Telefone')

  return Array.from(new Set(hits))
}

const KINDS: { value: ManifestationKind; label: string }[] = [
  { value: 'reclamacao', label: 'Reclamação' },
  { value: 'denuncia', label: 'Denúncia' },
  { value: 'sugestao', label: 'Sugestão' },
  { value: 'elogio', label: 'Elogio' },
  { value: 'solicitacao', label: 'Solicitação' },
]

const SUBJECT_EXAMPLES = [
  'Infraestrutura (buraco)',
  'Saúde (atendimento)',
  'Segurança (ocorrência)',
  'Iluminação pública',
  'Transporte',
]

const needsIdentification = (_k?: ManifestationKind) => false;
const isValidEmail = (email?: string) => {
  if (!email) return false;
  return z.string().email().safeParse(email).success;
};

const schema = z
  .object({
    kind: z.enum(['reclamacao', 'denuncia', 'sugestao', 'elogio', 'solicitacao']),

    subject: z.string().min(3, 'Informe o assunto (mín. 3 caracteres).').max(120),
    subject_detail: z.string().min(3, 'Descreva o tema (mín. 3 caracteres).').max(240),

    description_text: z.string().optional(),

    anonymous: z.boolean().default(false),
    contact_name: z.string().optional(),
    contact_email: z.string().optional(),
    contact_phone: z.string().optional(),

    image_file: z.any().optional(),
    image_alt: z.string().optional(),

    audio_file: z.any().optional(),
    audio_transcript: z.string().optional(),

    video_file: z.any().optional(),
    video_description: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const imageFile = firstFile(data.image_file)
    const audioFile = firstFile(data.audio_file)
    const videoFile = firstFile(data.video_file)

    // Limite de tamanho (orientação do canal): 25MB
    if (imageFile && imageFile.size > MAX_ATTACHMENT_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['image_file'],
        message: `Imagem acima do limite (${MAX_ATTACHMENT_MB}MB).`,
      })
    }
    if (audioFile && audioFile.size > MAX_ATTACHMENT_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['audio_file'],
        message: `Áudio acima do limite (${MAX_ATTACHMENT_MB}MB).`,
      })
    }
    if (videoFile && videoFile.size > MAX_ATTACHMENT_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['video_file'],
        message: `Vídeo acima do limite (${MAX_ATTACHMENT_MB}MB).`,
      })
    }

    const hasAnyFile = !!imageFile || !!audioFile || !!videoFile
    const hasText = !!(data.description_text && data.description_text.trim().length > 0)

    if (!hasText && !hasAnyFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['description_text'],
        message: 'Envie um relato em texto ou anexe pelo menos um arquivo.',
      })
    }

    // Acessibilidade: se anexar, exige descrição
    if (imageFile && (!data.image_alt || data.image_alt.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['image_alt'],
        message: 'Texto alternativo da imagem é obrigatório (mín. 3 caracteres).',
      })
    }

    if (audioFile && (!data.audio_transcript || data.audio_transcript.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['audio_transcript'],
        message: 'Transcrição do áudio é obrigatória (mín. 3 caracteres).',
      })
    }

    if (videoFile && (!data.video_description || data.video_description.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['video_description'],
        message: 'Descrição do vídeo é obrigatória (mín. 3 caracteres).',
      })
    }

    // Se o usuário preencher e-mail, valide formato.
    if (data.contact_email && data.contact_email.trim().length > 0) {
      const emailOk = z.string().email().safeParse(data.contact_email).success
      if (!emailOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contact_email'],
          message: 'Informe um e-mail válido para acompanhamento (ou deixe em branco).',
        })
      }
    }
  })

type FormValues = z.infer<typeof schema>

function kindLabel(kind?: ManifestationKind) {
  const found = KINDS.find((k) => k.value === kind)
  return found?.label || '—'
}

function fileSig(file?: File) {
  if (!file) return '0'
  return `${file.name}:${file.size}:${file.lastModified}`
}

export function NewManifestationPage() {
  const navigate = useNavigate()

  const relatoRef = useRef<HTMLElement | null>(null)
  const identificationRef = useRef<HTMLElement | null>(null)
  const sendRef = useRef<HTMLElement | null>(null)

  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1)
  const activeStepRef = useRef<1 | 2 | 3>(1)
  useEffect(() => {
    activeStepRef.current = activeStep
  }, [activeStep])


  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // IZA (Auto Form assist)
  const [izaSuggesting, setIzaSuggesting] = useState(false)
  const [izaSuggestError, setIzaSuggestError] = useState<string | null>(null)
  const [izaSuggestion, setIzaSuggestion] = useState<
    | {
        kind?: ManifestationKind
        subject?: string
        subject_detail?: string
      }
    | null
  >(null)
  const [izaUndoSnapshot, setIzaUndoSnapshot] = useState<{
    kind: ManifestationKind
    subject: string
    subject_detail: string
  } | null>(null)
  const [izaLastAutoAt, setIzaLastAutoAt] = useState<number | null>(null)

  // Se o usuário editar manualmente, não sobrescrevemos automaticamente.
  const [userOverride, setUserOverride] = useState({
    kind: false,
    subject: false,
    subject_detail: false,
  })
  const userOverrideRef = useRef(userOverride)
  useEffect(() => {
    userOverrideRef.current = userOverride
  }, [userOverride])

  const draft = useMemo(() => loadDraft() || {}, [])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      kind: (draft.kind as ManifestationKind) || 'reclamacao',
      subject: draft.subject || '',
      subject_detail: (draft as any).subject_detail || '',
      description_text: draft.description_text || '',
      anonymous: draft.anonymous || false,
      contact_name: (draft as any).contact_name || '',
      contact_email: (draft as any).contact_email || '',
      contact_phone: (draft as any).contact_phone || '',
      image_alt: (draft as any).image_alt || '',
      audio_transcript: (draft as any).audio_transcript || '',
      video_description: (draft as any).video_description || '',
    },
  })

  const kind = form.watch('kind')
  const anonymous = form.watch('anonymous')

  const descriptionTextLive = form.watch('description_text') || ''
  const subjectLive = form.watch('subject') || ''
  const subjectDetailLive = form.watch('subject_detail') || ''

  const imageAltLive = form.watch('image_alt') || ''
  const audioTranscriptLive = form.watch('audio_transcript') || ''
  const videoDescriptionLive = form.watch('video_description') || ''

  const contactNameLive = form.watch('contact_name') || ''
  const contactEmailLive = form.watch('contact_email') || ''

  const imageFile = firstFile(form.watch('image_file'))
  const audioFile = firstFile(form.watch('audio_file'))
  const videoFile = firstFile(form.watch('video_file'))
  const hasAnyAttachment = !!imageFile || !!audioFile || !!videoFile

  const hasAnyRelato = useMemo(() => {
    return (descriptionTextLive || '').trim().length > 0 || hasAnyAttachment
  }, [descriptionTextLive, hasAnyAttachment])

  const sensitiveHits = useMemo(() => detectSensitiveInNarrative(descriptionTextLive), [descriptionTextLive])

  const federalTopicDetected = useMemo(() => {
    const hay = `${subjectLive} ${descriptionTextLive}`.toLowerCase()
    return (
      hay.includes('inss') ||
      hay.includes('conecta sus') ||
      hay.includes('gov.br') ||
      hay.includes('fala br') ||
      hay.includes('governo federal')
    )
  }, [subjectLive, descriptionTextLive])

  // ===== Stepper: completude/etapas =====
  const step2Complete = useMemo(() => {
    const subjOk = (subjectLive || '').trim().length >= 3
    const detOk = (subjectDetailLive || '').trim().length >= 3
    if (!subjOk || !detOk) return false

    if (needsIdentification(kind)) {
      const nameOk = (contactNameLive || '').trim().length >= 3
      const emailOk = isValidEmail((contactEmailLive || '').trim())
      return nameOk && emailOk
    }

    // Se o usuário optou por acompanhar (preencheu e-mail), valide o formato
    const maybeEmail = (contactEmailLive || '').trim()
    if (maybeEmail.length > 0 && !isValidEmail(maybeEmail)) return false

    return true
  }, [kind, subjectLive, subjectDetailLive, contactNameLive, contactEmailLive])

  const step3Ready = hasAnyRelato && step2Complete

  const scrollToSection = (el?: HTMLElement | null) => {
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  // Highlight da etapa em viewport (acessível e natural)
  useEffect(() => {
    const s1 = document.getElementById('etapa-relato')
    const s2 = document.getElementById('etapa-identificacao')
    const s3 = document.getElementById('etapa-enviar')

    relatoRef.current = s1
    identificationRef.current = s2
    sendRef.current = s3

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top))

        const top = visible[0]
        const stepAttr = top?.target?.getAttribute('data-step')
        const step = stepAttr ? (Number(stepAttr) as 1 | 2 | 3) : null
        if (step && step !== activeStepRef.current) setActiveStep(step)
      },
      {
        // Mantém a troca de etapa estável mesmo com header/sticky
        rootMargin: '-30% 0px -60% 0px',
        threshold: [0.12, 0.22, 0.35],
      },
    )

    ;[s1, s2, s3].forEach((el) => el && obs.observe(el))

    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const steps: FormStep[] = useMemo(() => {
    return [
      {
        id: 'etapa-relato',
        label: 'Relato',
        description: 'Texto e anexos',
        state: activeStep === 1 ? 'current' : hasAnyRelato ? 'complete' : 'upcoming',
        disabled: false,
        onActivate: () => scrollToSection(relatoRef.current),
      },
      {
        id: 'etapa-identificacao',
        label: 'Identificação',
        description: 'Tipo, assunto e tema',
        state: activeStep === 2 ? 'current' : step2Complete ? 'complete' : 'upcoming',
        disabled: !hasAnyRelato,
        onActivate: () => scrollToSection(identificationRef.current),
      },
      {
        id: 'etapa-enviar',
        label: 'Enviar',
        description: 'Revisão e protocolo',
        state: activeStep === 3 ? 'current' : 'upcoming',
        disabled: !step3Ready,
        onActivate: () => scrollToSection(sendRef.current),
      },
    ]
  }, [activeStep, hasAnyRelato, step2Complete, step3Ready])

  // ===== Persistência do rascunho =====
  useEffect(() => {
    const sub = form.watch((values) => {
      // salvamos apenas campos serializáveis (sem File)
      const payload: Partial<ManifestationCreatePayload> = {
        kind: values.kind as ManifestationKind,
        subject: values.subject || '',
        subject_detail: values.subject_detail || '',
        description_text: values.description_text || '',
        anonymous: !!values.anonymous,
        contact_name: values.contact_name || '',
        contact_email: values.contact_email || '',
        contact_phone: values.contact_phone || '',
        image_alt: values.image_alt || '',
        audio_transcript: values.audio_transcript || '',
        video_description: values.video_description || '',
      }
      saveDraft(payload)
    })
    return () => sub.unsubscribe()
  }, [form])

  // Se o tipo exige identificação, garante que o usuário não fique em modo anônimo
  useEffect(() => {
    if (needsIdentification(kind) && anonymous) {
      form.setValue('anonymous', false, { shouldValidate: true, shouldDirty: true })
    }
  }, [kind, anonymous, form])

  async function onSubmit(values: FormValues) {
    setSubmitError(null)
    setSubmitting(true)

    try {
      const payload: ManifestationCreatePayload = {
        kind: values.kind as ManifestationKind,
        subject: values.subject,
        subject_detail: values.subject_detail,
        description_text: values.description_text?.trim() || undefined,
        anonymous: !!values.anonymous,

        contact_name: values.contact_name?.trim() || undefined,
        contact_email: values.contact_email?.trim() || undefined,
        contact_phone: values.contact_phone?.trim() || undefined,

        image_alt: values.image_alt?.trim() || undefined,
        audio_transcript: values.audio_transcript?.trim() || undefined,
        video_description: values.video_description?.trim() || undefined,

        image_file: firstFile(values.image_file),
        audio_file: firstFile(values.audio_file),
        video_file: firstFile(values.video_file),
      }

      const res = await createManifestation(payload)
      clearDraft()
      navigate(`/protocolos/${res.protocol}`, {
        state: {
          fromSubmit: true,
          initialResponseSlaDays: res.initial_response_sla_days,
        },
      })
    } catch (err: any) {
      setSubmitError(err?.message || 'Não foi possível enviar a manifestação.')
    } finally {
      setSubmitting(false)
    }
  }

  // ===== IZA: Auto sugestão (debounced + sem sobrescrever edição manual) =====
  const analysisText = useMemo(() => {
    const parts = [
      (descriptionTextLive || '').trim(),
      (imageAltLive || '').trim(),
      (audioTranscriptLive || '').trim(),
      (videoDescriptionLive || '').trim(),
    ].filter(Boolean)
    return parts.join('\n\n')
  }, [descriptionTextLive, imageAltLive, audioTranscriptLive, videoDescriptionLive])

  const analysisKey = useMemo(() => {
    return [
      analysisText,
      fileSig(imageFile),
      fileSig(audioFile),
      fileSig(videoFile),
      `anon:${anonymous ? 1 : 0}`,
    ].join('|')
  }, [analysisText, imageFile, audioFile, videoFile, anonymous])

  const shouldAutoSuggest = useMemo(() => {
    const descLen = (descriptionTextLive || '').trim().length
    const anyLen = (analysisText || '').trim().length

    // Queremos ser responsivos sem “martelar” a IA: mínimo de conteúdo antes de sugerir.
    // - Se há relato em texto: a partir de ~15 caracteres já dá contexto suficiente para classificar.
    // - Se há anexo: aceitamos texto menor (pois o usuário precisará preencher a descrição do anexo).
    if (descLen >= 15) return true
    if (hasAnyAttachment && anyLen >= 10) return true
    return false
  }, [analysisText, descriptionTextLive, hasAnyAttachment])

  const autoTimerRef = useRef<number | null>(null)
  const autoHydratedRef = useRef(false)
  const autoLastAppliedKeyRef = useRef<string | null>(null)
  const autoInFlightRef = useRef(false)
  const autoQueuedKeyRef = useRef<string | null>(null)
  const latestKeyRef = useRef(analysisKey)

  useEffect(() => {
    latestKeyRef.current = analysisKey
  }, [analysisKey])

  async function runAutoSuggest(key: string) {
    if (!shouldAutoSuggest) return

    // Evita paralelismo: enfileira a chave mais recente
    if (autoInFlightRef.current) {
      autoQueuedKeyRef.current = key
      return
    }

    autoInFlightRef.current = true
    setIzaSuggestError(null)
    setIzaSuggesting(true)

    // snapshot para desfazer
    setIzaUndoSnapshot({
      kind: form.getValues('kind'),
      subject: form.getValues('subject'),
      subject_detail: form.getValues('subject_detail'),
    })

    try {
      const desc = (form.getValues('description_text') || '').trim()
      const img = firstFile(form.getValues('image_file'))
      const aud = firstFile(form.getValues('audio_file'))
      const vid = firstFile(form.getValues('video_file'))

      const draftForIza: any = {
        description_text: desc || undefined,
        anonymous: form.getValues('anonymous'),

        contact_name: (form.getValues('contact_name') || '').trim() || undefined,
        contact_email: (form.getValues('contact_email') || '').trim() || undefined,
        contact_phone: (form.getValues('contact_phone') || '').trim() || undefined,

        image_alt: (form.getValues('image_alt') || '').trim() || undefined,
        audio_transcript: (form.getValues('audio_transcript') || '').trim() || undefined,
        video_description: (form.getValues('video_description') || '').trim() || undefined,

        // Apenas sinal (truthy) — o api layer transforma isso em has_* booleans.
        image_file: img,
        audio_file: aud,
        video_file: vid,
      }

      const res = await izaChat(
        [
          {
            role: 'user',
            content:
              'Com base no RELATO e nos ANEXOS do rascunho, sugira e preencha APENAS no draft_patch: kind, subject e subject_detail. ' +
              'Não faça perguntas. Não solicite dados pessoais.',
          },
        ],
        draftForIza,
      )

      // Se o usuário já mudou o texto enquanto a IZA respondia, ignoramos este resultado e enfileiramos o mais recente.
      if (key !== latestKeyRef.current) {
        autoQueuedKeyRef.current = latestKeyRef.current
        return
      }

      const patch: any = res?.draft_patch || {}
      const nextKind = patch.kind as ManifestationKind | undefined
      const nextSubject = typeof patch.subject === 'string' ? patch.subject.trim() : undefined
      const nextDetail = typeof patch.subject_detail === 'string' ? patch.subject_detail.trim() : undefined

      const overrides = userOverrideRef.current

      if (
        nextKind &&
        ['reclamacao', 'denuncia', 'sugestao', 'elogio', 'solicitacao'].includes(nextKind) &&
        !overrides.kind
      ) {
        form.setValue('kind', nextKind, { shouldValidate: true, shouldDirty: true })
      }

      if (nextSubject && nextSubject.length >= 3 && !overrides.subject) {
        form.setValue('subject', nextSubject, { shouldValidate: true, shouldDirty: true })
      }

      if (nextDetail && nextDetail.length >= 3 && !overrides.subject_detail) {
        form.setValue('subject_detail', nextDetail, { shouldValidate: true, shouldDirty: true })
      }

      if (typeof patch.anonymous === 'boolean') {
        form.setValue('anonymous', patch.anonymous, { shouldValidate: true, shouldDirty: true })
      }

      setIzaSuggestion({
        kind: nextKind,
        subject: nextSubject,
        subject_detail: nextDetail,
      })
      setIzaLastAutoAt(Date.now())
      autoLastAppliedKeyRef.current = key
    } catch (e: any) {
      setIzaSuggestError(e?.message || 'Não consegui usar a IZA agora. Verifique se o backend e o Ollama estão ativos.')
    } finally {
      setIzaSuggesting(false)
      autoInFlightRef.current = false

      const queued = autoQueuedKeyRef.current
      autoQueuedKeyRef.current = null

      if (queued && queued !== autoLastAppliedKeyRef.current) {
        // roda a versão mais recente (se houver)
        runAutoSuggest(queued)
      }
    }
  }

  useEffect(() => {
    // Evita chamada pesada no primeiro paint (apenas ao usuário começar a digitar/anexar)
    if (!autoHydratedRef.current) {
      autoHydratedRef.current = true
      return
    }

    if (!shouldAutoSuggest) return

    if (analysisKey === autoLastAppliedKeyRef.current) return

    if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current)

    autoTimerRef.current = window.setTimeout(() => {
      runAutoSuggest(analysisKey)
    }, 1100)

    return () => {
      if (autoTimerRef.current) window.clearTimeout(autoTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisKey, shouldAutoSuggest])

  function undoIzaSuggestion() {
    if (!izaUndoSnapshot) return
    form.setValue('kind', izaUndoSnapshot.kind, { shouldValidate: true, shouldDirty: true })
    form.setValue('subject', izaUndoSnapshot.subject, { shouldValidate: true, shouldDirty: true })
    form.setValue('subject_detail', izaUndoSnapshot.subject_detail, { shouldValidate: true, shouldDirty: true })
    setIzaSuggestion(null)
    setIzaUndoSnapshot(null)
    setIzaSuggestError(null)
  }

  const overriddenFields = useMemo(() => {
    const items: string[] = []
    if (userOverride.kind) items.push('Tipo')
    if (userOverride.subject) items.push('Assunto')
    if (userOverride.subject_detail) items.push('Tema')
    return items
  }, [userOverride])

  const errors = form.formState.errors

  // ===== Registers (com tracking de override manual) =====
  const kindReg = form.register('kind')
  const subjectReg = form.register('subject')
  const detailReg = form.register('subject_detail')

  return (
    <div className="space-y-6">
      <header className="surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">Formulário</Badge>
              <Badge>Inclusão e acessibilidade</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[rgb(var(--c-text))]">
              Nova manifestação
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[rgba(var(--c-text),0.80)]">
              Comece pelo <span className="font-semibold">relato</span>. Em seguida, a IZA{' '}
              <span className="font-semibold">preenche automaticamente</span> o{' '}
              <span className="font-semibold">tipo</span>, o <span className="font-semibold">assunto</span> e o{' '}
              <span className="font-semibold">tema</span>. Você sempre pode ajustar antes de enviar.
            </p>
          </div>

          <div className="glass max-w-md p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-[rgba(var(--c-text),0.82)]">
                Precisa de ajuda? Use a <span className="font-semibold">IZA</span> no canto inferior direito. Você
                pode falar por áudio e ela responde por voz.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Stepper (WCAG) */}
      <FormStepper steps={steps} />

      {/* Orientações do canal (visível e acessível) */}
      <RegistrationGuidelines />

      {/* Erros (WCAG) */}
      <ErrorSummary errors={errors} />

      {submitError && (
        <div className="rounded-xl border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden="true" />
            <p className="leading-relaxed">
              <span className="font-semibold">Falha ao enviar:</span> {submitError}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {/* 1) Relato e anexos */}
        <section
          id="etapa-relato"
          data-step="1"
          className="scroll-mt-24"
          aria-label="Etapa 1: Relato e anexos"
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="info">1</Badge>
                <CardTitle>Relato e anexos</CardTitle>
              </div>
              <CardDescription>
                Escreva seu relato (o quê, onde, quando, impacto) e anexe arquivos se quiser. Para acessibilidade,
                anexos exigem descrição.
              </CardDescription>
            </CardHeader>

            <div>
              <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="description_text">
                Relato em texto
              </label>
              <Textarea
                id="description_text"
                rows={6}
                placeholder="Escreva o que aconteceu (o quê, onde, quando) e o impacto."
                {...form.register('description_text')}
                className="mt-2"
              />
              {errors.description_text && (
                <p className="mt-2 text-sm text-red-700">{errors.description_text.message as any}</p>
              )}

              {/* Privacidade (orientação): evita dados pessoais no relato */}
              {sensitiveHits.length > 0 && (
                <div className="mt-4 rounded-xl border border-[rgba(var(--c-warning),0.30)] bg-[rgba(var(--c-warning),0.12)] p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden="true" />
                    <p className="text-sm leading-relaxed text-[rgba(var(--c-text),0.85)]">
                      Para proteger seus dados, evite incluir informações pessoais no texto do registro (ex.: CPF,
                      e-mail, data de nascimento). Use os campos de identificação quando necessário.
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sensitiveHits.map((h) => (
                      <Badge key={h} variant="warning">
                        {h}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Direcionamento: assunto federal -> Fala BR */}
              {federalTopicDetected && (
                <div className="mt-4 rounded-xl border border-[rgba(var(--c-primary),0.25)] bg-[rgba(var(--c-primary),0.08)] p-4">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4" aria-hidden="true" />
                    <p className="text-sm leading-relaxed text-[rgba(var(--c-text),0.85)]">
                      Parece um assunto do Governo Federal (ex.: INSS, Conecta SUS, gov.br). Para esses temas, use o
                      sistema{' '}
                      <a
                        className="font-semibold text-[rgb(var(--c-primary))] underline underline-offset-2"
                        href="https://falabr.cgu.gov.br"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Fala BR
                      </a>
                      .
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {/* Imagem */}
              <div className="rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.75)] p-4">
                <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Imagem</p>
                <p className="mt-1 text-xs text-[rgba(var(--c-text),0.70)]">Opcional. JPG/PNG.</p>
                <MediaAttachmentField
                  control={form.control}
                  name="image_file"
                  mode="image"
                  embedded
                  accept="image/*"
                  capture="environment"
                  selectLabel="Escolher imagem"
                  recordLabel="Tirar foto"
                  afterPickFocusId="image_alt"
                />

                <label className="mt-3 block text-xs font-semibold text-[rgb(var(--c-text))]" htmlFor="image_alt">
                  Texto alternativo da imagem (obrigatório se anexar)
                </label>
                <Input
                  id="image_alt"
                  placeholder='Ex.: "Foto de buraco na Rua X, em frente ao nº 120, com cones ao lado."'
                  {...form.register('image_alt')}
                  className="mt-2"
                />
                {errors.image_alt && <p className="mt-2 text-sm text-red-700">{errors.image_alt.message}</p>}
              </div>

              {/* Áudio */}
              <div className="rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.75)] p-4">
                <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Áudio</p>
                <p className="mt-1 text-xs text-[rgba(var(--c-text),0.70)]">Opcional. mp3/m4a/wav.</p>
                <MediaAttachmentField
                  control={form.control}
                  name="audio_file"
                  mode="audio"
                  embedded
                  accept="audio/*"
                  capture="microphone"
                  selectLabel="Escolher áudio"
                  recordLabel="Gravar áudio"
                  afterPickFocusId="audio_transcript"
                  autoTranscribe
                  autoTranscribeLang="pt-BR"
                  onAutoTranscription={(text) => {
                    // Preenche automaticamente a transcrição para acessibilidade (o usuário ainda pode editar)
                    form.setValue('audio_transcript', text, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: true,
                    })
                  }}
                />

                <label
                  className="mt-3 block text-xs font-semibold text-[rgb(var(--c-text))]"
                  htmlFor="audio_transcript"
                >
                  Transcrição do áudio (obrigatório se anexar)
                </label>
                <Textarea
                  id="audio_transcript"
                  rows={3}
                  placeholder="A transcrição garante acessibilidade e facilita encaminhamento."
                  {...form.register('audio_transcript')}
                  className="mt-2"
                />
                {errors.audio_transcript && (
                  <p className="mt-2 text-sm text-red-700">{errors.audio_transcript.message}</p>
                )}
              </div>

              {/* Vídeo */}
              <div className="rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.75)] p-4">
                <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Vídeo</p>
                <p className="mt-1 text-xs text-[rgba(var(--c-text),0.70)]">Opcional. mp4/mov.</p>
                <MediaAttachmentField
                  control={form.control}
                  name="video_file"
                  mode="video"
                  embedded
                  accept="video/*"
                  capture="environment"
                  selectLabel="Escolher vídeo"
                  recordLabel="Gravar vídeo"
                  afterPickFocusId="video_description"
                />

                <label
                  className="mt-3 block text-xs font-semibold text-[rgb(var(--c-text))]"
                  htmlFor="video_description"
                >
                  Descrição do vídeo (obrigatório se anexar)
                </label>
                <Input
                  id="video_description"
                  placeholder='Ex.: "Vídeo mostrando poste apagado na esquina, à noite, por ~10s."'
                  {...form.register('video_description')}
                  className="mt-2"
                />
                {errors.video_description && (
                  <p className="mt-2 text-sm text-red-700">{errors.video_description.message}</p>
                )}
              </div>
            </div>

            {/* IZA preenche automaticamente tipo/assunto/tema */}
            <div className="mt-6 rounded-2xl border border-[rgba(var(--c-primary),0.22)] bg-[rgba(var(--c-primary),0.06)] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-white/60 ring-1 ring-[rgba(var(--c-border),0.55)]">
                    <Sparkles className="h-4 w-4 text-[rgb(var(--c-primary))]" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">IZA preenche automaticamente</p>
                    <p className="mt-1 text-sm leading-relaxed text-[rgba(var(--c-text),0.82)]">
                      Conforme você escreve, a IZA atualiza <span className="font-semibold">tipo</span>,{' '}
                      <span className="font-semibold">assunto</span> e <span className="font-semibold">tema</span>. Se
                      você editar manualmente, a IZA respeita sua escolha.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 px-4 text-sm"
                    onClick={() => {
                      // reativar e forçar atualização
                      setUserOverride({ kind: false, subject: false, subject_detail: false })
                      if (shouldAutoSuggest) runAutoSuggest(latestKeyRef.current)
                    }}
                    disabled={!shouldAutoSuggest || izaSuggesting}
                    aria-disabled={!shouldAutoSuggest || izaSuggesting}
                  >
                    Atualizar sugestões
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-9 px-4 text-sm"
                    onClick={undoIzaSuggestion}
                    disabled={!izaUndoSnapshot}
                    aria-disabled={!izaUndoSnapshot}
                  >
                    Desfazer
                  </Button>
                </div>
              </div>

              {/* Status / feedback (acessível) */}
              <div className="sr-only" aria-live="polite">
                {izaSuggesting
                  ? 'IZA está analisando o relato.'
                  : izaSuggestion
                    ? 'Sugestões da IZA aplicadas.'
                    : shouldAutoSuggest
                      ? 'Sugestões prontas.'
                      : 'Escreva o relato para receber sugestões.'}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[rgba(var(--c-text),0.72)]">
                {izaSuggesting ? (
                  <span className="rounded-full bg-white/60 px-3 py-1 ring-1 ring-[rgba(var(--c-border),0.55)]">
                    IZA analisando…
                  </span>
                ) : shouldAutoSuggest ? (
                  <span className="rounded-full bg-white/60 px-3 py-1 ring-1 ring-[rgba(var(--c-border),0.55)]">
                    Atualização automática ativa
                    {izaLastAutoAt ? (
                      <span className="ml-2 text-[rgba(var(--c-text),0.70)]">
                        · Última atualização: {new Date(izaLastAutoAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="rounded-full bg-white/60 px-3 py-1 ring-1 ring-[rgba(var(--c-border),0.55)]">
                    Escreva pelo menos alguns detalhes para eu sugerir o tipo e assunto.
                  </span>
                )}

                {overriddenFields.length > 0 ? (
                  <span className="rounded-full bg-[rgba(var(--c-warning),0.15)] px-3 py-1 ring-1 ring-[rgba(var(--c-warning),0.25)]">
                    Você ajustou manualmente: {overriddenFields.join(', ')}.
                  </span>
                ) : null}
              </div>

              {izaSuggestError && (
                <div className="mt-4 rounded-xl border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden="true" />
                    <p className="leading-relaxed">
                      <span className="font-semibold">IZA:</span> {izaSuggestError}
                    </p>
                  </div>
                </div>
              )}

              {izaSuggestion && (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-[rgba(var(--c-border),0.65)] bg-white/70 p-4">
                    <p className="text-xs font-semibold text-[rgba(var(--c-text),0.70)]">Tipo sugerido</p>
                    <p className="mt-1 text-sm font-extrabold text-[rgb(var(--c-text))]">
                      {kindLabel(izaSuggestion.kind)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[rgba(var(--c-border),0.65)] bg-white/70 p-4">
                    <p className="text-xs font-semibold text-[rgba(var(--c-text),0.70)]">Assunto sugerido</p>
                    <p className="mt-1 text-sm font-extrabold text-[rgb(var(--c-text))]">
                      {izaSuggestion.subject?.trim() || '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[rgba(var(--c-border),0.65)] bg-white/70 p-4">
                    <p className="text-xs font-semibold text-[rgba(var(--c-text),0.70)]">Tema sugerido</p>
                    <p className="mt-1 text-sm font-extrabold text-[rgb(var(--c-text))]">
                      {izaSuggestion.subject_detail?.trim() || '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 rounded-xl border border-[rgba(var(--c-success),0.25)] bg-[rgba(var(--c-success),0.08)] p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-[rgba(var(--c-text),0.85)]">
                  Ao enviar, você receberá um protocolo automaticamente.
                  <span className="font-semibold"> Prazo inicial de resposta: 10 dias</span>.
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* 2) Identificação */}
        <section
          id="etapa-identificacao"
          data-step="2"
          className="scroll-mt-24"
          aria-label="Etapa 2: Identificação"
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="info">2</Badge>
                <CardTitle>Identificação</CardTitle>
              </div>
              <CardDescription>
                Confirme ou ajuste o tipo e o assunto principal. Se escolher elogio/sugestão/solicitação, a
                identificação é obrigatória.
              </CardDescription>
            </CardHeader>

            {izaSuggestion && (
              <div className="mb-4 rounded-xl border border-[rgba(var(--c-border),0.65)] bg-[rgba(var(--c-surface),0.75)] p-4">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-[rgba(var(--c-text),0.82)]">
                    Sugestão aplicada pela IZA. Se algo não estiver correto, você pode ajustar abaixo.
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="kind">
                  Tipo de manifestação
                </label>
                <select
                  id="kind"
                  {...kindReg}
                  onChange={(e) => {
                    kindReg.onChange(e)
                    setUserOverride((s) => ({ ...s, kind: true }))
                  }}
                  className="mt-2 w-full rounded-xl border border-[rgba(var(--c-border),0.85)] bg-[rgb(var(--c-surface))] px-4 py-3 text-base text-[rgb(var(--c-text))]"
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                {errors.kind && <p className="mt-2 text-sm text-red-700">{errors.kind.message}</p>}
              </div>

              <div>
                <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="subject">
                  Assunto
                </label>
                <Input
                  id="subject"
                  placeholder={SUBJECT_EXAMPLES[0]}
                  {...subjectReg}
                  onChange={(e) => {
                    subjectReg.onChange(e)
                    setUserOverride((s) => ({ ...s, subject: true }))
                  }}
                  className="mt-2"
                />
                <p className="mt-2 text-xs text-[rgba(var(--c-text),0.70)]">
                  Exemplos: {SUBJECT_EXAMPLES.join(' · ')}
                </p>
                <p className="mt-1 text-xs text-[rgba(var(--c-text),0.72)]">
                  Dica: cada registro deve conter apenas <span className="font-semibold">1 assunto</span>.
                </p>
                {errors.subject && <p className="mt-2 text-sm text-red-700">{errors.subject.message}</p>}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="subject_detail">
                Descreva o tema
              </label>
              <Input
                id="subject_detail"
                placeholder="Informe o assunto com um pouco mais de detalhe (mín. 3 caracteres)."
                {...detailReg}
                onChange={(e) => {
                  detailReg.onChange(e)
                  setUserOverride((s) => ({ ...s, subject_detail: true }))
                }}
                className="mt-2"
              />
              {errors.subject_detail && (
                <p className="mt-2 text-sm text-red-700">{errors.subject_detail.message}</p>
              )}
            </div>

            {/* Identificação obrigatória */}
            {needsIdentification(kind) && (
              <div className="mt-5 rounded-xl border border-[rgba(var(--c-primary),0.25)] bg-[rgba(var(--c-primary),0.08)] p-4">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-[rgb(var(--c-text))]">
                      Para {kind === 'elogio' ? 'elogio' : kind === 'sugestao' ? 'sugestão' : 'solicitação'}, a
                      identificação é obrigatória.
                    </p>
                    <p className="mt-1 text-sm text-[rgba(var(--c-text),0.80)]">
                      Isso permite retorno e acompanhamento. O envio anônimo fica desabilitado.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="contact_name">
                      Seu nome
                    </label>
                    <Input id="contact_name" {...form.register('contact_name')} className="mt-2" />
                    {errors.contact_name && (
                      <p className="mt-2 text-sm text-red-700">{errors.contact_name.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="contact_email">
                      E-mail
                    </label>
                    <Input
                      id="contact_email"
                      type="email"
                      inputMode="email"
                      placeholder="seuemail@exemplo.com"
                      {...form.register('contact_email')}
                      className="mt-2"
                    />
                    {errors.contact_email && (
                      <p className="mt-2 text-sm text-red-700">{errors.contact_email.message}</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="contact_phone">
                      Telefone (opcional)
                    </label>
                    <Input
                      id="contact_phone"
                      inputMode="tel"
                      placeholder="(61) 9XXXX-XXXX"
                      {...form.register('contact_phone')}
                      className="mt-2"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Anônimo */}
            <div className="mt-5">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  {...form.register('anonymous')}
                  disabled={needsIdentification(kind)}
                  className="mt-1 h-5 w-5 rounded border-[rgba(var(--c-border),0.85)]"
                />
                <span>
                  <span className="block text-sm font-semibold text-[rgb(var(--c-text))]">Enviar como anônimo</span>
                  <span className="block text-sm text-[rgba(var(--c-text),0.78)]">
                    Você pode registrar sem se identificar. Nesse caso, não poderá acompanhar nem receber a resposta.
                    Ainda assim, descreva bem o local e o contexto.
                  </span>
                </span>
              </label>
              {errors.anonymous && <p className="mt-2 text-sm text-red-700">{errors.anonymous.message}</p>}
            </div>

            {/* Acompanhamento opcional (para reclamação/denúncia) */}
            {!needsIdentification(kind) && !anonymous && (
              <div className="mt-5 rounded-xl border border-[rgba(var(--c-primary),0.20)] bg-[rgba(var(--c-primary),0.06)] p-4">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold text-[rgb(var(--c-text))]">
                        Quero acompanhar e receber resposta (opcional)
                      </span>
                      <span className="mt-1 block text-sm text-[rgba(var(--c-text),0.78)]">
                        Para acompanhamento, informe seu e-mail. Se preferir não informar, tudo bem: você ainda receberá
                        o protocolo.
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-1 h-6 w-6 shrink-0 rounded-full bg-white/70 text-[rgba(var(--c-text),0.70)] ring-1 ring-[rgba(var(--c-border),0.60)] transition group-open:rotate-180"
                      style={{ display: 'grid', placeItems: 'center' }}
                    >
                      ▾
                    </span>
                  </summary>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="contact_name">
                        Seu nome
                      </label>
                      <Input id="contact_name" {...form.register('contact_name')} className="mt-2" />
                      {errors.contact_name && (
                        <p className="mt-2 text-sm text-red-700">{errors.contact_name.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="contact_email">
                        E-mail
                      </label>
                      <Input
                        id="contact_email"
                        type="email"
                        inputMode="email"
                        placeholder="seuemail@exemplo.com"
                        {...form.register('contact_email')}
                        className="mt-2"
                      />
                      {errors.contact_email && (
                        <p className="mt-2 text-sm text-red-700">{errors.contact_email.message}</p>
                      )}
                      <p className="mt-2 text-xs text-[rgba(var(--c-text),0.72)]">
                        O acompanhamento será associado ao e-mail informado.
                      </p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="contact_phone">
                        Telefone (opcional)
                      </label>
                      <Input
                        id="contact_phone"
                        inputMode="tel"
                        placeholder="(61) 9XXXX-XXXX"
                        {...form.register('contact_phone')}
                        className="mt-2"
                      />
                    </div>
                  </div>
                </details>
              </div>
            )}

            {/* Se estiver anônimo, explique a consequência (sem assustar) */}
            {!needsIdentification(kind) && anonymous && (
              <div className="mt-4 rounded-xl border border-[rgba(var(--c-warning),0.25)] bg-[rgba(var(--c-warning),0.10)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4" aria-hidden="true" />
                    <p className="text-sm leading-relaxed text-[rgba(var(--c-text),0.85)]">
                      Modo anônimo ativo: você não poderá acompanhar nem receber resposta por e-mail.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-4"
                    onClick={() => form.setValue('anonymous', false, { shouldValidate: true, shouldDirty: true })}
                  >
                    Quero acompanhar
                  </Button>
                </div>
              </div>
            )}

            {/* Proteção ao denunciante (reforço de confiança) */}
            {kind === 'denuncia' && (
              <div className="mt-4 rounded-xl border border-[rgba(var(--c-success),0.25)] bg-[rgba(var(--c-success),0.08)] p-4">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-[rgba(var(--c-text),0.85)]">
                    <span className="font-semibold">Proteção ao denunciante:</span> denúncias são tratadas com sigilo.
                    Evite expor dados pessoais no relato.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* 3) Enviar */}
        <section id="etapa-enviar" data-step="3" className="scroll-mt-24" aria-label="Etapa 3: Enviar">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge variant="info">3</Badge>
                <CardTitle>Enviar</CardTitle>
              </div>
              <CardDescription>Revise antes de enviar. Você pode limpar o rascunho se quiser recomeçar.</CardDescription>
            </CardHeader>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" className="px-6" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar e gerar protocolo'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="px-6"
                onClick={() => {
                  form.reset({
                    kind: 'reclamacao',
                    subject: '',
                    subject_detail: '',
                    description_text: '',
                    anonymous: false,
                    contact_name: '',
                    contact_email: '',
                    contact_phone: '',
                    image_alt: '',
                    audio_transcript: '',
                    video_description: '',
                  })
                  clearDraft()
                  setSubmitError(null)
                  setIzaSuggestion(null)
                  setIzaUndoSnapshot(null)
                  setIzaSuggestError(null)
                  setUserOverride({ kind: false, subject: false, subject_detail: false })
                }}
              >
                Limpar rascunho
              </Button>
            </div>

            {!step3Ready && (
              <p className="mt-3 text-sm text-[rgba(var(--c-text),0.78)]">
                Para enviar, complete o <span className="font-semibold">relato</span> e confirme a{' '}
                <span className="font-semibold">identificação</span>.
              </p>
            )}
          </Card>
        </section>
      </form>
    </div>
  )
}
