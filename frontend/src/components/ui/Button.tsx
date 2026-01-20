import * as React from 'react'
import { cn } from '@/utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-500 shadow shadow-blue-600/20',
        variant === 'secondary' && 'bg-white/10 text-slate-50 hover:bg-white/15 ring-1 ring-white/10',
        variant === 'ghost' && 'bg-transparent text-slate-50 hover:bg-white/10',
        variant === 'destructive' && 'bg-red-600 text-white hover:bg-red-500 shadow shadow-red-600/20',
        className,
      )}
    />
  )
}
