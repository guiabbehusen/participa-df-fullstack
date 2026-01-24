import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, Paperclip } from 'lucide-react'

import type { ManifestationCreatePayload, ManifestationKind } from '@/types/manifestation'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { ErrorSummary } from '@/components/a11y/ErrorSummary'
import { createManifestation } from '@/services/api/manifestations'
import { clearDraft, loadDraft, saveDraft } from '@/services/storage/draft'

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

const needsIdentification = (k?: ManifestationKind) =>
  k === 'elogio' || k === 'sugestao' || k === 'solicitacao'

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
    const imageFile = (data.image_file as FileList | undefined)?.[0]
    const audioFile = (data.audio_file as FileList | undefined)?.[0]
    const videoFile = (data.video_file as FileList | undefined)?.[0]

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

    // Regra: elogio/sugestão/solicitação exigem identificação
    if (needsIdentification(data.kind)) {
      if (data.anonymous) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['anonymous'],
          message: 'Para elogio, sugestão ou solicitação, a identificação é obrigatória (sem anonimato).',
        })
      }

      if (!data.contact_name || data.contact_name.trim().length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contact_name'],
          message: 'Informe seu nome (mín. 3 caracteres).',
        })
      }

      if (!data.contact_email || data.contact_email.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contact_email'],
          message: 'Informe um e-mail válido para contato.',
        })
      } else {
        const emailOk = z.string().email().safeParse(data.contact_email).success
        if (!emailOk) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['contact_email'],
            message: 'Informe um e-mail válido para contato.',
          })
        }
      }
    }
  })

type FormValues = z.infer<typeof schema>

export function NewManifestationPage() {
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
      image_alt: draft.image_alt || '',
      audio_transcript: draft.audio_transcript || '',
      video_description: draft.video_description || '',
    },
  })

  const kind = form.watch('kind')
  const anonymous = form.watch('anonymous')

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

        image_file: (values.image_file as FileList | undefined)?.[0],
        audio_file: (values.audio_file as FileList | undefined)?.[0],
        video_file: (values.video_file as FileList | undefined)?.[0],
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

  const errors = form.formState.errors

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
              Preencha com calma. Use frases simples e inclua <span className="font-semibold">o quê, onde e quando</span>. Se anexar arquivos, descreva-os para garantir acessibilidade.
            </p>
          </div>

          <div className="glass max-w-md p-4">
            <div className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4" aria-hidden="true" />
              <p className="text-sm leading-relaxed text-[rgba(var(--c-text),0.82)]">
                Precisa de ajuda? Use a <span className="font-semibold">IZA</span> no canto inferior direito. Você pode falar por áudio e ela responde por voz.
              </p>
            </div>
          </div>
        </div>
      </header>

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
        {/* 1) Identificação */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="info">1</Badge>
              <CardTitle>Identificação</CardTitle>
            </div>
            <CardDescription>
              Escolha o tipo e o assunto principal. O campo “Descreva o tema” ajuda o encaminhamento.
            </CardDescription>
          </CardHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-[rgb(var(--c-text))]" htmlFor="kind">
                Tipo de manifestação
              </label>
              <select
                id="kind"
                {...form.register('kind')}
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
                {...form.register('subject')}
                className="mt-2"
              />
              <p className="mt-2 text-xs text-[rgba(var(--c-text),0.70)]">
                Exemplos: {SUBJECT_EXAMPLES.join(' · ')}
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
              {...form.register('subject_detail')}
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
                    Para {kind === 'elogio' ? 'elogio' : kind === 'sugestao' ? 'sugestão' : 'solicitação'}, a identificação é obrigatória.
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
                <span className="block text-sm font-semibold text-[rgb(var(--c-text))]">
                  Enviar como anônimo
                </span>
                <span className="block text-sm text-[rgba(var(--c-text),0.78)]">
                  Não solicitaremos dados pessoais. Ainda assim, descreva bem o local e o contexto.
                </span>
              </span>
            </label>
            {errors.anonymous && <p className="mt-2 text-sm text-red-700">{errors.anonymous.message}</p>}
          </div>
        </Card>

        {/* 2) Relato e anexos */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="info">2</Badge>
              <CardTitle>Relato e anexos</CardTitle>
            </div>
            <CardDescription>
              Você pode enviar por texto e/ou anexar áudio, imagem e vídeo. Para acessibilidade, anexos exigem descrição.
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
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {/* Imagem */}
            <div className="rounded-xl border border-[rgba(var(--c-border),0.75)] bg-[rgba(var(--c-surface),0.75)] p-4">
              <p className="text-sm font-extrabold text-[rgb(var(--c-text))]">Imagem</p>
              <p className="mt-1 text-xs text-[rgba(var(--c-text),0.70)]">Opcional. JPG/PNG.</p>
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(var(--c-border),0.90)] bg-[rgba(var(--c-surface),0.85)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.18)]">
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                Anexar imagem
                <input type="file" accept="image/*" className="sr-only" {...form.register('image_file')} />
              </label>

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
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(var(--c-border),0.90)] bg-[rgba(var(--c-surface),0.85)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.18)]">
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                Anexar áudio
                <input type="file" accept="audio/*" className="sr-only" {...form.register('audio_file')} />
              </label>

              <label className="mt-3 block text-xs font-semibold text-[rgb(var(--c-text))]" htmlFor="audio_transcript">
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
              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(var(--c-border),0.90)] bg-[rgba(var(--c-surface),0.85)] px-3 py-3 text-sm font-semibold text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.18)]">
                <Paperclip className="h-4 w-4" aria-hidden="true" />
                Anexar vídeo
                <input type="file" accept="video/*" className="sr-only" {...form.register('video_file')} />
              </label>

              <label className="mt-3 block text-xs font-semibold text-[rgb(var(--c-text))]" htmlFor="video_description">
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

        {/* 3) Enviar */}
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
              }}
            >
              Limpar rascunho
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
