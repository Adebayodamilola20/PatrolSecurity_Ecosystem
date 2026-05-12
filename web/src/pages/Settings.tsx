export default function Settings() {
  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Configuration</div>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Organization</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Company Name" value="SecureCorp Security Ltd." />
          <Field label="Control Room Email" value="ops@securecorp.com" />
          <Field label="Default Timezone" value="Africa/Lagos" />
          <Field label="Report Cadence" value="Daily — 06:00" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Patrol Rules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="GPS Validation Radius" value="50 m" />
          <Field label="Missed Checkpoint Threshold" value="15 min" />
          <Field label="Min. Scan Interval" value="2 min" />
          <Field label="Auto-flag Off-route" value="Enabled" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Integrations</h2>
        <Toggle label="Email reports via SendGrid" on />
        <Toggle label="WhatsApp critical alerts" on />
        <Toggle label="Push notifications (mobile)" on />
        <Toggle label="Webhook to client portal" />
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <input
        defaultValue={value}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
    </div>
  )
}

function Toggle({ label, on = false }: { label: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="text-sm">{label}</div>
      <div className={`h-5 w-9 rounded-full p-0.5 ${on ? 'bg-primary' : 'bg-muted'}`}>
        <div className={`h-4 w-4 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
      </div>
    </div>
  )
}
