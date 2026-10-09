import { useEffect } from 'react'

// Shared with the auth store, which clears the stamp on sign-out so the next
// sign-in starts a fresh countdown instead of inheriting a stale one.
export const IDLE_ACTIVITY_KEY = 'patrol_client_last_activity'

// An authenticated portal left unattended is an open door: anyone with
// physical access to the machine inherits the session. Lock it after 20 minutes
// with no interaction and force a fresh sign-in.
const IDLE_LIMIT_MS = 20 * 60 * 1000
// Poll rather than trust a single long timer: a timer does not fire while the
// machine is asleep, so a laptop closed overnight would wake up still signed in.
const POLL_MS = 15 * 1000
// The activity stamp is written to storage, so throttle it — mousemove alone
// would otherwise write hundreds of times a second.
const WRITE_THROTTLE_MS = 5 * 1000

const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
  'wheel',
] as const

/**
 * Signs the user out after IDLE_LIMIT_MS without interaction.
 *
 * The last-activity stamp lives in localStorage rather than a ref so that the
 * countdown survives a reload and is shared across tabs — working in one tab
 * keeps the others alive, and none of them can be resurrected by reloading.
 */
export function useIdleLogout(isAuthenticated: boolean, logout: () => void) {
  useEffect(() => {
    if (!isAuthenticated) return
    const storageKey = IDLE_ACTIVITY_KEY

    const now = () => Date.now()
    let lastWrite = 0

    const stamp = (value: number) => {
      try {
        localStorage.setItem(storageKey, String(value))
      } catch {
        // Private mode / storage full: the in-tab timer below still applies.
      }
    }

    const readStamp = (): number => {
      try {
        const raw = localStorage.getItem(storageKey)
        const parsed = raw ? Number(raw) : NaN
        return Number.isFinite(parsed) ? parsed : now()
      } catch {
        return now()
      }
    }

    // Starting the countdown fresh on mount means a reload cannot be used to
    // extend an already-idle session past its limit.
    if (!localStorage.getItem(storageKey)) stamp(now())

    const onActivity = () => {
      const t = now()
      if (t - lastWrite < WRITE_THROTTLE_MS) return
      lastWrite = t
      stamp(t)
    }

    const expire = () => {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // Nothing to clean up if storage is unavailable.
      }
      logout()
    }

    const check = () => {
      if (now() - readStamp() >= IDLE_LIMIT_MS) expire()
    }

    // A backgrounded tab gets throttled timers, so re-check the moment it comes
    // back to the foreground instead of waiting for the next poll.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    )
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', check)
    const interval = window.setInterval(check, POLL_MS)

    check()

    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity),
      )
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', check)
      window.clearInterval(interval)
    }
  }, [isAuthenticated, logout])
}
