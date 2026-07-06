import { useState } from 'react'
import { Cookie, X } from 'lucide-react'

// -----------------------------------------------------------------------------
// Cookie consent pop-up — UI ONLY.
//
// This just renders the banner and dismisses on click. No persistence and no
// real consent handling yet: clicking a button hides it for the current page
// load only. Wire the actual behaviour later where marked `// TODO(wire)`.
// -----------------------------------------------------------------------------

export default function CookieConsent() {
  const [visible, setVisible] = useState(true)

  const dismiss = () => {
    // TODO(wire): persist choice (e.g. localStorage / consent cookie) and
    // enable/disable analytics accordingly.
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:px-6">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Cookie className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold">We use cookies</h2>
              <button
                onClick={dismiss}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              We use essential cookies to keep you signed in and remember your preferences, plus
              optional cookies to understand how the dashboard is used. You can accept all or keep
              only what&apos;s necessary.{' '}
              <a href="#" className="text-primary hover:underline">
                Learn more
              </a>
              .
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={dismiss}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Necessary only
              </button>
              <button
                onClick={dismiss}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
              >
                Accept all
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
