export type ManifestationKind =
  | 'reclamacao'
  | 'denuncia'
  | 'sugestao'
  | 'elogio'
  | 'solicitacao'

export type AttachmentField = 'image' | 'audio' | 'video'

export interface AttachmentOut {
  id: string
  field: AttachmentField
  filename: string
  content_type: string
  bytes: number
  accessibility_text?: string | null
  download_url?: string | null
}

export interface ManifestationCreatePayload {
  kind: ManifestationKind
  subject: string
  subject_detail: string
  description_text?: string
  anonymous: boolean

  contact_name?: string
  contact_email?: string
  contact_phone?: string

  // Acessibilidade (se anexar)
  image_alt?: string
  audio_transcript?: string
  video_description?: string

  // Uploads
  image_file?: File
  audio_file?: File
  video_file?: File
}

export interface ManifestationCreateResponse {
  protocol: string
  initial_response_sla_days: number
}

export interface ManifestationRecord {
  protocol: string
  created_at: string
  status: string
  kind: ManifestationKind
  subject: string
  subject_detail: string
  description_text: string
  anonymous: boolean

  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null

  attachments: AttachmentOut[]
}
