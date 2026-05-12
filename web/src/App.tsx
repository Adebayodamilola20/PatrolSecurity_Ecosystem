import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardLayout from './components/layout/DashboardLayout'
import Dashboard from './pages/Dashboard'
import Monitoring from './pages/Monitoring'
import Scans from './pages/Scans'
import Checkpoints from './pages/Checkpoints'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Settings from './pages/Settings'
import Alerts from './pages/Alerts'
import Profile from './pages/Profile'
import ScanDetail from './pages/ScanDetail'
import CheckpointDetail from './pages/CheckpointDetail'
import Timesheets from './pages/Timesheets'
import Login from './pages/Login'
import { useAuthStore } from './stores/useAuthStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/monitoring" element={<Monitoring />} />
          <Route path="/scans" element={<Scans />} />
          <Route path="/scans/:id" element={<ScanDetail />} />
          <Route path="/checkpoints" element={<Checkpoints />} />
          <Route path="/checkpoints/:id" element={<CheckpointDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={<Users />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/timesheets" element={<Timesheets />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
