/**
 * The Evergreen mark.
 *
 * Shared, by intent, with the client portal — the same drawn leaf and the
 * same letterform, because staff and clients talking about "the system"
 * should be picturing one product. Only the second line differs.
 *
 * A stand-in until the real logo arrives. Deliberately a wordmark rather than
 * a generic shield glyph: every security product on earth has one of those
 * and it says nothing about who this is.
 *
 * WHEN THE LOGO ARRIVES: replace the <svg> below with an <img src=...> (or
 * the supplied SVG) and leave everything else alone. This is the only file
 * that draws the mark — nothing else in the portal hardcodes it.
 */
export function Wordmark({
  compact = false,
  className = '',
}: {
  /** Mark only, no wordmark — for the collapsed rail and small screens. */
  compact?: boolean
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        viewBox="0 0 28 28"
        aria-hidden="true"
        className="h-7 w-7 shrink-0"
        fill="none"
      >
        {/* A leaf, drawn as two arcs meeting at a point. Rotated so it reads
            as growth rather than as a generic teardrop. */}
        <path
          d="M14 3.5c5.5 2.2 8.5 6.2 8.5 11.1 0 5.2-3.9 9.4-8.5 9.4S5.5 19.8 5.5 14.6C5.5 9.7 8.5 5.7 14 3.5Z"
          fill="var(--color-primary)"
          opacity="0.16"
        />
        <path
          d="M14 3.5c5.5 2.2 8.5 6.2 8.5 11.1 0 5.2-3.9 9.4-8.5 9.4S5.5 19.8 5.5 14.6C5.5 9.7 8.5 5.7 14 3.5Z"
          stroke="var(--color-primary)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* The midrib, carried past the leaf edge — the one deliberate
            asymmetry, so the mark has a direction. */}
        <path
          d="M14 24.5V9.2"
          stroke="var(--color-primary)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M14 15.4l4.1-3.6M14 19.2l-3.4-3"
          stroke="var(--color-primary)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold leading-[1.2] tracking-[-0.015em]">
            Evergreen
          </span>
          <span className="block truncate text-[11px] font-medium uppercase leading-[1.3] tracking-[0.14em] opacity-60">
            Control Room
          </span>
        </span>
      )}
    </span>
  )
}
