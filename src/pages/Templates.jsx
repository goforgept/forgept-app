import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const mkKey = () => `_${Date.now()}_${Math.random().toString(36).slice(2)}`

const emptyLine = (markup = 35, sectionId = null) => ({
  _key: mkKey(), item_name: '', part_number_sku: '', quantity: '1', unit: 'ea',
  category: '', vendor: '', your_cost_unit: '', markup_percent: String(markup),
  customer_price_unit: '', section_id: sectionId,
})

const emptyLaborLine = (markup = 35) => ({
  role: '', quantity: '', unit: 'hr', your_cost: '', markup, customer_price: 0,
})

const emptySection = (sortOrder = 0) => ({
  _id: mkKey(), name: '', sort_order: sortOrder, include_labor: false, labor_items: [], isNew: true,
})

const emptyTemplate = { name: '', description: '', industry: '' }
const industries = ['Electrical', 'Mechanical', 'Plumbing', 'HVAC', 'Audio/Visual', 'Security', 'General Contractor', 'Other']
const matCategories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Other']
const unitOptions = ['ea', 'ft', 'lot', 'hr', 'box', 'roll']

export default function Templates({ isAdmin }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState(null)
  const [defaultMarkup, setDefaultMarkup] = useState(35)
  const [laborRates, setLaborRates] = useState([])

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyTemplate)
  const [lines, setLines] = useState([])
  const [laborItems, setLaborItems] = useState([])
  const [sections, setSections] = useState([])
  const [saving, setSaving] = useState(false)

  // Edit modal
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [editForm, setEditForm] = useState(emptyTemplate)
  const [editLines, setEditLines] = useState([])
  const [editLaborItems, setEditLaborItems] = useState([])
  const [editSections, setEditSections] = useState([])
  const [editSaving, setEditSaving] = useState(false)

  // Expand for view
  const [expandedId, setExpandedId] = useState(null)
  const [templateData, setTemplateData] = useState({}) // { [id]: { lines, sections } }

  // UI
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Library search
  const [libTarget, setLibTarget] = useState(null) // 'create' | 'edit'
  const [libQuery, setLibQuery] = useState('')
  const [libResults, setLibResults] = useState([])
  const [libLoading, setLibLoading] = useState(false)
  const [libSelected, setLibSelected] = useState(new Set())
  const [libSectionId, setLibSectionId] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles')
      .select('org_id, default_markup_percent').eq('id', user.id).single()
    if (!profile?.org_id) { setLoading(false); return }
    setOrgId(profile.org_id)
    const markup = parseFloat(profile.default_markup_percent) || 35
    setDefaultMarkup(markup)

    const [{ data: tmplData }, { data: rates }] = await Promise.all([
      supabase.from('templates').select('*').eq('org_id', profile.org_id).order('name'),
      supabase.from('labor_rates').select('role, cost_per_hour, bill_rate_per_hour, unit').eq('org_id', profile.org_id).order('sort_order'),
    ])
    setTemplates(tmplData || [])
    setLaborRates(rates || [])
    setLoading(false)
  }

  const fetchTemplateData = async (templateId) => {
    if (templateData[templateId]) return
    const [{ data: linesData }, { data: sectData }] = await Promise.all([
      supabase.from('template_line_items').select('*').eq('template_id', templateId).order('id'),
      supabase.from('template_sections').select('*').eq('template_id', templateId).order('sort_order'),
    ])
    setTemplateData(prev => ({ ...prev, [templateId]: { lines: linesData || [], sections: sectData || [] } }))
  }

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    await fetchTemplateData(id)
  }

  // ── Line helpers ─────────────────────────────────────────────────────────
  const recalcLine = (row, field) => {
    if (field === 'your_cost_unit' || field === 'markup_percent') {
      const cost = parseFloat(row.your_cost_unit) || 0
      const mkp = parseFloat(row.markup_percent) || 0
      if (cost > 0) return { ...row, customer_price_unit: (cost * (1 + mkp / 100)).toFixed(2) }
    }
    return row
  }

  const updateLineByKey = (setter, key, field, value) => {
    setter(prev => prev.map(l => {
      if (l._key !== key) return l
      const updated = { ...l, [field]: value }
      return recalcLine(updated, field)
    }))
  }

  // ── Labor helpers ─────────────────────────────────────────────────────────
  const recalcLabor = (row, changedField) => {
    const r = { ...row }
    if (changedField === 'role') {
      const matched = laborRates.find(lr => lr.role === r.role)
      if (matched) {
        r.your_cost = String(matched.cost_per_hour || '')
        r.unit = matched.unit || 'hr'
        const cost = parseFloat(matched.cost_per_hour) || 0
        const bill = parseFloat(matched.bill_rate_per_hour) || 0
        if (cost > 0 && bill > 0) r.markup = (((bill - cost) / cost) * 100).toFixed(1)
      }
    }
    const qty = parseFloat(r.quantity) || 0
    const cost = parseFloat(r.your_cost) || 0
    const mkp = parseFloat(r.markup) || 0
    const cp = parseFloat(r.customer_price) || 0
    if (['role', 'your_cost', 'markup', 'quantity'].includes(changedField)) {
      if (cost > 0 && qty > 0) r.customer_price = (cost * (1 + mkp / 100) * qty).toFixed(2)
    } else if (changedField === 'customer_price') {
      if (cp > 0 && qty > 0) {
        if (cost > 0) r.markup = (((cp / qty) / cost - 1) * 100).toFixed(1)
        else if (mkp >= 0) r.your_cost = (cp / (1 + mkp / 100) / qty).toFixed(2)
      }
    }
    return r
  }

  const updateLaborRow = (setter, index, field, value) =>
    setter(prev => { const u = [...prev]; u[index] = recalcLabor({ ...u[index], [field]: value }, field); return u })

  // ── Section helpers (works for both create and edit) ──────────────────────
  const addSection = (setSect, existingSects) =>
    setSect(prev => [...prev, emptySection(existingSects.length)])

  const updateSection = (setSect, sectionId, field, value) =>
    setSect(prev => prev.map(s => s._id === sectionId ? { ...s, [field]: value } : s))

  const deleteSection = (setSect, setLns, sectionId) => {
    setSect(prev => prev.filter(s => s._id !== sectionId))
    setLns(prev => prev.map(l => l.section_id === sectionId ? { ...l, section_id: null } : l))
  }

  const updateSectionLabor = (setSect, sectionId, index, field, value) =>
    setSect(prev => prev.map(s => {
      if (s._id !== sectionId) return s
      const updated = [...(s.labor_items || [])]
      updated[index] = recalcLabor({ ...updated[index], [field]: value }, field)
      return { ...s, labor_items: updated }
    }))

  const addSectionLaborLine = (setSect, sectionId) =>
    setSect(prev => prev.map(s => s._id !== sectionId ? s
      : { ...s, labor_items: [...(s.labor_items || []), emptyLaborLine(defaultMarkup)] }))

  const removeSectionLaborLine = (setSect, sectionId, index) =>
    setSect(prev => prev.map(s => s._id !== sectionId ? s
      : { ...s, labor_items: (s.labor_items || []).filter((_, i) => i !== index) }))

  // ── Product library ───────────────────────────────────────────────────────
  const searchLibrary = async (q) => {
    setLibQuery(q)
    if (!q.trim()) { setLibResults([]); return }
    setLibLoading(true)
    const { data } = await supabase.from('product_library')
      .select('*, product_library_pricing(*)')
      .eq('org_id', orgId).eq('active', true)
      .or(`item_name.ilike.%${q}%,part_number.ilike.%${q}%,manufacturer.ilike.%${q}%,category.ilike.%${q}%`)
      .limit(30)
    setLibResults(data || [])
    setLibLoading(false)
  }

  const toggleLibItem = (id) =>
    setLibSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const addLibraryItems = (setter) => {
    const STALE = 120
    const newLines = []
    libResults.forEach(prod => {
      if (!libSelected.has(prod.id)) return
      const pricing = prod.product_library_pricing?.[0]
      const days = pricing?.pricing_date
        ? Math.floor((Date.now() - new Date(pricing.pricing_date)) / 86400000) : null
      const isStale = !pricing || days === null || days > STALE
      const cost = parseFloat(pricing?.your_cost) || 0
      newLines.push({
        _key: mkKey(),
        item_name: prod.item_name,
        part_number_sku: prod.part_number || '',
        quantity: '1', unit: prod.unit || 'ea', category: prod.category || '',
        vendor: pricing?.vendor || '',
        your_cost_unit: isStale ? '' : String(cost),
        markup_percent: String(defaultMarkup),
        customer_price_unit: isStale ? '' : (cost * (1 + defaultMarkup / 100)).toFixed(2),
        section_id: libSectionId,
      })
    })
    setter(prev => [...prev, ...newLines])
    setLibTarget(null); setLibQuery(''); setLibResults([]); setLibSelected(new Set()); setLibSectionId(null)
  }

  const closeLib = () => {
    setLibTarget(null); setLibQuery(''); setLibResults([]); setLibSelected(new Set()); setLibSectionId(null)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name) { setError('Template name is required'); return }
    setSaving(true); setError(null)

    const { data: template, error: tErr } = await supabase.from('templates')
      .insert({ ...form, org_id: orgId, labor_items: laborItems })
      .select().single()
    if (tErr) { setError(tErr.message); setSaving(false); return }

    const idMap = {}
    for (const s of sections) {
      const { data: ns } = await supabase.from('template_sections').insert({
        template_id: template.id, org_id: orgId, name: s.name || 'Untitled Section',
        sort_order: s.sort_order, include_labor: s.include_labor, labor_items: s.labor_items || [],
      }).select().single()
      if (ns) idMap[s._id] = ns.id
    }

    const validLines = lines.filter(l => l.item_name.trim())
    if (validLines.length > 0) {
      await supabase.from('template_line_items').insert(validLines.map(l => ({
        template_id: template.id, item_name: l.item_name, part_number_sku: l.part_number_sku,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit, category: l.category, vendor: l.vendor,
        your_cost_unit: parseFloat(l.your_cost_unit) || null,
        markup_percent: parseFloat(l.markup_percent) || defaultMarkup,
        customer_price_unit: parseFloat(l.customer_price_unit) || null,
        section_id: l.section_id ? (idMap[l.section_id] || null) : null,
      })))
    }

    setSuccess('Template saved!')
    setForm(emptyTemplate); setLines([]); setLaborItems([]); setSections([])
    setShowForm(false); setSaving(false); fetchData()
  }

  const startEditing = async (template) => {
    setEditingTemplate(template.id)
    setEditForm({ name: template.name, description: template.description || '', industry: template.industry || '' })
    setEditLaborItems(template.labor_items?.length ? template.labor_items : [])
    if (!templateData[template.id]) await fetchTemplateData(template.id)
    const td = templateData[template.id] || { lines: [], sections: [] }
    const sects = td.sections.map(s => ({ ...s, _id: s.id, labor_items: s.labor_items || [] }))
    setEditSections(sects)
    setEditLines(td.lines.map(l => ({ ...l, _key: mkKey() })))
    closeLib(); setExpandedId(null)
  }

  const saveEdit = async (templateId) => {
    setEditSaving(true); setError(null)

    await supabase.from('templates').update({
      name: editForm.name, description: editForm.description,
      industry: editForm.industry, labor_items: editLaborItems,
    }).eq('id', templateId)

    const idMap = {}
    for (const s of editSections) {
      if (s.isNew) {
        const { data: ns } = await supabase.from('template_sections').insert({
          template_id: templateId, org_id: orgId, name: s.name || 'Untitled Section',
          sort_order: s.sort_order, include_labor: s.include_labor, labor_items: s.labor_items || [],
        }).select().single()
        if (ns) idMap[s._id] = ns.id
      } else {
        await supabase.from('template_sections').update({
          name: s.name, sort_order: s.sort_order,
          include_labor: s.include_labor, labor_items: s.labor_items || [],
        }).eq('id', s._id)
        idMap[s._id] = s._id
      }
    }
    // Delete removed sections
    const td = templateData[templateId] || { sections: [] }
    const keptIds = editSections.filter(s => !s.isNew).map(s => s._id)
    const removed = td.sections.filter(s => !keptIds.includes(s.id))
    for (const s of removed) await supabase.from('template_sections').delete().eq('id', s.id)

    await supabase.from('template_line_items').delete().eq('template_id', templateId)
    const validLines = editLines.filter(l => l.item_name.trim())
    if (validLines.length > 0) {
      await supabase.from('template_line_items').insert(validLines.map(l => ({
        template_id: templateId, item_name: l.item_name, part_number_sku: l.part_number_sku,
        quantity: parseFloat(l.quantity) || 1, unit: l.unit, category: l.category, vendor: l.vendor,
        your_cost_unit: parseFloat(l.your_cost_unit) || null,
        markup_percent: parseFloat(l.markup_percent) || defaultMarkup,
        customer_price_unit: parseFloat(l.customer_price_unit) || null,
        section_id: l.section_id ? (idMap[l.section_id] || null) : null,
      })))
    }

    setTemplateData(prev => { const n = { ...prev }; delete n[templateId]; return n })
    setEditingTemplate(null); setEditSaving(false); setSuccess('Template updated!'); fetchData()
  }

  const handleDelete = async (templateId) => {
    if (!window.confirm('Delete this template? This cannot be undone.')) return
    await supabase.from('templates').delete().eq('id', templateId)
    setTemplates(prev => prev.filter(t => t.id !== templateId))
    if (expandedId === templateId) setExpandedId(null)
    setSuccess('Template deleted')
  }

  const filtered = templates.filter(t => {
    const q = search.toLowerCase()
    return !q || t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.industry || '').toLowerCase().includes(q)
  })

  const fmt = (n) => n != null && !isNaN(n) ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'

  // ── Shared render pieces ──────────────────────────────────────────────────

  const LibraryPanel = ({ setter, activeSects }) => (
    <div className="bg-[#0a1628] rounded-xl p-4 space-y-3 border border-[#C8622A]/40 mb-4">
      <div className="flex items-center gap-3">
        <input autoFocus type="text" placeholder="Search product library…" value={libQuery}
          onChange={e => searchLibrary(e.target.value)}
          className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
        {activeSects.length > 0 && (
          <select value={libSectionId || ''} onChange={e => setLibSectionId(e.target.value || null)}
            className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
            <option value="">Add to: General</option>
            {activeSects.map(s => <option key={s._id} value={s._id}>{s.name || 'Untitled Section'}</option>)}
          </select>
        )}
        <button onClick={closeLib} className="text-[#8A9AB0] hover:text-white text-sm px-2">✕</button>
      </div>
      {libLoading && <p className="text-[#8A9AB0] text-xs">Searching…</p>}
      {!libLoading && libQuery && libResults.length === 0 && <p className="text-[#8A9AB0] text-xs">No products found.</p>}
      {libResults.length > 0 && (
        <div className="space-y-1 max-h-52 overflow-y-auto">
          {libResults.map(prod => {
            const pricing = prod.product_library_pricing?.[0]
            const cost = parseFloat(pricing?.your_cost) || 0
            return (
              <label key={prod.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a2d45] cursor-pointer">
                <input type="checkbox" checked={libSelected.has(prod.id)} onChange={() => toggleLibItem(prod.id)} className="accent-[#C8622A]" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{prod.item_name}</p>
                  <p className="text-[#8A9AB0] text-xs">{[prod.manufacturer, prod.part_number, prod.category].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${cost > 0 ? 'text-[#C8622A]' : 'text-[#8A9AB0]'}`}>
                  {cost > 0 ? `${fmt(cost)} → ${fmt(cost * (1 + defaultMarkup / 100))}` : 'No pricing'}
                </span>
              </label>
            )
          })}
        </div>
      )}
      {libSelected.size > 0 && (
        <button onClick={() => addLibraryItems(setter)}
          className="bg-[#C8622A] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors">
          Add {libSelected.size} item{libSelected.size !== 1 ? 's' : ''} to BOM
        </button>
      )}
    </div>
  )

  const roleDatalistId = `labor-roles-${Math.random().toString(36).slice(2)}`

  const LaborRow = ({ item, onUpdate, onRemove }) => (
    <tr className="border-b border-[#2a3d55]/30">
      <td className="pr-2 py-1">
        <input type="text" list={roleDatalistId} placeholder="e.g. Lead Tech" value={item.role}
          onChange={e => onUpdate('role', e.target.value)}
          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
        <datalist id={roleDatalistId}>
          {laborRates.map(r => <option key={r.role} value={r.role} />)}
        </datalist>
      </td>
      <td className="pr-2 py-1">
        <input type="number" placeholder="0" value={item.quantity} onChange={e => onUpdate('quantity', e.target.value)}
          className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <select value={item.unit || 'hr'} onChange={e => onUpdate('unit', e.target.value)}
          className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
          {['hr', 'day', 'lot'].map(u => <option key={u}>{u}</option>)}
        </select>
      </td>
      <td className="pr-2 py-1">
        <input type="number" placeholder="0.00" value={item.your_cost} onChange={e => onUpdate('your_cost', e.target.value)}
          className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <input type="number" placeholder={String(defaultMarkup)} value={item.markup} onChange={e => onUpdate('markup', e.target.value)}
          className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <input type="number" placeholder="0.00" value={item.customer_price || ''} onChange={e => onUpdate('customer_price', e.target.value)}
          className="w-24 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold" />
      </td>
      <td className="py-1"><button onClick={onRemove} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button></td>
    </tr>
  )

  const LaborTableHeader = () => (
    <tr className="border-b border-[#2a3d55]">
      {['Role', 'Qty', 'Unit', 'Your Cost/hr', 'Markup %', 'Total Labor', ''].map(h => (
        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
      ))}
    </tr>
  )

  // BOM line item row — shared between general and section groups
  const LineRow = ({ line, sects, onUpdate, onRemove }) => (
    <tr className="border-b border-[#2a3d55]/30 group">
      <td className="pr-2 py-1">
        <input type="text" placeholder="Item name" value={line.item_name}
          onChange={e => onUpdate(line._key, 'item_name', e.target.value)}
          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <input type="text" placeholder="Part #" value={line.part_number_sku}
          onChange={e => onUpdate(line._key, 'part_number_sku', e.target.value)}
          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <input type="number" placeholder="1" value={line.quantity}
          onChange={e => onUpdate(line._key, 'quantity', e.target.value)}
          className="w-14 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <select value={line.unit} onChange={e => onUpdate(line._key, 'unit', e.target.value)}
          className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
          {unitOptions.map(u => <option key={u}>{u}</option>)}
        </select>
      </td>
      <td className="pr-2 py-1">
        <select value={line.category} onChange={e => onUpdate(line._key, 'category', e.target.value)}
          className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
          <option value="">Category</option>
          {matCategories.map(c => <option key={c}>{c}</option>)}
        </select>
      </td>
      <td className="pr-2 py-1">
        <input type="text" placeholder="Vendor" value={line.vendor}
          onChange={e => onUpdate(line._key, 'vendor', e.target.value)}
          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <input type="number" placeholder="0.00" value={line.your_cost_unit}
          onChange={e => onUpdate(line._key, 'your_cost_unit', e.target.value)}
          className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <input type="number" placeholder={String(defaultMarkup)} value={line.markup_percent}
          onChange={e => onUpdate(line._key, 'markup_percent', e.target.value)}
          className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
      </td>
      <td className="pr-2 py-1">
        <input type="number" placeholder="0.00" value={line.customer_price_unit}
          onChange={e => onUpdate(line._key, 'customer_price_unit', e.target.value)}
          className="w-20 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold" />
      </td>
      {sects.length > 0 && (
        <td className="pr-2 py-1">
          <select value={line.section_id || ''}
            onChange={e => onUpdate(line._key, 'section_id', e.target.value || null)}
            className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
            <option value="">General</option>
            {sects.map(s => <option key={s._id} value={s._id}>{s.name || 'Untitled Section'}</option>)}
          </select>
        </td>
      )}
      <td className="py-1">
        <button onClick={() => onRemove(line._key)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button>
      </td>
    </tr>
  )

  const LineTableHeader = ({ hasSections }) => (
    <tr className="border-b border-[#2a3d55]">
      {['Item Name', 'Part #', 'Qty', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price', ...(hasSections ? ['Section'] : []), ''].map(h => (
        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
      ))}
    </tr>
  )

  // Render the full BOM editor (used in both create and edit)
  const BomEditor = ({ lns, setLns, labor, setLabor, sects, setSect, isLibTarget }) => {
    const updateLine = (key, field, value) => updateLineByKey(setLns, key, field, value)
    const removeLine = (key) => setLns(prev => prev.filter(l => l._key !== key))
    const hasSections = sects.length > 0

    return (
      <div className="space-y-5">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <h4 className="text-white font-semibold text-sm">Materials</h4>
          <div className="flex gap-2">
            <button
              onClick={() => libTarget === isLibTarget ? closeLib() : (setLibTarget(isLibTarget), setLibSectionId(null))}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${libTarget === isLibTarget ? 'bg-[#C8622A] text-white' : 'bg-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}>
              📦 Browse Library
            </button>
            <button onClick={() => addSection(setSect, sects)}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-[#2a3d55] text-[#8A9AB0] hover:text-white transition-colors">
              + Add Section
            </button>
          </div>
        </div>

        {libTarget === isLibTarget && <LibraryPanel setter={setLns} activeSects={sects} />}

        {/* Flat BOM table with section column when sections exist */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><LineTableHeader hasSections={hasSections} /></thead>
            <tbody>
              {lns.length === 0
                ? <tr><td colSpan={hasSections ? 11 : 10} className="text-[#8A9AB0] text-xs py-3">No items yet. Add manually or browse the library.</td></tr>
                : lns.map(line => (
                  <LineRow key={line._key} line={line} sects={sects}
                    onUpdate={updateLine} onRemove={removeLine} />
                ))}
            </tbody>
          </table>
        </div>
        <button onClick={() => setLns(prev => [...prev, emptyLine(defaultMarkup)])}
          className="text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Line Item</button>

        {/* Section cards — labor sub-tables per section */}
        {sects.length > 0 && (
          <div className="space-y-4 pt-2">
            <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Sections</p>
            {sects.map((s, si) => {
              const secLines = lns.filter(l => l.section_id === s._id)
              return (
                <div key={s._id} className="border border-[#2a3d55] rounded-xl overflow-hidden">
                  {/* Section header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-[#0F1C2E]">
                    <div className="w-2 h-2 rounded-full bg-[#C8622A]" />
                    <input
                      type="text"
                      placeholder={`Section ${si + 1} name`}
                      value={s.name}
                      onChange={e => updateSection(setSect, s._id, 'name', e.target.value)}
                      className="flex-1 bg-transparent text-white font-semibold text-sm focus:outline-none placeholder-[#2a3d55]"
                    />
                    <span className="text-[#8A9AB0] text-xs">{secLines.length} item{secLines.length !== 1 ? 's' : ''}</span>
                    <label className="flex items-center gap-1.5 text-xs text-[#8A9AB0] cursor-pointer select-none">
                      <input type="checkbox" checked={s.include_labor}
                        onChange={e => updateSection(setSect, s._id, 'include_labor', e.target.checked)}
                        className="accent-[#C8622A]" />
                      Section Labor
                    </label>
                    <button onClick={() => deleteSection(setSect, setLns, s._id)}
                      className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">✕ Remove</button>
                  </div>
                  {/* Section items summary */}
                  {secLines.length > 0 && (
                    <div className="px-4 py-2 bg-[#1a2d45]/50">
                      {secLines.map(l => (
                        <div key={l._key} className="flex items-center justify-between py-0.5">
                          <span className="text-white text-xs">{l.item_name || '(unnamed)'}</span>
                          <span className="text-[#8A9AB0] text-xs">Qty {l.quantity} · {l.customer_price_unit ? fmt(l.customer_price_unit) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Section labor */}
                  {s.include_labor && (
                    <div className="px-4 py-3 border-t border-[#2a3d55] space-y-2">
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Section Labor</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><LaborTableHeader /></thead>
                          <tbody>
                            {(s.labor_items || []).map((item, i) => (
                              <LaborRow key={i} item={item}
                                onUpdate={(field, value) => updateSectionLabor(setSect, s._id, i, field, value)}
                                onRemove={() => removeSectionLaborLine(setSect, s._id, i)} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button onClick={() => addSectionLaborLine(setSect, s._id)}
                        className="text-[#C8622A] hover:text-white text-xs transition-colors">+ Add Labor</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Global labor */}
        <div className="pt-2 border-t border-[#2a3d55]">
          <h4 className="text-white font-semibold text-sm mb-3">Labor</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><LaborTableHeader /></thead>
              <tbody>
                {labor.length === 0
                  ? <tr><td colSpan={7} className="text-[#8A9AB0] text-xs py-3">No labor rows yet.</td></tr>
                  : labor.map((item, i) => (
                    <LaborRow key={i} item={item}
                      onUpdate={(field, value) => updateLaborRow(setLabor, i, field, value)}
                      onRemove={() => setLabor(prev => prev.filter((_, idx) => idx !== i))} />
                  ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => setLabor(prev => [...prev, emptyLaborLine(defaultMarkup)])}
            className="mt-2 text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Labor</button>
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={true} featureCRM={true} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-white text-2xl font-bold">Proposal Templates</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">{templates.length} templates · {isAdmin ? 'Admin — can create and edit' : 'View and load into proposals'}</p>
          </div>
          {isAdmin && (
            <button onClick={() => showForm ? setShowForm(false) : (setShowForm(true), setForm(emptyTemplate), setLines([]), setLaborItems([]), setSections([]), setError(null))}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              {showForm ? 'Cancel' : '+ New Template'}
            </button>
          )}
        </div>

        {success && <p className="text-green-400 text-sm">{success}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* New Template Form */}
        {showForm && isAdmin && (
          <div className="bg-[#1a2d45] rounded-xl p-6 space-y-6">
            <h3 className="text-white font-bold text-lg">New Template</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Template Name <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. 8 Camera Install"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
                <select value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  <option value="">Select industry</option>
                  {industries.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Brief description"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
            </div>

            <BomEditor lns={lines} setLns={setLines} labor={laborItems} setLabor={setLaborItems}
              sects={sections} setSect={setSections} isLibTarget="create" />

            <div className="flex justify-end gap-3 pt-2 border-t border-[#2a3d55]">
              <button onClick={() => setShowForm(false)} className="px-6 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name}
                className="px-6 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <input type="text" placeholder="Search templates…" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />

        {/* Edit Modal */}
        {editingTemplate && isAdmin && (
          <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 px-4 py-6 overflow-y-auto">
            <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-5xl space-y-6">
              <h3 className="text-white font-bold text-lg">Edit Template</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Template Name <span className="text-[#C8622A]">*</span></label>
                  <input type="text" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
                  <select value={editForm.industry} onChange={e => setEditForm(p => ({ ...p, industry: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                    <option value="">Select industry</option>
                    {industries.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
                  <input type="text" value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
              </div>

              <BomEditor lns={editLines} setLns={setEditLines} labor={editLaborItems} setLabor={setEditLaborItems}
                sects={editSections} setSect={setEditSections} isLibTarget="edit" />

              <div className="flex justify-end gap-3 pt-4 border-t border-[#2a3d55]">
                <button onClick={() => setEditingTemplate(null)} className="px-6 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={() => saveEdit(editingTemplate)} disabled={editSaving || !editForm.name}
                  className="px-6 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template List */}
        {loading ? (
          <p className="text-[#8A9AB0]">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="bg-[#1a2d45] rounded-xl p-12 text-center">
            <p className="text-[#8A9AB0] text-lg mb-2">No templates yet</p>
            {isAdmin && <p className="text-[#8A9AB0] text-sm">Click "+ New Template" to create your first one.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(template => {
              const td = templateData[template.id] || { lines: [], sections: [] }
              const labor = template.labor_items || []
              const isExpanded = expandedId === template.id
              const totalLabor = labor.reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0)
              const sectionLaborTotal = td.sections.reduce((s, sec) =>
                s + (sec.include_labor ? (sec.labor_items || []).reduce((ss, l) => ss + (parseFloat(l.customer_price) || 0), 0) : 0), 0)

              return (
                <div key={template.id} className="bg-[#1a2d45] rounded-xl overflow-hidden border border-[#2a3d55]">
                  <div className="flex justify-between items-center p-5 cursor-pointer" onClick={() => toggleExpand(template.id)}>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-[#C8622A]/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#C8622A] text-lg">📋</span>
                      </div>
                      <div>
                        <p className="text-white font-semibold">{template.name}</p>
                        <p className="text-[#8A9AB0] text-xs mt-0.5">
                          {template.industry && <span className="mr-2">{template.industry}</span>}
                          {template.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {(totalLabor + sectionLaborTotal) > 0 && (
                        <span className="text-[#8A9AB0] text-xs">{fmt(totalLabor + sectionLaborTotal)} labor</span>
                      )}
                      {isAdmin && (
                        <button onClick={e => { e.stopPropagation(); startEditing(template) }}
                          className="text-[#8A9AB0] hover:text-white text-xs transition-colors px-2">Edit</button>
                      )}
                      {isAdmin && (
                        <button onClick={e => { e.stopPropagation(); handleDelete(template.id) }}
                          className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors px-2">Delete</button>
                      )}
                      <span className="text-[#8A9AB0] text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#2a3d55] p-5 space-y-5">
                      {/* General items (no section) */}
                      {(() => {
                        const general = td.lines.filter(l => !l.section_id)
                        if (general.length === 0 && td.sections.length === 0) return null
                        return general.length > 0 && (
                          <div>
                            {td.sections.length > 0 && <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">General</p>}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-[#2a3d55]">
                                  {['Item', 'Part #', 'Qty', 'Unit', 'Category', 'Your Cost', 'Markup %', 'Customer Price'].map(h => (
                                    <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {general.map(l => (
                                  <tr key={l.id} className="border-b border-[#2a3d55]/30">
                                    <td className="text-white py-2 pr-4">{l.item_name}</td>
                                    <td className="text-[#8A9AB0] py-2 pr-4">{l.part_number_sku || '—'}</td>
                                    <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                    <td className="text-[#8A9AB0] py-2 pr-4">{l.unit}</td>
                                    <td className="text-[#8A9AB0] py-2 pr-4">{l.category || '—'}</td>
                                    <td className="text-[#8A9AB0] py-2 pr-4">{fmt(l.your_cost_unit)}</td>
                                    <td className="text-[#8A9AB0] py-2 pr-4">{l.markup_percent}%</td>
                                    <td className="text-[#C8622A] py-2 pr-4 font-semibold">{fmt(l.customer_price_unit)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      })()}

                      {/* Sections */}
                      {td.sections.map(section => {
                        const secLines = td.lines.filter(l => l.section_id === section.id)
                        const secLabor = section.include_labor ? (section.labor_items || []).filter(l => l.role) : []
                        const secMatTotal = secLines.reduce((s, l) => s + (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 1), 0)
                        const secLaborTotal = secLabor.reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0)
                        return (
                          <div key={section.id} className="border border-[#2a3d55] rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-[#0F1C2E]">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-[#C8622A]" />
                                <span className="text-white font-semibold text-sm">{section.name || 'Untitled Section'}</span>
                              </div>
                              <span className="text-[#8A9AB0] text-xs">Total: <span className="text-white font-bold">{fmt(secMatTotal + secLaborTotal)}</span></span>
                            </div>
                            {secLines.length > 0 && (
                              <div className="px-4 py-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-[#2a3d55]">
                                      {['Item', 'Part #', 'Qty', 'Unit', 'Your Cost', 'Markup %', 'Customer Price'].map(h => (
                                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {secLines.map(l => (
                                      <tr key={l.id} className="border-b border-[#2a3d55]/30">
                                        <td className="text-white py-2 pr-4">{l.item_name}</td>
                                        <td className="text-[#8A9AB0] py-2 pr-4">{l.part_number_sku || '—'}</td>
                                        <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                        <td className="text-[#8A9AB0] py-2 pr-4">{l.unit}</td>
                                        <td className="text-[#8A9AB0] py-2 pr-4">{fmt(l.your_cost_unit)}</td>
                                        <td className="text-[#8A9AB0] py-2 pr-4">{l.markup_percent}%</td>
                                        <td className="text-[#C8622A] py-2 pr-4 font-semibold">{fmt(l.customer_price_unit)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {secLabor.length > 0 && (
                              <div className="border-t border-[#2a3d55] px-4 py-2">
                                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Section Labor</p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-[#2a3d55]">
                                      {['Role', 'Qty', 'Unit', 'Total Labor'].map(h => (
                                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {secLabor.map((l, i) => (
                                      <tr key={i} className="border-b border-[#2a3d55]/30">
                                        <td className="text-white py-2 pr-4">{l.role}</td>
                                        <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                        <td className="text-[#8A9AB0] py-2 pr-4">{l.unit || 'hr'}</td>
                                        <td className="text-[#C8622A] py-2 pr-4 font-semibold">{fmt(l.customer_price)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Global labor */}
                      {labor.filter(l => l.role).length > 0 && (
                        <div>
                          <p className="text-white text-sm font-semibold mb-3">Labor</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-[#2a3d55]">
                                {['Role', 'Qty', 'Unit', 'Total Labor'].map(h => (
                                  <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {labor.filter(l => l.role).map((l, i) => (
                                <tr key={i} className="border-b border-[#2a3d55]/30">
                                  <td className="text-white py-2 pr-4">{l.role}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4">{l.unit || 'hr'}</td>
                                  <td className="text-[#C8622A] py-2 pr-4 font-semibold">{fmt(l.customer_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {td.lines.length === 0 && labor.filter(l => l.role).length === 0 && td.sections.length === 0 && (
                        <p className="text-[#8A9AB0] text-sm">No items in this template yet.</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
