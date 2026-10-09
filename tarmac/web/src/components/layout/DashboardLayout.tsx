import { Suspense, useEffect, useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { AlertTriangle, MapPin, X } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import { formatDate } from '../../utils/format'
import { useAuthStore } from '../../stores/useAuthStore'
import { ErrorBoundary } from '../ErrorBoundary'
import { Skeleton } from '../ui/Skeleton'
import AiAssistantPanel, { AiAssistantLauncher } from '../AiAssistantPanel'
import IncidentToasts from '../IncidentToasts'
import { subscribeToEmergency } from '../../services/websocket'

import { api } from '../../services/api'

/**
 * How recent an unattended alert must be to interrupt you when the dashboard
 * first loads. Long enough to catch one raised while you were walking to the
 * desk; short enough that yesterday's unclosed alert does not greet you every
 * morning. New alerts arriving while the dashboard is open always interrupt,
 * regardless of this.
 */
const FIRST_LOAD_ALERT_WINDOW_MS = 30 * 60 * 1000

interface AppIssue {
  message: string
  kind: 'network' | 'server' | 'request'
}

interface EmergencyAlert {
  id?: string
  message?: string
  note?: string
  siteLabel?: string
  category?: string
  triggeredAt?: string
  userName?: string
  delivery?: any
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [issue, setIssue] = useState<AppIssue | null>(null)
  const [emergency, setEmergency] = useState<EmergencyAlert | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const role = useAuthStore((s) => s.user?.role)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    const handleRequestError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; kind?: AppIssue['kind']; status?: number }>).detail
      if (detail?.status === 401 || detail?.message === 'Invalid or expired token') {
        logout()
        return
      }
      setIssue({
        message: detail?.message || 'Something went wrong while loading data. Please try again.',
        kind: detail?.kind || 'request',
      })
    }
    const handleRequestSuccess = () => {
      setIssue((current) => {
        if (!navigator.onLine) return current
        return current ? null : current
      })
    }

    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    window.addEventListener('app:request-error', handleRequestError as EventListener)
    window.addEventListener('app:request-success', handleRequestSuccess)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
      window.removeEventListener('app:request-error', handleRequestError as EventListener)
      window.removeEventListener('app:request-success', handleRequestSuccess)
    }
  }, [logout])

  useEffect(() => {
    if (!isAuthenticated || role === 'guard') return
    const unsubscribe = subscribeToEmergency((data) => {
      setEmergency(data || {})
    })

    // The socket only carries emergencies a guard raised. A client raising one
    // from their portal never fired it, so a CODE RED could sit on the server
    // with nobody in the control room seeing anything — and staff on any page
    // other than Alerts would not have seen it regardless. Polling covers both
    // sources and survives a dropped socket, which is exactly the moment this
    // must not be relying on one.
    const show = (a: Awaited<ReturnType<typeof api.emergency.active>>[number]) =>
      setEmergency({
        id: a.id,
        message: a.message,
        note: a.reason,
        siteLabel: a.siteName ?? a.clientName ?? '',
        category: a.category,
        triggeredAt: a.triggeredAt,
        userName: a.officerName,
      })

    let seen = new Set<string>()
    let primed = false
    const poll = async () => {
      try {
        const active = await api.emergency.active()
        const ids = new Set(active.map((a) => a.id))
        // On the first pass, only a *recent* unattended alert interrupts.
        //
        // Two wrong versions preceded this one. Swallowing everything meant an
        // emergency raised a minute before you opened the dashboard showed you
        // nothing. Showing everything unattended meant a day-old alert nobody
        // had closed hijacked every single login, forever — which teaches you
        // to click past a CODE RED, the exact habit this modal exists to
        // prevent. Anything older than the window is a backlog item: it
        // belongs on Alerts, with the badge, not across your screen at 8am.
        if (!primed) {
          seen = ids
          primed = true
          const cutoff = Date.now() - FIRST_LOAD_ALERT_WINDOW_MS
          const unattended = active.find(
            (a) => a.status === 'triggered' && Date.parse(a.triggeredAt) >= cutoff,
          )
          if (unattended) show(unattended)
          return
        }
        const fresh = active.find((a) => !seen.has(a.id))
        seen = ids
        if (fresh) show(fresh)
      } catch {
        // Offline or a transient failure; the next tick tries again.
      }
    }
    void poll()
    // A CODE RED is the one thing here worth checking often.
    const timer = window.setInterval(poll, 10_000)
    return () => {
      unsubscribe?.()
      window.clearInterval(timer)
    }
  }, [isAuthenticated, role])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out md:hidden ${
        mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <Sidebar
          collapsed={false}
          onToggle={() => {}}
          mobile
          onClose={() => setMobileSidebarOpen(false)}
        />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300`}>
        <Header onMenuClick={() => setMobileSidebarOpen(true)} />
        {emergency && (
          <EmergencyPopup
            alert={emergency}
            onClose={() => setEmergency(null)}
            onAcknowledge={async () => {
              // No id means it arrived over the socket without one; there is
              // nothing to acknowledge server-side, so just close.
              if (emergency.id) {
                await api.emergency.setStatus(emergency.id, 'acknowledged')
              }
              setEmergency(null)
            }}
          />
        )}
        {role !== 'guard' && <IncidentToasts />}
        {(!online || issue) && (
          <div className={`border-b px-5 py-3 text-sm ${
            !online || issue?.kind === 'network'
              ? 'border-warning/20 bg-warning/10 text-warning'
              : issue?.kind === 'server'
                ? 'border-destructive/20 bg-destructive/10 text-destructive'
                : 'border-info/20 bg-info/10 text-info'
          }`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium">
                  {!online
                    ? 'You are offline or your network is unstable.'
                    : issue?.kind === 'server'
                      ? 'The server is having trouble right now.'
                      : 'There was a problem loading this page.'}
                </div>
                <div className="mt-1 text-xs opacity-90">
                  {issue?.message || 'Please check your connection and try again.'}
                </div>
              </div>
              <button
                onClick={() => {
                  setIssue(null)
                  window.dispatchEvent(new CustomEvent('app:retry'))
                }}
                className="inline-flex items-center justify-center rounded-lg border border-current/20 px-3 py-2 text-xs font-semibold hover:bg-black/5"
              >
                Try again
              </button>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-3 md:p-5">
          <ErrorBoundary>
            {/* Every page but the Dashboard is now loaded on demand, so there
                is a moment between clicking a menu item and the page arriving.
                A blank panel in that moment reads as a broken click; a shape
                the size of the page reads as "coming". */}
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <AiAssistantLauncher onClick={() => setAiOpen(true)} />
        <AiAssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>
    </div>
  )
}

/**
 * Stand-in for a page that is still downloading.
 *
 * Deliberately generic — a heading, some stat tiles, a list — because it has
 * to serve every page and a shape that is wrong is worse than a shape that is
 * vague. It only has to say "something is coming, the click worked".
 */
function PageSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

function EmergencyPopup({
  alert,
  onClose,
  onAcknowledge,
}: {
  alert: EmergencyAlert
  onClose: () => void
  onAcknowledge: () => Promise<void>
}) {
  const when = formatDate(alert.triggeredAt ?? new Date())
  const emailDelivery = alert.delivery?.email
  const smsDelivery = alert.delivery?.sms
  const [acknowledging, setAcknowledging] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)

  return (
    /* A corner toast is what you use for "report ready". An emergency has to
       stop the room: full screen, over everything, dismissable only by saying
       you have seen it. Whatever the operator was doing can wait ninety
       seconds; someone is in trouble. */
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-destructive/25 p-4 backdrop-blur-sm">
      <div className="emergency-alert w-full max-w-lg overflow-hidden rounded-2xl border-2 border-destructive bg-card shadow-2xl">
        <div className="bg-destructive px-4 py-3 text-destructive-foreground">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/18">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-base font-black uppercase tracking-wide">🚨 Code Red — Emergency</div>
              <div className="mt-0.5 text-xs opacity-90">Immediate response required</div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-white/80 hover:bg-white/15 hover:text-white"
              aria-label="Dismiss emergency alert"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Message</div>
            <div className="mt-1 text-sm font-semibold text-foreground">
              {alert.message || 'Emergency assistance requested.'}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Info label="Raised by" value={alert.userName || 'Unknown'} />
            <Info label="Site" value={alert.siteLabel || 'Unknown site'} />
            <Info label="Category" value={alert.category || 'Not specified'} />
            <Info label="Time" value={when} />
          </div>

          {alert.note && (
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Officer note</div>
              <div className="mt-1 text-sm text-foreground">{alert.note}</div>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <MapPin className="h-4 w-4 shrink-0" />
            Dispatch was received in real time. Verify location and contact response team immediately.
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground md:grid-cols-2">
            <div>Email: {emailDelivery?.skipped ? emailDelivery.reason : emailDelivery ? 'sent' : 'not configured'}</div>
            <div>SMS: {smsDelivery?.skipped ? smsDelivery.reason : smsDelivery ? 'sent' : 'not configured'}</div>
          </div>

          {ackError && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {ackError}
            </div>
          )}

          {/* This used to call onClose and nothing else — it shut the dialog
              and told the server nothing, so the alert stayed "triggered"
              forever and reappeared at every login. A button labelled
              Acknowledge has to actually acknowledge. */}
          <button
            onClick={async () => {
              setAcknowledging(true)
              setAckError(null)
              try {
                await onAcknowledge()
              } catch (err) {
                setAckError(
                  err instanceof Error
                    ? err.message
                    : 'Could not record that. The alert stays open on the Alerts page.',
                )
                setAcknowledging(false)
              }
            }}
            disabled={acknowledging}
            className="w-full rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
          >
            {acknowledging ? 'Recording…' : 'Acknowledge — I have seen this'}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            Closing without acknowledging leaves it unattended on the Alerts page.
          </p>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}
