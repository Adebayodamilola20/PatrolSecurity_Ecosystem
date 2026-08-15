import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Mail,
  MessageSquareText,
  Moon,
  Phone,
  RefreshCw,
  ShieldAlert,
  Sun,
} from 'lucide-react'
import { api } from '../services/api'
import { useIsAdmin } from '../stores/useAuthStore'
import { useTheme } from '../hooks/useTheme'
import { Skeleton } from '../components/ui/Skeleton'
import { PageHeader } from '../components/ui/PageHeader'

type FormKeys =
  | 'emergency_message_template'
  | 'emergency_email_recipients'
  | 'emergency_phone_recipients'
  | 'report_email_recipients'
  | 'export_email_recipients'
  | 'auto_report_enabled'
  | 'auto_report_schedule'
  | 'auto_report_range'
  | 'zero_time_enabled'

type SettingRow = {
  settingKey?: string
  settingkey?: string
  settingValue?: string
  settingvalue?: string
}

const defaultForm: Record<FormKeys, string> = {
  emergency_message_template:
    'Emergency alert from {{who}} at {{where}}. Immediate response required.',
  emergency_email_recipients: '',
  emergency_phone_recipients: '',
  report_email_recipients: '',
  export_email_recipients: '',
  auto_report_enabled: 'false',
  auto_report_schedule: 'daily',
  auto_report_range: 'last_24h',
  zero_time_enabled: 'true',
}

const allKeys = Object.keys(defaultForm) as FormKeys[]

const scheduleOptions = [
  { value: 'hourly', label: 'Every hour' },
  { value: 'daily', label: 'Once per day' },
  { value: 'weekly', label: 'Once per week' },
]

const rangeOptions = [
  { value: 'last_24h', label: 'Last 24 hours' },
  { value: 'today', label: 'Today (since midnight)' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week (since Monday)' },
]

/**
 * Which section of settings is on screen.
 *
 * The page used to be one long scrolling form: five unrelated concerns —
 * who gets rung in an emergency, report scheduling, GPS behaviour, dark mode,
 * your own password — stacked in a column with a single Save at the bottom.
 * Finding anything meant scrolling and reading, and pressing Save wrote all
 * nine values whether you had touched them or not.
 */
const SECTIONS = [
  { id: 'alerts', label: 'Alerts & dispatch', icon: ShieldAlert },
  { id: 'reports', label: 'Automated reports', icon: Mail },
  { id: 'tracking', label: 'Live tracking', icon: RefreshCw },
  { id: 'appearance', label: 'Appearance', icon: Sun },
  { id: 'account', label: 'Your account', icon: KeyRound },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

function latestSettings(rows: SettingRow[]) {
  const values = { ...defaultForm }
  for (const row of [...rows].reverse()) {
    const key = (row.settingKey ?? row.settingkey ?? '') as FormKeys
    if (allKeys.includes(key)) {
      values[key] = row.settingValue ?? row.settingvalue ?? ''
    }
  }
  return values
}

export default function Settings() {
  const isAdmin = useIsAdmin()
  const { theme, toggleTheme } = useTheme()
  const [section, setSection] = useState<SectionId>('alerts')
  const [form, setForm] = useState<Record<FormKeys, string>>(defaultForm)
  // What was on the server when we loaded, so we can tell what actually
  // changed and save only that.
  const [saved, setSaved] = useState<Record<FormKeys, string>>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    api.emergency
      .settings()
      .then((rows) => {
        const values = latestSettings(rows)
        setForm(values)
        setSaved(values)
      })
      .catch((err) => setError(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const dirtyKeys = useMemo(
    () => allKeys.filter((key) => form[key].trim() !== saved[key].trim()),
    [form, saved],
  )

  const preview = useMemo(
    () =>
      form.emergency_message_template
        .replaceAll('{{who}}', 'Ade Guard')
        .replaceAll('{{where}}', 'Gbagada — Front Gate')
        .replaceAll('{{when}}', new Date().toLocaleString())
        .replaceAll('{{what}}', 'Emergency distress alert triggered'),
    [form.emergency_message_template],
  )

  const handleChange = (key: FormKeys, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
    setError('')
  }

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (dirtyKeys.length === 0) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      // Only what changed. Writing all nine keys on every save made an audit
      // trail that could not distinguish a real edit from someone opening the
      // page and pressing the button.
      await Promise.all(
        dirtyKeys.map((settingKey) =>
          api.emergency.saveSetting({
            settingKey,
            settingValue: form[settingKey].trim(),
            scopeType: 'global',
            scopeId: '',
          }),
        ),
      )
      setSaved({ ...form })
      setMessage(`Saved ${dirtyKeys.length} change${dirtyKeys.length === 1 ? '' : 's'}.`)
    } catch (err: any) {
      setError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
          <div>
            <h1 className="text-xl font-semibold">Admin access required</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              These settings decide who is rung in an emergency, so they are managed by an admin
              account only.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <div className="mb-5">
        <PageHeader
          title="Settings"
          blurb="Who gets alerted, when reports go out, and how the dashboard behaves."
        />
      </div>

      <div className="flex flex-col gap-5 md:flex-row">
        {/* Section nav. Horizontal chips on a phone, a rail on desktop. */}
        <nav className="flex gap-1 overflow-x-auto md:w-52 md:shrink-0 md:flex-col md:overflow-visible">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                section === id
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </button>
          ))}
        </nav>

        <form onSubmit={handleSubmit} className="min-w-0 flex-1 space-y-4">
          {loading ? (
            <div className="space-y-3 rounded-xl border border-border bg-card p-5">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-72" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {section === 'alerts' && (
                <>
                  <Panel
                    icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
                    title="Who is alerted in an emergency"
                    blurb="These are rung the moment a guard presses panic or a client raises an alarm. Separate multiple entries with commas."
                    tone="danger"
                  >
                    <Field
                      label="Email recipients"
                      hint="Control room inboxes. Leave empty to send no email."
                      icon={<Mail className="h-4 w-4" />}
                    >
                      <input
                        value={form.emergency_email_recipients}
                        onChange={(e) => handleChange('emergency_email_recipients', e.target.value)}
                        placeholder="control@company.com, ops@company.com"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                    <Field
                      label="SMS recipients"
                      hint="International format, e.g. +2348055512345 — a local 0… number will not deliver."
                      icon={<Phone className="h-4 w-4" />}
                    >
                      <input
                        value={form.emergency_phone_recipients}
                        onChange={(e) => handleChange('emergency_phone_recipients', e.target.value)}
                        placeholder="+2348055512345, +2348012345678"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </Field>
                    {!form.emergency_email_recipients.trim() &&
                      !form.emergency_phone_recipients.trim() && (
                        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Nobody is listed. An emergency will still be recorded and shown on the
                          dashboard, but no one will be rung or emailed.
                        </div>
                      )}
                  </Panel>

                  <Panel
                    icon={<MessageSquareText className="h-5 w-5 text-primary" />}
                    title="Alert wording"
                    blurb="Used for the email and SMS body. The placeholders are filled in when it sends."
                  >
                    <textarea
                      value={form.emergency_message_template}
                      onChange={(e) => handleChange('emergency_message_template', e.target.value)}
                      className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {['{{who}}', '{{where}}', '{{when}}', '{{what}}'].map((token) => (
                        <code key={token} className="rounded bg-muted px-1.5 py-0.5 font-mono">
                          {token}
                        </code>
                      ))}
                    </div>
                    <div className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Preview
                      </div>
                      <p className="mt-1 text-sm">{preview}</p>
                    </div>
                  </Panel>
                </>
              )}

              {section === 'reports' && (
                <Panel
                  icon={<Clock className="h-5 w-5 text-primary" />}
                  title="Automated patrol reports"
                  blurb="Send a patrol summary on a schedule without anyone having to remember."
                >
                  <Toggle
                    checked={form.auto_report_enabled === 'true'}
                    onChange={(on) => handleChange('auto_report_enabled', on ? 'true' : 'false')}
                    title="Send reports automatically"
                    detail={
                      form.auto_report_enabled === 'true'
                        ? 'Reports go out on the schedule below.'
                        : 'Nothing is sent automatically; reports are generated on demand.'
                    }
                  />
                  {form.auto_report_enabled === 'true' && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="How often">
                        <select
                          value={form.auto_report_schedule}
                          onChange={(e) => handleChange('auto_report_schedule', e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          {scheduleOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="What it covers">
                        <select
                          value={form.auto_report_range}
                          onChange={(e) => handleChange('auto_report_range', e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                        >
                          {rangeOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  )}
                  <Field
                    label="Report recipients"
                    hint="Who receives the scheduled patrol summary."
                    icon={<Mail className="h-4 w-4" />}
                  >
                    <input
                      value={form.report_email_recipients}
                      onChange={(e) => handleChange('report_email_recipients', e.target.value)}
                      placeholder="ops@company.com"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field
                    label="Export recipients"
                    hint="Who receives CSV exports when one is requested."
                    icon={<Mail className="h-4 w-4" />}
                  >
                    <input
                      value={form.export_email_recipients}
                      onChange={(e) => handleChange('export_email_recipients', e.target.value)}
                      placeholder="admin@company.com"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                </Panel>
              )}

              {section === 'tracking' && (
                <Panel
                  icon={<RefreshCw className="h-5 w-5 text-primary" />}
                  title="Live tracking"
                  blurb="How soon a guard's position starts appearing on the map after they clock in."
                >
                  <Toggle
                    checked={form.zero_time_enabled === 'true'}
                    onChange={(on) => handleChange('zero_time_enabled', on ? 'true' : 'false')}
                    title="Track from the moment they clock in"
                    detail={
                      form.zero_time_enabled === 'true'
                        ? 'Position updates begin at clock-in, before the first scan.'
                        : 'Tracking begins only once the guard submits their first scan.'
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Guards see that they are being tracked either way — the phone shows a permanent
                    notification for the whole shift, which the operating system requires and we
                    would not remove.
                  </p>
                </Panel>
              )}

              {section === 'appearance' && (
                <Panel
                  icon={theme === 'dark' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
                  title="Appearance"
                  blurb="Applies to this browser only — it is not shared with the rest of your team."
                >
                  <Toggle
                    checked={theme === 'light'}
                    onChange={toggleTheme}
                    title="Light mode"
                    detail={theme === 'light' ? 'Dashboard is in light mode.' : 'Dashboard is in dark mode.'}
                  />
                </Panel>
              )}

              {section === 'account' && <AccountPanel />}
            </>
          )}
        </form>
      </div>

      {/* Sticky save bar. It only appears when something has changed, and it
          says how many things — a Save button that is always live gives no
          signal about whether you have edited anything. Appearance and the
          account section save themselves, so it stays out of their way. */}
      {!loading && (dirtyKeys.length > 0 || message || error) &&
        section !== 'appearance' && section !== 'account' && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:left-64">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {error ? (
                <span className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {error}
                </span>
              ) : message ? (
                <span className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="h-4 w-4" /> {message}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {dirtyKeys.length} unsaved change{dirtyKeys.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {dirtyKeys.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setForm({ ...saved }); setMessage(''); setError('') }}
                  disabled={saving}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Panel({
  icon,
  title,
  blurb,
  tone,
  children,
}: {
  icon: React.ReactNode
  title: string
  blurb: string
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <section
      className={`space-y-4 rounded-xl border p-5 ${
        tone === 'danger' ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  hint,
  icon,
  children,
}: {
  label: string
  hint?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  title: string
  detail: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="h-6 w-11 rounded-full border border-border bg-background after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-muted-foreground after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:bg-white" />
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  )
}

/**
 * Changing your own password.
 *
 * It lived nowhere: an admin could reset everyone else's password but not
 * their own without someone else doing it for them. The current password is
 * required, so an unattended logged-in dashboard is not a way to take the
 * account over.
 */
function AccountPanel() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [problem, setProblem] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProblem('')
    setDone('')
    if (next !== confirm) {
      setProblem('The two new passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await api.auth.changePassword(current, next)
      setDone('Password changed. Your other sessions have been signed out.')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not change your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel
      icon={<KeyRound className="h-5 w-5 text-primary" />}
      title="Your password"
      blurb="Changing it signs you out of your other sessions."
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Current password">
          <input
            required
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="New password" hint="At least 8 characters.">
            <input
              required
              minLength={8}
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              required
              minLength={8}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </Field>
        </div>
        {problem && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {problem}
          </div>
        )}
        {done && (
          <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm text-success">
            {done}
          </div>
        )}
        <button
          disabled={busy}
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </Panel>
  )
}
