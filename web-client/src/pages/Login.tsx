import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
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
  ArrowLeft,
  ArrowRight,
  AlertCircle,
  Smartphone,
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
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* ───────────── Left: evergreen brand panel (desktop only) ─────────────
          The gradient used to run deep green while every button on the
          marketing site is teal → cyan, so arriving here felt like landing on
          a different company. Same family now, just darkened. */}
      <aside
        className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between"
        style={{
          background:
            'linear-gradient(150deg, #042f2e 0%, #0d5c56 48%, #0e7490 100%)',
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
            background: 'radial-gradient(circle, rgba(34,211,238,0.28), transparent 70%)',
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

        {/* brand mark — clickable, because this page has no nav of its own */}
        <Link to="/" className="lp-fade relative flex w-fit items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <ShieldCheck className="h-5 w-5 text-teal-300" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Evergreen Security</p>
            <p className="text-[11px] text-teal-200/80">Client Portal</p>
          </div>
        </Link>

        {/* centered writing */}
        <div className="relative max-w-md">
          {/* floating shield with pulse */}
          <div className="lp-fade-up relative mb-8 h-16 w-16" style={{ animationDelay: '0.05s' }}>
            <span className="lp-pulse-ring absolute inset-0 rounded-2xl bg-teal-400/40" />
            <span className="lp-float relative grid h-16 w-16 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/25 backdrop-blur">
              <ShieldCheck className="h-8 w-8 text-teal-300" />
            </span>
          </div>
          <h1
            className="lp-fade-up text-4xl font-semibold leading-[1.1] tracking-tight"
            style={{ animationDelay: '0.12s' }}
          >
            Your security,
            <br />
            <span className="bg-gradient-to-r from-teal-300 to-cyan-300 bg-clip-text text-transparent">
              in full view.
            </span>
          </h1>
          <p
            className="lp-fade-up mt-5 text-[15px] leading-relaxed text-teal-50/80"
            style={{ animationDelay: '0.2s' }}
          >
            Sign in to follow your guards, live patrol scans, checkpoints, and
            reports — always current, and always only yours.
          </p>
        </div>

        {/* trust row */}
        <ul className="lp-fade relative space-y-3" style={{ animationDelay: '0.3s' }}>
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-teal-50/90">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon className="h-4 w-4 text-teal-300" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </aside>

      {/* ───────────── Right: sign-in form (all screens) ───────────── */}
      <main className="relative flex min-h-screen flex-col px-5 py-8 lg:min-h-0">
        {/* soft teal wash so the white card sits on something */}
        <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-teal-500/10 blur-[100px]" />

        {/* There is no nav on this route, so leaving is a dead end without it. */}
        <Link
          to="/"
          className="relative z-10 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to site
        </Link>

        <div className="relative z-10 flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-[26rem]">
            {/* brand mark — shown on mobile where the panel is hidden */}
            <div className="lp-fade-up mb-6 flex flex-col items-center text-center lg:hidden">
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-teal-600 to-cyan-500 shadow-[0_8px_20px_rgba(20,184,166,0.35)]">
                <ShieldCheck className="h-6 w-6 text-white" />
              </span>
              <p className="text-sm font-semibold text-slate-900">Evergreen Security</p>
              <p className="text-xs text-slate-500">Client Portal</p>
            </div>

            <div
              className="lp-fade-up rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-8"
              style={{ animationDelay: '0.06s' }}
            >
              <div className="mb-7">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
                <p className="mt-1.5 text-sm text-slate-500">
                  Sign in to view your guards &amp; patrols.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="username"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-3 pl-11 pr-3.5 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/25"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-600">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-3 pl-11 pr-11 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/25"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="lp-fade flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-xs leading-relaxed text-rose-700"
                  >
                    <AlertCircle className="mt-px h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(20,184,166,0.35)] transition-all hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Self-service password reset was removed on purpose — client
                  logins are created and reset by our staff — so the usual
                  "Forgot password?" link would lead nowhere. Point at a human. */}
              <p className="mt-6 border-t border-slate-100 pt-5 text-center text-xs text-slate-500">
                Trouble signing in?{' '}
                <Link to="/contact" className="font-medium text-teal-600 transition-colors hover:text-teal-700">
                  Contact your account manager
                </Link>
              </p>
            </div>

            {/* Guards land here by mistake often enough to be worth a line. */}
            <p className="lp-fade mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-400" style={{ animationDelay: '0.4s' }}>
              <Smartphone className="h-3.5 w-3.5 shrink-0" />
              This portal is for clients. Guards sign in on the Evergreen app.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
