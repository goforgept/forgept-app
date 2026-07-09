import { useState, useEffect } from 'react'
import { supabase } from '../../supabase'
import { useProfile } from '../../context/ProfileContext'

const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

export default function RegionsTab({ regionsEnabled, setRegionsEnabled }) {
  const { profile } = useProfile()
  const [regions,  setRegions]  = useState([])
  const [members,  setMembers]  = useState([]) // all org profiles
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ name: '', manager_id: '' })
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    if (profile?.org_id) load()
  }, [profile?.org_id])

  const load = async () => {
    setLoading(true)
    const [{ data: regionData }, { data: memberData }] = await Promise.all([
      supabase.from('regions').select('id, name, manager_id, profiles!regions_manager_id_fkey(full_name)').eq('org_id', profile.org_id).order('name'),
      supabase.from('profiles').select('id, full_name, email, org_role, region_id').eq('org_id', profile.org_id).order('full_name'),
    ])
    setRegions(regionData || [])
    setMembers(memberData || [])
    setLoading(false)
  }

  const toggleRegions = async () => {
    const next = !regionsEnabled
    setRegionsEnabled(next)
    await supabase.from('organizations').update({ feature_regions: next }).eq('id', profile.org_id)
  }

  const handleAdd = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('regions').insert({
      org_id:     profile.org_id,
      name:       form.name.trim(),
      manager_id: form.manager_id || null,
    })
    setForm({ name: '', manager_id: '' })
    setShowForm(false)
    setSaving(false)
    load()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this region? Members will be unassigned.')) return
    await supabase.from('profiles').update({ region_id: null }).eq('region_id', id)
    await supabase.from('regions').delete().eq('id', id)
    load()
  }

  const handleSetManager = async (regionId, managerId) => {
    await supabase.from('regions').update({ manager_id: managerId || null }).eq('id', regionId)
    // Also give them the regional VP flag
    if (managerId) {
      await supabase.from('profiles').update({ is_regional_vp: true, region_id: regionId }).eq('id', managerId)
    }
    load()
  }

  const handleAssignMember = async (profileId, regionId) => {
    await supabase.from('profiles').update({ region_id: regionId || null }).eq('id', profileId)
    load()
  }

  if (loading) return <div className="text-fp-muted text-sm p-6">Loading…</div>

  return (
    <div className="space-y-6">

      {/* Feature toggle */}
      <div className="bg-fp-card border border-fp-border rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-fp-text font-bold text-base">Regions</h3>
            <p className="text-fp-muted text-xs mt-0.5">
              Organize your team into regions with a dedicated manager per region.
              Regional managers can edit all quotes for their team.
              All other users are read-only on deals unless added as a collaborator.
            </p>
          </div>
          <button onClick={toggleRegions}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${regionsEnabled ? 'bg-fp-brand' : 'bg-fp-inset'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${regionsEnabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      {regionsEnabled && (
        <>
          {/* Region list */}
          <div className="bg-fp-card border border-fp-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-fp-border">
              <div>
                <h3 className="text-fp-text font-bold text-base">Regions</h3>
                <p className="text-fp-muted text-xs mt-0.5">{regions.length} region{regions.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowForm(s => !s)}
                className="px-3 py-1.5 bg-fp-brand text-white text-xs font-semibold rounded-lg hover:bg-[#b5571f] transition-colors">
                + Add Region
              </button>
            </div>

            {showForm && (
              <div className="px-5 py-4 border-b border-fp-border bg-fp-inset/40">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="text-fp-muted text-xs mb-1 block">Region Name</label>
                    <input type="text" placeholder="e.g. Northeast, West Coast"
                      value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                      className={inputClass} />
                  </div>
                  <div>
                    <label className="text-fp-muted text-xs mb-1 block">Regional Manager</label>
                    <select value={form.manager_id} onChange={e => setForm(p => ({ ...p, manager_id: e.target.value }))}
                      className={inputClass}>
                      <option value="">— Assign later —</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowForm(false); setForm({ name: '', manager_id: '' }) }}
                    className="px-3 py-1.5 text-fp-muted hover:text-fp-text text-sm transition-colors">Cancel</button>
                  <button onClick={handleAdd} disabled={saving || !form.name.trim()}
                    className="px-4 py-1.5 bg-fp-brand text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors">
                    {saving ? 'Adding…' : 'Add Region'}
                  </button>
                </div>
              </div>
            )}

            {regions.length === 0 ? (
              <div className="px-5 py-8 text-center text-fp-muted text-sm">
                No regions yet. Add one to get started.
              </div>
            ) : (
              <div className="divide-y divide-fp-border">
                {regions.map(region => {
                  const regionMembers = members.filter(m => m.region_id === region.id)
                  return (
                    <div key={region.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="text-fp-text font-semibold">{region.name}</p>
                          <p className="text-fp-muted text-xs mt-0.5">{regionMembers.length} member{regionMembers.length !== 1 ? 's' : ''}</p>
                        </div>
                        <button onClick={() => handleDelete(region.id)}
                          className="text-fp-muted hover:text-red-400 text-xs transition-colors flex-shrink-0">
                          Delete
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-fp-muted text-xs mb-1 block">Regional Manager</label>
                          <select
                            value={region.manager_id || ''}
                            onChange={e => handleSetManager(region.id, e.target.value)}
                            className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-fp-brand">
                            <option value="">— None —</option>
                            {members.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                          </select>
                          {region.manager_id && (
                            <p className="text-fp-muted text-xs mt-1">Can edit all quotes in this region</p>
                          )}
                        </div>
                      </div>

                      {/* Member list */}
                      {regionMembers.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {regionMembers.map(m => (
                            <div key={m.id} className="flex items-center justify-between bg-fp-inset rounded px-3 py-1.5">
                              <div>
                                <span className="text-fp-text text-xs font-medium">{m.full_name}</span>
                                <span className="text-fp-muted text-xs ml-2">{m.org_role}</span>
                                {m.id === region.manager_id && (
                                  <span className="ml-2 text-xs bg-fp-brand/20 text-fp-brand px-1.5 py-0.5 rounded-full">Manager</span>
                                )}
                              </div>
                              <button
                                onClick={() => handleAssignMember(m.id, null)}
                                className="text-fp-muted hover:text-red-400 text-xs transition-colors">
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Unassigned members */}
          {members.filter(m => !m.region_id).length > 0 && (
            <div className="bg-fp-card border border-fp-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-fp-border">
                <h3 className="text-fp-text font-semibold text-sm">Unassigned Members</h3>
                <p className="text-fp-muted text-xs mt-0.5">Assign these team members to a region</p>
              </div>
              <div className="divide-y divide-fp-border">
                {members.filter(m => !m.region_id).map(m => (
                  <div key={m.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-fp-text text-sm font-medium">{m.full_name}</p>
                      <p className="text-fp-muted text-xs">{m.email} · {m.org_role}</p>
                    </div>
                    <select
                      value=""
                      onChange={e => handleAssignMember(m.id, e.target.value || null)}
                      className="bg-fp-inset text-fp-text border border-fp-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-fp-brand">
                      <option value="">Assign to region…</option>
                      {regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
