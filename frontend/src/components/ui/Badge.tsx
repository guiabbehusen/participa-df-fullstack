import * as React from 'react'
import { cn } from '@/utils/cn'

type BadgeVariant = 'default' | 'success' | 'warning' | 'info'

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const variants: Record<BadgeVariant, string> = {
    default: 'border border-[rgba(var(--c-border),0.70)] bg-[rgba(var(--c-surface),0.85)] text-[rgb(var(--c-text))]',
    success: 'border border-[rgba(var(--c-success),0.30)] bg-[rgba(var(--c-success),0.10)] text-[rgb(var(--c-text))]',
    warning: 'border border-[rgba(var(--c-warning),0.35)] bg-[rgba(var(--c-warning),0.12)] text-[rgb(var(--c-text))]',
    info: 'border border-[rgba(var(--c-primary),0.28)] bg-[rgba(var(--c-primary),0.10)] text-[rgb(var(--c-text))]',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
