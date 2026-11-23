import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export const fieldClass =
  'h-8 w-full rounded-md border border-input bg-field px-2 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none transition-[border-color,box-shadow] motion-reduce:transition-none focus:border-ring focus:ring-2 focus:ring-ring/25 disabled:opacity-60 read-only:cursor-default'

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
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={htmlFor} className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  )
}

export function TextInput({
  className,
  autoComplete = 'off',
  onPointerDown,
  highlightValid = false,
  ...props
}: React.ComponentProps<'input'> & { highlightValid?: boolean }) {
  const valorAtual = typeof props.value === 'string' ? props.value : typeof props.defaultValue === 'string' ? props.defaultValue : ''
  const valorValido = highlightValid && valorAtual.trim().length > 0
  return (
    <input
      autoComplete={autoComplete}
      className={cn(fieldClass, 'relative z-10 pointer-events-auto touch-manipulation', className)}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (!event.defaultPrevented && !event.currentTarget.disabled && !event.currentTarget.readOnly) {
          event.currentTarget.focus({ preventScroll: true })
        }
      }}
      {...props}
      style={{ ...props.style, backgroundColor: valorValido ? '#dcfce7' : '#f1f5f9', borderColor: valorValido ? '#86efac' : '#cbd5e1' }}
    />
  )
}

export function SelectInput({
  className,
  placeholder,
  options,
  highlightValid = false,
  ...props
}: React.ComponentProps<'select'> & {
  placeholder?: string
  options: (string | { value: string; label: string })[]
  highlightValid?: boolean
}) {
  const valorAtual = typeof props.value === 'string' ? props.value : typeof props.defaultValue === 'string' ? props.defaultValue : ''
  const opcoesValidas = options.map((option) => typeof option === 'string' ? option : option.value)
  const valorValido = highlightValid && valorAtual.trim().length > 0 && opcoesValidas.includes(valorAtual)
  return (
    <div className="relative">
      <select className={cn(fieldClass, 'cursor-pointer appearance-none pr-9', className)} {...props} style={{ ...props.style, backgroundColor: valorValido ? '#dcfce7' : props.style?.backgroundColor, borderColor: valorValido ? '#86efac' : props.style?.borderColor }}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => (
          <option key={typeof o === 'string' ? o : o.value} value={typeof o === 'string' ? o : o.value}>
            {typeof o === 'string' ? o : o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
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
    <section className={cn('rounded-lg border border-border bg-card shadow-sm', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
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
        'inline-flex items-center justify-center gap-2 rounded-lg bg-[#c91d26] text-white font-semibold shadow-sm transition-[background-color,transform] outline-none hover:bg-[#e3262e] focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
        size === 'lg' ? 'h-11 w-full px-5 text-sm' : 'h-9 px-4 text-xs',
        className,
      )}
      {...props}
    />
  )
}

export function Mono({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('font-mono tabular-nums', className)} {...props} />
}
