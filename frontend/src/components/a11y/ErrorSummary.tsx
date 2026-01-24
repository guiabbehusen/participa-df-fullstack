import { useEffect, useMemo, useRef } from 'react'

export type ErrorItem = {
  fieldId: string
  message: string
}

function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null
}

function extractMessage(v: any): string | null {
  if (!v) return null
  if (typeof v === 'string') return v
  if (typeof v?.message === 'string') return v.message
  return null
}

function normalizeErrors(errors: unknown): ErrorItem[] {
  if (!errors) return []

  // Already normalized
  if (Array.isArray(errors)) {
    return errors
      .map((e: any, idx) => {
        if (!e) return null
        if (typeof e === 'string') return { fieldId: `error-${idx}`, message: e }
        if (typeof e?.fieldId === 'string' && typeof e?.message === 'string') {
          return { fieldId: e.fieldId, message: e.message }
        }
        const msg = extractMessage(e)
        if (msg) return { fieldId: `error-${idx}`, message: msg }
        return null
      })
      .filter(Boolean) as ErrorItem[]
  }

  // react-hook-form FieldErrors shape (object tree)
  if (isRecord(errors)) {
    const out: ErrorItem[] = []

    const walk = (obj: any, pathPrefix: string) => {
      if (!obj) return

      // If this node itself carries a message
      const msg = extractMessage(obj)
      if (msg && pathPrefix) {
        out.push({ fieldId: pathPrefix, message: msg })
      }

      if (!isRecord(obj)) return

      for (const [k, v] of Object.entries(obj)) {
        if (k === 'ref' || k === 'type' || k === 'types' || k === 'message') continue

        // For nested fields, join with '_' to match HTML ids used in this app.
        const nextPath = pathPrefix ? `${pathPrefix}_${k}` : k

        const direct = extractMessage(v)
        if (direct) {
          out.push({ fieldId: nextPath, message: direct })
          continue
        }

        if (Array.isArray(v)) {
          v.forEach((vv, idx) => walk(vv, `${nextPath}_${idx}`))
          continue
        }

        if (isRecord(v)) {
          walk(v, nextPath)
        }
      }
    }

    walk(errors, '')

    // De-dup by fieldId (keep first)
    const seen = new Set<string>()
    return out.filter((e) => {
      if (!e.fieldId || seen.has(e.fieldId)) return false
      seen.add(e.fieldId)
      return true
    })
  }

  return []
}

export function ErrorSummary({ errors }: { errors: unknown }) {
  const ref = useRef<HTMLDivElement | null>(null)

  const list = useMemo(() => normalizeErrors(errors), [errors])

  useEffect(() => {
    if (list.length > 0) {
      ref.current?.focus()
    }
  }, [list.length])

  if (list.length === 0) return null

  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-label="Resumo de erros do formulário"
      className="mb-4 rounded-xl border border-red-600/30 bg-red-600/10 p-4 text-[rgba(127,29,29,1)]"
    >
      <p className="font-extrabold">Confira os campos com erro:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {list.map((e) => (
          <li key={e.fieldId}>
            <a
              href={`#${e.fieldId}`}
              className="font-semibold underline underline-offset-2 hover:text-red-900"
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
