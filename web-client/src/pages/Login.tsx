import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Radar,
  Fingerprint,
  Activity,
} from 'lucide-react'
import { useClientAuthStore } from '../stores/useClientAuthStore'

const TRUST_POINTS = [
  { icon: Radar, label: 'Real-time patrol visibility' },
  { icon: Fingerprint, label: 'Your data, fully isolated' },
  { icon: Activity, label: '24/7 monitored & encrypted' },
]

export default function Login() {
  const navigate = useNavigate()
  const login = useClientAuthStore((s) => s.login)
  const isAuthenticated = useClientAuthStore((s) => s.isAuthenticated)
  // DEMO: prefilled placeholder credentials — remove before production.
  const [email, setEmail] = useState('client@securecorp.com')
  const [password, setPassword] = useState('123456')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // "/" is the public landing page now, so a signed-in client belongs on the
  // portal itself rather than back out on the marketing site.
  if (isAuthenticated) return <Navigate to="/overview" replace />

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim().toLowerCase(), password)
      navigate('/overview', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-background text-foreground lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ───────────── Left: evergreen brand panel (desktop only) ───────────── */}
      <aside
        className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{
          background:
            'linear-gradient(150deg, #052723 0%, #0a3f39 46%, #0f6b60 100%)',
        }}
      >
        {/* ambient aurora glows */}
        <div
          className="lp-aurora pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.35), transparent 70%)' }}
        />
        <div
          className="lp-aurora pointer-events-none absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full blur-3xl"
          style={{
            background: 'radial-gradient(circle, rgba(16,185,129,0.28), transparent 70%)',
            animationDelay: '-6s',
          }}
        />
        {/* faint grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        {/* brand mark */}
        <div className="lp-fade relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Evergreen Security</p>
            <p className="text-[11px] text-emerald-200/80">Client Portal</p>
          </div>
        </div>

        {/* centered writing */}
        <div className="relative max-w-md">
          {/* floating shield with pulse */}
          <div className="lp-fade-up relative mb-8 h-16 w-16" style={{ animationDelay: '0.05s' }}>
            <span className="lp-pulse-ring absolute inset-0 rounded-2xl bg-emerald-400/40" />
            <span className="lp-float relative grid h-16 w-16 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/25 backdrop-blur">
              <ShieldCheck className="h-8 w-8 text-emerald-300" />
            </span>
          </div>
          <h1
            className="lp-fade-up text-4xl font-semibold leading-[1.1] tracking-tight"
            style={{ animationDelay: '0.12s' }}
          >
            Your security,
            <br />
            <span className="text-emerald-300">in full view.</span>
          </h1>
          <p
            className="lp-fade-up mt-5 text-[15px] leading-relaxed text-emerald-50/80"
            style={{ animationDelay: '0.2s' }}
          >
            Sign in to follow your guards, live patrol scans, checkpoints, and
            reports — always current, and always only yours.
          </p>
        </div>

        {/* trust row */}
        <ul className="lp-fade relative space-y-3" style={{ animationDelay: '0.3s' }}>
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-emerald-50/90">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon className="h-4 w-4 text-emerald-300" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </aside>

      {/* ───────────── Right: sign-in form (all screens) ───────────── */}
      <main className="flex min-h-screen items-center justify-center px-5 py-10 lg:min-h-0">
        <div className="w-full max-w-sm">
          {/* brand mark — shown on mobile where the panel is hidden */}
          <div className="lp-fade-up mb-8 flex flex-col items-center text-center lg:hidden">
            <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </span>
            <p className="text-sm font-semibold">Evergreen Security</p>
            <p className="text-xs text-muted-foreground">Client Portal</p>
          </div>

          <div className="lp-fade-up mb-6" style={{ animationDelay: '0.06s' }}>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to view your guards &amp; patrols.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="lp-fade-up" style={{ animationDelay: '0.12s' }}>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="lp-fade-up" style={{ animationDelay: '0.18s' }}>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-10 text-sm outline-none transition-shadow placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <p className="lp-fade rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="lp-fade-up flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-60"
              style={{ animationDelay: '0.24s' }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

        </div>
      </main>
    </div>
  )
}
