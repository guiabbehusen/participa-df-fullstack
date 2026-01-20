import * as React from 'react'
import { cn } from '@/utils/cn'

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'info' | 'success' | 'warning'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-white/10',
        variant === 'default' && 'bg-white/10 text-slate-50',
        variant === 'info' && 'bg-blue-600/20 text-blue-100 ring-blue-400/20',
        variant === 'success' && 'bg-emerald-500/20 text-emerald-100 ring-emerald-400/20',
        variant === 'warning' && 'bg-amber-500/20 text-amber-100 ring-amber-400/20',
        className,
      )}
    />
  )
}
