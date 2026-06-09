import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'

export default function TeamSettingsTab({ featureDesignerOnly }) {
  const [members,  setMembers]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ email: '', full_name: '', org_role: 'rep' })
  const [adding,   setAdding]   = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(null)
  const [orgId,    setOrgId]    = useState(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (profile?.org_id) {
        setOrgId(profile.org_id)
        const { data } = await supabase.from('profiles')
          .select('id, full_name, email, org_role, created_at')
          .eq('org_id', profile.org_id)
          .order('created_at', { ascending: false })
        setMembers(data || [])
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleInvite = async () => {
    if (!form.email || !form.full_name) { setError('Name and email are required'); return }
    setAdding(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/invite-team-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: form.email, fullName: form.full_name, orgId, orgRole: form.org_role })
      })
      const result = await res.json()
      if (result.error) { setError(result.error); return }
      setSuccess(`Invite sent to ${form.email}`)
      setForm({ email: '', full_name: '', org_role: 'rep' })
      setShowForm(false)
    } catch (err) {
      setError('Failed to send invite: ' + (err?.message || String(err)))
    } finally {
      setAdding(false)
    }
  }

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-lg">Team Members</h3>
          <p className="text-[#8A9AB0] text-sm mt-0.5">
            {featureDesignerOnly ? 'Invite designers to collaborate on projects' : 'Manage your team'}
          </p>
        </div>
        <button onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-[#C8622A] text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Invite Member
        </button>
      </div>

      {showForm && (
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-5 space-y-3">
          <h4 className="text-white font-semibold text-sm">Invite Team Member</h4>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {success && <p className="text-green-400 text-xs">{success}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Full Name</label>
              <input type="text" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Jane Smith" className={inputClass} />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="jane@company.com" className={inputClass} />
            </div>
          </div>
          {!featureDesignerOnly && (
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Role</label>
              <select value={form.org_role} onChange={e => setForm(p => ({ ...p, org_role: e.target.value }))} className={inputClass}>
                <option value="rep">Designer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2 text-sm border border-[#2a3d55] text-[#8A9AB0] rounded-lg hover:text-white transition-colors">
              Cancel
            </button>
            <button onClick={handleInvite} disabled={adding}
              className="flex-1 py-2 text-sm font-semibold bg-[#C8622A] text-white rounded-lg hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {adding ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <svg className="w-5 h-5 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
        </div>
      ) : (
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a3d55] bg-[#0F1C2E]">
                <th className="text-left px-4 py-2.5 font-medium text-[#8A9AB0]">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#8A9AB0]">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#8A9AB0]">Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-[#8A9AB0]">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-[#0F1C2E]/50">
                  <td className="px-4 py-2.5 text-white font-medium">{m.full_name || '—'}</td>
                  <td className="px-4 py-2.5 text-[#8A9AB0]">{m.email}</td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full bg-[#2a3d55] text-[#8A9AB0] text-xs capitalize">
                      {m.org_role || 'Designer'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[#8A9AB0] text-xs">
                    {m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
