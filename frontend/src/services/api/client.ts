const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

export async function apiFetch(path: string, init?: RequestInit) {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
  })

  if (!res.ok) {
    let message = `Erro ${res.status}`
    try {
      const data = await res.json()
      if (data?.detail) message = String(data.detail)
      if (data?.message) message = String(data.message)
    } catch {
      // ignore
    }
    throw new Error(message)
  }

  return res
}
