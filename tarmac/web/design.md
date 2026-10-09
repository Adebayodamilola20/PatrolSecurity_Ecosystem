# Design — Evergreen Control Room (admin)

The locked design system for the admin dashboard. Read this before changing any
page's visual layer. Extend or amend this file when the system needs to grow;
do not solve a one-page problem with a one-page exception, because that is how
fourteen pages end up looking like fourteen products.

This is the **same system** as
[`web-client/design.md`](../web-client/design.md), set one notch heavier. Where
the two differ, the difference is written down below and nowhere else. Anything
not listed as a difference must match the portal exactly — staff and clients
are looking at one company.

## Genre

**modern-minimal.** The person using this is running a shift: who is on, what
has been scanned, what has gone wrong. They read this screen for eight hours
and navigate it by shape rather than by reading. Restraint and consistency, not
atmosphere — no gradient meshes, no glows, no motion for its own sake.

## Brand

**Evergreen.** The mark lives in exactly one file,
`src/components/Wordmark.tsx`, second line "Control Room". When the real logo
arrives, replace the `<svg>` inside it and nothing else changes. Never draw the
mark inline anywhere else.

## Theme

Tokens live in `src/index.css` on `:root, .light` and `.dark`. Both themes are
first-class; the dashboard ships **light by default** (`useTheme`, storage key
`patrol_theme_v2`).

Three rules hold the palette together:

1. **Neutrals are never zero-chroma.** Every surface carries a trace of the
   brand hue (chroma 0.005–0.028 at hue ~195–200). Flat greys are the default
   every generated interface reaches for, and a wall of them is why the first
   version read as unfinished.

2. **Red belongs to emergencies and nothing else.** No destructive button, no
   validation error, no overdue chip, and no stat figure may borrow
   `--destructive`. `StatCard tone="alert"` renders **amber**, deliberately —
   a missed patrol is bad news, not a CODE RED. A colour that only ever means
   one thing is readable across a room; the moment it also means "four missed
   patrols" it stops being an alarm. The only red on the dashboard is the
   CODE RED card, the emergency modal, and the Alerts badge.

3. **The rail follows the theme.** `--sidebar` is light in light and dark in
   dark, as the portal's is. A permanently dark rail was tried and reverted:
   it makes every token placed on it — `text-muted-foreground` above all,
   which is what everything reaches for — dark-on-dark in the light theme, so
   you reintroduce the bug every time you add a control there.

Accent budget: primary teal on no more than ~5 % of any viewport. It marks the
active nav row, the primary action, and nothing else.

## Typography

- **Plus Jakarta Sans** throughout, one family, real weight contrast
  (400 body / 600 emphasis / 700–800 display). The `@import` must stay the
  first line of `index.css` or the browser drops it.
- Page titles: **26px, weight 800, tracking −0.025em** — heavier than the
  portal's 22/700. This is the "bolder" the brief asked for, and it is carried
  by weight and scale, not by more colour.
- Stat figures: **32px, weight 800, tabular** (portal: 28).
- Numerals are **tabular** on anything appearing in a column — counts, times,
  distances, durations. `index.css` applies this to `table`, `.tabular`,
  `time`, and `[data-numeric]`.
- No italic headings, ever. Emphasis is weight or accent colour.

## Spacing & shape

- 4-point scale via Tailwind's default spacing.
- `--radius: 0.625rem`. Cards `rounded-lg`, controls `rounded-md`,
  pills `rounded-full`. Nothing else.

## Components

- **`PageHeader`** (`src/components/ui/PageHeader.tsx`) — every page's head:
  optional eyebrow in primary, title, one line of purpose, actions right.
  **Pages must not hand-roll their own.** Every page had been rebuilding the
  same two lines slightly differently, and those small drifts are most of what
  makes a product feel unfinished.
- **`Card`** (`src/components/ui/Card.tsx`) — three levels, and only three.
  `flat` (default), `raised` (the one thing on a page that matters more),
  `inset` (recedes: helper panels, empty states). A fourth is a distinction
  nobody can see.
- **`StatCard`** — label above, figure below and largest. `tone="good"` is
  green, `tone="alert"` is amber. Neither is red. See palette rule 2.
- **Skeletons** — never leave a blank panel. A shape the size of the content,
  or a spinner that says what it is waiting for.

## Navigation

Rail on desktop, drawer on mobile, one shared `navItems` list so a new page
cannot appear on one and go missing on the other. The rail collapses to 64px;
`Wordmark` renders `compact` at that width.

The active row is marked by a **solid bar against the rail's edge** plus a bold
label, not a filled pill — you read where you are from the shape of the edge
without the row shouting an answer you already have.

Who you are signed in as sits at the **foot**, above Sign out. It was a filled
box under the wordmark, which made the loudest thing on the rail a fact nobody
needs mid-shift and put it in competition with the row that tells you where
you are.

## Motion

- Colour and opacity transitions only, ~150–200 ms. No layout animation.
- One exception: the emergency modal pulses **three times and stops**
  (`.emergency-alert` in `index.css`). A light that never stops flashing is one
  people learn to look past.
- Everything respects `prefers-reduced-motion`.

## Copy voice

Plain sentences, no marketing register. Sentence case in headings and buttons
("New post order", not "New Post Order"). Say what a control does, not what it
is called. Never invent a number — if there is no figure, show a dash and say
so. **No dead controls**: a button with no handler is worse than no button, and
a heavier header only makes it more conspicuous. Two were removed from the
dashboard head for exactly this reason.

## What every page must share

The wordmark, the teal and its placement, the typeface, the `PageHeader`
rhythm, the card levels, tabular figures, and the rule that red means
emergency.

## What pages may differ on

Their content layout below the header, and which card levels they use.
