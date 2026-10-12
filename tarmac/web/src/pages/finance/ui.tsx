import type { ReactNode } from 'react'
import { Info, Search } from 'lucide-react'
import { SHARES, cx, naira } from './format'

/** Shown on every finance screen until it reads real data. */
export function SampleBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
      <Info className="h-3.5 w-3.5 shrink-0" />
      Preview with sample data. Nothing on this page is live yet.
    </div>
  )
}

type Tone = 'neutral' | 'blue' | 'green' | 'amber' | 'red'

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  blue: 'bg-primary/10 text-primary',
  green: 'bg-success/12 text-success',
  amber: 'bg-warning/15 text-warning',
  // Red is reserved for money that is late or failed.
  red: 'bg-destructive/12 text-destructive',
}

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold', TONES[tone])}>
      {children}
    </span>
  )
}

/**
 * A row of headline figures in one bordered strip, divided by rules — not a
 * grid of separate tiles. Reads left to right like a statement.
 */
export function Figures({ items }: { items: { label: string; value: string; note?: string; tone?: 'red' | 'amber' }[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-4">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={cx(
            'px-4 py-4 sm:px-5',
            i % 2 === 1 && 'border-l border-border',
            i >= 2 && 'border-t border-border lg:border-t-0',
            i === 2 && 'lg:border-l',
          )}
        >
          <div className="text-xs font-medium text-muted-foreground">{item.label}</div>
          <div
            className={cx(
              'mt-1.5 text-[22px] font-bold leading-none tracking-tight tabular-nums',
              item.tone === 'red' && 'text-destructive',
              item.tone === 'amber' && 'text-warning',
            )}
          >
            {item.value}
          </div>
          {item.note && <div className="mt-1.5 text-xs text-muted-foreground">{item.note}</div>}
        </div>
      ))}
    </div>
  )
}

export function Section({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Wide tables scroll inside their card instead of pushing the page sideways. */
export function Table({ head, children }: { head: { label: string; align?: 'right' }[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {head.map((h) => (
              <th key={h.label} className={cx('whitespace-nowrap px-4 py-2.5 font-medium first:pl-4 sm:first:pl-5', h.align === 'right' && 'text-right')}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, align, strong, muted, className }: { children: ReactNode; align?: 'right'; strong?: boolean; muted?: boolean; className?: string }) {
  return (
    <td
      className={cx(
        'px-4 py-3 align-middle first:min-w-[170px] first:pl-4 sm:first:pl-5',
        align === 'right' && 'whitespace-nowrap text-right tabular-nums',
        strong && 'font-medium',
        muted && 'text-muted-foreground',
        className,
      )}
    >
      {children}
    </td>
  )
}

export function SearchBox({ placeholder }: { placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
      />
    </div>
  )
}

export function Select({ options }: { options: string[] }) {
  return (
    <select className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50">
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  )
}

export function Button({ children, variant = 'primary', onClick }: { children: ReactNode; variant?: 'primary' | 'outline'; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'outline' && 'border border-border bg-card hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

export function SplitBar({ height = 'h-2.5' }: { height?: string }) {
  return (
    <div className={cx('flex w-full overflow-hidden rounded-full bg-muted', height)}>
      {SHARES.map((s) => (
        <div key={s.key} className={s.className} style={{ width: `${s.pct}%` }} title={`${s.label} ${s.pct}%`} />
      ))}
    </div>
  )
}

export function SplitLegend({ amounts }: { amounts?: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
      {SHARES.map((s) => (
        <div key={s.key} className="flex items-start gap-2">
          <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', s.className)} />
          <div>
            <div className="text-muted-foreground">
              {s.label} · {s.pct}%
            </div>
            {amounts && <div className="font-semibold tabular-nums">{naira(amounts[s.key])}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Initials({ name }: { name: string }) {
  const letters = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
      {letters}
    </span>
  )
}
