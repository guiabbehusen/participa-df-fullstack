import type {
  AttachmentOut,
  ManifestationCreatePayload,
  ManifestationCreateResponse,
  ManifestationRecord,
} from '@/types/manifestation'
import { apiFetch } from './client'

export async function createManifestation(payload: ManifestationCreatePayload): Promise<ManifestationCreateResponse> {
  const form = new FormData()

  form.append('kind', payload.kind)
  form.append('subject', payload.subject)
  form.append('subject_detail', payload.subject_detail)

  if (payload.description_text) form.append('description_text', payload.description_text)
  form.append('anonymous', String(payload.anonymous))

  if (payload.contact_name) form.append('contact_name', payload.contact_name)
  if (payload.contact_email) form.append('contact_email', payload.contact_email)
  if (payload.contact_phone) form.append('contact_phone', payload.contact_phone)

  if (payload.image_alt) form.append('image_alt', payload.image_alt)
  if (payload.audio_transcript) form.append('audio_transcript', payload.audio_transcript)
  if (payload.video_description) form.append('video_description', payload.video_description)

  if (payload.image_file) form.append('image_file', payload.image_file)
  if (payload.audio_file) form.append('audio_file', payload.audio_file)
  if (payload.video_file) form.append('video_file', payload.video_file)

  const res = await apiFetch('/manifestations', {
    method: 'POST',
    body: form,
  })

  return (await res.json()) as ManifestationCreateResponse
}

export async function getManifestation(protocol: string): Promise<ManifestationRecord> {
  const res = await apiFetch(`/manifestations/${encodeURIComponent(protocol)}`)
  return (await res.json()) as ManifestationRecord
}

export function buildAttachmentUrl(protocol: string, att: AttachmentOut): string {
  if (att.download_url) return att.download_url
  return `/api/manifestations/${encodeURIComponent(protocol)}/files/${encodeURIComponent(att.filename)}`
}
