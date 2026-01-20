import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { ErrorSummary, type ErrorItem } from '@/components/a11y/ErrorSummary'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardDescription, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { createManifestation } from '@/services/api/manifestations'
import { clearDraft, loadDraft, saveDraft } from '@/services/storage/draft'
import type { ManifestationCreatePayload, ManifestationKind } from '@/types/manifestation'

const schema = z
  .object({
    kind: z.enum(['reclamacao', 'denuncia', 'sugestao', 'elogio', 'solicitacao'], {
      required_error: 'Selecione o tipo de manifestação.',
    }),
    subject: z
      .string()
      .min(3, 'Informe o assunto (mín. 3 caracteres).')
      .max(120, 'Assunto muito longo.'),
    description_text: z.string().max(5000).optional().or(z.literal('')),
    anonymous: z.boolean().default(false),

    audio_file: z.any().optional(),
    audio_transcript: z.string().max(5000).optional().or(z.literal('')),

    image_file: z.any().optional(),
    image_alt: z.string().max(400).optional().or(z.literal('')),

    video_file: z.any().optional(),
    video_description: z.string().max(800).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    const hasText = !!data.description_text && data.description_text.trim().length > 0
    const hasAudio = data.audio_file instanceof File
    const hasImage = data.image_file instanceof File
    const hasVideo = data.video_file instanceof File

    if (!hasText && !hasAudio && !hasImage && !hasVideo) {
      ctx.addIssue({
        code: 'custom',
        message: 'Envie um relato em texto ou anexe pelo menos um arquivo.',
        path: ['description_text'],
      })
    }

    if (hasAudio && (!data.audio_transcript || data.audio_transcript.trim().length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Áudio anexado requer transcrição (acessibilidade).',
        path: ['audio_transcript'],
      })
    }

    if (hasImage && (!data.image_alt || data.image_alt.trim().length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Imagem anexada requer texto alternativo (acessibilidade).',
        path: ['image_alt'],
      })
    }

    if (hasVideo && (!data.video_description || data.video_description.trim().length === 0)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Vídeo anexado requer descrição (acessibilidade).',
        path: ['video_description'],
      })
    }
  })

type FormValues = z.infer<typeof schema>

export function NewManifestationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const draft = useMemo(() => loadDraft(), [])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      kind: (draft?.kind as ManifestationKind) || 'reclamacao',
      subject: (draft?.subject as string) || '',
      description_text: (draft?.description_text as string) || '',
      anonymous: !!draft?.anonymous,
      audio_transcript: (draft?.audio_transcript as string) || '',
      image_alt: (draft?.image_alt as string) || '',
      video_description: (draft?.video_description as string) || '',
    },
  })

  // Prefill vindo da IZA (query params)
  useEffect(() => {
    const kind = searchParams.get('kind') as ManifestationKind | null
    const subject = searchParams.get('subject')
    if (kind) form.setValue('kind', kind)
    if (subject) form.setValue('subject', subject)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Salvamento de rascunho (sem arquivos)
  useEffect(() => {
    const sub = form.watch((values) => {
      saveDraft({
        kind: values.kind,
        subject: values.subject,
        description_text: values.description_text,
        anonymous: values.anonymous,
        audio_transcript: values.audio_transcript,
        image_alt: values.image_alt,
        video_description: values.video_description,
      })
    })
    return () => sub.unsubscribe()
  }, [form])

  const errorsList: ErrorItem[] = useMemo(() => {
    const e = form.formState.errors
    const list: ErrorItem[] = []

    if (e.kind?.message) list.push({ fieldId: 'kind', message: String(e.kind.message) })
    if (e.subject?.message) list.push({ fieldId: 'subject', message: String(e.subject.message) })
    if (e.description_text?.message) list.push({ fieldId: 'description_text', message: String(e.description_text.message) })
    if (e.audio_transcript?.message) list.push({ fieldId: 'audio_transcript', message: String(e.audio_transcript.message) })
    if (e.image_alt?.message) list.push({ fieldId: 'image_alt', message: String(e.image_alt.message) })
    if (e.video_description?.message) list.push({ fieldId: 'video_description', message: String(e.video_description.message) })

    return list
  }, [form.formState.errors])

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    setSubmitError(null)

    try {
      const payload: ManifestationCreatePayload = {
        kind: values.kind,
        subject: values.subject,
        description_text: values.description_text?.trim() ? values.description_text.trim() : undefined,
        anonymous: values.anonymous,

        audio_transcript: values.audio_transcript?.trim() ? values.audio_transcript.trim() : undefined,
        image_alt: values.image_alt?.trim() ? values.image_alt.trim() : undefined,
        video_description: values.video_description?.trim() ? values.video_description.trim() : undefined,

        audio_file: values.audio_file instanceof File ? values.audio_file : undefined,
        image_file: values.image_file instanceof File ? values.image_file : undefined,
        video_file: values.video_file instanceof File ? values.video_file : undefined,
      }

      const res = await createManifestation(payload)
      clearDraft()
      navigate(`/protocolos/${encodeURIComponent(res.protocol)}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao enviar manifestação')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-50">Registrar manifestação</h1>
          <p className="mt-1 text-sm text-slate-200/70">
            Campos com anexos exigem descrição alternativa.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info">Protocolo automático</Badge>
          <Badge variant="default">Opção de anonimato</Badge>
        </div>
      </div>

      <ErrorSummary errors={errorsList} />

      {submitError && (
        <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          {submitError}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Card>
          <CardTitle>1) Identificação</CardTitle>
          <CardDescription>Escolha o tipo e o assunto principal.</CardDescription>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <fieldset id="kind" className="space-y-2">
                <legend className="text-sm font-semibold text-slate-50">Tipo de manifestação</legend>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: 'reclamacao', label: 'Reclamação' },
                      { value: 'denuncia', label: 'Denúncia' },
                      { value: 'sugestao', label: 'Sugestão' },
                      { value: 'elogio', label: 'Elogio' },
                      { value: 'solicitacao', label: 'Solicitação' },
                    ] as const
                  ).map((o) => (
                    <label
                      key={o.value}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-slate-50 hover:bg-white/10"
                    >
                      <input
                        type="radio"
                        value={o.value}
                        {...form.register('kind')}
                        className="h-4 w-4"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>

                {form.formState.errors.kind?.message && (
                  <p className="mt-2 text-sm text-red-200">{String(form.formState.errors.kind.message)}</p>
                )}
              </fieldset>
            </div>

            <div>
              <label htmlFor="subject" className="text-sm font-semibold text-slate-50">
                Assunto
              </label>
              <p className="mt-1 text-xs text-slate-200/60">
                Ex.: Infraestrutura (buraco), Saúde (atendimento), Segurança (ocorrência), etc.
              </p>
              <div className="mt-2">
                <Input id="subject" placeholder="Descreva o tema" {...form.register('subject')} />
                {form.formState.errors.subject?.message && (
                  <p className="mt-2 text-sm text-red-200">{String(form.formState.errors.subject.message)}</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>2) Relato e anexos</CardTitle>
          <CardDescription>
            Você pode enviar por texto e/ou anexar áudio, imagem e vídeo. Para acessibilidade, anexos exigem descrição.
          </CardDescription>

          <div className="mt-5 space-y-6">
            <div>
              <label htmlFor="description_text" className="text-sm font-semibold text-slate-50">
                Relato em texto
              </label>
              <p className="mt-1 text-xs text-slate-200/60">
                Escreva o que aconteceu (o quê, onde, quando) e o impacto.
              </p>
              <div className="mt-2">
                <Textarea id="description_text" rows={5} placeholder="Descreva sua manifestação" {...form.register('description_text')} />
                {form.formState.errors.description_text?.message && (
                  <p className="mt-2 text-sm text-red-200">{String(form.formState.errors.description_text.message)}</p>
                )}
              </div>
            </div>

            {/* Imagem */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-50">Anexar imagem</label>
                <p className="mt-1 text-xs text-slate-200/60">Opcional. Formatos comuns: JPG/PNG.</p>
                <div className="mt-2">
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-50 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-50 hover:bg-white/10"
                    onChange={(e) => form.setValue('image_file', e.target.files?.[0])}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="image_alt" className="text-sm font-semibold text-slate-50">
                  Texto alternativo da imagem (obrigatório se anexar)
                </label>
                <p className="mt-1 text-xs text-slate-200/60">
                  Ex.: “Foto de buraco na Rua X, em frente ao nº 120, com cones ao lado.”
                </p>
                <div className="mt-2">
                  <Input id="image_alt" placeholder="Descreva a imagem" {...form.register('image_alt')} />
                  {form.formState.errors.image_alt?.message && (
                    <p className="mt-2 text-sm text-red-200">{String(form.formState.errors.image_alt.message)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Áudio */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-50">Anexar áudio</label>
                <p className="mt-1 text-xs text-slate-200/60">Opcional. Formatos comuns: m4a/mp3/wav.</p>
                <div className="mt-2">
                  <input
                    type="file"
                    accept="audio/*"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-50 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-50 hover:bg-white/10"
                    onChange={(e) => form.setValue('audio_file', e.target.files?.[0])}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="audio_transcript" className="text-sm font-semibold text-slate-50">
                  Transcrição do áudio (obrigatório se anexar)
                </label>
                <p className="mt-1 text-xs text-slate-200/60">
                  A transcrição garante acessibilidade e facilita encaminhamento.
                </p>
                <div className="mt-2">
                  <Textarea id="audio_transcript" rows={3} placeholder="Digite a transcrição" {...form.register('audio_transcript')} />
                  {form.formState.errors.audio_transcript?.message && (
                    <p className="mt-2 text-sm text-red-200">{String(form.formState.errors.audio_transcript.message)}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Vídeo */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-slate-50">Anexar vídeo</label>
                <p className="mt-1 text-xs text-slate-200/60">Opcional. Formatos comuns: mp4/mov.</p>
                <div className="mt-2">
                  <input
                    type="file"
                    accept="video/*"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-50 file:mr-4 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-50 hover:bg-white/10"
                    onChange={(e) => form.setValue('video_file', e.target.files?.[0])}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="video_description" className="text-sm font-semibold text-slate-50">
                  Descrição do vídeo (obrigatório se anexar)
                </label>
                <p className="mt-1 text-xs text-slate-200/60">
                  Ex.: “Vídeo mostrando poste apagado na esquina, à noite, por ~10s.”
                </p>
                <div className="mt-2">
                  <Textarea id="video_description" rows={3} placeholder="Descreva o vídeo" {...form.register('video_description')} />
                  {form.formState.errors.video_description?.message && (
                    <p className="mt-2 text-sm text-red-200">{String(form.formState.errors.video_description.message)}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4" {...form.register('anonymous')} />
                <span>
                  <span className="block text-sm font-semibold text-slate-50">Enviar como anônimo</span>
                  <span className="block text-xs text-slate-200/60">
                    Não solicitaremos dados pessoais. Ainda assim, descreva o local e contexto para viabilizar análise.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>3) Enviar</CardTitle>
          <CardDescription>
            Ao enviar, você receberá um protocolo automaticamente.
          </CardDescription>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar e gerar protocolo'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                clearDraft()
                form.reset({
                  kind: 'reclamacao',
                  subject: '',
                  description_text: '',
                  anonymous: false,
                  audio_transcript: '',
                  image_alt: '',
                  video_description: '',
                })
              }}
            >
              Limpar rascunho
            </Button>
          </div>

          <p className="mt-3 text-xs text-slate-200/60">
            Observação: arquivos (mídias) não ficam no rascunho. Se você recarregar a página, precisará selecionar novamente os anexos.
          </p>
        </Card>
      </form>
    </div>
  )
}
