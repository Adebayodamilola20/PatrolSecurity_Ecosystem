import { useEffect, useState } from 'react'
import { Phone, Mail, MoreHorizontal, Plus, X, UsersIcon, Clock3, Search } from 'lucide-react'
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
  const [formError, setFormError] = useState('')
  const canManage = useCanManageUsers()
  const isMainAccount = useIsMainAccount()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'guard' | 'supervisor' | 'main_account'>('all')
  const [dutyFilter, setDutyFilter] = useState<'all' | 'on' | 'off'>('all')

  const filteredOfficers = officers.filter((o) => {
    const q = search.trim().toLowerCase()
    const matchSearch =
      !q ||
      o.name.toLowerCase().includes(q) ||
      (o.email ?? '').toLowerCase().includes(q) ||
      (o.phone ?? '').toLowerCase().includes(q)
    const matchRole = roleFilter === 'all' || o.role === roleFilter
    const matchDuty = dutyFilter === 'all' || (dutyFilter === 'on' ? o.onDuty : !o.onDuty)
    return matchSearch && matchRole && matchDuty
  })

  // `silent` refreshes update the data without flashing the loading skeleton,
  // so background polling/websocket updates don't make the page look like it's
  // reloading itself. Only the first load and explicit actions show the skeleton.
  const load = (silent = false) => {
    if (!silent) setLoading(true)
    api.users.list().then((users) => {
      setOfficers(users.filter((u: User) => u.role === 'guard' || u.role === 'supervisor' || u.role === 'main_account'))
    }).catch((err) => { console.error('Failed to load users:', err) }).finally(() => { if (!silent) setLoading(false) })
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 15000)
    const unsub = subscribeToShiftUpdates(() => {
      load(true)
    })
    return () => {
      clearInterval(interval)
      unsub()
    }
  }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const payload: any = { ...form }
      if (currentUser?.clientId) {
        payload.clientId = currentUser.clientId
      }
      if (!payload.clientId) {
        delete payload.clientId
      }
      if (payload.siteIds.length === 0) {
        delete payload.siteIds
      }
      await api.users.create(payload)
      setShowForm(false)
      setForm({ name: '', email: '', password: '', role: 'guard', phone: '', clientId: '', siteIds: [] })
      load()
    } catch (err: any) {
      setFormError(err?.message || 'Could not add personnel. Please try again.')
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
            onClick={() => {
              setFormError('')
              setShowForm(true)
            }}
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
              <button onClick={() => {
                setFormError('')
                setShowForm(false)
              }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              {formError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}
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
                <button type="button" onClick={() => {
                  setFormError('')
                  setShowForm(false)
                }}
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
              onClick={() => {
                setFormError('')
                setShowForm(true)
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Add Personnel
            </button>
          }
        />
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or phone..."
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All roles</option>
              <option value="guard">Guard</option>
              <option value="supervisor">Supervisor</option>
              <option value="main_account">Main Account</option>
            </select>
            <select
              value={dutyFilter}
              onChange={(e) => setDutyFilter(e.target.value as typeof dutyFilter)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All status</option>
              <option value="on">Clocked In</option>
              <option value="off">Clocked Out</option>
            </select>
          </div>

          {filteredOfficers.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground text-center">
              No personnel match your filters.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOfficers.map((o) => (
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
        </>
      )}
    </div>
  )
}
