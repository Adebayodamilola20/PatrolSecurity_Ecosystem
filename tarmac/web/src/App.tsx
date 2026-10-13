import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardLayout from './components/layout/DashboardLayout'
import CookieConsent from './components/CookieConsent'
import Dashboard from './pages/Dashboard'
import Scans from './pages/Scans'
import Clients from './pages/Clients'
import Users from './pages/Users'
// NOTE: pages/Checkpoints.tsx is intentionally no longer routed — checkpoint
// management moved inside client accounts (Clients -> ClientDetail).
import Alerts from './pages/Alerts'
import Login from './pages/Login'
import { useAuthStore, useCanViewLiveTracking, type UserRole } from './stores/useAuthStore'
import { useIdleLogout } from './hooks/useIdleLogout'
import { features } from './brand'

// Analytics pulls in the charting library; loading it on demand keeps it out
// of the bundle every other page pays for.
// Route-level splitting. The whole dashboard shipped in one 1MB bundle,
// so opening the login page downloaded Leaflet, the QR generator, the
// charting library and every page nobody had asked for yet. Login, the
// layout and the Dashboard stay eager — they are the first paint; the
// rest arrive when someone actually navigates to them.
const Analytics = lazy(() => import('./pages/Analytics'))
const Monitoring = lazy(() => import('./pages/Monitoring'))
const ClientDetail = lazy(() => import('./pages/ClientDetail'))
const CheckpointDetail = lazy(() => import('./pages/CheckpointDetail'))
const ScanDetail = lazy(() => import('./pages/ScanDetail'))
const Reports = lazy(() => import('./pages/Reports'))
const Timesheets = lazy(() => import('./pages/Timesheets'))
const PostOrders = lazy(() => import('./pages/PostOrders'))
const Handovers = lazy(() => import('./pages/Handovers'))
const PassOnLogs = lazy(() => import('./pages/PassOnLogs'))
const ActivitySummary = lazy(() => import('./pages/ActivitySummary'))
const AiAssistant = lazy(() => import('./pages/AiAssistant'))
const Settings = lazy(() => import('./pages/Settings'))
const UserDetail = lazy(() => import('./pages/UserDetail'))
const Profile = lazy(() => import('./pages/Profile'))
// Finance package pages (Tarmac). /finance/partners redirects to Branches.
const FINANCE_PAGES = [
  { path: 'clients', Page: lazy(() => import('./pages/finance/Clients')) },
  { path: 'invoices', Page: lazy(() => import('./pages/finance/Invoices')) },
  { path: 'payments', Page: lazy(() => import('./pages/finance/Payments')) },
  { path: 'branches', Page: lazy(() => import('./pages/finance/Branches')) },
  { path: 'partners', Page: lazy(() => import('./pages/finance/Partners')) },
  { path: 'recruitment', Page: lazy(() => import('./pages/finance/Recruitment')) },
  { path: 'staff', Page: lazy(() => import('./pages/finance/Staff')) },
  { path: 'rosters', Page: lazy(() => import('./pages/finance/Rosters')) },
  { path: 'payroll', Page: lazy(() => import('./pages/finance/Payroll')) },
  { path: 'reports', Page: lazy(() => import('./pages/finance/Reports')) },
]
const FinanceOverview = lazy(() => import('./pages/finance/Overview'))

const roleHomePath: Record<UserRole, string> = {
  admin: '/',
  main_account: '/',
  supervisor: '/',
  guard: '/profile',
}

/** Patrol screens: shown only while the patrol package is switched on. */
function PatrolOnly({ children }: { children: React.ReactNode }) {
  return features.patrol ? <>{children}</> : <Navigate to="/" replace />
}

function RoleHomeRedirect() {
  const role = useAuthStore((s) => s.user?.role)
  return <Navigate to={role ? roleHomePath[role] : '/login'} replace />
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: UserRole[] }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const loading = useAuthStore((s) => s.loading)
  const role = useAuthStore((s) => s.user?.role)
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return <Navigate to={role ? roleHomePath[role] : '/login'} replace />
  }
  return <>{children}</>
}

function RoleRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: UserRole[] }) {
  return <ProtectedRoute allowedRoles={allowedRoles}>{children}</ProtectedRoute>
}

function MonitoringGuard({ children }: { children: React.ReactNode }) {
  const canView = useCanViewLiveTracking()
  const role = useAuthStore((s) => s.user?.role)
  if (!canView) return <Navigate to={role ? roleHomePath[role] : '/login'} replace />
  return <>{children}</>
}

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // Lock the dashboard after 20 minutes unattended. logout() flips
  // isAuthenticated, which ProtectedRoute turns into a redirect to /login.
  useIdleLogout(isAuthenticated, logout)

  return (
    <BrowserRouter>
      <CookieConsent />
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={features.patrol
            ? <RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><Dashboard /></RoleRoute>
            : <RoleRoute allowedRoles={['admin']}><FinanceOverview /></RoleRoute>} />
          <Route path="/monitoring" element={<PatrolOnly><MonitoringGuard><Monitoring /></MonitoringGuard></PatrolOnly>} />
          <Route path="/scans" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account', 'supervisor', 'guard']}><Scans /></RoleRoute></PatrolOnly>} />
          <Route path="/scans/:id" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account', 'supervisor', 'guard']}><ScanDetail /></RoleRoute></PatrolOnly>} />
          <Route path="/clients" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'supervisor']}><Clients /></RoleRoute></PatrolOnly>} />
          <Route path="/clients/:id" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'supervisor']}><ClientDetail /></RoleRoute></PatrolOnly>} />
          {/* The flat Checkpoints page moved inside client accounts; the list
              route now redirects there. Detail stays for printed QR deep links. */}
          <Route path="/checkpoints" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><Navigate to="/clients" replace /></RoleRoute></PatrolOnly>} />
          <Route path="/checkpoints/:id" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><CheckpointDetail /></RoleRoute></PatrolOnly>} />
          <Route path="/reports" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account']}><Reports /></RoleRoute></PatrolOnly>} />
          <Route path="/users" element={<PatrolOnly><RoleRoute allowedRoles={['admin']}><Users /></RoleRoute></PatrolOnly>} />
          <Route path="/users/:id" element={<PatrolOnly><RoleRoute allowedRoles={['admin']}><UserDetail /></RoleRoute></PatrolOnly>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<RoleRoute allowedRoles={['admin']}><Settings /></RoleRoute>} />
          <Route path="/alerts" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><Alerts /></RoleRoute></PatrolOnly>} />
          <Route path="/timesheets" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account', 'supervisor', 'guard']}><Timesheets /></RoleRoute></PatrolOnly>} />
          <Route path="/post-orders" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><PostOrders /></RoleRoute></PatrolOnly>} />
          <Route path="/handovers" element={features.handovers ? <RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><Handovers /></RoleRoute> : <Navigate to="/" replace />} />
          <Route path="/pass-on-logs" element={features.passOnLogs ? <RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><PassOnLogs /></RoleRoute> : <Navigate to="/" replace />} />
          <Route path="/activity-summary" element={<PatrolOnly><RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><ActivitySummary /></RoleRoute></PatrolOnly>} />
          <Route path="/analytics" element={features.analytics ? <RoleRoute allowedRoles={['admin', 'supervisor']}><Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading analytics…</div>}><Analytics /></Suspense></RoleRoute> : <Navigate to="/" replace />} />
          {features.finance && FINANCE_PAGES.map(({ path, Page }) => (
            <Route key={path} path={`/finance/${path}`} element={<RoleRoute allowedRoles={['admin']}><Page /></RoleRoute>} />
          ))}
          <Route path="/ai-assistant" element={features.aiAssistant ? <RoleRoute allowedRoles={['admin', 'main_account', 'supervisor', 'guard']}><AiAssistant /></RoleRoute> : <Navigate to="/" replace />} />
        </Route>

        <Route path="*" element={<ProtectedRoute><RoleHomeRedirect /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
