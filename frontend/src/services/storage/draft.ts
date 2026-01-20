import type { ManifestationCreatePayload } from '@/types/manifestation'

const KEY = 'participa_df:draft:v1'

export function loadDraft(): Partial<ManifestationCreatePayload> | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<ManifestationCreatePayload>
  } catch {
    return null
  }
}

export function saveDraft(draft: Partial<ManifestationCreatePayload>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // ignore
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
