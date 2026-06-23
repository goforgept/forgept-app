import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

const CATEGORIES = ['feature', 'product', 'improvement', 'bug_fix']
const CATEGORY_LABELS = { feature: 'Feature', product: 'Product', improvement: 'Improvement', bug_fix: 'Bug Fix' }
const CATEGORY_COLORS = {
  feature:     'bg-blue-500/20 text-blue-400',
  product:     'bg-purple-500/20 text-purple-400',
  improvement: 'bg-yellow-500/20 text-yellow-400',
  bug_fix:     'bg-red-500/20 text-red-400',
}

const STATUS_META = {
  backlog:     { label: 'Backlog',     color: 'text-[#8A9AB0]',  dot: 'bg-[#8A9AB0]',  badge: 'bg-[#8A9AB0]/20 text-[#8A9AB0]' },
  planned:     { label: 'Planned',     color: 'text-yellow-400', dot: 'bg-yellow-400',  badge: 'bg-yellow-500/20 text-yellow-400' },
  in_progress: { label: 'In Progress', color: 'text-blue-400',   dot: 'bg-blue-400',    badge: 'bg-blue-500/20 text-blue-400' },
  released:    { label: 'Released',    color: 'text-green-400',  dot: 'bg-green-400',   badge: 'bg-green-500/20 text-green-400' },
  declined:    { label: 'Declined',    color: 'text-red-400',    dot: 'bg-red-400',     badge: 'bg-red-500/20 text-red-400' },
}

const ADMIN_COLUMNS = ['backlog', 'planned', 'in_progress', 'released', 'declined']

const NEXT_STATUSES = {
  backlog:     [{ value: 'planned', label: 'Approve → Planned' }, { value: 'declined', label: 'Decline' }],
  planned:     [{ value: 'in_progress', label: 'Start' }, { value: 'released', label: 'Release' }, { value: 'backlog', label: '← Backlog' }],
  in_progress: [{ value: 'released', label: 'Mark Released' }, { value: 'planned', label: '← Planned' }],
  released:    [{ value: 'in_progress', label: '← In Progress' }],
  declined:    [{ value: 'backlog', label: 'Reopen' }],
}

const QUARTER_OPTIONS = (() => {
  const opts = []
  const now = new Date()
  for (let y = now.getFullYear(); y <= now.getFullYear() + 2; y++) {
    for (let q = 1; q <= 4; q++) opts.push(`Q${q} ${y}`)
  }
  return opts
})()

const emptyForm = { title: '', description: '', category: 'feature', target_quarter: '', target_date: '' }

export default function Roadmap({ isAdmin, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices }) {
  const { profile } = useProfile()
  const [items, setItems]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editItem, setEditItem]       = useState(null)
  const [form, setForm]               = useState(emptyForm)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState(null)
  const [showRequest, setShowRequest] = useState(false)
  const [reqForm, setReqForm]         = useState({ title: '', description: '', category: 'feature' })
  const [submitting, setSubmitting]   = useState(false)
  const [drawer, setDrawer]           = useState(null) // roadmap_item id

  const orgId       = profile?.org_id
  const userIsAdmin = profile?.org_role === 'admin' || profile?.role === 'admin'

  useEffect(() => { if (orgId) fetchItems() }, [orgId])

  const fetchItems = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('roadmap_items')
      .select('*, profiles!roadmap_items_requested_by_fkey(full_name)')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  const openCreate = () => { setForm(emptyForm); setEditItem(null); setShowModal(true); setError(null) }
  const openEdit   = (item) => {
    setForm({ title: item.title, description: item.description || '', category: item.category, target_quarter: item.target_quarter || '', target_date: item.target_date || '' })
    setEditItem(item)
    setShowModal(true)
    setError(null)
  }

  const saveItem = async () => {
    if (!form.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    const payload = { title: form.title, description: form.description, category: form.category, target_quarter: form.target_quarter || null, target_date: form.target_date || null }
    if (editItem) {
      await supabase.from('roadmap_items').update(payload).eq('id', editItem.id)
      setItems(prev => prev.map(i => i.id === editItem.id ? { ...i, ...payload } : i))
    } else {
      const { data } = await supabase.from('roadmap_items').insert({ org_id: orgId, ...payload, status: 'planned' }).select('*, profiles!roadmap_items_requested_by_fkey(full_name)').single()
      if (data) setItems(prev => [data, ...prev])
    }
    setSaving(false)
    setShowModal(false)
  }

  const updateStatus = async (id, status) => {
    const updates = { status, ...(status !== 'backlog' && status !== 'declined' ? { approved_by: profile?.id } : {}) }
    await supabase.from('roadmap_items').update(updates).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
  }

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item?')) return
    await supabase.from('roadmap_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    if (drawer === id) setDrawer(null)
  }

  const submitRequest = async () => {
    if (!reqForm.title.trim()) return
    setSubmitting(true)
    const { data } = await supabase.from('roadmap_items').insert({
      org_id: orgId, title: reqForm.title, description: reqForm.description,
      category: reqForm.category, status: 'backlog', requested_by: profile?.id,
    }).select('*, profiles!roadmap_items_requested_by_fkey(full_name)').single()
    if (data) setItems(prev => [...prev, data])
    setSubmitting(false)
    setShowRequest(false)
    setReqForm({ title: '', description: '', category: 'feature' })
  }

  const byStatus = (status) => items.filter(i => i.status === status)
  const drawerItem = items.find(i => i.id === drawer) || null

  if (loading) return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} />
      <div className="flex-1 flex items-center justify-center"><p className="text-[#8A9AB0]">Loading...</p></div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} />

      <div className="flex-1 p-6 min-w-0">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-white text-2xl font-bold">Roadmap</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">
              {userIsAdmin ? "Manage your team's feature pipeline." : 'See what\'s planned and submit a request.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowRequest(true)}
              className="bg-[#1a2d45] text-[#8A9AB0] hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-[#2a3d55]">
              + Submit Request
            </button>
            {userIsAdmin && (
              <button onClick={openCreate}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                + Add Item
              </button>
            )}
          </div>
        </div>

        {userIsAdmin ? (
          <div className="grid grid-cols-5 gap-4">
            {ADMIN_COLUMNS.map(status => {
              const meta = STATUS_META[status]
              const col  = byStatus(status)
              return (
                <div key={status} className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    <span className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
                    <span className="text-[#8A9AB0] text-xs ml-auto">{col.length}</span>
                  </div>
                  {col.length === 0 && (
                    <div className="border border-dashed border-[#2a3d55] rounded-xl p-4 text-center">
                      <p className="text-[#8A9AB0] text-xs">Empty</p>
                    </div>
                  )}
                  {col.map(item => (
                    <AdminCard key={item.id} item={item} currentStatus={status}
                      onOpen={() => setDrawer(item.id)}
                      onEdit={() => openEdit(item)}
                      onDelete={() => deleteItem(item.id)}
                      onStatusChange={(s) => updateStatus(item.id, s)} />
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <h3 className="text-white font-semibold">Coming Up</h3>
                <span className="text-[#8A9AB0] text-xs">{byStatus('planned').length + byStatus('in_progress').length} items</span>
              </div>
              {byStatus('planned').length === 0 && byStatus('in_progress').length === 0 ? (
                <p className="text-[#8A9AB0] text-sm">Nothing planned yet — check back soon.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {[...byStatus('in_progress'), ...byStatus('planned')].map(item => (
                    <RepCard key={item.id} item={item} onOpen={() => setDrawer(item.id)} />
                  ))}
                </div>
              )}
            </div>
            {byStatus('released').length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <h3 className="text-white font-semibold">Released</h3>
                  <span className="text-[#8A9AB0] text-xs">{byStatus('released').length} items</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {byStatus('released').map(item => (
                    <RepCard key={item.id} item={item} released onOpen={() => setDrawer(item.id)} />
                  ))}
                </div>
              </div>
            )}
            {items.filter(i => i.requested_by === profile?.id).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-[#C8622A]" />
                  <h3 className="text-white font-semibold">My Requests</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.filter(i => i.requested_by === profile?.id).map(item => (
                    <RepCard key={item.id} item={item} showStatus onOpen={() => setDrawer(item.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Item drawer */}
      {drawerItem && (
        <ItemDrawer
          item={drawerItem}
          orgId={orgId}
          profile={profile}
          userIsAdmin={userIsAdmin}
          onClose={() => setDrawer(null)}
          onEdit={() => { openEdit(drawerItem); setDrawer(null) }}
          onStatusChange={(s) => updateStatus(drawerItem.id, s)}
          onItemUpdate={(patch) => setItems(prev => prev.map(i => i.id === drawerItem.id ? { ...i, ...patch } : i))}
        />
      )}

      {/* Admin add/edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-5">{editItem ? 'Edit Item' : 'Add Roadmap Item'}</h3>
            {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Title <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Dark mode support"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="What is this and why does it matter?"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Target Quarter</label>
                  <select value={form.target_quarter} onChange={e => setForm(p => ({ ...p, target_quarter: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                    <option value="">— None —</option>
                    {QUARTER_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Specific Date</label>
                  <input type="month" value={form.target_date} onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveItem} disabled={saving}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rep request modal */}
      {showRequest && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Submit a Feature Request</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Your request will go into the backlog for review.</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">What do you need? <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={reqForm.title} onChange={e => setReqForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Batch pricing update for catalog"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">More detail</label>
                <textarea value={reqForm.description} onChange={e => setReqForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="Why would this help you or your customers?"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Category</label>
                <select value={reqForm.category} onChange={e => setReqForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowRequest(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={submitRequest} disabled={submitting || !reqForm.title.trim()}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Item Drawer ────────────────────────────────────────────────────────────────
function ItemDrawer({ item, orgId, profile, userIsAdmin, onClose, onEdit, onStatusChange, onItemUpdate }) {
  const [notes, setNotes]         = useState([])
  const [noteBody, setNoteBody]   = useState('')
  const [posting, setPosting]     = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [editingRelease, setEditingRelease] = useState(false)
  const [releaseForm, setReleaseForm] = useState({ target_quarter: item.target_quarter || '', target_date: item.target_date || '' })
  const [savingRelease, setSavingRelease] = useState(false)
  const textareaRef = useRef(null)

  const moves = NEXT_STATUSES[item.status] || []
  const meta  = STATUS_META[item.status]

  useEffect(() => { fetchNotes() }, [item.id])

  const [noteInternal, setNoteInternal] = useState(true)

  const fetchNotes = async () => {
    setLoadingNotes(true)
    const { data } = await supabase
      .from('roadmap_notes')
      .select('*, profiles(full_name)')
      .eq('item_id', item.id)
      .order('created_at', { ascending: true })
    setNotes(data || [])
    setLoadingNotes(false)
  }

  const postNote = async () => {
    if (!noteBody.trim()) return
    setPosting(true)
    const { data } = await supabase.from('roadmap_notes').insert({
      item_id: item.id, org_id: orgId, author_id: profile?.id, body: noteBody.trim(), is_internal: noteInternal,
    }).select('*, profiles(full_name)').single()
    if (data) setNotes(prev => [...prev, data])
    setNoteBody('')
    setPosting(false)
  }

  const deleteNote = async (id) => {
    await supabase.from('roadmap_notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const saveRelease = async () => {
    setSavingRelease(true)
    const patch = { target_quarter: releaseForm.target_quarter || null, target_date: releaseForm.target_date || null }
    await supabase.from('roadmap_items').update(patch).eq('id', item.id)
    onItemUpdate(patch)
    setSavingRelease(false)
    setEditingRelease(false)
  }

  const displayRelease = item.target_quarter || (item.target_date
    ? new Date(item.target_date + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-[#1a2d45] border-l border-[#2a3d55] z-50 flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#2a3d55] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badge}`}>{meta.label}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category]}`}>
                {CATEGORY_LABELS[item.category]}
              </span>
            </div>
            <h3 className="text-white font-bold text-base leading-snug">{item.title}</h3>
            {item.profiles?.full_name && (
              <p className="text-[#8A9AB0] text-xs mt-1">Requested by {item.profiles.full_name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-[#8A9AB0] hover:text-white transition-colors ml-3 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Description */}
          {item.description && (
            <div>
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-1">Description</p>
              <p className="text-white text-sm leading-relaxed">{item.description}</p>
            </div>
          )}

          {/* Expected Release */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Expected Release</p>
              {userIsAdmin && !editingRelease && (
                <button onClick={() => { setReleaseForm({ target_quarter: item.target_quarter || '', target_date: item.target_date || '' }); setEditingRelease(true) }}
                  className="text-[#8A9AB0] hover:text-[#C8622A] text-xs transition-colors">Edit</button>
              )}
            </div>
            {editingRelease ? (
              <div className="space-y-3 bg-[#0F1C2E] rounded-xl p-3 border border-[#2a3d55]">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Quarter</label>
                  <select value={releaseForm.target_quarter} onChange={e => setReleaseForm(p => ({ ...p, target_quarter: e.target.value }))}
                    className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                    <option value="">— None —</option>
                    {QUARTER_OPTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Specific Month</label>
                  <input type="month" value={releaseForm.target_date} onChange={e => setReleaseForm(p => ({ ...p, target_date: e.target.value }))}
                    className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditingRelease(false)} className="flex-1 py-1.5 text-[#8A9AB0] hover:text-white text-xs transition-colors">Cancel</button>
                  <button onClick={saveRelease} disabled={savingRelease}
                    className="flex-1 bg-[#C8622A] text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {savingRelease ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : displayRelease ? (
              <div className="flex items-center gap-2 bg-[#0F1C2E] rounded-xl px-4 py-3 border border-[#2a3d55]">
                <svg className="w-4 h-4 text-[#C8622A] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                <span className="text-white text-sm font-semibold">{displayRelease}</span>
                {item.target_quarter && item.target_date && (
                  <span className="text-[#8A9AB0] text-xs">
                    · {new Date(item.target_date + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[#8A9AB0] text-sm">{userIsAdmin ? 'Not set — click Edit to add a target.' : 'Not yet scheduled.'}</p>
            )}
          </div>

          {/* Status moves — admin only */}
          {userIsAdmin && moves.length > 0 && (
            <div>
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Move To</p>
              <div className="flex flex-wrap gap-2">
                {moves.map(m => (
                  <button key={m.value} onClick={() => onStatusChange(m.value)}
                    className="px-3 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white hover:bg-[#2a3d55] text-xs font-medium transition-colors border border-[#2a3d55]">
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Admin actions */}
          {userIsAdmin && (
            <div className="flex gap-2">
              <button onClick={onEdit}
                className="flex-1 px-3 py-2 bg-[#0F1C2E] border border-[#2a3d55] text-[#8A9AB0] hover:text-white rounded-lg text-xs font-medium transition-colors">
                Edit Details
              </button>
            </div>
          )}

          {/* Notes thread — internal only for admins */}
          {userIsAdmin && (
            <div>
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">
                Team Notes {notes.length > 0 && `(${notes.length})`}
              </p>
              {loadingNotes ? (
                <p className="text-[#8A9AB0] text-xs">Loading...</p>
              ) : notes.length === 0 ? (
                <p className="text-[#8A9AB0] text-sm">No notes yet. Add the first update below.</p>
              ) : (
                <div className="space-y-3">
                  {notes.map(note => (
                    <div key={note.id} className={`rounded-xl p-3 border group ${note.is_internal ? 'bg-[#0F1C2E] border-[#2a3d55]' : 'bg-blue-900/10 border-blue-500/20'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[#C8622A] text-xs font-semibold">{note.profiles?.full_name || 'Team'}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${note.is_internal ? 'bg-[#2a3d55] text-[#8A9AB0]' : 'bg-blue-500/20 text-blue-400'}`}>
                            {note.is_internal ? 'Internal' : 'Public'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[#8A9AB0] text-xs">{new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <button onClick={() => deleteNote(note.id)}
                            className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100">✕</button>
                        </div>
                      </div>
                      <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Note input — admin only */}
        {userIsAdmin && (
          <div className="px-6 py-4 border-t border-[#2a3d55] flex-shrink-0 bg-[#1a2d45]">
            <textarea
              ref={textareaRef}
              value={noteBody}
              onChange={e => setNoteBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postNote() }}
              placeholder="Add a team note… (⌘↵ to post)"
              rows={3}
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#8A9AB0] mb-2"
            />
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setNoteInternal(!noteInternal)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${noteInternal ? 'bg-[#2a3d55] border-[#2a3d55] text-[#8A9AB0]' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
                {noteInternal ? '🔒 Internal only' : '👁 Visible to reps'}
              </button>
              <span className="text-[#8A9AB0] text-xs">{noteInternal ? 'Only admins see this' : 'Rep who submitted can see this'}</span>
            </div>
            <button onClick={postNote} disabled={posting || !noteBody.trim()}
              className="w-full bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {posting ? 'Posting...' : 'Post Note'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ── Admin Kanban card ──────────────────────────────────────────────────────────
function AdminCard({ item, currentStatus, onOpen, onEdit, onDelete, onStatusChange }) {
  const moves = (NEXT_STATUSES[currentStatus] || []).slice(0, 2)
  const displayRelease = item.target_quarter || (item.target_date
    ? new Date(item.target_date + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null)

  return (
    <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-4 group hover:border-[#C8622A]/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <button onClick={onOpen} className="text-white text-sm font-semibold leading-tight text-left hover:text-[#C8622A] transition-colors">
          {item.title}
        </button>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={onEdit} className="text-[#8A9AB0] hover:text-white text-xs transition-colors p-0.5">✏️</button>
          <button onClick={onDelete} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors p-0.5">✕</button>
        </div>
      </div>
      {item.description && (
        <p className="text-[#8A9AB0] text-xs mb-2 leading-relaxed line-clamp-2">{item.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category]}`}>
          {CATEGORY_LABELS[item.category]}
        </span>
        {displayRelease && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#C8622A]/10 text-[#C8622A] font-medium">
            {displayRelease}
          </span>
        )}
      </div>
      {item.profiles?.full_name && (
        <p className="text-[#8A9AB0] text-xs mb-2">↑ {item.profiles.full_name}</p>
      )}
      <div className="flex flex-col gap-1">
        <button onClick={onOpen} className="w-full text-left text-xs px-2 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white hover:bg-[#2a3d55] transition-colors">
          View details & notes →
        </button>
        {moves.map(m => (
          <button key={m.value} onClick={() => onStatusChange(m.value)}
            className="w-full text-left text-xs px-2 py-1.5 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white hover:bg-[#2a3d55] transition-colors">
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Rep read-only card ─────────────────────────────────────────────────────────
function RepCard({ item, released = false, showStatus = false, onOpen }) {
  const statusBadge = {
    backlog:     'bg-[#8A9AB0]/20 text-[#8A9AB0]',
    planned:     'bg-yellow-500/20 text-yellow-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    released:    'bg-green-500/20 text-green-400',
    declined:    'bg-red-500/20 text-red-400',
  }
  const statusLabel = { backlog: 'Pending', planned: 'Planned', in_progress: 'In Progress', released: 'Released', declined: 'Declined' }
  const displayRelease = item.target_quarter || (item.target_date
    ? new Date(item.target_date + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null)

  return (
    <button onClick={onOpen} className={`w-full text-left bg-[#1a2d45] border rounded-xl p-4 hover:border-[#C8622A]/40 transition-colors ${released ? 'border-green-500/20' : 'border-[#2a3d55]'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-white text-sm font-semibold leading-tight">{item.title}</p>
        {showStatus && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusBadge[item.status]}`}>
            {statusLabel[item.status]}
          </span>
        )}
        {!showStatus && item.status === 'in_progress' && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 flex-shrink-0">In Progress</span>
        )}
      </div>
      {item.description && <p className="text-[#8A9AB0] text-xs mb-3 leading-relaxed line-clamp-2">{item.description}</p>}
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category]}`}>
          {CATEGORY_LABELS[item.category]}
        </span>
        {displayRelease && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#C8622A]/10 text-[#C8622A] font-medium">
            {displayRelease}
          </span>
        )}
      </div>
    </button>
  )
}
