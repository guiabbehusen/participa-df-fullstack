import * as React from 'react'
import { cn } from '@/utils/cn'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cn(
        'w-full rounded-xl border border-[rgba(var(--c-border),0.85)] bg-[rgb(var(--c-surface))] px-4 py-3 text-base leading-relaxed text-[rgb(var(--c-text))] placeholder:text-[rgba(var(--c-text),0.55)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]',
        className,
      )}
    />
  )
})
