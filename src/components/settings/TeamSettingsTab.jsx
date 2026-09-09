import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabase'
import { PERMISSION_AREAS, computePermissions } from '../../hooks/usePermissions'

// ── Permission level selector ─────────────────────────────────────────────────
const LEVELS = ['none', 'read', 'write']
const LEVEL_LABELS = { none: 'None', read: 'View', write: 'Full' }
const LEVEL_COLORS = {
  none:  'text-fp-muted',
  read:  'text-blue-400',
  write: 'text-green-400',
}

function LevelToggle({ value, onChange, disabled }) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-fp-border bg-fp-inset text-xs">
      {LEVELS.map(lvl => (
        <button
          key={lvl}
          disabled={disabled}
          onClick={() => onChange(lvl)}
          className={`px-2.5 py-1 font-medium transition-colors ${
            value === lvl
              ? lvl === 'none' ? 'bg-fp-muted/20 text-fp-text'
              : lvl === 'read' ? 'bg-blue-500/20 text-blue-400'
              : 'bg-green-500/20 text-green-400'
              : 'text-fp-muted hover:text-fp-text'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {LEVEL_LABELS[lvl]}
        </button>
      ))}
    </div>
  )
}

// ── Permission matrix for role editing ────────────────────────────────────────
function PermissionMatrix({ permissions, onChange, isAdminRole }) {
  const grouped = useMemo(() => {
    const groups = {}
    for (const area of PERMISSION_AREAS) {
      if (!groups[area.group]) groups[area.group] = []
      groups[area.group].push(area)
    }
    return groups
  }, [])

  return (
    <div className="space-y-4">
      {isAdminRole && (
        <div className="bg-fp-brand/10 border border-fp-brand/30 rounded-lg px-3 py-2 text-xs text-fp-brand">
          Admin roles bypass all permission checks — members have full access to everything.
        </div>
      )}
      {Object.entries(grouped).map(([group, areas]) => (
        <div key={group}>
          <p className="text-fp-muted text-xs font-semibold uppercase tracking-wider mb-2">{group}</p>
          <div className="space-y-1">
            {areas.map(area => (
              <div key={area.key} className="flex items-center justify-between py-1.5">
                <span className={`text-sm ${isAdminRole ? 'text-fp-muted' : 'text-fp-text'}`}>{area.label}</span>
                <LevelToggle
                  value={isAdminRole ? 'write' : (permissions[area.key] ?? 'write')}
                  onChange={v => onChange(area.key, v)}
                  disabled={isAdminRole}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── User permission overrides (vs role defaults) ───────────────────────────────
function UserPermissionOverrides({ rolePermissions, overrides, onChange, isAdminRole }) {
  const grouped = useMemo(() => {
    const groups = {}
    for (const area of PERMISSION_AREAS) {
      if (!groups[area.group]) groups[area.group] = []
      groups[area.group].push(area)
    }
    return groups
  }, [])

  return (
    <div className="space-y-4">
      {isAdminRole && (
        <div className="bg-fp-brand/10 border border-fp-brand/30 rounded-lg px-3 py-2 text-xs text-fp-brand">
          This is an admin role — no restrictions apply.
        </div>
      )}
      {!isAdminRole && (
        <p className="text-fp-muted text-xs">
          Showing role defaults. Toggle any area to override for this user specifically.
          <span className="ml-1 text-yellow-400">Yellow = overridden</span>.
        </p>
      )}
      {Object.entries(grouped).map(([group, areas]) => (
        <div key={group}>
          <p className="text-fp-muted text-xs font-semibold uppercase tracking-wider mb-2">{group}</p>
          <div className="space-y-1">
            {areas.map(area => {
              const roleDefault = rolePermissions?.[area.key] ?? 'write'
              const override = overrides?.[area.key]
              const effective = override ?? roleDefault
              const isOverridden = override !== undefined && override !== roleDefault
              return (
                <div key={area.key} className={`flex items-center justify-between py-1.5 rounded px-1 -mx-1 ${isOverridden ? 'bg-yellow-500/5' : ''}`}>
                  <div>
                    <span className={`text-sm ${isAdminRole ? 'text-fp-muted' : 'text-fp-text'}`}>{area.label}</span>
                    {isOverridden && (
                      <span className="ml-2 text-xs text-yellow-400">
                        (role: {LEVEL_LABELS[roleDefault]})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isOverridden && (
                      <button
                        onClick={() => onChange(area.key, null)}
                        className="text-xs text-fp-muted hover:text-fp-text transition-colors"
                        title="Reset to role default"
                      >
                        ↺
                      </button>
                    )}
                    <LevelToggle
                      value={isAdminRole ? 'write' : effective}
                      onChange={v => onChange(area.key, v === roleDefault ? null : v)}
                      disabled={isAdminRole}
                    />
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

// ── Role modal ────────────────────────────────────────────────────────────────
function RoleModal({ role, orgId, onSave, onClose }) {
  const [form, setForm] = useState({
    name: role?.name || '',
    description: role?.description || '',
    base_role: role?.base_role || 'rep',
    permissions: role?.permissions || {},
    is_admin: role?.is_admin || false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Role name is required'); return }
    setSaving(true); setError(null)
    const payload = { ...form, org_id: orgId }
    let result
    if (role?.id) {
      result = await supabase.from('org_roles').update(payload).eq('id', role.id).select().single()
    } else {
      result = await supabase.from('org_roles').insert(payload).select().single()
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSave(result.data)
  }

  const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-12 px-4 overflow-y-auto">
      <div className="bg-fp-card border border-fp-border rounded-2xl w-full max-w-lg mb-12">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fp-border">
          <h3 className="text-fp-text font-bold text-base">{role?.id ? 'Edit Role' : 'New Role'}</h3>
          <button onClick={onClose} className="text-fp-muted hover:text-fp-text transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-fp-muted text-xs mb-1 block">Role Name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Sales Rep, Field Tech" className={inputClass} />
            </div>
            <div className="col-span-2">
              <label className="text-fp-muted text-xs mb-1 block">Description (optional)</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="What does this role do?" className={inputClass} />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Nav Template</label>
              <select value={form.base_role} onChange={e => setForm(p => ({ ...p, base_role: e.target.value }))} className={inputClass}>
                <option value="rep">Sales Rep</option>
                <option value="project_manager">Project Manager</option>
                <option value="technician">Technician</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <button
                onClick={() => setForm(p => ({ ...p, is_admin: !p.is_admin }))}
                className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${form.is_admin ? 'bg-fp-brand' : 'bg-fp-inset border border-fp-border'}`}
              >
                <span className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_admin ? 'translate-x-5' : ''}`} />
              </button>
              <span className="text-fp-muted text-xs">Full admin access</span>
            </div>
          </div>

          <div className="border-t border-fp-border pt-4">
            <p className="text-fp-text text-sm font-semibold mb-3">Default Permissions</p>
            <PermissionMatrix
              permissions={form.permissions}
              isAdminRole={form.is_admin}
              onChange={(key, val) => setForm(p => ({ ...p, permissions: { ...p.permissions, [key]: val } }))}
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-fp-border">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-fp-border text-fp-muted rounded-lg hover:text-fp-text transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 text-sm font-semibold bg-fp-brand text-white rounded-lg hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Role'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Member edit modal ─────────────────────────────────────────────────────────
function MemberModal({ member, roles, onSave, onClose }) {
  const [roleId, setRoleId] = useState(member.org_role_id || '')
  const [overrides, setOverrides] = useState(member.permission_overrides || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const selectedRole = roles.find(r => r.id === roleId) || null

  const handleOverride = (key, val) => {
    setOverrides(prev => {
      const next = { ...prev }
      if (val === null) { delete next[key] } else { next[key] = val }
      return next
    })
  }

  const overrideCount = Object.keys(overrides).length

  const handleSave = async () => {
    setSaving(true); setError(null)
    const { error } = await supabase.from('profiles').update({
      org_role_id: roleId || null,
      permission_overrides: overrides,
    }).eq('id', member.id)
    setSaving(false)
    if (error) { setError(error.message); return }
    onSave({ ...member, org_role_id: roleId || null, permission_overrides: overrides, org_roles: selectedRole })
  }

  const rolePerms = selectedRole ? { ...Object.fromEntries(PERMISSION_AREAS.map(a => [a.key, 'write'])), ...(selectedRole.permissions || {}) } : null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-12 px-4 overflow-y-auto">
      <div className="bg-fp-card border border-fp-border rounded-2xl w-full max-w-lg mb-12">
        <div className="flex items-center justify-between px-6 py-4 border-b border-fp-border">
          <div>
            <h3 className="text-fp-text font-bold text-base">{member.full_name || member.email}</h3>
            <p className="text-fp-muted text-xs mt-0.5">{member.email}</p>
          </div>
          <button onClick={onClose} className="text-fp-muted hover:text-fp-text transition-colors text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="text-fp-muted text-xs mb-1.5 block font-semibold">Assigned Role</label>
            <select
              value={roleId}
              onChange={e => { setRoleId(e.target.value); setOverrides({}) }}
              className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
            >
              <option value="">No custom role (full access)</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {selectedRole?.description && (
              <p className="text-fp-muted text-xs mt-1.5">{selectedRole.description}</p>
            )}
          </div>

          <div className="border-t border-fp-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-fp-text text-sm font-semibold">Permissions</p>
              {overrideCount > 0 && (
                <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                  {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <UserPermissionOverrides
              rolePermissions={rolePerms}
              overrides={overrides}
              onChange={handleOverride}
              isAdminRole={selectedRole?.is_admin || false}
            />
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-fp-border">
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-fp-border text-fp-muted rounded-lg hover:text-fp-text transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 text-sm font-semibold bg-fp-brand text-white rounded-lg hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Permissions'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TeamSettingsTab({ featureDesignerOnly }) {
  const [tab, setTab] = useState('members')
  const [roles, setRoles] = useState([])
  const [members, setMembers] = useState([])
  const [orgId, setOrgId] = useState(null)
  const [loading, setLoading] = useState(true)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', org_role: 'rep' })
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [inviteSuccess, setInviteSuccess] = useState(null)

  const [editRole, setEditRole] = useState(null)   // null = closed, {} = new, {id,...} = edit
  const [editMember, setEditMember] = useState(null)

  const [deletingRoleId, setDeletingRoleId] = useState(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
      if (!profile?.org_id) { setLoading(false); return }
      setOrgId(profile.org_id)

      const [{ data: rolesData }, { data: membersData }] = await Promise.all([
        supabase.from('org_roles').select('*').eq('org_id', profile.org_id).order('created_at'),
        supabase.from('profiles')
          .select('id, full_name, email, org_role, org_role_id, permission_overrides, created_at, org_roles(id, name, is_admin)')
          .eq('org_id', profile.org_id)
          .order('created_at'),
      ])
      setRoles(rolesData || [])
      setMembers(membersData || [])
      setLoading(false)
    }
    load()
  }, [])

  const handleInvite = async () => {
    if (!inviteForm.email || !inviteForm.full_name) { setInviteError('Name and email are required'); return }
    setInviting(true); setInviteError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/invite-team-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: inviteForm.email, fullName: inviteForm.full_name, orgId, orgRole: inviteForm.org_role })
      })
      const result = await res.json()
      if (result.error) { setInviteError(result.error); return }
      setInviteSuccess(`Invite sent to ${inviteForm.email}`)
      setInviteForm({ email: '', full_name: '', org_role: 'rep' })
      setShowInvite(false)
    } catch (err) {
      setInviteError('Failed: ' + (err?.message || String(err)))
    } finally {
      setInviting(false)
    }
  }

  const handleRoleSaved = (savedRole) => {
    setRoles(prev => {
      const idx = prev.findIndex(r => r.id === savedRole.id)
      return idx >= 0 ? prev.map(r => r.id === savedRole.id ? savedRole : r) : [...prev, savedRole]
    })
    setEditRole(null)
  }

  const handleDeleteRole = async (roleId) => {
    const inUse = members.some(m => m.org_role_id === roleId)
    if (inUse) { alert('This role is assigned to one or more members. Remove it from all members first.'); return }
    if (!confirm('Delete this role?')) return
    setDeletingRoleId(roleId)
    await supabase.from('org_roles').delete().eq('id', roleId)
    setRoles(prev => prev.filter(r => r.id !== roleId))
    setDeletingRoleId(null)
  }

  const handleMemberSaved = (savedMember) => {
    setMembers(prev => prev.map(m => m.id === savedMember.id ? savedMember : m))
    setEditMember(null)
  }

  const roleMemberCount = (roleId) => members.filter(m => m.org_role_id === roleId).length

  const inputClass = "w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <svg className="w-5 h-5 animate-spin text-fp-brand" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Modals */}
      {editRole !== null && (
        <RoleModal
          role={editRole?.id ? editRole : null}
          orgId={orgId}
          onSave={handleRoleSaved}
          onClose={() => setEditRole(null)}
        />
      )}
      {editMember !== null && (
        <MemberModal
          member={editMember}
          roles={roles}
          onSave={handleMemberSaved}
          onClose={() => setEditMember(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-fp-text font-bold text-lg">Team & Permissions</h3>
          <p className="text-fp-muted text-sm mt-0.5">Manage roles, members, and what each person can access.</p>
        </div>
        <button onClick={() => setShowInvite(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-fp-brand text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Invite Member
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-fp-card border border-fp-border rounded-xl p-5 space-y-3">
          <h4 className="text-fp-text font-semibold text-sm">Invite Team Member</h4>
          {inviteError && <p className="text-red-400 text-xs">{inviteError}</p>}
          {inviteSuccess && <p className="text-green-400 text-xs">{inviteSuccess}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Full Name</label>
              <input type="text" value={inviteForm.full_name} onChange={e => setInviteForm(p => ({ ...p, full_name: e.target.value }))}
                placeholder="Jane Smith" className={inputClass} />
            </div>
            <div>
              <label className="text-fp-muted text-xs mb-1 block">Email</label>
              <input type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                placeholder="jane@company.com" className={inputClass} />
            </div>
          </div>
          {!featureDesignerOnly && (
            <div>
              <label className="text-fp-muted text-xs mb-1 block">System Role</label>
              <select value={inviteForm.org_role} onChange={e => setInviteForm(p => ({ ...p, org_role: e.target.value }))} className={inputClass}>
                <option value="rep">Member</option>
                <option value="admin">Admin</option>
              </select>
              <p className="text-fp-muted text-xs mt-1">You can assign a custom role with detailed permissions after they join.</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setShowInvite(false)} className="flex-1 py-2 text-sm border border-fp-border text-fp-muted rounded-lg hover:text-fp-text transition-colors">Cancel</button>
            <button onClick={handleInvite} disabled={inviting}
              className="flex-1 py-2 text-sm font-semibold bg-fp-brand text-white rounded-lg hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-fp-border">
        {[['members', 'Members'], ['roles', 'Roles']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key ? 'border-fp-brand text-fp-brand' : 'border-transparent text-fp-muted hover:text-fp-text'
            }`}>
            {label}
            {key === 'members' && <span className="ml-1.5 text-xs text-fp-muted">({members.length})</span>}
            {key === 'roles' && <span className="ml-1.5 text-xs text-fp-muted">({roles.length})</span>}
          </button>
        ))}
      </div>

      {/* Members tab */}
      {tab === 'members' && (
        <div className="bg-fp-card border border-fp-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-fp-border bg-fp-inset">
                <th className="text-left px-4 py-2.5 font-medium text-fp-muted">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-fp-muted">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-fp-muted">Custom Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-fp-muted">Overrides</th>
                <th className="text-left px-4 py-2.5 font-medium text-fp-muted">Joined</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-fp-border/50">
              {members.map(m => {
                const overrideCount = Object.keys(m.permission_overrides || {}).length
                return (
                  <tr key={m.id} className="hover:bg-fp-inset/50">
                    <td className="px-4 py-2.5 text-fp-text font-medium">{m.full_name || '—'}</td>
                    <td className="px-4 py-2.5 text-fp-muted text-xs">{m.email}</td>
                    <td className="px-4 py-2.5">
                      {m.org_roles ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.org_roles.is_admin ? 'bg-fp-brand/20 text-fp-brand' : 'bg-fp-inset text-fp-muted border border-fp-border'}`}>
                          {m.org_roles.name}
                        </span>
                      ) : (
                        <span className="text-fp-muted text-xs">
                          {m.org_role === 'admin' ? <span className="text-fp-brand text-xs font-medium">Admin</span> : '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {overrideCount > 0 ? (
                        <span className="text-xs text-yellow-400">{overrideCount} override{overrideCount !== 1 ? 's' : ''}</span>
                      ) : <span className="text-fp-muted text-xs">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-fp-muted text-xs">{m.created_at ? new Date(m.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setEditMember(m)}
                        className="text-fp-muted hover:text-fp-brand text-xs transition-colors font-medium">
                        Edit permissions
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Roles tab */}
      {tab === 'roles' && (
        <div className="space-y-3">
          <button onClick={() => setEditRole({})}
            className="w-full py-3 border border-dashed border-fp-border rounded-xl text-fp-muted hover:text-fp-text hover:border-fp-brand text-sm transition-colors">
            + Create New Role
          </button>

          {roles.length === 0 && (
            <div className="text-center py-12 text-fp-muted text-sm">
              No custom roles yet. Create one to define permission templates for your team.
            </div>
          )}

          {roles.map(role => {
            const memberCount = roleMemberCount(role.id)
            const areaCount = PERMISSION_AREAS.length
            const noneCount = role.is_admin ? 0 : PERMISSION_AREAS.filter(a => (role.permissions?.[a.key] ?? 'write') === 'none').length
            const readCount = role.is_admin ? 0 : PERMISSION_AREAS.filter(a => (role.permissions?.[a.key] ?? 'write') === 'read').length
            return (
              <div key={role.id} className="bg-fp-card border border-fp-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-fp-text font-semibold text-sm">{role.name}</h4>
                      {role.is_admin && (
                        <span className="text-xs bg-fp-brand/20 text-fp-brand px-2 py-0.5 rounded-full">Admin</span>
                      )}
                      <span className="text-xs bg-fp-inset text-fp-muted px-2 py-0.5 rounded-full border border-fp-border capitalize">
                        Nav: {role.base_role?.replace('_', ' ') || 'rep'}
                      </span>
                    </div>
                    {role.description && <p className="text-fp-muted text-xs mt-0.5">{role.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-fp-muted">
                      <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
                      {!role.is_admin && (
                        <>
                          {noneCount > 0 && <span className="text-red-400">{noneCount} hidden</span>}
                          {readCount > 0 && <span className="text-blue-400">{readCount} view-only</span>}
                          {noneCount === 0 && readCount === 0 && <span className="text-green-400">Full access</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setEditRole(role)}
                      className="px-3 py-1.5 text-xs border border-fp-border text-fp-muted rounded-lg hover:text-fp-text transition-colors">
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteRole(role.id)}
                      disabled={deletingRoleId === role.id}
                      className="px-3 py-1.5 text-xs border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-40">
                      {deletingRoleId === role.id ? '...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
