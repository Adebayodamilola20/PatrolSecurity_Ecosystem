/**
 * Placeholders that look like the thing being loaded.
 *
 * The portal used to show a bare "Loading…" line, or nothing at all, which on
 * a slow Nigerian connection reads as a page that has stopped working. A shape
 * roughly the size of the content tells the reader the screen is busy and
 * roughly what is about to arrive.
 *
 * Deliberately the same markup as the staff dashboard's version so the two
 * products do not drift into two different idea of "loading".
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/50 ${className}`} />
}

/** A stand-in for one bordered card: a title, two lines, a footer row. */
export function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

/** Rows for a list or table. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

/**
 * For screens where a shape would be guesswork — say so in words instead.
 * "Loading" alone leaves the reader wondering loading what.
 */
export function LoadingNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <span
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
        role="status"
        aria-label={label}
      />
      {label}
    </div>
  )
}
