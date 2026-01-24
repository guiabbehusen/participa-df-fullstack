import * as React from 'react'
import { cn } from '@/utils/cn'

export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'danger'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
}

export function Button({ className, variant = 'default', ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold leading-none'
    + ' transition-colors focus-visible:outline-none'
    + ' focus-visible:ring-2 focus-visible:ring-[rgba(var(--c-primary),0.40)]'
    + ' disabled:opacity-60 disabled:pointer-events-none'

  const variants: Record<ButtonVariant, string> = {
    default:
      'bg-[rgb(var(--c-primary))] text-[rgb(var(--c-primary-foreground))]'
      + ' hover:bg-[rgba(var(--c-primary),0.92)] active:bg-[rgba(var(--c-primary),0.88)]',
    secondary:
      'border border-[rgba(var(--c-primary),0.28)] bg-[rgba(var(--c-primary),0.10)] text-[rgb(var(--c-primary))]'
      + ' hover:bg-[rgba(var(--c-primary),0.14)] active:bg-[rgba(var(--c-primary),0.18)]',
    ghost:
      'bg-transparent text-[rgb(var(--c-text))] hover:bg-[rgba(var(--c-border),0.30)] active:bg-[rgba(var(--c-border),0.40)]',
    danger:
      'border border-red-600/20 bg-red-600/10 text-red-700 hover:bg-red-600/15',
  }

  return <button className={cn(base, variants[variant], className)} {...props} />
}
