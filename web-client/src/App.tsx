import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ClientLayout from './components/layout/ClientLayout'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Overview from './pages/Overview'
import Guards from './pages/Guards'
import GuardDetail from './pages/GuardDetail'
import Scans from './pages/Scans'
import Checkpoints from './pages/Checkpoints'
import Reports from './pages/Reports'
import { useClientAuthStore } from './stores/useClientAuthStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useClientAuthStore((s) => s.isAuthenticated)
  const loading = useClientAuthStore((s) => s.loading)
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const hydrate = useClientAuthStore((s) => s.hydrate)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route
          element={
            <ProtectedRoute>
              <ClientLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Overview />} />
          <Route path="/guards" element={<Guards />} />
          <Route path="/guards/:id" element={<GuardDetail />} />
          <Route path="/scans" element={<Scans />} />
          <Route path="/checkpoints" element={<Checkpoints />} />
          <Route path="/reports" element={<Reports />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
