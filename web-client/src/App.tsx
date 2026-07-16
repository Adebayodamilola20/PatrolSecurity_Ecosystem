import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ClientLayout from './components/layout/ClientLayout'
import MarketingLayout from './marketing/MarketingLayout'
import Landing from './marketing/Landing'
import AboutUs from './marketing/AboutUs'
import ContactUs from './marketing/ContactUs'
import ComingSoon from './marketing/ComingSoon'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Overview from './pages/Overview'
import Guards from './pages/Guards'
import Scans from './pages/Scans'
import Locations from './pages/Locations'
import Reports from './pages/Reports'
import { useClientAuthStore } from './stores/useClientAuthStore'
import { useIdleLogout } from './hooks/useIdleLogout'

// Analytics pulls in the charting library; loading it on demand keeps it out
// of the bundle every other page pays for.
const Analytics = lazy(() => import('./pages/Analytics'))

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
          {/* In the nav, not yet written — a real page beats bouncing off the
              catch-all back to home. */}
          <Route
            path="/blog"
            element={<ComingSoon title="The Evergreen blog" blurb="Field notes on running accountable guarding operations — what we learn from the control rooms using Evergreen." />}
          />
          <Route
            path="/docs"
            element={<ComingSoon title="Documentation" blurb="Setup guides, checkpoint and post-order references, and the API. We're writing them up now." />}
          />
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
          <Route
            path="/analytics"
            element={
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading analytics…</div>}>
                <Analytics />
              </Suspense>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
