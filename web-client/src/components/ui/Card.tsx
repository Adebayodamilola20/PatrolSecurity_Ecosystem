import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * A surface.
 *
 * Everything on this portal was the same grey box at the same weight, which
 * is most of why the screen read as flat — with no hierarchy, the eye has
 * nowhere to land and every element competes equally for attention.
 *
 * Three levels now, and only three. `flat` is the default and carries most
 * content. `raised` is for the one thing on a page that matters more than
 * the rest. `inset` recedes — helper panels, empty states, secondary detail.
 * A fourth level would be a distinction nobody could see.
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
  /** Adds hover feedback. Only for cards that actually navigate somewhere. */
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg p-4 sm:p-5',
        level === 'flat' && 'border border-border bg-card',
        level === 'raised' &&
          'border border-border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)]',
        level === 'inset' && 'border border-border/60 bg-muted/40',
        interactive &&
          'cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40',
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
 * The number is the largest thing in the tile and the label sits above it —
 * you read the figure first and the caption second, which is the order the
 * eye wants and the reverse of how these usually get built. Digits are
 * tabular so a row of tiles lines up down the page.
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
  /** `alert` is for a figure that is bad news — nothing else may use it. */
  tone?: 'default' | 'alert'
}) {
  return (
    <Card className="flex flex-col justify-between gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
        {label}
      </p>
      <div>
        <p
          className={cn(
            'text-[28px] font-bold leading-none tracking-[-0.02em] tabular-nums',
            tone === 'alert' && 'text-destructive',
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </Card>
  )
}
