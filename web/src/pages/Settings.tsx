import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Mail, MessageSquareText, Phone, ShieldAlert } from 'lucide-react'
import { api } from '../services/api'
import { useIsAdmin } from '../stores/useAuthStore'

type EmergencyForm = {
  emergency_message_template: string
  emergency_email_recipients: string
  emergency_phone_recipients: string
  report_email_recipients: string
  export_email_recipients: string
}

type SettingRow = {
  settingKey?: string
  settingkey?: string
  settingValue?: string
  settingvalue?: string
}

const defaultForm: EmergencyForm = {
  emergency_message_template: 'Emergency alert from {{who}} at {{where}}. Immediate response required.',
  emergency_email_recipients: '',
  emergency_phone_recipients: '',
  report_email_recipients: '',
  export_email_recipients: '',
}

const emergencyKeys = Object.keys(defaultForm) as Array<keyof EmergencyForm>

function latestSettings(rows: SettingRow[]) {
  const values = { ...defaultForm }
  for (const row of [...rows].reverse()) {
    const key = (row.settingKey ?? row.settingkey ?? '') as keyof EmergencyForm
    if (emergencyKeys.includes(key)) {
      values[key] = row.settingValue ?? row.settingvalue ?? ''
    }
  }
  return values
}

export default function Settings() {
  const isAdmin = useIsAdmin()
  const [form, setForm] = useState<EmergencyForm>(defaultForm)
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
      .catch((err) => setError(err.message || 'Failed to load emergency settings'))
      .finally(() => setLoading(false))
  }, [isAdmin])

  const preview = useMemo(() => {
    return form.emergency_message_template
      .replaceAll('{{who}}', 'Field Guard')
      .replaceAll('{{where}}', '6.524379, 3.379206')
      .replaceAll('{{when}}', new Date().toISOString())
      .replaceAll('{{what}}', 'Emergency distress alert triggered')
  }, [form.emergency_message_template])

  const handleChange = (key: keyof EmergencyForm, value: string) => {
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
        emergencyKeys.map((settingKey) => api.emergency.saveSetting({
          settingKey,
          settingValue: form[settingKey].trim(),
          scopeType: 'global',
          scopeId: '',
        })),
      )
      setMessage('Emergency notification settings saved successfully.')
    } catch (err: any) {
      setError(err.message || 'Failed to save emergency settings')
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
              Emergency notification settings can only be managed by an Admin account.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Configuration</div>
        <h1 className="text-2xl font-semibold">Emergency Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure the message and designated email/SMS recipients used when a guard presses the mobile emergency button.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading emergency settings...
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
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
            <h2 className="font-semibold">Report and export recipients</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextAreaField
                icon={<Mail className="h-4 w-4 text-primary" />}
                label="Report email recipients"
                helper="Used for submitted daily activity and maintenance reports."
                value={form.report_email_recipients}
                onChange={(value) => handleChange('report_email_recipients', value)}
              />
              <TextAreaField
                icon={<Mail className="h-4 w-4 text-primary" />}
                label="Export email recipients"
                helper="Used for patrol export notifications and future scheduled Excel exports."
                value={form.export_email_recipients}
                onChange={(value) => handleChange('export_email_recipients', value)}
              />
            </div>
          </div>

          {message && (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> {message}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : 'Save Emergency Settings'}
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