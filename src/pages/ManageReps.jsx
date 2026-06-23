import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'

const ROLES = [
  { value: 'admin',           label: 'Admin',           color: 'bg-[#C8622A]/20 text-[#C8622A]',     desc: 'Full access — manages team, settings, billing, and all features' },
  { value: 'sales_manager',   label: 'Sales Manager',   color: 'bg-yellow-500/20 text-yellow-400',   desc: 'Full sales access — leaderboard, all proposals, team pipeline' },
  { value: 'rep',             label: 'Sales Rep',       color: 'bg-blue-500/20 text-blue-400',       desc: 'Creates and manages their own proposals and clients' },
  { value: 'project_manager', label: 'Project Manager', color: 'bg-purple-500/20 text-purple-400',   desc: 'Manages active jobs, POs, change orders, and tech logs' },
  { value: 'technician',      label: 'Technician',      color: 'bg-green-500/20 text-green-400',     desc: 'Field access only — tech daily log and job viewing' },
  { value: 'product_manager', label: 'Product Manager', color: 'bg-indigo-500/20 text-indigo-400',   desc: 'Manages the product roadmap, catalog, and release planning' },
  { value: 'dev',             label: 'Dev Team',        color: 'bg-teal-500/20 text-teal-400',       desc: 'Works on roadmap items — bug fixes, features, and improvements' },
]

const PERMISSION_FLAGS = [
  {
    key: 'view_cost',
    label: 'View Cost & Margin',
    desc: 'Can see material cost, gross margin %, and profitability on proposals',
    defaultOn: ['admin', 'sales_manager'],
  },
  {
    key: 'view_all_proposals',
    label: 'View All Proposals',
    desc: "Can view the entire team's proposals, not just their own",
    defaultOn: ['admin', 'sales_manager'],
  },
  {
    key: 'manage_products',
    label: 'Manage Product Library',
    desc: 'Can add, edit, and remove items in the product library / catalog',
    defaultOn: ['admin'],
  },
  {
    key: 'delete_proposals',
    label: 'Delete Proposals',
    desc: 'Can permanently delete proposals',
    defaultOn: ['admin'],
  },
  {
    key: 'export_data',
    label: 'Export & Reports',
    desc: 'Can download exports and access the reports section',
    defaultOn: ['admin', 'sales_manager'],
  },
]

const getRoleStyle = (role) => ROLES.find(r => r.value === role)?.color || 'bg-[#8A9AB0]/20 text-[#8A9AB0]'
const getRoleLabel = (role) => ROLES.find(r => r.value === role)?.label || role || 'Rep'

const effectivePerm = (flag, rep) => {
  const perms = rep.permissions || {}
  if (flag.key in perms) return perms[flag.key]
  return flag.defaultOn.includes(rep.org_role || rep.role || 'rep')
}

export default function ManageReps({ isAdmin, featureProposals = true, featureCRM = false }) {
  const { profile: currentProfile } = useProfile()
  const [reps, setReps]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [adding, setAdding]         = useState(false)
  const [form, setForm]             = useState({ email: '', full_name: '', org_role: 'rep' })
  const [error, setError]           = useState(null)
  const [success, setSuccess]       = useState(null)
  const [updatingRole, setUpdatingRole] = useState({})
  const [deletingId, setDeletingId] = useState(null)
  const [expanded, setExpanded]     = useState({}) // { [repId]: true }
  const [savingPerm, setSavingPerm] = useState({}) // { [repId:key]: true }

  useEffect(() => { if (currentProfile?.org_id) fetchReps(currentProfile.org_id) }, [currentProfile?.org_id])

  const fetchReps = async (orgId) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, org_role, created_at, permissions')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    setReps((data || []).map(r => ({ ...r, permissions: r.permissions || {} })))
    setLoading(false)
  }

  const handleAddRep = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setAdding(true); setError(null); setSuccess(null)
    if (!form.email || !form.full_name) { setError('Name and email are required'); setAdding(false); return }
    try {
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/invite-team-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: form.email, fullName: form.full_name, orgId: currentProfile.org_id, orgRole: form.org_role }),
      })
      const result = await res.json()
      if (result.error) { setError(result.error); setAdding(false); return }
      setSuccess(`Invite sent to ${form.email} — they'll receive an email to set up their account.`)
      setForm({ email: '', full_name: '', org_role: 'rep' })
      setShowForm(false)
      fetchReps(currentProfile.org_id)
    } catch { setError('Failed to send invite. Please try again.') }
    setAdding(false)
  }

  const handleRemoveMember = async (rep) => {
    if (!window.confirm(`Remove ${rep.full_name || rep.email} from your team? This cannot be undone.`)) return
    setDeletingId(rep.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/remove-team-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ userId: rep.id }),
    })
    const result = await res.json()
    if (result.error) setError(result.error)
    else setReps(prev => prev.filter(r => r.id !== rep.id))
    setDeletingId(null)
  }

  const updateRole = async (repId, newRole) => {
    setUpdatingRole(prev => ({ ...prev, [repId]: true }))
    await supabase.from('profiles').update({ org_role: newRole, role: newRole }).eq('id', repId)
    setReps(prev => prev.map(r => r.id === repId ? { ...r, org_role: newRole, role: newRole } : r))
    setUpdatingRole(prev => ({ ...prev, [repId]: false }))
  }

  const togglePerm = async (rep, flagKey, newVal) => {
    const stateKey = `${rep.id}:${flagKey}`
    setSavingPerm(prev => ({ ...prev, [stateKey]: true }))
    const updatedPerms = { ...(rep.permissions || {}), [flagKey]: newVal }
    await supabase.from('profiles').update({ permissions: updatedPerms }).eq('id', rep.id)
    setReps(prev => prev.map(r => r.id === rep.id ? { ...r, permissions: updatedPerms } : r))
    setSavingPerm(prev => ({ ...prev, [stateKey]: false }))
  }

  const resetPerms = async (rep) => {
    await supabase.from('profiles').update({ permissions: {} }).eq('id', rep.id)
    setReps(prev => prev.map(r => r.id === rep.id ? { ...r, permissions: {} } : r))
  }

  const hasCustomPerms = (rep) => Object.keys(rep.permissions || {}).length > 0

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Team</h2>
          {isAdmin && (
            <button onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null) }}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              {showForm ? 'Cancel' : '+ Add Team Member'}
            </button>
          )}
        </div>

        {/* Role legend */}
        <div className="bg-[#1a2d45] rounded-xl p-5">
          <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Roles</p>
          <div className="grid grid-cols-2 gap-3">
            {ROLES.map(role => (
              <div key={role.value} className="flex items-start gap-3">
                <span className={`text-xs font-semibold px-2 py-1 rounded whitespace-nowrap ${role.color}`}>{role.label}</span>
                <p className="text-[#8A9AB0] text-xs leading-relaxed">{role.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Invite form */}
        {showForm && isAdmin && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">Invite Team Member</h3>
            <p className="text-[#8A9AB0] text-sm mb-4">They'll receive an email with a link to set up their password.</p>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            {success && <p className="text-green-400 text-sm mb-4">{success}</p>}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
                <input type="text" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  className={inputClass} placeholder="John Smith" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className={inputClass} placeholder="rep@company.com" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Role</label>
                <select value={form.org_role} onChange={e => setForm(p => ({ ...p, org_role: e.target.value }))} className={inputClass}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <button onClick={handleAddRep} disabled={adding}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {adding ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        )}

        {/* Team list */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Team Members ({reps.length})</h3>
          {loading ? (
            <p className="text-[#8A9AB0]">Loading...</p>
          ) : reps.length === 0 ? (
            <p className="text-[#8A9AB0]">No team members yet. Add your first above.</p>
          ) : (
            <div className="space-y-2">
              {reps.map(rep => {
                const isCurrentUser = rep.id === currentProfile?.id
                const currentRole   = rep.org_role || rep.role || 'rep'
                const isOpen        = !!expanded[rep.id]

                return (
                  <div key={rep.id} className="border border-[#2a3d55] rounded-xl overflow-hidden">
                    {/* Row */}
                    <div className="flex justify-between items-center px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Expand toggle (admin only, not self) */}
                        {isAdmin && !isCurrentUser && currentRole !== 'admin' && (
                          <button onClick={() => setExpanded(p => ({ ...p, [rep.id]: !p[rep.id] }))}
                            className="text-[#8A9AB0] hover:text-white transition-colors text-xs w-4 text-center">
                            {isOpen ? '▾' : '▸'}
                          </button>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-white font-medium">{rep.full_name || '—'}</p>
                            {isCurrentUser && <span className="text-[#8A9AB0] text-xs">(you)</span>}
                            {hasCustomPerms(rep) && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-[#C8622A]/10 text-[#C8622A] font-medium">custom</span>
                            )}
                          </div>
                          <p className="text-[#8A9AB0] text-sm">{rep.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {updatingRole[rep.id] && <span className="text-[#8A9AB0] text-xs">Saving...</span>}
                        {isAdmin && !isCurrentUser && currentRole !== 'admin' ? (
                          <>
                            <select value={currentRole} onChange={e => updateRole(rep.id, e.target.value)}
                              className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <button onClick={() => handleRemoveMember(rep)} disabled={deletingId === rep.id}
                              className="text-red-400 hover:text-red-300 text-xs disabled:opacity-40 transition-colors">
                              {deletingId === rep.id ? 'Removing...' : 'Remove'}
                            </button>
                          </>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleStyle(currentRole)}`}>
                            {getRoleLabel(currentRole)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded permissions panel */}
                    {isOpen && isAdmin && (
                      <div className="border-t border-[#2a3d55] bg-[#0F1C2E] px-6 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">
                            Permission Overrides
                          </p>
                          {hasCustomPerms(rep) && (
                            <button onClick={() => resetPerms(rep)}
                              className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">
                              Reset to role defaults
                            </button>
                          )}
                        </div>
                        <p className="text-[#8A9AB0] text-xs mb-4 leading-relaxed">
                          Overrides apply on top of the <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getRoleStyle(currentRole)}`}>{getRoleLabel(currentRole)}</span> role defaults.
                          A grey toggle means the role's default applies — flip it to override.
                        </p>
                        <div className="space-y-3">
                          {PERMISSION_FLAGS.map(flag => {
                            const isOverridden = flag.key in (rep.permissions || {})
                            const currentVal   = effectivePerm(flag, rep)
                            const roleDefault  = flag.defaultOn.includes(currentRole)
                            const stateKey     = `${rep.id}:${flag.key}`

                            return (
                              <div key={flag.key} className={`flex items-center justify-between rounded-lg px-4 py-3 border transition-colors ${isOverridden ? 'border-[#C8622A]/30 bg-[#C8622A]/5' : 'border-[#2a3d55]'}`}>
                                <div className="flex-1 min-w-0 mr-4">
                                  <div className="flex items-center gap-2">
                                    <p className="text-white text-sm font-medium">{flag.label}</p>
                                    {isOverridden ? (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#C8622A]/20 text-[#C8622A]">overridden</span>
                                    ) : (
                                      <span className="text-xs text-[#8A9AB0]">role default: {roleDefault ? 'on' : 'off'}</span>
                                    )}
                                  </div>
                                  <p className="text-[#8A9AB0] text-xs mt-0.5">{flag.desc}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {savingPerm[stateKey] && <span className="text-[#8A9AB0] text-xs">Saving...</span>}
                                  <button
                                    onClick={() => togglePerm(rep, flag.key, !currentVal)}
                                    disabled={!!savingPerm[stateKey]}
                                    className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-50 ${currentVal ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${currentVal ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                  </button>
                                  {isOverridden && (
                                    <button onClick={() => {
                                      const p = { ...(rep.permissions || {}) }
                                      delete p[flag.key]
                                      supabase.from('profiles').update({ permissions: p }).eq('id', rep.id)
                                      setReps(prev => prev.map(r => r.id === rep.id ? { ...r, permissions: p } : r))
                                    }} className="text-[#8A9AB0] hover:text-white text-xs transition-colors" title="Remove override">✕</button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
