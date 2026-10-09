# Design — Evergreen Client Portal

The locked design system for the client portal. Read this before changing any
page's visual layer. Extend or amend this file when the system needs to grow;
do not solve a one-page problem with a one-page exception, because that is how
seven pages end up looking like seven products.

## Genre

**modern-minimal.** The person using this is checking whether their premises
were patrolled last night. They want the answer, legibly, and they want to
believe it. Trust here comes from restraint and consistency, not from
atmosphere — no gradient meshes, no glows, no motion for its own sake.

## Brand

**Evergreen.** The mark lives in exactly one file,
`src/components/Wordmark.tsx`. When the real logo arrives, replace the `<svg>`
inside it and nothing else changes. Never draw the mark inline anywhere else.

The portal must feel like the same company as the marketing site — same teal,
same typeface — because clients cross between them.

## Theme

Tokens live in `src/index.css` as CSS custom properties on `:root, .dark` and
`.light`. Both themes are first-class; the portal ships **light by default**.

Two rules that hold the palette together:

1. **Neutrals are never zero-chroma.** Every surface carries a trace of the
   brand hue (chroma 0.004–0.02 at hue ~195). Flat `#888` greys are the
   default every generated interface reaches for, and a wall of them is why
   the first version read as unfinished.

2. **Red belongs to emergencies and nothing else.** No destructive button, no
   validation error, no "overdue" chip may borrow `--destructive`. A colour
   that only ever means one thing is readable across a room; the moment it
   also means "required field" it stops being an alarm.

Accent budget: primary teal on no more than ~5 % of any viewport. It marks the
active nav row, the primary action, and nothing else.

## Typography

- **Plus Jakarta Sans** throughout, one family, real weight contrast
  (400 body / 600 emphasis / 700–800 display). Already loaded for the
  marketing site, so it costs nothing here.
- Page titles: 22px, weight 700, tracking −0.02em.
- Numerals are **tabular** on anything that appears in a column — counts,
  times, distances. Proportional digits make a column of figures harder to
  compare than it needs to be.
- No italic headings, ever. Emphasis is carried by weight or accent colour.

## Spacing & shape

- 4-point scale via Tailwind's default spacing.
- `--radius: 0.625rem`. Cards `rounded-lg`, controls `rounded-md`,
  pills `rounded-full`. Nothing else.

## Components

- **`PageHeader`** — every page's head. Title, one line of purpose, actions
  right. Pages must not hand-roll their own; the drift between them was
  visible and cheap to remove.
- **`Card`** — three levels, and only three. `flat` (default), `raised` (the
  one thing on a page that matters more), `inset` (recedes: helper panels,
  empty states). A fourth level is a distinction nobody can see.
- **`StatCard`** — label above, figure below and largest. `tone="alert"` is
  reserved for a figure that is genuinely bad news.
- **`Skeleton` / `LoadingNote`** — never leave a blank panel. A shape the size
  of the content, or a spinner that says what it is waiting for.

## Navigation

Rail on desktop, drawer on mobile, one shared `navItems` list so a new page
cannot appear on one and go missing on the other.

The active row is marked by a **solid bar against the rail's edge**, not a
filled pill — you can see where you are from the shape of the edge without the
row shouting.

**Emergency is not in that list.** It renders below a rule at the foot of the
rail, in the emergency colour. Everything above it is something you browse;
it is something you reach for when something has gone wrong, and nobody
should arrive there by mis-clicking "Reports".

## Motion

- Colour and opacity transitions only, ~150–200 ms. No layout animation.
- One exception: the emergency modal pulses **three times and stops**. A light
  that never stops flashing is one people learn to look past.
- Everything respects `prefers-reduced-motion`.

## Copy voice

Plain sentences, no marketing register. "Nobody assigned yet" beats "No
assignees configured". Say what a control does, not what it is called. Never
invent a number — if there is no figure, show a dash and say so.

## What every page must share

The wordmark, the teal and its placement, the typeface, the `PageHeader`
rhythm, the card levels, and the rule that red means emergency.

## What pages may differ on

Their content layout below the header, and which card levels they use.
