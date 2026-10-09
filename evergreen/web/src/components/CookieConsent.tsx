import { useEffect, useState } from 'react'
import { Cookie, X } from 'lucide-react'

/*
 * Cookie consent banner.
 *
 * This was previously UI-only: both buttons called the same handler, which set
 * a piece of component state and nothing else. The banner therefore returned on
 * every page load and every refresh, "Accept all" and "Necessary only" were
 * indistinguishable, and no part of the app could find out what was chosen.
 * The decision is now recorded and can be honoured.
 */

const STORAGE_KEY = 'patrol_cookie_consent'

export type ConsentChoice = 'all' | 'necessary'

interface StoredConsent {
  choice: ConsentChoice
  decidedAt: string
}

/**
 * The stored decision, or `null` if the user has not chosen yet.
 *
 * Anything optional — analytics, session replay — must check this before it
 * starts, or the banner is decoration rather than consent.
 */
export function getCookieConsent(): ConsentChoice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredConsent
    return parsed.choice === 'all' || parsed.choice === 'necessary'
      ? parsed.choice
      : null
  } catch {
    // Private browsing, disabled storage, or a corrupt value: treat as undecided
    // rather than assuming consent.
    return null
  }
}

export function hasOptionalCookieConsent(): boolean {
  return getCookieConsent() === 'all'
}

export default function CookieConsent() {
  // Start hidden and decide in an effect. Rendering the banner first and hiding
  // it once storage is read would flash it on every load for users who have
  // already answered.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (getCookieConsent() === null) setVisible(true)
  }, [])

  const decide = (choice: ConsentChoice) => {
    try {
      const record: StoredConsent = {
        choice,
        decidedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
      // If the choice cannot be stored the banner will ask again next load,
      // which is the honest outcome — better than hiding it and losing the
      // answer.
    }
    // Let anything gated on consent react without needing a reload.
    window.dispatchEvent(
      new CustomEvent('app:cookie-consent', { detail: { choice } }),
    )
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
                // Dismissing without choosing is not consent to anything
                // optional, so the X means the same as "Necessary only".
                onClick={() => decide('necessary')}
                aria-label="Close and keep only necessary cookies"
                className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              We use essential cookies to keep you signed in and remember your preferences, plus
              optional cookies to understand how the dashboard is used. You can accept all or keep
              only what&apos;s necessary.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => decide('necessary')}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Necessary only
              </button>
              <button
                onClick={() => decide('all')}
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
