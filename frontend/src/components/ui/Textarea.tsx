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
        'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-300/40'
          + ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80',
        className,
      )}
    />
  )
})
