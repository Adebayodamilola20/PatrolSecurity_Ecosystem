import type { ReactNode } from 'react'

function cx(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

/**
 * A surface.
 *
 * Same three levels as the client portal — `flat`, `raised`, `inset` — with
 * more separation between them. Staff pages carry far more on screen at once
 * than a client's do, so the levels have to be distinguishable at a glance
 * rather than on inspection.
 *
 * Three levels, and only three. A fourth is a distinction nobody can see.
 */
export function Card({
  children,
  className,
  level = 'flat',
  interactive = false,
}: {
  children: ReactNode
  className?: string
  level?: 'flat' | 'raised' | 'inset'
  /** Hover feedback. Only for cards that actually navigate somewhere. */
  interactive?: boolean
}) {
  return (
    <div
      className={cx(
        'rounded-lg p-4 sm:p-5',
        level === 'flat' && 'border border-border bg-card',
        level === 'raised' &&
          'border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)]',
        level === 'inset' && 'border border-border/60 bg-muted/50',
        interactive &&
          'cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/50',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * A single number and what it means.
 *
 * The figure is the largest thing in the tile and the label sits above it —
 * you read the number first and the caption second, which is the order the
 * eye wants and the reverse of how these usually get built. Bolder and larger
 * than the portal's: a supervisor scanning a wall of tiles for the one that
 * has changed is reading shapes, not text.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: string
  /**
   * `alert` is a figure that needs attention — it renders amber, not red.
   * Red is the emergency colour and nothing but an emergency may borrow it.
   */
  tone?: 'default' | 'alert' | 'good'
}) {
  return (
    <Card className="flex flex-col justify-between gap-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <div>
        <p
          className={cx(
            'text-[32px] font-extrabold leading-none tracking-[-0.03em] tabular-nums',
            tone === 'alert' && 'text-warning',
            tone === 'good' && 'text-success',
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </Card>
  )
}
