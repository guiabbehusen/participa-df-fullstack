export type ManifestationKind = 'reclamacao' | 'denuncia' | 'sugestao' | 'elogio' | 'solicitacao'

export type AttachmentMeta = {
  field: string
  filename: string
  content_type: string
  bytes: number
}

export type ManifestationCreatePayload = {
  kind: ManifestationKind
  subject: string
  description_text?: string
  anonymous?: boolean

  audio_transcript?: string
  image_alt?: string
  video_description?: string

  audio_file?: File | null
  image_file?: File | null
  video_file?: File | null
}

export type ManifestationCreateResponse = {
  protocol: string
  created_at: string
}

export type ManifestationRecord = {
  protocol: string
  created_at: string
  status: 'Recebido' | 'Em análise' | 'Respondido'

  kind: ManifestationKind
  subject: string
  description_text?: string | null
  anonymous: boolean

  audio_transcript?: string | null
  image_alt?: string | null
  video_description?: string | null

  attachments: AttachmentMeta[]
}
