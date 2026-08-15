import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ClientLayout from './components/layout/ClientLayout'
import MarketingLayout from './marketing/MarketingLayout'
import Landing from './marketing/Landing'
import ComingSoon from './marketing/ComingSoon'
import Login from './pages/Login'
import Overview from './pages/Overview'
import { useClientAuthStore } from './stores/useClientAuthStore'
import { useIdleLogout } from './hooks/useIdleLogout'

// Analytics pulls in the charting library; loading it on demand keeps it out
// of the bundle every other page pays for.
// Route-level splitting. The marketing site and the signed-in portal
// shipped as one 878KB bundle, so a client logging in first downloaded
// the landing page's animation library, and a visitor reading the landing
// page downloaded Leaflet and the QR generator. Landing, Login and
// Overview stay eager — everything else arrives on navigation.
const Analytics = lazy(() => import('./pages/Analytics'))
const Solutions = lazy(() => import('./marketing/Solutions'))
const AboutUs = lazy(() => import('./marketing/AboutUs'))
const ContactUs = lazy(() => import('./marketing/ContactUs'))
const Locations = lazy(() => import('./pages/Locations'))
const Scans = lazy(() => import('./pages/Scans'))
const Reports = lazy(() => import('./pages/Reports'))
const PassOns = lazy(() => import('./pages/PassOns'))
const Emergency = lazy(() => import('./pages/Emergency'))
const Guards = lazy(() => import('./pages/Guards'))

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
        {/* Public marketing site — the portal's front door. Its one auth CTA,
            "Sign In", leads to /login below; everything else routes to
            /contact, because clients are onboarded by our staff. */}
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/solutions" element={<Solutions />} />
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
          {/* The one screen that flows outward: instructions this client
              writes for the guards posted on its own sites. */}
          <Route path="/pass-ons" element={<PassOns />} />
          <Route path="/emergency" element={<Emergency />} />
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
