import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardLayout from './components/layout/DashboardLayout'
import Dashboard from './pages/Dashboard'
import Monitoring from './pages/Monitoring'
import Scans from './pages/Scans'
import Checkpoints from './pages/Checkpoints'
import Reports from './pages/Reports'
import Users from './pages/Users'
import UserDetail from './pages/UserDetail'
import Settings from './pages/Settings'
import Alerts from './pages/Alerts'
import Profile from './pages/Profile'
import ScanDetail from './pages/ScanDetail'
import CheckpointDetail from './pages/CheckpointDetail'
import Timesheets from './pages/Timesheets'
import PostOrders from './pages/PostOrders'
import Handovers from './pages/Handovers'
import PassOnLogs from './pages/PassOnLogs'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import { useAuthStore, useCanViewLiveTracking, type UserRole } from './stores/useAuthStore'

const roleHomePath: Record<UserRole, string> = {
  admin: '/',
  main_account: '/',
  supervisor: '/',
  guard: '/profile',
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

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><Dashboard /></RoleRoute>} />
          <Route path="/monitoring" element={<MonitoringGuard><Monitoring /></MonitoringGuard>} />
          <Route path="/scans" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor', 'guard']}><Scans /></RoleRoute>} />
          <Route path="/scans/:id" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor', 'guard']}><ScanDetail /></RoleRoute>} />
          <Route path="/checkpoints" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><Checkpoints /></RoleRoute>} />
          <Route path="/checkpoints/:id" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><CheckpointDetail /></RoleRoute>} />
          <Route path="/reports" element={<RoleRoute allowedRoles={['admin', 'main_account']}><Reports /></RoleRoute>} />
          <Route path="/users" element={<RoleRoute allowedRoles={['admin']}><Users /></RoleRoute>} />
          <Route path="/users/:id" element={<RoleRoute allowedRoles={['admin']}><UserDetail /></RoleRoute>} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<RoleRoute allowedRoles={['admin']}><Settings /></RoleRoute>} />
          <Route path="/alerts" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><Alerts /></RoleRoute>} />
          <Route path="/timesheets" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor', 'guard']}><Timesheets /></RoleRoute>} />
          <Route path="/post-orders" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><PostOrders /></RoleRoute>} />
          <Route path="/handovers" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><Handovers /></RoleRoute>} />
          <Route path="/pass-on-logs" element={<RoleRoute allowedRoles={['admin', 'main_account', 'supervisor']}><PassOnLogs /></RoleRoute>} />
        </Route>

        <Route path="*" element={<ProtectedRoute><RoleHomeRedirect /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
