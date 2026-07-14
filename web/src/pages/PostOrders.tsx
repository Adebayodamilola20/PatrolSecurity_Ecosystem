import { useEffect, useMemo, useState } from 'react'
import { Camera, CheckCircle2, ClipboardList, Clock3, Plus, X, XCircle } from 'lucide-react'
import { API_BASE, api } from '../services/api'
import type { Checkpoint, PostOrder, PostOrderCompletion, User } from '../types'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Skeleton'
import { formatDate } from '../utils/format'

export default function PostOrders() {
  const [orders, setOrders] = useState<PostOrder[]>([])
  const [completions, setCompletions] = useState<PostOrderCompletion[]>([])
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([])
  // convexId is what checkpoints reference as their siteId (id may be a
  // legacy import id), so the picker keys options on convexId.
  const [sites, setSites] = useState<{ id: string; convexId?: string; name: string }[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [detail, setDetail] = useState<PostOrder | null>(null)
  const [form, setForm] = useState({
    title: '',
    summary: '',
    instructions: '',
    siteId: '',
    checkpointId: '',
    assignedUserIds: [] as string[],
    assignedRole: 'guard',
    priority: 'normal',
    active: true,
    requiresAcknowledgement: false,
    requiresPhotoProof: true,
  })

  const load = async () => {
    setLoading(true)
    try {
      const [ordersData, completionsData, checkpointsData, sitesData, usersData] = await Promise.all([
        api.postOrders.manage(),
        api.postOrders.completions(),
        api.checkpoints.list(),
        api.sites.list(),
        api.users.list(),
      ])
      setOrders(ordersData)
      setCompletions(completionsData)
      setCheckpoints(checkpointsData)
      setSites(sitesData)
      setUsers(usersData.filter((user: User) => user.role === 'guard' || user.role === 'supervisor'))
    } finally {
      setLoading(false)
    }
  }

  // Points inside the chosen location; a sub-location pin narrows the order
  // from "any scan at this location" to that one QR point.
  const sitePoints = form.siteId
    ? checkpoints.filter((cp) => cp.siteId === form.siteId)
    : []

  // Plain acknowledgements ("read & continue" after a scan) also create
  // completion rows, but there is nothing to review on them — only actual
  // proof submissions belong in the review queue.
  const proofReviews = completions.filter(
    (c) => c.status === 'completed' || c.proofPhotoUrl,
  )

  useEffect(() => {
    void load()
  }, [])

  const toggleFormGuard = (id: string) => {
    setForm((f) => ({
      ...f,
      assignedUserIds: f.assignedUserIds.includes(id)
        ? f.assignedUserIds.filter((g) => g !== id)
        : [...f.assignedUserIds, id],
    }))
  }

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.postOrders.create({
        ...form,
        // A pinned sub-location wins; otherwise the whole location; otherwise
        // this is a general duty that isn't tied to any scan.
        checkpointId: form.checkpointId || null,
        siteId: form.checkpointId ? null : form.siteId || null,
        assignedUserIds: form.assignedUserIds,
      })
      setShowForm(false)
      setForm({
        title: '',
        summary: '',
        instructions: '',
        siteId: '',
        checkpointId: '',
        assignedUserIds: [],
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

  const deleteOrder = async (id: string) => {
    if (!window.confirm('Delete this post order? This also clears its acknowledgement history and cannot be undone.')) return
    setDeleting(id)
    try {
      await api.postOrders.remove(id)
      if (detail?.id === id) setDetail(null)
      await load()
    } finally {
      setDeleting(null)
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

  const assignedNames = (order: PostOrder) => {
    if (order.assignedGuards && order.assignedGuards.length) {
      return order.assignedGuards.map((g) => g.name).join(', ')
    }
    if (order.assignedUserName) return order.assignedUserName
    return 'Any guard'
  }

  const whereLabel = (order: PostOrder) =>
    order.checkpointName
      ? `${order.siteName ? `${order.siteName} — ` : ''}${order.checkpointName}`
      : order.siteName || 'Anywhere'

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
          <form onSubmit={createOrder} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Create Post Order</h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Short summary" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value, checkpointId: '' })} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">Anywhere (general duty)</option>
                {sites.map((site) => <option key={site.id} value={site.convexId ?? site.id}>{site.name}</option>)}
              </select>
              <select value={form.checkpointId} onChange={(e) => setForm({ ...form, checkpointId: e.target.value })} disabled={!form.siteId} className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50">
                <option value="">{form.siteId ? 'Whole location (any scan there)' : 'Pick a location first'}</option>
                {sitePoints.map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
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

            {/* Multiple guards can be posted to one order. None selected = every
                guard the location/sub-location reaches. */}
            <div>
              <div className="mb-2 text-sm font-medium">Assign guards <span className="text-muted-foreground font-normal">({form.assignedUserIds.length || 'none'} selected — leave empty for all guards at this location)</span></div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {users.length === 0 ? (
                  <div className="text-sm text-muted-foreground px-1 py-2">No guards available.</div>
                ) : users.map((user) => (
                  <label key={user.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer">
                    <input type="checkbox" checked={form.assignedUserIds.includes(user.id)} onChange={() => toggleFormGuard(user.id)} />
                    <span>{user.name}</span>
                    {user.role === 'supervisor' && <span className="text-[10px] uppercase text-muted-foreground">Supervisor</span>}
                  </label>
                ))}
              </div>
            </div>

            <textarea required value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Detailed instructions" className="min-h-32 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.requiresAcknowledgement} onChange={(e) => setForm({ ...form, requiresAcknowledgement: e.target.checked })} /> Pop up &amp; require acknowledgement on scan</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.requiresPhotoProof} onChange={(e) => setForm({ ...form, requiresPhotoProof: e.target.checked })} /> Requires proof photo</label>
            </div>
            {form.requiresAcknowledgement && !form.checkpointId && !form.siteId && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Heads up: this order isn't tied to a location, so it won't pop up on any scan. Pick a location or sub-location above.
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
              <button disabled={saving} type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                {saving ? 'Saving...' : 'Create order'}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <PostOrderDetail
          order={detail}
          guards={users}
          onClose={() => setDetail(null)}
          onDelete={() => void deleteOrder(detail.id)}
          deleting={deleting === detail.id}
          onSaved={async () => { await load() }}
          whereLabel={whereLabel(detail)}
        />
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
          description="Create patrol instructions guards acknowledge when they scan a location."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {orders.map((order) => (
              <div key={order.id} onClick={() => setDetail(order)} className="cursor-pointer rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{order.title}</div>
                    <div className="text-sm text-muted-foreground">{order.summary || order.instructions.slice(0, 120)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${order.active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {order.active ? order.priority : 'inactive'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); void deleteOrder(order.id) }}
                      disabled={deleting === order.id}
                      title="Delete post order"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div>Where: <span className="text-foreground">{whereLabel(order)}</span></div>
                  <div>Assigned: <span className="text-foreground">{assignedNames(order)}</span></div>
                  <div>Acknowledgement: <span className="text-foreground">{order.requiresAcknowledgement ? 'Pops up on scan' : 'Not required'}</span></div>
                  <div>Created: <span className="text-foreground">{formatDate(order.createdAt)}</span></div>
                </div>
                {order.acknowledgementHistory && order.acknowledgementHistory.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" /> {order.acknowledgementHistory.length} acknowledgement{order.acknowledgementHistory.length === 1 ? '' : 's'} · tap to view
                  </div>
                )}
                <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3 text-sm whitespace-pre-wrap">{order.instructions}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-lg font-semibold">Proof Photo Reviews</div>
            <div className="space-y-3">
              {proofReviews.length === 0 ? (
                <div className="text-sm text-muted-foreground">No proof submissions yet.</div>
              ) : proofReviews.map((completion) => (
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
                      <img src={/^https?:\/\//.test(completion.proofPhotoUrl) ? completion.proofPhotoUrl : `${API_BASE.replace(/\/api\/v1$/, '')}${completion.proofPhotoUrl}`} alt="Proof" className="h-20 w-20 rounded-lg object-cover border border-border" />
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

function PostOrderDetail({
  order,
  guards,
  onClose,
  onDelete,
  deleting,
  onSaved,
  whereLabel,
}: {
  order: PostOrder
  guards: User[]
  onClose: () => void
  onDelete: () => void
  deleting: boolean
  onSaved: () => Promise<void>
  whereLabel: string
}) {
  const initialGuards = useMemo(
    () => order.assignedGuards?.map((g) => g.id) ?? (order.assignedUserId ? [order.assignedUserId] : []),
    [order],
  )
  const [selected, setSelected] = useState<string[]>(initialGuards)
  const [requiresAck, setRequiresAck] = useState(order.requiresAcknowledgement)
  const [active, setActive] = useState(order.active)
  const [saving, setSaving] = useState(false)

  const dirty =
    requiresAck !== order.requiresAcknowledgement ||
    active !== order.active ||
    selected.slice().sort().join(',') !== initialGuards.slice().sort().join(',')

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((g) => g !== id) : [...s, id]))

  const save = async () => {
    setSaving(true)
    try {
      await api.postOrders.update(order.id, {
        assignedUserIds: selected,
        requiresAcknowledgement: requiresAck,
        active,
      })
      await onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const history = order.acknowledgementHistory ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Post Order</div>
            <h2 className="text-xl font-semibold">{order.title}</h2>
            <div className="text-sm text-muted-foreground">{order.summary}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="text-muted-foreground">Where: <span className="text-foreground">{whereLabel}</span></div>
          <div className="text-muted-foreground">Priority: <span className="text-foreground capitalize">{order.priority}</span></div>
          <div className="text-muted-foreground">Created: <span className="text-foreground">{formatDate(order.createdAt)}{order.createdByName ? ` · by ${order.createdByName}` : ''}</span></div>
          <div className="text-muted-foreground">Photo proof: <span className="text-foreground">{order.requiresPhotoProof ? 'Required' : 'Optional'}</span></div>
        </div>

        <div className="rounded-lg border border-border/60 bg-background/40 p-3 text-sm whitespace-pre-wrap">{order.instructions}</div>

        {/* Reassign: add or remove guards on this order. */}
        <div>
          <div className="mb-2 text-sm font-medium">Assigned guards <span className="font-normal text-muted-foreground">({selected.length || 'none'} — none means every guard at this location)</span></div>
          <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-background p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
            {guards.length === 0 ? (
              <div className="px-1 py-2 text-sm text-muted-foreground">No guards available.</div>
            ) : guards.map((g) => (
              <label key={g.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer">
                <input type="checkbox" checked={selected.includes(g.id)} onChange={() => toggle(g.id)} />
                <span>{g.name}</span>
                {g.role === 'supervisor' && <span className="text-[10px] uppercase text-muted-foreground">Supervisor</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} /> Pop up &amp; require acknowledgement on scan</label>
        </div>

        {/* Who acknowledged this order, and when. */}
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4" /> Acknowledgement history</div>
          {history.length === 0 ? (
            <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-4 text-sm text-muted-foreground">No guard has acknowledged this order yet.</div>
          ) : (
            <div className="divide-y divide-border/60 rounded-lg border border-border/60">
              {history.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{h.userName}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(h.completedAt || h.acknowledgedAt || h.createdAt)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${h.status === 'completed' ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary'}`}>
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button onClick={onDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50">
            <XCircle className="h-4 w-4" /> {deleting ? 'Deleting...' : 'Delete order'}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">Close</button>
            <button onClick={() => void save()} disabled={!dirty || saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
