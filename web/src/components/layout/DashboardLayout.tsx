import { useState } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuthStore } from '../../stores/useAuthStore'
import { ErrorBoundary } from '../ErrorBoundary'

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="dark flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300`}>
        <Header />
        <main className="flex-1 overflow-y-auto p-5">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
