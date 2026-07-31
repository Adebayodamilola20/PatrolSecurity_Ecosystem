import { useEffect, useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { AlertTriangle, MapPin, X } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import { formatDate } from '../../utils/format'
import { useAuthStore } from '../../stores/useAuthStore'
import { ErrorBoundary } from '../ErrorBoundary'
import AiAssistantPanel, { AiAssistantLauncher } from '../AiAssistantPanel'
import IncidentToasts from '../IncidentToasts'
import { subscribeToEmergency } from '../../services/websocket'

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
    return subscribeToEmergency((data) => {
      setEmergency(data || {})
    })
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
          <EmergencyPopup alert={emergency} onClose={() => setEmergency(null)} />
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
            <Outlet />
          </ErrorBoundary>
        </main>
        <AiAssistantLauncher onClick={() => setAiOpen(true)} />
        <AiAssistantPanel open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>
    </div>
  )
}

function EmergencyPopup({ alert, onClose }: { alert: EmergencyAlert; onClose: () => void }) {
  const when = formatDate(alert.triggeredAt ?? new Date())
  const emailDelivery = alert.delivery?.email
  const smsDelivery = alert.delivery?.sms

  return (
    <div className="fixed inset-x-3 top-3 z-[80] md:inset-x-auto md:right-5 md:top-5 md:w-[440px]">
      <div className="overflow-hidden rounded-2xl border border-destructive/40 bg-card shadow-2xl shadow-destructive/20">
        <div className="bg-destructive px-4 py-3 text-destructive-foreground">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/18">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black uppercase tracking-wide">Emergency Alert Triggered</div>
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

          <button
            onClick={onClose}
            className="w-full rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90"
          >
            Acknowledge On Screen
          </button>
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
