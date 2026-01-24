import * as React from 'react'
import { cn } from '@/utils/cn'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      {...props}
      className={cn(
        // WCAG: bom contraste, altura confortável e foco evidente
        'w-full rounded-xl border border-[rgba(var(--c-border),0.85)] bg-[rgb(var(--c-surface))] px-4 py-3 text-base leading-relaxed text-[rgb(var(--c-text))] placeholder:text-[rgba(var(--c-text),0.55)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]',
        className,
      )}
    />
  )
})
