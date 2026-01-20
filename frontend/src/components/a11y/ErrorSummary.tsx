import { useEffect, useRef } from 'react'

export type ErrorItem = {
  fieldId: string
  message: string
}

export function ErrorSummary({ errors }: { errors: ErrorItem[] }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (errors.length > 0) {
      ref.current?.focus()
    }
  }, [errors.length])

  if (errors.length === 0) return null

  return (
    <div
      ref={ref}
      tabIndex={-1}
      aria-label="Resumo de erros do formulário"
      className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-red-100"
    >
      <p className="font-semibold">Confira os campos com erro:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a
              href={`#${e.fieldId}`}
              className="underline underline-offset-2 hover:text-white"
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
