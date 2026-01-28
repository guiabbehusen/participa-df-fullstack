import { Check } from 'lucide-react'

export type FormStepState = 'complete' | 'current' | 'upcoming'

export type FormStep = {
  id: string
  label: string
  description?: string
  state: FormStepState
  disabled?: boolean
  onActivate?: () => void
}

export function FormStepper({
  steps,
  ariaLabel = 'Etapas do registro',
}: {
  steps: FormStep[]
  ariaLabel?: string
}) {
  return (
    <nav aria-label={ariaLabel} className="surface px-4 py-4 sm:px-6">
      <ol className="relative flex items-start justify-between gap-2">
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-[18px] hidden h-[2px] bg-[rgba(var(--c-border),0.70)] sm:block"
        />

        {steps.map((step, idx) => {
          const isCurrent = step.state === 'current'
          const isComplete = step.state === 'complete'

          const circle = isComplete
            ? 'bg-[rgb(var(--c-primary))] text-white ring-1 ring-[rgba(var(--c-primary),0.25)]'
            : isCurrent
              ? 'bg-white text-[rgb(var(--c-primary))] ring-2 ring-[rgba(var(--c-primary),0.35)]'
              : 'bg-white/70 text-[rgba(var(--c-text),0.70)] ring-1 ring-[rgba(var(--c-border),0.75)]'

          const label = isComplete
            ? 'text-[rgba(var(--c-text),0.95)]'
            : isCurrent
              ? 'text-[rgba(var(--c-text),0.95)]'
              : 'text-[rgba(var(--c-text),0.80)]'

          return (
            <li key={step.id} className="relative z-10 flex flex-1 flex-col items-center">
              <button
                type="button"
                onClick={step.onActivate}
                disabled={step.disabled}
                aria-current={isCurrent ? 'step' : undefined}
                aria-disabled={step.disabled ? true : undefined}
                className={[
                  'group flex w-full flex-col items-center gap-2 rounded-xl px-2 py-1 text-center',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--c-primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--c-bg))]',
                  step.disabled ? 'opacity-60' : 'hover:bg-[rgba(var(--c-border),0.12)]',
                ].join(' ')}
              >
                <span className={['grid h-9 w-9 place-items-center rounded-full', circle].join(' ')}>
                  {isComplete ? (
                    <Check className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <span className="text-sm font-extrabold" aria-hidden="true">
                      {idx + 1}
                    </span>
                  )}
                  <span className="sr-only">
                    {isCurrent ? 'Etapa atual:' : isComplete ? 'Etapa concluída:' : 'Etapa:'} {step.label}
                  </span>
                </span>

                <span className={['text-xs font-extrabold leading-tight', label].join(' ')}>{step.label}</span>

                {step.description ? (
                  <span className="hidden max-w-[14rem] text-[11px] leading-snug text-[rgba(var(--c-text),0.70)] sm:block">
                    {step.description}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
