import type { ManifestationCreatePayload } from '@/types/manifestation'

import { apiFetch } from './client'

export type IzaDraftPatch = Partial<
  Pick<
    ManifestationCreatePayload,
    | 'kind'
    | 'subject'
    | 'subject_detail'
    | 'description_text'
    | 'anonymous'
    | 'contact_name'
    | 'contact_email'
    | 'contact_phone'
    | 'image_alt'
    | 'audio_transcript'
    | 'video_description'
  >
> & {
  has_image_file?: boolean
  has_audio_file?: boolean
  has_video_file?: boolean

  // UI guidance flags (computed by IZA or fallback heuristics)
  needs_location?: boolean
  needs_time?: boolean
  needs_impact?: boolean
  needs_photo?: boolean
}

export type IzaIntent =
  | 'denuncia_infraestrutura'
  | 'saúde'
  | 'segurança'
  | 'elogio'
  | 'cumprimento'
  | 'outro'

export type IzaChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type IzaChatResponse = {
  model: string
  assistant_message: string
  intent: IzaIntent
  draft_patch: IzaDraftPatch
  missing_required_fields: string[]
  missing_recommended_fields: string[]
  can_submit: boolean
}

export type IzaHealthResponse = {
  ok: boolean
  ollama?: boolean
  model?: string
  error?: string
}

export async function izaHealth(): Promise<IzaHealthResponse> {
  const res = await apiFetch('/iza/health')
  return (await res.json()) as IzaHealthResponse
}

function sanitizeDraft(draft?: Partial<ManifestationCreatePayload>) {
  if (!draft) return {}

  // Remove objetos File do JSON e envia apenas os campos relevantes.
  const anyDraft: any = draft as any
  return {
    kind: draft.kind,
    subject: draft.subject,
    subject_detail: (draft as any).subject_detail,
    description_text: draft.description_text,
    anonymous: draft.anonymous,

    contact_name: (draft as any).contact_name,
    contact_email: (draft as any).contact_email,
    contact_phone: (draft as any).contact_phone,

    image_alt: (draft as any).image_alt,
    audio_transcript: (draft as any).audio_transcript,
    video_description: (draft as any).video_description,

    has_image_file: Boolean(anyDraft.image_file),
    has_audio_file: Boolean(anyDraft.audio_file),
    has_video_file: Boolean(anyDraft.video_file),
  }
}

export async function izaChat(
  messages: IzaChatMessage[],
  draft?: Partial<ManifestationCreatePayload>,
): Promise<IzaChatResponse> {
  const body = {
    messages,
    draft: sanitizeDraft(draft),
  }

  const res = await apiFetch('/iza/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return (await res.json()) as IzaChatResponse
}
