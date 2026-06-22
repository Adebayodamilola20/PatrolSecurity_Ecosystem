import { useEffect, useState } from 'react'
import { Camera, CheckCircle2, ClipboardList, Plus, XCircle } from 'lucide-react'
import { API_BASE, api } from '../services/api'
import type { Checkpoint, PostOrder, PostOrderCompletion, User } from '../types'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { formatDate } from '../utils/format'

export default function PostOrders() {
  const [orders, setOrders] = useState<PostOrder[]>([])
  const [completions, setCompletions] = useState<PostOrderCompletion[]>([])
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    summary: '',
    instructions: '',
    checkpointId: '',
    assignedUserId: '',
    assignedRole: 'guard',
    priority: 'normal',
    active: true,
    requiresAcknowledgement: false,
    requiresPhotoProof: true,
  })

  const load = async () => {
    setLoading(true)
    try {
      const [ordersData, completionsData, checkpointsData, usersData] = await Promise.all([
        api.postOrders.list({ active: 'all' }),
        api.postOrders.completions(),
        api.checkpoints.list(),
        api.users.list(),
      ])
      setOrders(ordersData)
      setCompletions(completionsData)
      setCheckpoints(checkpointsData)
      setUsers(usersData.filter((user: User) => user.role === 'guard' || user.role === 'supervisor'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.postOrders.create({
        ...form,
        checkpointId: form.checkpointId || null,
        assignedUserId: form.assignedUserId || null,
      })
      setShowForm(false)
      setForm({
        title: '',
        summary: '',
        instructions: '',
        checkpointId: '',
        assignedUserId: '',
        assignedRole: 'guard',
        priority: 'normal',
        active: true,
        requiresAcknowledgement: false,
        requiresPhotoProof: true,
      })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const reviewCompletion = async (id: string, reviewStatus: 'verified' | 'rejected') => {
    setReviewing(id)
    try {
      await api.postOrders.reviewCompletion(id, { reviewStatus })
      await load()
    } finally {
      setReviewing(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Operations</div>
          <h1 className="text-2xl font-semibold">Post Orders</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> New Post Order
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={createOrder} className="w-full max-w-2xl rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create Post Order</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Short summary" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <select value={form.checkpointId} onChange={(e) => setForm({ ...form, checkpointId: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">Any checkpoint</option>
                {checkpoints.map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
              </select>
              <select value={form.assignedUserId} onChange={(e) => setForm({ ...form, assignedUserId: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">Any guard</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <select value={form.assignedRole} onChange={(e) => setForm({ ...form, assignedRole: e.target.value })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="guard">Guard</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>
            <textarea required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Detailed instructions" className="min-h-32 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
              <span className="text-muted-foreground">No acknowledgement required before submission.</span>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.requiresPhotoProof} onChange={(e) => setForm({ ...form, requiresPhotoProof: e.target.checked })} /> Requires proof photo</label>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button disabled={saving} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                {saving ? 'Saving...' : 'Create order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="No post orders yet"
          description="Create patrol instructions guards can complete without a separate acknowledgement step."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {orders.map((order) => (
              <div key={order.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{order.title}</div>
                    <div className="text-sm text-muted-foreground">{order.summary || order.instructions.slice(0, 120)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${order.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {order.active ? order.priority : 'inactive'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div>Checkpoint: <span className="text-foreground">{order.checkpointName || 'Any'}</span></div>
                  <div>Assigned: <span className="text-foreground">{order.assignedUserName || order.assignedRole || 'Guard'}</span></div>
                  <div>Photo proof: <span className="text-foreground">{order.requiresPhotoProof ? 'Required' : 'Optional'}</span></div>
                  <div>Created: <span className="text-foreground">{formatDate(order.createdAt)}</span></div>
                </div>
                <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3 text-sm whitespace-pre-wrap">{order.instructions}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-lg font-semibold">Proof Photo Reviews</div>
            <div className="space-y-3">
              {completions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No submissions yet.</div>
              ) : completions.map((completion) => (
                <div key={completion.id} className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{completion.postOrderTitle || 'Post order completion'}</div>
                      <div className="text-xs text-muted-foreground">{completion.userName} · {completion.checkpointName || 'No checkpoint'} · {formatDate(completion.completedAt || completion.createdAt)}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                      completion.reviewStatus === 'verified'
                        ? 'bg-success/15 text-success'
                        : completion.reviewStatus === 'rejected'
                          ? 'bg-destructive/15 text-destructive'
                          : 'bg-warning/15 text-warning'
                    }`}>
                      {completion.reviewStatus}
                    </span>
                  </div>
                  {completion.proofPhotoUrl ? (
                    <div className="mt-3 flex items-center gap-3">
                      <img src={`${API_BASE.replace(/\/api\/v1$/, '')}${completion.proofPhotoUrl}`} alt="Proof" className="h-20 w-20 rounded-lg object-cover border border-border" />
                      <div className="text-sm text-muted-foreground">
                        <div className="flex items-center gap-2"><Camera className="h-4 w-4" /> Proof photo attached</div>
                        {completion.proofNote ? <div className="mt-1">{completion.proofNote}</div> : null}
                      </div>
                    </div>
                  ) : null}
                  {completion.reviewStatus === 'pending' ? (
                    <div className="mt-3 flex gap-2">
                      <button disabled={reviewing === completion.id} onClick={() => void reviewCompletion(completion.id, 'verified')} className="inline-flex items-center gap-2 rounded-lg bg-success px-3 py-2 text-xs font-medium text-white hover:opacity-90">
                        <CheckCircle2 className="h-4 w-4" /> Verify
                      </button>
                      <button disabled={reviewing === completion.id} onClick={() => void reviewCompletion(completion.id, 'rejected')} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-xs font-medium text-white hover:opacity-90">
                        <XCircle className="h-4 w-4" /> Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
