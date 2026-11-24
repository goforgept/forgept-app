import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { useProfile } from '../../context/ProfileContext'

// ── Palette ──────────────────────────────────────────────────────────────────
export const TAG_COLORS = {
  slate:  '#64748b',
  red:    '#dc2626',
  orange: '#ea580c',
  amber:  '#d97706',
  green:  '#16a34a',
  teal:   '#0d9488',
  blue:   '#2563eb',
  indigo: '#6366f1',
  purple: '#9333ea',
  pink:   '#db2777',
}
const COLOR_KEYS = Object.keys(TAG_COLORS)
const hexFor = (c) => TAG_COLORS[c] || TAG_COLORS.slate

// Link tables per record type
export const TAG_LINKS = {
  client:   { table: 'client_tags',   col: 'client_id' },
  contact:  { table: 'contact_tags',  col: 'contact_id' },
  proposal: { table: 'proposal_tags', col: 'proposal_id' },
}

// ── Name matching (keeps the tag list clean) ─────────────────────────────────
const norm = (s) => (s || '').trim().replace(/\s+/g, ' ')
const key = (s) => norm(s).toLowerCase()
const loose = (s) => key(s).replace(/[^a-z0-9]/g, '').replace(/(es|s)$/, '')

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      // swapped neighbours ("teir" vs "tier") count as one typo
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
    }
  return dp[a.length][b.length]
}

const digits = (s) => (s.match(/\d+/g) || []).join(',')

/** Existing tag that is probably what the user meant ("Hospitals" → "Hospital", "Teir 1" → "Tier 1"). */
export function findSimilarTag(name, tags) {
  const l = loose(name)
  if (!l) return null
  const exact = tags.find(t => loose(t.name) === l)
  if (exact) return exact
  if (l.length < 4) return null
  // Typos only: same first letter, same numbers ("ISC 2025" is not "ISC 2026"), 1–2 edits
  return tags.find(t => {
    const o = loose(t.name)
    return o[0] === l[0] && digits(o) === digits(l) && editDistance(o, l) <= (l.length >= 8 ? 2 : 1)
  }) || null
}

// Supabase caps selects at 1000 rows; page through link tables.
async function fetchAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error || !data) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// ── Hook: org tag library + links ────────────────────────────────────────────
/**
 * Loads the org's tags and which records carry them.
 * `entities` limits which link tables load, e.g. ['client', 'proposal'].
 */
export function useTags(entities = ['client', 'contact', 'proposal']) {
  const { profile } = useProfile()
  const orgId = profile?.org_id
  const isAdmin = profile?.org_role === 'admin' || profile?.role === 'admin'
  const [tags, setTags] = useState([])
  const [links, setLinks] = useState({ client: {}, contact: {}, proposal: {} })
  const [adminOnly, setAdminOnly] = useState(false)
  const [ready, setReady] = useState(false)
  const entityKey = entities.join(',')

  const reload = useCallback(async () => {
    if (!orgId) return
    const ents = entityKey.split(',').filter(Boolean)
    const [{ data: tagRows }, { data: org }, ...linkRows] = await Promise.all([
      supabase.from('tags').select('id, name, color').eq('org_id', orgId).order('name'),
      supabase.from('organizations').select('tags_admin_only').eq('id', orgId).maybeSingle(),
      ...ents.map(e => fetchAll(() => supabase.from(TAG_LINKS[e].table).select(`${TAG_LINKS[e].col}, tag_id`).eq('org_id', orgId))),
    ])
    const next = { client: {}, contact: {}, proposal: {} }
    ents.forEach((e, i) => {
      for (const row of linkRows[i]) {
        const id = row[TAG_LINKS[e].col]
        ;(next[e][id] ||= []).push(row.tag_id)
      }
    })
    setTags(tagRows || [])
    setAdminOnly(!!org?.tags_admin_only)
    setLinks(next)
    setReady(true)
  }, [orgId, entityKey])

  useEffect(() => { reload() }, [reload])

  const tagById = useMemo(() => Object.fromEntries(tags.map(t => [t.id, t])), [tags])

  /** Tag objects on a record, sorted by name. */
  const tagsFor = useCallback((entity, id) =>
    (links[entity]?.[id] || []).map(tid => tagById[tid]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)),
  [links, tagById])

  const add = useCallback(async (entity, id, tagId) => {
    if ((links[entity]?.[id] || []).includes(tagId)) return
    setLinks(prev => ({ ...prev, [entity]: { ...prev[entity], [id]: [...(prev[entity][id] || []), tagId] } }))
    const { table, col } = TAG_LINKS[entity]
    const { error } = await supabase.from(table).insert({ [col]: id, tag_id: tagId, org_id: orgId })
    if (error && error.code !== '23505') reload()
  }, [links, orgId, reload])

  const remove = useCallback(async (entity, id, tagId) => {
    setLinks(prev => ({ ...prev, [entity]: { ...prev[entity], [id]: (prev[entity][id] || []).filter(t => t !== tagId) } }))
    const { table, col } = TAG_LINKS[entity]
    const { error } = await supabase.from(table).delete().eq(col, id).eq('tag_id', tagId)
    if (error) reload()
  }, [reload])

  /** Create a tag (or return the existing one with the same name). */
  const create = useCallback(async (name, color) => {
    const clean = norm(name).slice(0, 40)
    if (!clean) return null
    const existing = tags.find(t => key(t.name) === key(clean))
    if (existing) return existing
    const pick = color || COLOR_KEYS[tags.length % COLOR_KEYS.length]
    const { data, error } = await supabase.from('tags')
      .insert({ org_id: orgId, name: clean, color: pick, created_by: profile?.id })
      .select('id, name, color').single()
    if (error) {
      // Someone else created it a moment ago — reload and use theirs
      if (error.code === '23505') {
        const { data: row } = await supabase.from('tags').select('id, name, color').eq('org_id', orgId).ilike('name', clean).maybeSingle()
        if (row) { setTags(prev => [...prev, row]); return row }
      }
      return { error: error.message }
    }
    setTags(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    return data
  }, [tags, orgId, profile?.id])

  return { tags, tagById, links, tagsFor, add, remove, create, reload, ready, canCreate: isAdmin || !adminOnly, isAdmin, adminOnly, setAdminOnly }
}

// ── Chip ─────────────────────────────────────────────────────────────────────
export function TagChip({ tag, dim = false, onRemove, title }) {
  const hex = hexFor(tag.color)
  return (
    <span title={title || tag.name}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold leading-tight whitespace-nowrap ${dim ? 'opacity-60' : ''}`}
      style={{ backgroundColor: `${hex}1f`, color: hex, border: `1px ${dim ? 'dashed' : 'solid'} ${hex}55` }}>
      {tag.name}
      {onRemove && (
        <button type="button" onClick={e => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 -mr-0.5 hover:opacity-70 focus:outline-none" aria-label={`Remove ${tag.name}`}>×</button>
      )}
    </span>
  )
}

/** Read-only chip row. `inherited` chips render dimmed (e.g. client tags shown on a proposal). */
export function TagList({ tags = [], inherited = [], max = 4, inheritedTitle = 'From client' }) {
  const own = new Set(tags.map(t => t.id))
  const all = [...tags.map(t => ({ t, dim: false })), ...inherited.filter(t => !own.has(t.id)).map(t => ({ t, dim: true }))]
  if (!all.length) return null
  const shown = all.slice(0, max)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map(({ t, dim }) => <TagChip key={`${t.id}${dim ? 'i' : ''}`} tag={t} dim={dim} title={dim ? `${t.name} · ${inheritedTitle}` : t.name} />)}
      {all.length > max && <span className="text-fp-muted text-xs">+{all.length - max}</span>}
    </div>
  )
}

// ── Editor: chips + "+ Tag" with autocomplete ────────────────────────────────
export function TagEditor({ api, entity, id, canEdit = true, inherited = [], inheritedTitle = 'From client' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef(null)
  const current = api.tagsFor(entity, id)
  const currentIds = new Set(current.map(t => t.id))

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) { setOpen(false); setQ(''); setErr(null) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const query = norm(q)
  const matches = api.tags
    .filter(t => !currentIds.has(t.id))
    .filter(t => !query || key(t.name).includes(key(query)))
    .slice(0, 8)
  const exact = api.tags.find(t => key(t.name) === key(query))
  const similar = query && !exact ? findSimilarTag(query, api.tags) : null
  const showCreate = query && !exact && api.canCreate

  const pick = async (tag) => {
    await api.add(entity, id, tag.id)
    setQ(''); setErr(null)
  }
  const createAndAdd = async () => {
    setBusy(true)
    const t = await api.create(query)
    setBusy(false)
    if (!t || t.error) { setErr(t?.error || 'Could not create tag'); return }
    await pick(t)
  }
  const onKey = (e) => {
    if (e.key === 'Escape') { setOpen(false); setQ('') }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (exact && !currentIds.has(exact.id)) pick(exact)
      else if (matches.length === 1) pick(matches[0])
      else if (showCreate && !similar) createAndAdd()
    }
  }

  const inheritedShown = inherited.filter(t => !currentIds.has(t.id))

  return (
    <div className="flex flex-wrap items-center gap-1.5" ref={boxRef} onClick={e => e.stopPropagation()}>
      {current.map(t => <TagChip key={t.id} tag={t} onRemove={canEdit ? () => api.remove(entity, id, t.id) : undefined} />)}
      {inheritedShown.map(t => <TagChip key={`i${t.id}`} tag={t} dim title={`${t.name} · ${inheritedTitle}`} />)}
      {canEdit && (
        <div className="relative">
          <button type="button" onClick={() => setOpen(o => !o)}
            className="text-xs px-2 py-0.5 rounded-full border border-dashed border-fp-border text-fp-muted hover:text-fp-text hover:border-fp-brand transition-colors">
            + Tag
          </button>
          {open && (
            <div className="absolute z-50 mt-1 left-0 w-64 bg-fp-card border border-fp-border rounded-lg shadow-xl p-2">
              <input autoFocus value={q} onChange={e => { setQ(e.target.value); setErr(null) }} onKeyDown={onKey}
                placeholder={api.canCreate ? 'Find or create a tag…' : 'Find a tag…'} maxLength={40}
                className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-fp-brand" />
              <div className="mt-1.5 max-h-56 overflow-y-auto space-y-0.5">
                {similar && !currentIds.has(similar.id) && (
                  <button type="button" onClick={() => pick(similar)}
                    className="w-full text-left px-2 py-1.5 rounded-md bg-fp-brand/10 hover:bg-fp-brand/20 text-xs text-fp-text flex items-center gap-2">
                    <span className="text-fp-muted">Did you mean</span> <TagChip tag={similar} />
                  </button>
                )}
                {matches.map(t => (
                  <button key={t.id} type="button" onClick={() => pick(t)}
                    className="w-full text-left px-2 py-1 rounded-md hover:bg-fp-hover flex items-center">
                    <TagChip tag={t} />
                  </button>
                ))}
                {showCreate && (
                  <button type="button" onClick={createAndAdd} disabled={busy}
                    className="w-full text-left px-2 py-1.5 rounded-md hover:bg-fp-hover text-xs text-fp-muted">
                    {busy ? 'Creating…' : <>Create <span className="text-fp-text font-semibold">“{query}”</span>{similar ? ' anyway' : ''}</>}
                  </button>
                )}
                {query && !exact && !api.canCreate && (
                  <p className="px-2 py-1.5 text-xs text-fp-muted">Only admins can create new tags.</p>
                )}
                {!query && matches.length === 0 && (
                  <p className="px-2 py-1.5 text-xs text-fp-muted">{api.tags.length ? 'All tags already added.' : 'No tags yet. Type to create one.'}</p>
                )}
                {err && <p className="px-2 py-1 text-xs text-red-400">{err}</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Filter ───────────────────────────────────────────────────────────────────
export const EMPTY_TAG_FILTER = { mode: 'any', ids: [] }

/** Does a record with these tag ids pass the filter? */
export function matchTagFilter(tagIds, filter) {
  if (!filter?.ids?.length) return true
  const have = new Set(tagIds)
  if (filter.mode === 'all')  return filter.ids.every(id => have.has(id))
  if (filter.mode === 'none') return !filter.ids.some(id => have.has(id))
  return filter.ids.some(id => have.has(id))
}

export function TagFilter({ tags, value = EMPTY_TAG_FILTER, onChange }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  if (!tags.length) return null
  const selected = new Set(value.ids)
  const toggle = (id) => onChange({ ...value, ids: selected.has(id) ? value.ids.filter(x => x !== id) : [...value.ids, id] })
  const label = value.ids.length
    ? `${value.mode === 'none' ? 'Not tagged' : 'Tags'}: ${value.ids.length === 1 ? tags.find(t => t.id === value.ids[0])?.name : value.ids.length}`
    : 'Tags'
  return (
    <div className="relative" ref={boxRef}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`h-full bg-fp-card border rounded-lg px-3 py-2 text-sm transition-colors ${value.ids.length ? 'border-fp-brand text-fp-text' : 'border-fp-border text-fp-muted hover:text-fp-text'}`}>
        {label} ▾
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 w-64 bg-fp-card border border-fp-border rounded-lg shadow-xl p-2">
          <div className="flex gap-1 mb-2">
            {[['any', 'Any of'], ['all', 'All of'], ['none', 'None of']].map(([m, l]) => (
              <button key={m} type="button" onClick={() => onChange({ ...value, mode: m })}
                className={`flex-1 text-xs py-1 rounded-md font-semibold ${value.mode === m ? 'bg-fp-brand text-white' : 'text-fp-muted hover:text-fp-text bg-fp-inset'}`}>{l}</button>
            ))}
          </div>
          <div className="max-h-64 overflow-y-auto space-y-0.5">
            {tags.map(t => (
              <label key={t.id} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-fp-hover cursor-pointer">
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="accent-[#C8622A]" />
                <TagChip tag={t} />
              </label>
            ))}
          </div>
          {value.ids.length > 0 && (
            <button type="button" onClick={() => onChange(EMPTY_TAG_FILTER)} className="mt-2 w-full text-xs text-fp-muted hover:text-fp-text">Clear</button>
          )}
        </div>
      )}
    </div>
  )
}
