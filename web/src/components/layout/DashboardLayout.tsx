import { useEffect, useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuthStore } from '../../stores/useAuthStore'
import { ErrorBoundary } from '../ErrorBoundary'

interface AppIssue {
  message: string
  kind: 'network' | 'server' | 'request'
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [issue, setIssue] = useState<AppIssue | null>(null)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    const handleRequestError = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; kind?: AppIssue['kind'] }>).detail
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
  }, [])

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="dark flex h-screen w-screen overflow-hidden bg-background text-foreground">
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
      </div>
    </div>
  )
}
