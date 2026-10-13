/**
 * Building blocks for the finance screens.
 *
 * Built for people who do not live in software: large type, one obvious
 * button per screen, plain words for status ("Paid", "Late") rather than
 * colour codes, and forms that open in a simple box with big fields.
 */
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, X } from 'lucide-react'
import { cx } from './format'

// ------------------------------------------------------------------ layout

export function Page({ title, help, action, children }: { title: string; help?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10 text-base">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
          {help && <p className="mt-1.5 max-w-2xl text-base text-muted-foreground">{help}</p>}
        </div>
        {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
      </header>
      {children}
    </div>
  )
}

/** Up to three headline amounts. Nothing else competes with them. */
export function Stats({ items }: { items: { label: string; value: string; note?: string; tone?: 'warn' | 'bad' }[] }) {
  return (
    <div className={cx('grid gap-3', items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-border bg-card px-5 py-4">
          <div className="text-[15px] text-muted-foreground">{s.label}</div>
          <div
            className={cx(
              'mt-1 text-[30px] font-bold leading-tight tabular-nums',
              s.tone === 'bad' && 'text-destructive',
              s.tone === 'warn' && 'text-warning',
            )}
          >
            {s.value}
          </div>
          {s.note && <div className="mt-0.5 text-sm text-muted-foreground">{s.note}</div>}
        </div>
      ))}
    </div>
  )
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('overflow-hidden rounded-xl border border-border bg-card', className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h2 className="text-lg font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** A big, clickable line in a list. */
export function Row({
  title,
  sub,
  right,
  rightSub,
  status,
  onClick,
}: {
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  rightSub?: ReactNode
  status?: ReactNode
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold">{title}</div>
        {sub && <div className="mt-0.5 truncate text-[15px] text-muted-foreground">{sub}</div>}
      </div>
      {status && <div className="hidden shrink-0 sm:block">{status}</div>}
      {(right || rightSub) && (
        <div className="shrink-0 text-right">
          {right && <div className="text-base font-semibold tabular-nums">{right}</div>}
          {rightSub && <div className="mt-0.5 text-sm text-muted-foreground">{rightSub}</div>}
          {status && <div className="mt-1 sm:hidden">{status}</div>}
        </div>
      )}
      {onClick && <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none">
      {inner}
    </button>
  ) : (
    <div className="flex items-center gap-4 px-5 py-4">{inner}</div>
  )
}

export function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>
}

/** Status as a word with a small dot. Green = done, amber = waiting, red = late or failed. */
export function Status({ tone, children }: { tone: 'good' | 'wait' | 'bad' | 'plain'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap text-[15px] font-medium',
        tone === 'good' && 'text-success',
        tone === 'wait' && 'text-warning',
        tone === 'bad' && 'text-destructive',
        tone === 'plain' && 'text-muted-foreground',
      )}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {children}
    </span>
  )
}

/** Simple key → value lines inside a box. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-border">
      {items.map((f) => (
        <div key={f.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-[15px] text-muted-foreground">{f.label}</dt>
          <dd className="text-right text-base font-medium">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ----------------------------------------------------------------- buttons

export function Btn({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  busy,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet'
  type?: 'button' | 'submit'
  disabled?: boolean
  busy?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={cx(
        'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'secondary' && 'border border-border bg-card hover:bg-muted',
        variant === 'danger' && 'border border-destructive/40 bg-card text-destructive hover:bg-destructive/10',
        variant === 'quiet' && 'px-3 text-primary hover:bg-primary/10',
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ dialog

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button[data-autofocus]')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('w-full rounded-2xl bg-card text-base shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

/** Save / Cancel row at the bottom of a form. */
export function FormButtons({ onCancel, saveLabel = 'Save', busy }: { onCancel: () => void; saveLabel?: string; busy?: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
      <Btn type="submit" busy={busy}>{saveLabel}</Btn>
    </div>
  )
}

// ------------------------------------------------------------------- forms

/** Gives the box inside a Field the id its label points at. */
const FieldId = createContext<string | undefined>(undefined)

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  // The label is tied to its box by id rather than wrapped around it, so a
  // screen reader announces just the label — not the hint or a dropdown's options.
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[15px] font-semibold">{label}</label>
      <FieldId.Provider value={id}>{children}</FieldId.Provider>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}

const inputClass =
  'h-12 w-full rounded-lg border border-input bg-background px-3.5 text-base placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40'

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useContext(FieldId)
  return <input id={id} {...props} className={cx(inputClass, props.className)} />
}

export function MoneyInput({ value, onChange, placeholder, required }: { value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  const id = useContext(FieldId)
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-muted-foreground">₦</span>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        required={required}
        placeholder={placeholder ?? '0'}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className={cx(inputClass, 'pl-8 tabular-nums')}
      />
    </div>
  )
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
}) {
  const id = useContext(FieldId)
  return (
    <select id={id} value={value} required={required} onChange={(e) => onChange(e.target.value)} className={cx(inputClass, 'pr-8')}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useContext(FieldId)
  return <textarea id={id} rows={3} {...props} className={cx(inputClass, 'h-auto py-3', props.className)} />
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 py-1 text-base">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-[var(--primary)]" />
      {label}
    </label>
  )
}

// --------------------------------------------------------- states & notices

export function Notice({ tone = 'info', children, onClose }: { tone?: 'info' | 'good' | 'bad' | 'warn'; children: ReactNode; onClose?: () => void }) {
  const Icon = tone === 'good' ? CheckCircle2 : AlertCircle
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-base',
        tone === 'info' && 'border-primary/30 bg-primary/5',
        tone === 'good' && 'border-success/40 bg-success/10',
        tone === 'bad' && 'border-destructive/40 bg-destructive/10',
        tone === 'warn' && 'border-warning/40 bg-warning/10',
      )}
    >
      <Icon
        className={cx(
          'mt-0.5 h-5 w-5 shrink-0',
          tone === 'good' && 'text-success',
          tone === 'bad' && 'text-destructive',
          tone === 'warn' && 'text-warning',
          tone === 'info' && 'text-primary',
        )}
      />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-base text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> {text}
    </div>
  )
}

export function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Notice tone="bad">
      <div className="font-semibold">This page could not load.</div>
      <div className="mt-0.5 text-[15px]">{message}</div>
      <div className="mt-3">
        <Btn variant="secondary" onClick={onRetry}>Try again</Btn>
      </div>
    </Notice>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="text-lg font-semibold">{title}</div>
      {text && <p className="mx-auto mt-1 max-w-md text-base text-muted-foreground">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
