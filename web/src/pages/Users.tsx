import { useEffect, useState } from 'react'
import { Phone, Mail, MoreHorizontal, Plus, X } from 'lucide-react'
import { api } from '../services/api'
import type { User } from '../types'

export default function Users() {
  const [officers, setOfficers] = useState<User[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'officer', phone: '' })
  const [saving, setSaving] = useState(false)

  const load = () => {
    api.users.list().then((users) => {
      setOfficers(users.filter((u: User) => u.role === 'officer' || u.role === 'supervisor'))
    }).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.users.create(form)
      setShowForm(false)
      setForm({ name: '', email: '', password: '', role: 'officer', phone: '' })
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
          <h1 className="text-2xl font-semibold">Officers</h1>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Officer
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="rounded-xl border border-border bg-card p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Officer</h2>
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
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="officer@securecorp.com" />
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
                    <option value="officer">Officer</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
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
                  {saving ? 'Saving...' : 'Add Officer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {officers.map((o) => (
          <div key={o.id} className="rounded-xl border border-border bg-card p-4">
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
                <span className="mt-2 inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase bg-success/15 text-success">
                  {o.active ? 'Active' : 'Inactive'}
                </span>
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
          </div>
        ))}
      </div>
    </div>
  )
}
