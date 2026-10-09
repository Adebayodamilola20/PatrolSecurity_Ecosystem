/**
 * The head of every page.
 *
 * Each page was writing its own — same two lines, slightly different sizes,
 * slightly different spacing, actions wherever they landed. Small drifts, but
 * they are most of what makes an interface feel unfinished: the eye notices
 * that the title moved between pages long before it can say why.
 *
 * One component, one rhythm. Title, one line saying what the page is for,
 * actions on the right where they do not compete with the sentence.
 */
export function PageHeader({
  title,
  blurb,
  actions,
}: {
  title: string
  /** One line. If it needs two, the page is doing too much. */
  blurb?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {blurb && (
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {blurb}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}
