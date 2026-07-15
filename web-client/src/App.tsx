import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ClientLayout from './components/layout/ClientLayout'
import MarketingLayout from './marketing/MarketingLayout'
import Landing from './marketing/Landing'
import AboutUs from './marketing/AboutUs'
import ContactUs from './marketing/ContactUs'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Overview from './pages/Overview'
import Guards from './pages/Guards'
import Scans from './pages/Scans'
import Locations from './pages/Locations'
import Reports from './pages/Reports'
import { useClientAuthStore } from './stores/useClientAuthStore'
import { useIdleLogout } from './hooks/useIdleLogout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useClientAuthStore((s) => s.isAuthenticated)
  const loading = useClientAuthStore((s) => s.loading)
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const hydrate = useClientAuthStore((s) => s.hydrate)
  const isAuthenticated = useClientAuthStore((s) => s.isAuthenticated)
  const logout = useClientAuthStore((s) => s.logout)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // Lock the portal after 20 minutes unattended. logout() flips
  // isAuthenticated, which ProtectedRoute turns into a redirect to /login.
  useIdleLogout(isAuthenticated, logout)

  return (
    <BrowserRouter>
      <Routes>
        {/* Public marketing site — the portal's front door. Its "Log in" and
            "Get Started" CTAs lead to /login below. */}
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/about" element={<AboutUs />} />
          <Route path="/contact" element={<ContactUs />} />
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route
          element={
            <ProtectedRoute>
              <ClientLayout />
            </ProtectedRoute>
          }
        >
          {/* The signed-in portal starts at /overview; "/" is the landing page. */}
          <Route path="/overview" element={<Overview />} />
          {/* Guard identities are staff-only; clients get coverage numbers. */}
          <Route path="/guards" element={<Guards />} />
          <Route path="/scans" element={<Scans />} />
          <Route path="/locations" element={<Locations />} />
          {/* Old flat checkpoints view is superseded by the grouped Locations view. */}
          <Route path="/checkpoints" element={<Navigate to="/locations" replace />} />
          <Route path="/reports" element={<Reports />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
