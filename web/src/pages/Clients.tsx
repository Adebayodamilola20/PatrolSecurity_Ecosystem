import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Building2, Plus, Eye, EyeOff } from 'lucide-react'
import { api } from '../services/api'
import { useAuthStore } from '../stores/useAuthStore'
import { CardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'

interface ClientRow {
  id: string
  name: string
  email: string
  phone: string
  active: boolean
  createdAt: string
}

export default function Clients() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const canManage = role === 'admin'
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const emptyForm = { name: '', email: '', phones: [''], password: '' }
  const [form, setForm] = useState(emptyForm)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const load = () => {
    setLoading(true)
    api.clients.list().then(setClients).finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }
    try {
      setSubmitting(true)
      setFormError('')
      const created = await api.clients.create({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phones.map((p) => p.trim()).filter(Boolean).join(', '),
        password: form.password,
      })
      setShowModal(false)
      setForm(emptyForm)
      if (created?.id) {
        navigate(`/clients/${created.id}`)
      } else {
        load()
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Could not create the client account.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Client Accounts</div>
          <h1 className="text-2xl font-semibold">Clients</h1>
        </div>
        {canManage && (
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New Client
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-7 w-7" />}
          title="No client accounts yet"
          description="Create a client account with a portal login, then add their locations and sub-location QR codes inside it."
          action={canManage ? (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New Client
            </button>
          ) : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => (
            <button
              key={client.id}
              onClick={() => navigate(`/clients/${client.id}`)}
              className={`rounded-xl border bg-card p-5 text-left transition hover:border-primary/50 ${client.active ? 'border-border' : 'border-muted opacity-50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${client.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {client.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-3 font-semibold">{client.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{client.email}</div>
              {client.phone ? (
                <div className="mt-0.5 text-xs text-muted-foreground">{client.phone}</div>
              ) : null}
              <div className="mt-3 text-[11px] text-muted-foreground">
                Created {new Date(client.createdAt).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-semibold">New Client Account</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-3 px-6 py-4">
              <p className="text-xs text-muted-foreground">
                This creates the company and its client-portal login in one step. Share the email and password with the client — they sign in on the client portal, never on this dashboard.
              </p>
              {formError ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              ) : null}
              <div>
                <label className="text-xs text-muted-foreground">Company Name</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Portal Login Email</label>
                <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Phone number(s) (optional)</label>
                <div className="mt-1 space-y-2">
                  {form.phones.map((phone, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={phone}
                        onChange={e => setForm(f => ({
                          ...f,
                          phones: f.phones.map((p, j) => (j === i ? e.target.value : p)),
                        }))}
                        placeholder={i === 0 ? 'Primary phone' : 'Additional phone'}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                      {form.phones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setForm(f => ({ ...f, phones: f.phones.filter((_, j) => j !== i) }))}
                          className="shrink-0 rounded-lg border border-border p-2 text-muted-foreground hover:text-destructive"
                          title="Remove this number"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, phones: [...f.phones, ''] }))}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80"
                >
                  <Plus className="h-3.5 w-3.5" /> Add another phone number
                </button>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Portal Password</label>
                <div className="relative mt-1">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    minLength={8}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">At least 8 characters.</p>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground" />
                    Creating account...
                  </>
                ) : (
                  'Create Client Account'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
