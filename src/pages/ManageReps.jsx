import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const ROLES = [
  { value: 'admin', label: 'Admin', color: 'bg-[#C8622A]/20 text-[#C8622A]', desc: 'Full access — manages team, settings, billing, and all features' },
  { value: 'sales_manager', label: 'Sales Manager', color: 'bg-yellow-500/20 text-yellow-400', desc: 'Full sales access — leaderboard, all proposals, team pipeline' },
  { value: 'rep', label: 'Sales Rep', color: 'bg-blue-500/20 text-blue-400', desc: 'Creates and manages their own proposals and clients' },
  { value: 'project_manager', label: 'Project Manager', color: 'bg-purple-500/20 text-purple-400', desc: 'Manages active jobs, POs, change orders, and tech logs' },
  { value: 'technician', label: 'Technician', color: 'bg-green-500/20 text-green-400', desc: 'Field access only — tech daily log and job viewing' },
]

const getRoleStyle = (role) => ROLES.find(r => r.value === role)?.color || 'bg-[#8A9AB0]/20 text-[#8A9AB0]'
const getRoleLabel = (role) => ROLES.find(r => r.value === role)?.label || role || 'Rep'

export default function ManageReps({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [reps, setReps] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ email: '', full_name: '', org_role: 'rep' })
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [currentProfile, setCurrentProfile] = useState(null)
  const [updatingRole, setUpdatingRole] = useState({})

  useEffect(() => { fetchCurrentProfile() }, [])

  const fetchCurrentProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('profiles').select('id, full_name, email, org_id, role, org_role, company_name, logo_url, primary_color, default_markup_percent, followup_days, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, ship_to_address, ship_to_city, ship_to_state, ship_to_zip, payment_instructions_payable_to, payment_instructions_zelle, payment_instructions_notes, dispatch_zone, google_calendar_connected, google_calendar_id, microsoft_calendar_connected, team_id, is_regional_vp, is_operations_manager').eq('id', user.id).single()
    setCurrentProfile(data)
    if (data?.org_id) fetchReps(data.org_id)
  }

  const fetchReps = async (orgId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    setReps(data || [])
    setLoading(false)
  }

  const handleAddRep = async () => {
    setAdding(true)
    setError(null)
    setSuccess(null)

    if (!form.email || !form.full_name) {
      setError('Name and email are required')
      setAdding(false)
      return
    }

    try {
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/invite-team-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          email: form.email,
          fullName: form.full_name,
          orgId: currentProfile.org_id,
          orgRole: form.org_role,
        })
      })

      const result = await res.json()
      if (result.error) { setError(result.error); setAdding(false); return }

      setSuccess(`Invite sent to ${form.email} — they'll receive an email to set up their account.`)
      setForm({ email: '', full_name: '', org_role: 'rep' })
      setShowForm(false)
      fetchReps(currentProfile.org_id)
    } catch (err) {
      setError('Failed to send invite. Please try again.')
    }

    setAdding(false)
  }

  const updateRole = async (repId, newRole) => {
    setUpdatingRole(prev => ({ ...prev, [repId]: true }))
    await supabase.from('profiles').update({ org_role: newRole, role: newRole }).eq('id', repId)
    setReps(prev => prev.map(r => r.id === repId ? { ...r, org_role: newRole, role: newRole } : r))
    setUpdatingRole(prev => ({ ...prev, [repId]: false }))
  }

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Team</h2>
          {isAdmin && (
            <button
              onClick={() => { setShowForm(!showForm); setError(null); setSuccess(null) }}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
            >
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

        {showForm && isAdmin && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">Invite Team Member</h3>
            <p className="text-[#8A9AB0] text-sm mb-4">They'll receive an email with a link to set up their password.</p>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            {success && <p className="text-green-400 text-sm mb-4">{success}</p>}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
                <input type="text" value={form.full_name}
                  onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))}
                  className={inputClass} placeholder="John Smith" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  className={inputClass} placeholder="rep@company.com" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Role</label>
                <select value={form.org_role}
                  onChange={e => setForm(prev => ({ ...prev, org_role: e.target.value }))}
                  className={inputClass}>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={handleAddRep} disabled={adding}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {adding ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        )}

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Team Members ({reps.length})</h3>
          {loading ? (
            <p className="text-[#8A9AB0]">Loading...</p>
          ) : reps.length === 0 ? (
            <p className="text-[#8A9AB0]">No team members yet. Add your first rep above.</p>
          ) : (
            <div className="space-y-2">
              {reps.map(rep => {
                const isCurrentUser = rep.id === currentProfile?.id
                const currentRole = rep.org_role || rep.role || 'rep'
                return (
                  <div key={rep.id} className="flex justify-between items-center border-b border-[#2a3d55] py-3 last:border-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium">{rep.full_name || '—'}</p>
                        {isCurrentUser && <span className="text-[#8A9AB0] text-xs">(you)</span>}
                      </div>
                      <p className="text-[#8A9AB0] text-sm">{rep.email}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {updatingRole[rep.id] && (
                        <span className="text-[#8A9AB0] text-xs">Saving...</span>
                      )}
                      {isAdmin && !isCurrentUser ? (
                        <select
                          value={currentRole}
                          onChange={e => updateRole(rep.id, e.target.value)}
                          className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        >
                          {ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleStyle(currentRole)}`}>
                          {getRoleLabel(currentRole)}
                        </span>
                      )}
                    </div>
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