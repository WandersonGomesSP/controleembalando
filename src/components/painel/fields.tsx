import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const fieldClass =
  'h-11 w-full rounded-lg border border-input bg-field px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-[border-color,box-shadow] motion-reduce:transition-none focus:border-ring focus:ring-[3px] focus:ring-ring/30 disabled:opacity-60 read-only:cursor-default'

export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  )
}

export function TextInput({
  className,
  ...props
}: React.ComponentProps<'input'>) {
  return <input className={cn(fieldClass, className)} {...props} />
}

export function SelectInput({
  className,
  placeholder,
  options,
  ...props
}: React.ComponentProps<'select'> & {
  placeholder?: string
  options: string[]
}) {
  return (
    <div className="relative">
      <select
        className={cn(fieldClass, 'cursor-pointer appearance-none pr-9', className)}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export function Panel({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border bg-card/90 shadow-[0_1px_0_0_oklch(1_0_0/0.04)_inset,0_20px_40px_-24px_oklch(0_0_0/0.6)] backdrop-blur',
        className,
      )}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
          <div>
            {title && (
              <h2 className="text-base font-semibold tracking-tight">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  )
}

export function PrimaryButton({
  className,
  size = 'lg',
  ...props
}: React.ComponentProps<'button'> & { size?: 'md' | 'lg' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_var(--primary)] transition-[background-color,transform] outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
        size === 'lg' ? 'h-14 w-full px-6 text-base' : 'h-11 px-5 text-sm',
        className,
      )}
      {...props}
    />
  )
}

export function Mono({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return <span className={cn('font-mono tabular-nums', className)} {...props} />
}
