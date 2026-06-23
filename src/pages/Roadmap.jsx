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
  for (let y = now.getFullYear(); y <= now.getFullYear() + 5; y++) {
    for (let q = 1; q <= 4; q++) opts.push(`Q${q} ${y}`)
  }
  return opts
})()

const fmtDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
const fmtDateLong = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null

const emptyForm = { title: '', description: '', category: 'feature', target_quarter: '', target_date: '' }

export default function Roadmap({ isAdmin, isDevTeam, isProductManager, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices }) {
  const { profile } = useProfile()
  const [items, setItems]               = useState([])
  const [assigneesMap, setAssigneesMap] = useState({}) // { [item_id]: [{profile_id, full_name, org_role}] }
  const [teamMembers, setTeamMembers]   = useState([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [editItem, setEditItem]         = useState(null)
  const [form, setForm]                 = useState(emptyForm)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState(null)
  const [showRequest, setShowRequest]   = useState(false)
  const [reqForm, setReqForm]           = useState({ title: '', description: '', category: 'feature' })
  const [submitting, setSubmitting]     = useState(false)
  const [drawer, setDrawer]             = useState(null)
  const [view, setView]                 = useState('board') // 'board' | 'mywork' | 'report'
  const [showArchived, setShowArchived] = useState(false)

  const orgId           = profile?.org_id
  const profileId       = profile?.id
  const userIsAdmin     = profile?.org_role === 'admin' || profile?.role === 'admin' || isDevTeam || isProductManager

  useEffect(() => { if (orgId) loadAll() }, [orgId])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: itemData }, { data: assigneeData }, { data: memberData }] = await Promise.all([
      supabase
        .from('roadmap_items')
        .select('*, profiles!roadmap_items_requested_by_fkey(full_name)')
        .eq('org_id', orgId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase
        .from('roadmap_item_assignees')
        .select('item_id, profile_id, profiles(full_name, org_role)'),
      supabase
        .from('profiles')
        .select('id, full_name, org_role')
        .eq('org_id', orgId)
        .in('org_role', ['admin', 'dev', 'product_manager'])
        .order('full_name'),
    ])

    setItems(itemData || [])
    setTeamMembers(memberData || [])

    const map = {}
    for (const row of (assigneeData || [])) {
      if (!map[row.item_id]) map[row.item_id] = []
      map[row.item_id].push({ profile_id: row.profile_id, ...row.profiles })
    }
    setAssigneesMap(map)
    setLoading(false)
  }

  const fetchItems = async () => {
    const { data } = await supabase
      .from('roadmap_items')
      .select('*, profiles!roadmap_items_requested_by_fkey(full_name)')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    setItems(data || [])
  }

  const addAssignee = async (itemId, pid) => {
    if (!pid) return
    if ((assigneesMap[itemId] || []).find(a => a.profile_id === pid)) return
    await supabase.from('roadmap_item_assignees').insert({ item_id: itemId, profile_id: pid })
    const member = teamMembers.find(m => m.id === pid)
    setAssigneesMap(prev => ({
      ...prev,
      [itemId]: [...(prev[itemId] || []), { profile_id: pid, full_name: member?.full_name, org_role: member?.org_role }],
    }))
  }

  const removeAssignee = async (itemId, pid) => {
    await supabase.from('roadmap_item_assignees').delete().eq('item_id', itemId).eq('profile_id', pid)
    setAssigneesMap(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).filter(a => a.profile_id !== pid),
    }))
  }

  const getAssignees = (itemId) => assigneesMap[itemId] || []

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
    } else {
      await supabase.from('roadmap_items').insert({ org_id: orgId, ...payload, status: 'planned' })
    }
    setSaving(false)
    setShowModal(false)
    fetchItems()
  }

  const updateStatus = async (id, status) => {
    const updates = { status, ...(status !== 'backlog' && status !== 'declined' ? { approved_by: profileId } : {}) }
    await supabase.from('roadmap_items').update(updates).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i))
  }

  const deleteItem = async (id) => {
    if (!window.confirm('Delete this item?')) return
    await supabase.from('roadmap_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
    if (drawer === id) setDrawer(null)
  }

  const archiveItem = async (id) => {
    const archived_at = new Date().toISOString()
    await supabase.from('roadmap_items').update({ archived_at }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, archived_at } : i))
    setDrawer(null)
  }

  const restoreItem = async (id) => {
    await supabase.from('roadmap_items').update({ archived_at: null }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, archived_at: null } : i))
    setDrawer(null)
  }

  const submitRequest = async () => {
    if (!reqForm.title.trim()) return
    setSubmitting(true)
    await supabase.from('roadmap_items').insert({
      org_id: orgId, title: reqForm.title, description: reqForm.description,
      category: reqForm.category, status: 'backlog', requested_by: profileId,
    })
    setSubmitting(false)
    setShowRequest(false)
    setReqForm({ title: '', description: '', category: 'feature' })
    fetchItems()
  }

  const activeItems   = items.filter(i => !i.archived_at)
  const archivedItems = items.filter(i => !!i.archived_at)
  const visibleItems  = showArchived ? archivedItems : activeItems
  const byStatus      = (status) => visibleItems.filter(i => i.status === status)
  const myItems       = activeItems.filter(i => getAssignees(i.id).some(a => a.profile_id === profileId))
  const drawerItem    = items.find(i => i.id === drawer) || null

  const sidebarProps = { isAdmin, isDevTeam, isProductManager, featureProposals, featureCRM, featurePurchaseOrders, featureInvoices }

  if (loading) return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar {...sidebarProps} />
      <div className="flex-1 flex items-center justify-center"><p className="text-[#8A9AB0]">Loading...</p></div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar {...sidebarProps} />

      <div className="flex-1 p-6 min-w-0 print:p-0 print:bg-white">

        {/* Header */}
        <div className="flex justify-between items-center mb-6 print:hidden">
          <div>
            <h2 className="text-white text-2xl font-bold">Roadmap</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">
              {userIsAdmin ? "Manage your team's feature pipeline." : "See what's planned and submit a request."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            {userIsAdmin && (
              <div className="flex bg-[#1a2d45] border border-[#2a3d55] rounded-lg p-1 gap-1">
                <button onClick={() => setView('board')}
                  className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${view === 'board' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>
                  Board
                </button>
                {isDevTeam && (
                  <button onClick={() => setView('mywork')}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${view === 'mywork' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>
                    My Work {myItems.length > 0 && <span className="ml-1 bg-white/20 rounded-full px-1.5">{myItems.length}</span>}
                  </button>
                )}
                {(isAdmin || isProductManager) && (
                  <button onClick={() => setView('report')}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${view === 'report' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>
                    Report
                  </button>
                )}
              </div>
            )}

            {userIsAdmin && (
              <button
                onClick={() => { setShowArchived(p => !p); setDrawer(null) }}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${showArchived ? 'bg-[#2a3d55] border-[#2a3d55] text-white' : 'bg-[#1a2d45] border-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}>
                {showArchived ? '← Active Board' : `Archive${archivedItems.length > 0 ? ` (${archivedItems.length})` : ''}`}
              </button>
            )}
            {!showArchived && (
              <button onClick={() => setShowRequest(true)}
                className="bg-[#1a2d45] text-[#8A9AB0] hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-[#2a3d55]">
                + Submit Request
              </button>
            )}
            {userIsAdmin && view === 'board' && !showArchived && (
              <button onClick={openCreate}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                + Add Item
              </button>
            )}
            {view === 'report' && (
              <button onClick={() => window.print()}
                className="bg-[#1a2d45] text-[#8A9AB0] hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-[#2a3d55]">
                🖨 Print / Export
              </button>
            )}
          </div>
        </div>

        {/* ── Archived view ── */}
        {showArchived && userIsAdmin && (
          <div className="max-w-4xl">
            {archivedItems.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-white font-semibold mb-2">No archived items.</p>
                <p className="text-[#8A9AB0] text-sm">Archive items from the board to clean up old releases.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {['released', 'declined', 'in_progress', 'planned', 'backlog'].map(status => {
                  const group = archivedItems.filter(i => i.status === status)
                  if (group.length === 0) return null
                  const meta = STATUS_META[status]
                  return (
                    <div key={status} className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                        <span className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
                        <span className="text-[#8A9AB0] text-xs">({group.length})</span>
                      </div>
                      <div className="space-y-2">
                        {group.map(item => {
                          const assignees = getAssignees(item.id)
                          const release   = item.target_quarter || fmtDate(item.target_date)
                          return (
                            <button key={item.id} onClick={() => setDrawer(item.id)}
                              className="w-full text-left bg-[#1a2d45] border border-[#2a3d55] hover:border-[#C8622A]/40 rounded-xl px-5 py-4 flex items-start gap-4 transition-colors opacity-70 hover:opacity-100">
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold text-sm">{item.title}</p>
                                {item.description && <p className="text-[#8A9AB0] text-xs mt-1 line-clamp-1">{item.description}</p>}
                                <p className="text-[#8A9AB0] text-xs mt-1">
                                  Archived {new Date(item.archived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category]}`}>
                                  {CATEGORY_LABELS[item.category]}
                                </span>
                                {assignees.length > 0 && (
                                  <span className="text-[#8A9AB0] text-xs">{assignees.map(a => a.full_name).join(', ')}</span>
                                )}
                                {release && <span className="text-[#C8622A] text-xs font-semibold">{release}</span>}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Board ── */}
        {!showArchived && view === 'board' && userIsAdmin && (
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
                      assignees={getAssignees(item.id)}
                      onOpen={() => setDrawer(item.id)}
                      onEdit={() => openEdit(item)}
                      onDelete={() => deleteItem(item.id)}
                      onStatusChange={(s) => updateStatus(item.id, s)} />
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* ── My Work (dev only) ── */}
        {!showArchived && view === 'mywork' && isDevTeam && (
          <div className="space-y-8 max-w-4xl">
            {myItems.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-white font-semibold mb-2">Nothing assigned to you yet.</p>
                <p className="text-[#8A9AB0] text-sm">Ask your product manager to assign items to you.</p>
              </div>
            ) : (
              <>
                {['in_progress', 'planned', 'backlog', 'released', 'declined'].map(status => {
                  const mine = myItems.filter(i => i.status === status)
                  if (mine.length === 0) return null
                  const meta = STATUS_META[status]
                  return (
                    <div key={status}>
                      <div className="flex items-center gap-2 mb-4">
                        <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                        <h3 className={`font-semibold text-sm uppercase tracking-wide ${meta.color}`}>{meta.label}</h3>
                        <span className="text-[#8A9AB0] text-xs">({mine.length})</span>
                      </div>
                      <div className="space-y-2">
                        {mine.map(item => {
                          const release = item.target_quarter || fmtDate(item.target_date)
                          return (
                            <button key={item.id} onClick={() => setDrawer(item.id)}
                              className="w-full text-left bg-[#1a2d45] border border-[#2a3d55] hover:border-[#C8622A]/40 rounded-xl px-5 py-4 flex items-start gap-4 transition-colors">
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold text-sm">{item.title}</p>
                                {item.description && <p className="text-[#8A9AB0] text-xs mt-1 line-clamp-2">{item.description}</p>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category]}`}>
                                  {CATEGORY_LABELS[item.category]}
                                </span>
                                {release && <span className="text-[#C8622A] text-xs font-semibold">{release}</span>}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* ── Report ── */}
        {!showArchived && view === 'report' && (isAdmin || isProductManager) && (
          <ReportView items={items} getAssignees={getAssignees} />
        )}

        {/* ── Rep view ── */}
        {!showArchived && !userIsAdmin && (
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
            {items.filter(i => i.requested_by === profileId).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-[#C8622A]" />
                  <h3 className="text-white font-semibold">My Requests</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {items.filter(i => i.requested_by === profileId).map(item => (
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
          teamMembers={teamMembers}
          assignees={getAssignees(drawerItem.id)}
          onAddAssignee={(pid) => addAssignee(drawerItem.id, pid)}
          onRemoveAssignee={(pid) => removeAssignee(drawerItem.id, pid)}
          onClose={() => setDrawer(null)}
          onEdit={() => { openEdit(drawerItem); setDrawer(null) }}
          onStatusChange={(s) => updateStatus(drawerItem.id, s)}
          onItemUpdate={(patch) => setItems(prev => prev.map(i => i.id === drawerItem.id ? { ...i, ...patch } : i))}
          onArchive={() => archiveItem(drawerItem.id)}
          onRestore={() => restoreItem(drawerItem.id)}
        />
      )}

      {/* Add/edit modal */}
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
                  <input type="date" value={form.target_date} onChange={e => setForm(p => ({ ...p, target_date: e.target.value }))}
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

      {/* Request modal */}
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

// ── Leadership Report ──────────────────────────────────────────────────────────
function ReportView({ items, getAssignees }) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const SECTIONS = [
    { status: 'in_progress', label: 'In Progress',  border: 'border-blue-500/30',   dot: 'bg-blue-400' },
    { status: 'planned',     label: 'Planned',       border: 'border-yellow-500/30', dot: 'bg-yellow-400' },
    { status: 'released',    label: 'Released',      border: 'border-green-500/30',  dot: 'bg-green-400' },
    { status: 'backlog',     label: 'Backlog',       border: 'border-[#2a3d55]',     dot: 'bg-[#8A9AB0]' },
    { status: 'declined',    label: 'Declined',      border: 'border-red-500/30',    dot: 'bg-red-400' },
  ]
  const byStatus = (s) => items.filter(i => i.status === s)

  return (
    <div className="max-w-4xl mx-auto print:max-w-none">
      <div className="mb-8 pb-6 border-b border-[#2a3d55] print:border-gray-300">
        <h1 className="text-white text-3xl font-bold mb-1 print:text-black">Product Roadmap</h1>
        <p className="text-[#8A9AB0] text-sm print:text-gray-500">Generated {today}</p>
      </div>
      <div className="grid grid-cols-5 gap-3 mb-8">
        {SECTIONS.map(s => (
          <div key={s.status} className={`bg-[#1a2d45] border ${s.border} rounded-xl p-4 text-center print:bg-white print:border-gray-200`}>
            <div className={`w-2 h-2 rounded-full ${s.dot} mx-auto mb-2`} />
            <p className="text-white text-2xl font-bold print:text-black">{byStatus(s.status).length}</p>
            <p className="text-[#8A9AB0] text-xs mt-0.5 print:text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
      {SECTIONS.filter(s => byStatus(s.status).length > 0).map(s => (
        <div key={s.status} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
            <h2 className="text-white font-bold text-lg print:text-black">{s.label}</h2>
            <span className="text-[#8A9AB0] text-sm">({byStatus(s.status).length})</span>
          </div>
          <div className="space-y-2">
            {byStatus(s.status).map(item => {
              const assignees = getAssignees(item.id)
              const release   = item.target_quarter || fmtDate(item.target_date)
              return (
                <div key={item.id} className={`bg-[#1a2d45] border ${s.border} rounded-xl px-5 py-4 flex items-start gap-4 print:bg-white print:border-gray-200`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm print:text-black">{item.title}</p>
                    {item.description && <p className="text-[#8A9AB0] text-xs mt-1 leading-relaxed print:text-gray-500">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category]}`}>
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    {assignees.length > 0 && (
                      <span className="text-[#8A9AB0] text-xs">{assignees.map(a => a.full_name).join(', ')}</span>
                    )}
                    {release && <span className="text-[#C8622A] text-xs font-semibold">{release}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Item Drawer ────────────────────────────────────────────────────────────────
function ItemDrawer({ item, orgId, profile, userIsAdmin, teamMembers, assignees, onAddAssignee, onRemoveAssignee, onClose, onEdit, onStatusChange, onItemUpdate, onArchive, onRestore }) {
  const [notes, setNotes]               = useState([])
  const [noteBody, setNoteBody]         = useState('')
  const [posting, setPosting]           = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [noteInternal, setNoteInternal] = useState(true)
  const [editingRelease, setEditingRelease] = useState(false)
  const [releaseForm, setReleaseForm]   = useState({ target_quarter: item.target_quarter || '', target_date: item.target_date || '' })
  const [savingRelease, setSavingRelease] = useState(false)
  const textareaRef = useRef(null)

  const moves = NEXT_STATUSES[item.status] || []
  const meta  = STATUS_META[item.status]

  const unassigned = teamMembers.filter(m => !assignees.find(a => a.profile_id === m.id))

  useEffect(() => { fetchNotes() }, [item.id])

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

  const roleLabel = (r) => r === 'product_manager' ? 'Product Mgr' : r === 'dev' ? 'Dev' : 'Admin'
  const displayRelease = item.target_quarter || fmtDateLong(item.target_date)

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-[440px] bg-[#1a2d45] border-l border-[#2a3d55] z-50 flex flex-col shadow-2xl">

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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {item.description && (
            <div>
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-1">Description</p>
              <p className="text-white text-sm leading-relaxed">{item.description}</p>
            </div>
          )}

          {/* Assignees */}
          {userIsAdmin && (
            <div>
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Assigned To</p>
              {/* Current assignees as chips */}
              {assignees.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {assignees.map(a => (
                    <div key={a.profile_id} className="flex items-center gap-1.5 bg-[#0F1C2E] border border-[#2a3d55] rounded-full pl-3 pr-2 py-1">
                      <span className="text-white text-xs font-medium">{a.full_name}</span>
                      <span className="text-[#8A9AB0] text-xs">· {roleLabel(a.org_role)}</span>
                      <button onClick={() => onRemoveAssignee(a.profile_id)}
                        className="text-[#8A9AB0] hover:text-red-400 transition-colors ml-1 text-xs leading-none">✕</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Add person */}
              {unassigned.length > 0 && (
                <select
                  value=""
                  onChange={e => { if (e.target.value) onAddAssignee(e.target.value) }}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  <option value="">+ Add person…</option>
                  {unassigned.map(m => (
                    <option key={m.id} value={m.id}>{m.full_name} ({roleLabel(m.org_role)})</option>
                  ))}
                </select>
              )}
              {unassigned.length === 0 && assignees.length > 0 && (
                <p className="text-[#8A9AB0] text-xs">All team members assigned.</p>
              )}
              {teamMembers.length === 0 && (
                <p className="text-[#8A9AB0] text-xs">No dev or product manager profiles in this org yet.</p>
              )}
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
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Specific Date</label>
                  <input type="date" value={releaseForm.target_date} onChange={e => setReleaseForm(p => ({ ...p, target_date: e.target.value }))}
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
                  <span className="text-[#8A9AB0] text-xs">· {fmtDateLong(item.target_date)}</span>
                )}
              </div>
            ) : (
              <p className="text-[#8A9AB0] text-sm">{userIsAdmin ? 'Not set — click Edit to add a target.' : 'Not yet scheduled.'}</p>
            )}
          </div>

          {/* Status moves */}
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

          {userIsAdmin && (
            <div className="flex gap-2">
              <button onClick={onEdit}
                className="flex-1 px-3 py-2 bg-[#0F1C2E] border border-[#2a3d55] text-[#8A9AB0] hover:text-white rounded-lg text-xs font-medium transition-colors text-left">
                Edit Title & Description
              </button>
              {item.archived_at ? (
                <button onClick={onRestore}
                  className="px-3 py-2 bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 rounded-lg text-xs font-medium transition-colors">
                  Restore
                </button>
              ) : (
                <button onClick={onArchive}
                  className="px-3 py-2 bg-[#0F1C2E] border border-[#2a3d55] text-[#8A9AB0] hover:text-yellow-400 hover:border-yellow-500/30 rounded-lg text-xs font-medium transition-colors">
                  Archive
                </button>
              )}
            </div>
          )}

          {/* Team notes */}
          {userIsAdmin && (
            <div>
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">
                Team Notes {notes.length > 0 && `(${notes.length})`}
              </p>
              {loadingNotes ? (
                <p className="text-[#8A9AB0] text-xs">Loading...</p>
              ) : notes.length === 0 ? (
                <p className="text-[#8A9AB0] text-sm">No notes yet.</p>
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
                            className="text-[#8A9AB0] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
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

        {/* Note input */}
        {userIsAdmin && (
          <div className="px-6 py-4 border-t border-[#2a3d55] flex-shrink-0">
            <textarea ref={textareaRef} value={noteBody}
              onChange={e => setNoteBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) postNote() }}
              placeholder="Add a team note… (⌘↵ to post)"
              rows={3}
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#8A9AB0] mb-2"
            />
            <div className="flex items-center gap-3 mb-2">
              <button onClick={() => setNoteInternal(!noteInternal)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${noteInternal ? 'bg-[#2a3d55] border-[#2a3d55] text-[#8A9AB0]' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
                {noteInternal ? '🔒 Internal only' : '👁 Visible to reps'}
              </button>
              <span className="text-[#8A9AB0] text-xs">{noteInternal ? 'Only team sees this' : 'Rep who submitted can see this'}</span>
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
function AdminCard({ item, currentStatus, assignees, onOpen, onEdit, onDelete, onStatusChange }) {
  const moves = (NEXT_STATUSES[currentStatus] || []).slice(0, 2)
  const displayRelease = item.target_quarter || fmtDate(item.target_date)

  return (
    <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-4 group hover:border-[#C8622A]/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <button onClick={onOpen} className="text-white text-sm font-semibold leading-tight text-left hover:text-[#C8622A] transition-colors">
          {item.title}
        </button>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={onEdit} className="text-[#8A9AB0] hover:text-white text-xs p-0.5">✏️</button>
          <button onClick={onDelete} className="text-[#8A9AB0] hover:text-red-400 text-xs p-0.5">✕</button>
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
      {/* Requestor + assignees */}
      <div className="mb-2 space-y-0.5">
        {item.profiles?.full_name && (
          <p className="text-[#8A9AB0] text-xs">↑ {item.profiles.full_name}</p>
        )}
        {assignees.length > 0 && (
          <p className="text-blue-400 text-xs">
            → {assignees.slice(0, 2).map(a => a.full_name).join(', ')}{assignees.length > 2 ? ` +${assignees.length - 2}` : ''}
          </p>
        )}
      </div>
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

// ── Rep card ──────────────────────────────────────────────────────────────────
function RepCard({ item, released = false, showStatus = false, onOpen }) {
  const statusBadge = {
    backlog: 'bg-[#8A9AB0]/20 text-[#8A9AB0]', planned: 'bg-yellow-500/20 text-yellow-400',
    in_progress: 'bg-blue-500/20 text-blue-400', released: 'bg-green-500/20 text-green-400', declined: 'bg-red-500/20 text-red-400',
  }
  const statusLabel = { backlog: 'Pending', planned: 'Planned', in_progress: 'In Progress', released: 'Released', declined: 'Declined' }
  const displayRelease = item.target_quarter || fmtDateLong(item.target_date)

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
