import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, MessageSquareText, Moon, Phone, RefreshCw, ShieldAlert, Sun } from 'lucide-react'
import { api } from '../services/api'
import { useIsAdmin } from '../stores/useAuthStore'
import { useTheme } from '../hooks/useTheme'

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
  emergency_message_template: 'Emergency alert from {{who}} at {{where}}. Immediate response required.',
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
  const [form, setForm] = useState<Record<FormKeys, string>>(defaultForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }

    api.emergency.settings()
      .then((rows) => setForm(latestSettings(rows)))
      .catch((err) => setError(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const preview = useMemo(() => {
    return form.emergency_message_template
      .replaceAll('{{who}}', 'Field Guard')
      .replaceAll('{{where}}', '6.524379, 3.379206')
      .replaceAll('{{when}}', new Date().toISOString())
      .replaceAll('{{what}}', 'Emergency distress alert triggered')
  }, [form.emergency_message_template])

  const handleChange = (key: FormKeys, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
    setMessage('')
    setError('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    try {
      await Promise.all(
        allKeys.map((settingKey) => api.emergency.saveSetting({
          settingKey,
          settingValue: form[settingKey].trim(),
          scopeType: 'global',
          scopeId: '',
        })),
      )
      setMessage('Communication settings saved successfully.')
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
              Communication settings can only be managed by an Admin account.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Configuration</div>
        <h1 className="text-2xl font-semibold">Communication Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure notifications, automated reporting, and alert dispatch settings.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading settings...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <h2 className="font-semibold text-destructive">Emergency dispatch controls</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  These settings are used immediately by the mobile emergency button. Keep phone numbers in international format.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-5">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <MessageSquareText className="h-4 w-4 text-primary" /> Emergency message template
              </label>
              <textarea
                required
                rows={4}
                value={form.emergency_message_template}
                onChange={(e) => handleChange('emergency_message_template', e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Supported placeholders: <code>{'{{who}}'}</code>, <code>{'{{where}}'}</code>, <code>{'{{when}}'}</code>, <code>{'{{what}}'}</code>
              </p>
            </div>

            <div className="rounded-lg border border-border bg-background/60 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Preview</div>
              <div className="mt-2 text-sm font-medium text-foreground">{preview}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextAreaField
                icon={<Mail className="h-4 w-4 text-primary" />}
                label="Emergency email recipients"
                helper="Comma-separated emails. Example: ops@example.com, manager@example.com"
                value={form.emergency_email_recipients}
                onChange={(value) => handleChange('emergency_email_recipients', value)}
              />
              <TextAreaField
                icon={<Phone className="h-4 w-4 text-primary" />}
                label="Emergency phone recipients"
                helper="Comma-separated phone numbers. Example: +2348012345678, +2348098765432"
                value={form.emergency_phone_recipients}
                onChange={(value) => handleChange('emergency_phone_recipients', value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> Report and export notification recipients
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextAreaField
                icon={<Mail className="h-4 w-4 text-primary" />}
                label="Report email recipients"
                helper="Used for submitted daily activity and maintenance reports. Also CC'd on auto-generated patrol reports."
                value={form.report_email_recipients}
                onChange={(value) => handleChange('report_email_recipients', value)}
              />
              <TextAreaField
                icon={<Mail className="h-4 w-4 text-primary" />}
                label="Export email recipients"
                helper="Used for patrol export notifications."
                value={form.export_email_recipients}
                onChange={(value) => handleChange('export_email_recipients', value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-5 space-y-5">
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-semibold">Automated patrol report delivery</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Schedule regular patrol reports to be automatically generated and emailed to the report recipients above.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={form.auto_report_enabled === 'true'}
                  onChange={(e) => handleChange('auto_report_enabled', e.target.checked ? 'true' : 'false')}
                />
                <div className="h-6 w-11 rounded-full border border-border bg-background after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-muted-foreground after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:bg-white" />
              </label>
              <div>
                <div className="text-sm font-medium">Enable auto-reporting</div>
                <div className="text-xs text-muted-foreground">
                  {form.auto_report_enabled === 'true'
                    ? 'Reports will be generated and emailed on the schedule below.'
                    : 'No automated reports will be sent.'}
                </div>
              </div>
            </div>

            {form.auto_report_enabled === 'true' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-1">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="h-4 w-4 text-primary" /> Schedule frequency
                  </label>
                  <select
                    value={form.auto_report_schedule}
                    onChange={(e) => handleChange('auto_report_schedule', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {scheduleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    How often the system checks and sends reports.
                  </p>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <RefreshCw className="h-4 w-4 text-primary" /> Report time range
                  </label>
                  <select
                    value={form.auto_report_range}
                    onChange={(e) => handleChange('auto_report_range', e.target.value)}
                    className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    {rangeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The period of patrol data included in each report.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-start gap-3">
              <RefreshCw className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-semibold">Zero-Time Live Tracking</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  When enabled, guards start broadcasting their live GPS location immediately upon clock-in — no delay, no grace period. The dashboard shows their position moving in real-time even between QR scans.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={form.zero_time_enabled === 'true'}
                  onChange={(e) => handleChange('zero_time_enabled', e.target.checked ? 'true' : 'false')}
                />
                <div className="h-6 w-11 rounded-full border border-border bg-background after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-muted-foreground after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:bg-white" />
              </label>
              <div>
                <div className="text-sm font-medium">Enable zero-time tracking</div>
                <div className="text-xs text-muted-foreground">
                  {form.zero_time_enabled === 'true'
                    ? 'Guards are tracked from the moment they clock in.'
                    : 'GPS tracking starts only when the first scan is submitted.'}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-start gap-3">
              {theme === 'dark' ? <Moon className="mt-0.5 h-5 w-5 text-primary" /> : <Sun className="mt-0.5 h-5 w-5 text-primary" />}
              <div>
                <h2 className="font-semibold">Appearance</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Switch between dark and light mode for the dashboard.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={theme === 'light'}
                  onChange={toggleTheme}
                />
                <div className="h-6 w-11 rounded-full border border-border bg-background after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-muted-foreground after:transition-all peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:bg-white" />
              </label>
              <div>
                <div className="text-sm font-medium">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</div>
                <div className="text-xs text-muted-foreground">
                  {theme === 'dark'
                    ? 'Dark theme — easier on the eyes in low light.'
                    : 'Light theme — brighter interface for daytime use.'}
                </div>
              </div>
            </div>
          </div>

          {message && (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {message}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : 'Save Communication Settings'}
          </button>
        </form>
      )}
    </div>
  )
}

function TextAreaField({
  icon,
  label,
  helper,
  value,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  helper: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium">{icon} {label}</label>
      <textarea
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  )
}
