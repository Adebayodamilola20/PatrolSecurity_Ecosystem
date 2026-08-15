/**
 * The head of every page.
 *
 * Same component as the client portal's, one notch heavier. Staff read this
 * screen for a whole shift and navigate it by shape rather than by reading,
 * so the title carries more weight and an optional eyebrow names the section
 * above it — a glance tells you where you are without parsing a word.
 *
 * Pages must not hand-roll their own head. Every page had been rebuilding the
 * same two lines slightly differently, and those small drifts are most of
 * what makes a product feel unfinished.
 */
export function PageHeader({
  eyebrow,
  title,
  blurb,
  actions,
}: {
  /** Section this page belongs to. Two or three words, not a sentence. */
  eyebrow?: string
  title: string
  /** One line. If it needs two, the page is doing too much. */
  blurb?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.13em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[26px] font-extrabold leading-[1.1] tracking-[-0.025em]">
          {title}
        </h1>
        {blurb && (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {blurb}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
