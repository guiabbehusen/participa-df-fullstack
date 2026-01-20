import { apiFetch } from './client'
import type {
  ManifestationCreatePayload,
  ManifestationCreateResponse,
  ManifestationRecord,
} from '@/types/manifestation'

export async function createManifestation(payload: ManifestationCreatePayload): Promise<ManifestationCreateResponse> {
  const fd = new FormData()

  fd.append('kind', payload.kind)
  fd.append('subject', payload.subject)
  if (payload.description_text) fd.append('description_text', payload.description_text)
  fd.append('anonymous', String(!!payload.anonymous))

  if (payload.audio_transcript) fd.append('audio_transcript', payload.audio_transcript)
  if (payload.image_alt) fd.append('image_alt', payload.image_alt)
  if (payload.video_description) fd.append('video_description', payload.video_description)

  if (payload.audio_file) fd.append('audio_file', payload.audio_file)
  if (payload.image_file) fd.append('image_file', payload.image_file)
  if (payload.video_file) fd.append('video_file', payload.video_file)

  const res = await apiFetch('/manifestations', {
    method: 'POST',
    body: fd,
  })

  return (await res.json()) as ManifestationCreateResponse
}

export async function getManifestation(protocol: string): Promise<ManifestationRecord> {
  const res = await apiFetch(`/manifestations/${encodeURIComponent(protocol)}`)
  return (await res.json()) as ManifestationRecord
}

export function buildAttachmentUrl(protocol: string, filename: string) {
  // Usa a mesma base da API (pode ser /api com proxy)
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  return `${base}/manifestations/${encodeURIComponent(protocol)}/files/${encodeURIComponent(filename)}`
}
