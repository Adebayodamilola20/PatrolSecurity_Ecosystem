import { useEffect, useState } from 'react'
import { Phone, Mail, MoreHorizontal, Plus, X, UsersIcon, Clock3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { subscribeToShiftUpdates } from '../services/websocket'
import { useCanManageUsers, useIsMainAccount, useAuthStore } from '../stores/useAuthStore'
import type { User } from '../types'
import { CardSkeleton } from '../components/ui/Skeleton'
import { EmptyState } from '../components/ui/EmptyState'
import { formatDate } from '../utils/format'

export default function Users() {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const [officers, setOfficers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'guard', phone: '', clientId: '', siteIds: [] as string[] })
  const [saving, setSaving] = useState(false)
  const canManage = useCanManageUsers()
  const isMainAccount = useIsMainAccount()

  const load = () => {
    setLoading(true)
    api.users.list().then((users) => {
      setOfficers(users.filter((u: User) => u.role === 'guard' || u.role === 'supervisor' || u.role === 'main_account'))
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const unsub = subscribeToShiftUpdates(() => {
      load()
    })
    return unsub
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (currentUser?.clientId) {
        payload.clientId = currentUser.clientId
      }
      await api.users.create(payload)
      setShowForm(false)
      setForm({ name: '', email: '', password: '', role: 'guard', phone: '', clientId: '', siteIds: [] })
      load()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Team</div>
          <h1 className="text-2xl font-semibold">Personnel</h1>
        </div>
        {(canManage || isMainAccount) && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add Personnel
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-xl border border-border bg-card p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Personnel</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Full Name</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. John Doe" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="guard@securecorp.com" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Password</label>
                <input required type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Default password" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Role</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="guard">Guard</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="main_account">Main Account</option>
                    {currentUser?.role === 'admin' && <option value="admin">Admin</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="+234 800 000 0000" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-border py-2 text-sm hover:bg-accent">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Add Personnel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : officers.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-7 w-7" />}
          title="No personnel yet"
          description="Add personnel to get started."
          action={
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add Personnel
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {officers.map((o) => (
            <button
              key={o.id}
              onClick={() => navigate(`/users/${o.id}`)}
              className="rounded-xl border border-border bg-card p-4 text-left hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-info" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold truncate">{o.name}</div>
                    <button className="text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{o.role} · {o.id.slice(0, 6).toUpperCase()}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      o.onDuty ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                    }`}>
                      {o.onDuty ? 'Clocked In' : 'Clocked Out'}
                    </span>
                    {o.lastClockIn && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {formatDate(o.lastClockIn)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Email</div>
                  <div className="text-sm font-medium truncate">{o.email}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Phone</div>
                  <div className="text-sm font-medium">{o.phone || '-'}</div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs hover:bg-accent">
                  <Phone className="h-3.5 w-3.5" /> Call
                </button>
                <button className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs hover:bg-accent">
                  <Mail className="h-3.5 w-3.5" /> Message
                </button>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
