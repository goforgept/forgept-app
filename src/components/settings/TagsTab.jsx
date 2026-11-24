import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { useProfile } from '../../context/ProfileContext'
import { useTags, TagChip, TAG_COLORS } from '../tags/tags'

const inputClass = "bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-fp-brand"

export default function TagsTab() {
  const { profile } = useProfile()
  const api = useTags(['client', 'contact', 'proposal'])
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null)   // tag id being renamed
  const [draft, setDraft] = useState('')
  const [merging, setMerging] = useState(null)   // tag id being merged
  const [mergeTarget, setMergeTarget] = useState('')
  const [msg, setMsg] = useState(null)

  // Usage counts per tag
  const counts = useMemo(() => {
    const c = {}
    for (const ent of ['client', 'contact', 'proposal'])
      for (const ids of Object.values(api.links[ent] || {}))
        for (const tid of ids) { c[tid] ||= { client: 0, contact: 0, proposal: 0 }; c[tid][ent]++ }
    return c
  }, [api.links])

  const flash = (text, error = false) => { setMsg({ text, error }); setTimeout(() => setMsg(null), 4000) }

  const create = async () => {
    const t = await api.create(newName)
    if (t?.error) return flash(t.error, true)
    setNewName('')
  }

  const rename = async (tag) => {
    const name = draft.trim().replace(/\s+/g, ' ')
    if (!name || name === tag.name) { setEditing(null); return }
    const clash = api.tags.find(t => t.id !== tag.id && t.name.toLowerCase() === name.toLowerCase())
    if (clash) return flash(`"${clash.name}" already exists. Use Merge instead.`, true)
    const { error } = await supabase.from('tags').update({ name }).eq('id', tag.id)
    if (error) return flash(error.message, true)
    setEditing(null); api.reload()
  }

  const recolor = async (tag, color) => {
    const { error } = await supabase.from('tags').update({ color }).eq('id', tag.id)
    if (error) return flash(error.message, true)
    api.reload()
  }

  const merge = async (tag) => {
    const target = api.tagById[mergeTarget]
    if (!target) return
    if (!window.confirm(`Merge "${tag.name}" into "${target.name}"? Everything tagged "${tag.name}" will be tagged "${target.name}", and "${tag.name}" will be deleted.`)) return
    const { error } = await supabase.rpc('merge_tags', { p_source: tag.id, p_target: target.id })
    if (error) return flash(error.message, true)
    setMerging(null); setMergeTarget(''); api.reload()
    flash(`Merged into "${target.name}".`)
  }

  const remove = async (tag) => {
    const n = counts[tag.id]; const total = n ? n.client + n.contact + n.proposal : 0
    if (!window.confirm(`Delete "${tag.name}"?${total ? ` It will be removed from ${total} record${total === 1 ? '' : 's'}.` : ''}`)) return
    const { error } = await supabase.from('tags').delete().eq('id', tag.id)
    if (error) return flash(error.message, true)
    api.reload()
  }

  const toggleAdminOnly = async () => {
    const next = !api.adminOnly
    const { error } = await supabase.from('organizations').update({ tags_admin_only: next }).eq('id', profile.org_id)
    if (error) return flash(error.message, true)
    api.setAdminOnly(next)
  }

  const usage = (id) => {
    const n = counts[id]
    if (!n) return 'Not used'
    return [n.client && `${n.client} client${n.client === 1 ? '' : 's'}`, n.contact && `${n.contact} contact${n.contact === 1 ? '' : 's'}`, n.proposal && `${n.proposal} proposal${n.proposal === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-fp-text text-lg font-bold">Tags</h3>
        <p className="text-fp-muted text-sm mt-1">One shared tag list for clients, contacts and proposals. Proposals also show their client's tags.</p>
      </div>

      {api.isAdmin && (
        <div className="flex items-center justify-between bg-fp-card rounded-xl px-5 py-3">
          <div>
            <p className="text-fp-text text-sm font-semibold">Only admins can create new tags</p>
            <p className="text-fp-muted text-xs mt-0.5">Everyone can still apply existing tags. Off by default.</p>
          </div>
          <button onClick={toggleAdminOnly} aria-label="Only admins can create new tags"
            className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${api.adminOnly ? 'bg-[#C8622A]' : 'bg-fp-border'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${api.adminOnly ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      )}

      {api.canCreate && (
        <div className="flex gap-2">
          <input id="new-tag-name" value={newName} onChange={e => setNewName(e.target.value)} maxLength={40}
            onKeyDown={e => e.key === 'Enter' && create()} placeholder="New tag name" className={`${inputClass} flex-1 max-w-xs`} />
          <button onClick={create} disabled={!newName.trim()}
            className="bg-fp-brand text-white px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40">Add Tag</button>
        </div>
      )}

      {msg && <p className={`text-sm ${msg.error ? 'text-red-400' : 'text-green-500'}`}>{msg.text}</p>}

      <div className="bg-fp-card rounded-xl divide-y divide-fp-border">
        {!api.ready ? <p className="p-5 text-fp-muted text-sm">Loading…</p>
          : api.tags.length === 0 ? <p className="p-5 text-fp-muted text-sm">No tags yet. Create one here, or from any client, contact or proposal.</p>
          : api.tags.map(tag => (
            <div key={tag.id} className="px-5 py-3 flex flex-wrap items-center gap-3">
              <div className="min-w-[10rem] flex-1">
                {editing === tag.id ? (
                  <div className="flex gap-2 items-center">
                    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} maxLength={40}
                      onKeyDown={e => { if (e.key === 'Enter') rename(tag); if (e.key === 'Escape') setEditing(null) }} className={inputClass} />
                    <button onClick={() => rename(tag)} className="text-fp-brand text-sm font-semibold">Save</button>
                    <button onClick={() => setEditing(null)} className="text-fp-muted text-sm">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <TagChip tag={tag} />
                    <span className="text-fp-muted text-xs">{usage(tag.id)}</span>
                  </div>
                )}
              </div>

              {api.isAdmin && editing !== tag.id && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex gap-1" role="group" aria-label={`Color for ${tag.name}`}>
                    {Object.entries(TAG_COLORS).map(([k, hex]) => (
                      <button key={k} onClick={() => recolor(tag, k)} aria-label={k}
                        className={`w-4 h-4 rounded-full ${tag.color === k ? 'ring-2 ring-offset-1 ring-fp-text ring-offset-fp-card' : ''}`}
                        style={{ backgroundColor: hex }} />
                    ))}
                  </div>
                  {merging === tag.id ? (
                    <div className="flex items-center gap-2">
                      <select value={mergeTarget} onChange={e => setMergeTarget(e.target.value)} className={inputClass}>
                        <option value="">Merge into…</option>
                        {api.tags.filter(t => t.id !== tag.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <button onClick={() => merge(tag)} disabled={!mergeTarget} className="text-fp-brand text-sm font-semibold disabled:opacity-40">Merge</button>
                      <button onClick={() => { setMerging(null); setMergeTarget('') }} className="text-fp-muted text-sm">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => { setEditing(tag.id); setDraft(tag.name) }} className="text-fp-muted hover:text-fp-text text-sm">Rename</button>
                      {api.tags.length > 1 && <button onClick={() => setMerging(tag.id)} className="text-fp-muted hover:text-fp-text text-sm">Merge</button>}
                      <button onClick={() => remove(tag)} className="text-red-400 hover:text-red-300 text-sm">Delete</button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
