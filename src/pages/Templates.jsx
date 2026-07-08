import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const emptyLine = (markup = 35) => ({
  item_name: '', part_number_sku: '', quantity: '1', unit: 'ea',
  category: '', vendor: '', your_cost_unit: '', markup_percent: String(markup), customer_price_unit: ''
})

const emptyLaborLine = (markup = 35) => ({
  role: '', quantity: '', unit: 'hr', your_cost: '', markup, customer_price: 0
})

const emptyTemplate = { name: '', description: '', industry: '' }

const industries = ['Electrical', 'Mechanical', 'Plumbing', 'HVAC', 'Audio/Visual', 'Security', 'General Contractor', 'Other']
const categories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Labor', 'Other']

export default function Templates({ isAdmin }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState(null)
  const [defaultMarkup, setDefaultMarkup] = useState(35)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyTemplate)
  const [lines, setLines] = useState([])
  const [laborItems, setLaborItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [templateLines, setTemplateLines] = useState({})
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [editForm, setEditForm] = useState(emptyTemplate)
  const [editLines, setEditLines] = useState([])
  const [editLaborItems, setEditLaborItems] = useState([])
  const [editSaving, setEditSaving] = useState(false)

  // Product library search — shared between create and edit panels
  const [libraryTarget, setLibraryTarget] = useState(null) // 'create' | 'edit'
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryResults, setLibraryResults] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [librarySelected, setLibrarySelected] = useState(new Set())

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles').select('org_id, default_markup_percent').eq('id', user.id).single()
    if (!profile?.org_id) { setLoading(false); return }
    setOrgId(profile.org_id)
    const markup = parseFloat(profile.default_markup_percent) || 35
    setDefaultMarkup(markup)

    const { data } = await supabase
      .from('templates')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('name', { ascending: true })
    setTemplates(data || [])
    setLoading(false)
  }

  // Reset create form with correct defaults whenever it opens
  const openCreateForm = () => {
    setForm(emptyTemplate)
    setLines([emptyLine(defaultMarkup), emptyLine(defaultMarkup), emptyLine(defaultMarkup)])
    setLaborItems([emptyLaborLine(defaultMarkup)])
    setLibraryTarget(null); setLibraryQuery(''); setLibraryResults([]); setLibrarySelected(new Set())
    setError(null); setSuccess(null)
    setShowForm(true)
  }

  const fetchTemplateLines = async (templateId) => {
    if (templateLines[templateId]) return
    const { data } = await supabase
      .from('template_line_items')
      .select('*')
      .eq('template_id', templateId)
      .order('id', { ascending: true })
    setTemplateLines(prev => ({ ...prev, [templateId]: data || [] }))
  }

  const toggleExpand = async (id) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    await fetchTemplateLines(id)
  }

  // ── Line item update helpers ─────────────────────────────────────────────
  const applyMarkupCalc = (row) => {
    const cost = parseFloat(row.your_cost_unit) || 0
    const markup = parseFloat(row.markup_percent) || 0
    return { ...row, customer_price_unit: cost > 0 ? (cost * (1 + markup / 100)).toFixed(2) : row.customer_price_unit }
  }

  const updateLine = (index, field, value) => {
    setLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'your_cost_unit' || field === 'markup_percent') updated[index] = applyMarkupCalc(updated[index])
      return updated
    })
  }

  const updateEditLine = (index, field, value) => {
    setEditLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'your_cost_unit' || field === 'markup_percent') updated[index] = applyMarkupCalc(updated[index])
      return updated
    })
  }

  const calcLabor = (row, changed) => {
    const r = { ...row, [changed.field]: changed.value }
    const qty = parseFloat(r.quantity) || 0
    const cost = parseFloat(r.your_cost) || 0
    const markup = parseFloat(r.markup) || 0
    const cp = parseFloat(r.customer_price) || 0
    if (['your_cost', 'markup', 'quantity'].includes(changed.field)) {
      if (cost > 0 && qty > 0) r.customer_price = (cost * (1 + markup / 100) * qty).toFixed(2)
    } else if (changed.field === 'customer_price') {
      if (cp > 0 && qty > 0) {
        if (cost > 0) r.markup = (((cp / qty) / cost - 1) * 100).toFixed(1)
        else if (markup >= 0) r.your_cost = (cp / (1 + markup / 100) / qty).toFixed(2)
      }
    }
    return r
  }

  const updateLabor = (index, field, value) =>
    setLaborItems(prev => { const u = [...prev]; u[index] = calcLabor(u[index], { field, value }); return u })

  const updateEditLabor = (index, field, value) =>
    setEditLaborItems(prev => { const u = [...prev]; u[index] = calcLabor(u[index], { field, value }); return u })

  // ── Product library search ───────────────────────────────────────────────
  const searchLibrary = async (q) => {
    setLibraryQuery(q)
    if (!q.trim()) { setLibraryResults([]); return }
    setLibraryLoading(true)
    const { data } = await supabase
      .from('product_library')
      .select('*, product_library_pricing(*)')
      .eq('org_id', orgId)
      .eq('active', true)
      .or(`item_name.ilike.%${q}%,part_number.ilike.%${q}%,manufacturer.ilike.%${q}%,category.ilike.%${q}%`)
      .limit(30)
    setLibraryResults(data || [])
    setLibraryLoading(false)
  }

  const toggleLibraryItem = (id) => {
    setLibrarySelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const addLibraryItems = () => {
    const STALE_DAYS = 120
    const newLines = []
    libraryResults.forEach(prod => {
      if (!librarySelected.has(prod.id)) return
      const pricing = prod.product_library_pricing?.[0]
      const days = pricing?.pricing_date
        ? Math.floor((Date.now() - new Date(pricing.pricing_date)) / 86400000)
        : null
      const isStale = !pricing || days === null || days > STALE_DAYS
      const cost = parseFloat(pricing?.your_cost) || 0
      newLines.push({
        item_name: prod.item_name,
        part_number_sku: prod.part_number || '',
        quantity: '1',
        unit: prod.unit || 'ea',
        category: prod.category || '',
        vendor: pricing?.vendor || '',
        your_cost_unit: isStale ? '' : String(cost),
        markup_percent: String(defaultMarkup),
        customer_price_unit: isStale ? '' : (cost * (1 + defaultMarkup / 100)).toFixed(2),
      })
    })

    if (libraryTarget === 'create') {
      setLines(prev => [...prev.filter(l => l.item_name.trim() !== '' || prev.indexOf(l) < prev.length - 1), ...newLines])
    } else {
      setEditLines(prev => [...prev, ...newLines])
    }

    setLibraryTarget(null); setLibraryQuery(''); setLibraryResults([]); setLibrarySelected(new Set())
  }

  // ── Save / edit ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name) { setError('Template name is required'); return }
    setSaving(true); setError(null)

    const { data: template, error: tErr } = await supabase
      .from('templates')
      .insert({ ...form, org_id: orgId, labor_items: laborItems })
      .select().single()

    if (tErr) { setError(tErr.message); setSaving(false); return }

    const validLines = lines.filter(l => l.item_name.trim() !== '')
    if (validLines.length > 0) {
      await supabase.from('template_line_items').insert(
        validLines.map(l => ({
          template_id: template.id,
          item_name: l.item_name,
          part_number_sku: l.part_number_sku,
          quantity: parseFloat(l.quantity) || 1,
          unit: l.unit,
          category: l.category,
          vendor: l.vendor,
          your_cost_unit: parseFloat(l.your_cost_unit) || null,
          markup_percent: parseFloat(l.markup_percent) || defaultMarkup,
          customer_price_unit: parseFloat(l.customer_price_unit) || null,
        }))
      )
    }

    setSuccess('Template saved!')
    setForm(emptyTemplate)
    setLines([emptyLine(defaultMarkup), emptyLine(defaultMarkup), emptyLine(defaultMarkup)])
    setLaborItems([emptyLaborLine(defaultMarkup)])
    setShowForm(false)
    setSaving(false)
    fetchData()
  }

  const startEditing = async (template) => {
    setEditingTemplate(template.id)
    setEditForm({ name: template.name, description: template.description || '', industry: template.industry || '' })
    setEditLaborItems(template.labor_items?.length > 0 ? template.labor_items : [emptyLaborLine(defaultMarkup)])
    if (!templateLines[template.id]) await fetchTemplateLines(template.id)
    const items = templateLines[template.id] || []
    setEditLines(items.length > 0 ? items.map(l => ({
      id: l.id,
      item_name: l.item_name || '',
      part_number_sku: l.part_number_sku || '',
      quantity: String(l.quantity || ''),
      unit: l.unit || 'ea',
      category: l.category || '',
      vendor: l.vendor || '',
      your_cost_unit: String(l.your_cost_unit || ''),
      markup_percent: String(l.markup_percent || defaultMarkup),
      customer_price_unit: String(l.customer_price_unit || ''),
    })) : [emptyLine(defaultMarkup)])
    setLibraryTarget(null); setLibraryQuery(''); setLibraryResults([]); setLibrarySelected(new Set())
    setExpandedId(null)
  }

  const saveEdit = async (templateId) => {
    setEditSaving(true); setError(null)

    await supabase.from('templates').update({
      name: editForm.name,
      description: editForm.description,
      industry: editForm.industry,
      labor_items: editLaborItems
    }).eq('id', templateId)

    await supabase.from('template_line_items').delete().eq('template_id', templateId)

    const validLines = editLines.filter(l => l.item_name.trim() !== '')
    if (validLines.length > 0) {
      await supabase.from('template_line_items').insert(
        validLines.map(l => ({
          template_id: templateId,
          item_name: l.item_name,
          part_number_sku: l.part_number_sku,
          quantity: parseFloat(l.quantity) || 1,
          unit: l.unit,
          category: l.category,
          vendor: l.vendor,
          your_cost_unit: parseFloat(l.your_cost_unit) || null,
          markup_percent: parseFloat(l.markup_percent) || defaultMarkup,
          customer_price_unit: parseFloat(l.customer_price_unit) || null,
        }))
      )
    }

    setTemplateLines(prev => { const next = { ...prev }; delete next[templateId]; return next })
    setEditingTemplate(null)
    setEditSaving(false)
    setSuccess('Template updated!')
    fetchData()
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

  const fmt = (num) => num != null ? `$${Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  // ── Shared sub-components ────────────────────────────────────────────────
  const LibrarySearch = ({ target }) => (
    <div className="bg-[#0F1C2E] rounded-xl p-4 space-y-3 border border-[#C8622A]/30">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          type="text"
          placeholder="Search product library by name, part #, manufacturer..."
          value={libraryQuery}
          onChange={e => searchLibrary(e.target.value)}
          className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
        />
        <button onClick={() => { setLibraryTarget(null); setLibraryQuery(''); setLibraryResults([]); setLibrarySelected(new Set()) }}
          className="text-[#8A9AB0] hover:text-white text-sm px-2">✕</button>
      </div>
      {libraryLoading && <p className="text-[#8A9AB0] text-xs">Searching...</p>}
      {!libraryLoading && libraryQuery && libraryResults.length === 0 && (
        <p className="text-[#8A9AB0] text-xs">No products found.</p>
      )}
      {libraryResults.length > 0 && (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {libraryResults.map(prod => {
            const pricing = prod.product_library_pricing?.[0]
            const cost = parseFloat(pricing?.your_cost) || 0
            return (
              <label key={prod.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#1a2d45] cursor-pointer">
                <input
                  type="checkbox"
                  checked={librarySelected.has(prod.id)}
                  onChange={() => toggleLibraryItem(prod.id)}
                  className="accent-[#C8622A]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">{prod.item_name}</p>
                  <p className="text-[#8A9AB0] text-xs">{prod.manufacturer || ''}{prod.part_number ? ` · ${prod.part_number}` : ''}{prod.category ? ` · ${prod.category}` : ''}</p>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${cost > 0 ? 'text-[#C8622A]' : 'text-[#8A9AB0]'}`}>
                  {cost > 0 ? `$${cost.toFixed(2)} → $${(cost * (1 + defaultMarkup / 100)).toFixed(2)}` : 'No pricing'}
                </span>
              </label>
            )
          })}
        </div>
      )}
      {librarySelected.size > 0 && (
        <button onClick={addLibraryItems}
          className="bg-[#C8622A] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors">
          Add {librarySelected.size} item{librarySelected.size > 1 ? 's' : ''} to BOM
        </button>
      )}
    </div>
  )

  const MaterialsTable = ({ rows, onUpdate, onRemove, onAddBlank, showLibraryTarget }) => (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white font-semibold text-sm">Materials</h4>
        <button
          onClick={() => setLibraryTarget(libraryTarget === showLibraryTarget ? null : showLibraryTarget)}
          className={`text-xs px-3 py-1 rounded-lg font-semibold transition-colors ${libraryTarget === showLibraryTarget ? 'bg-[#C8622A] text-white' : 'bg-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}
        >
          📦 Browse Library
        </button>
      </div>
      {libraryTarget === showLibraryTarget && <div className="mb-3"><LibrarySearch target={showLibraryTarget} /></div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a3d55]">
              {['Item Name', 'Part #', 'Qty', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price', ''].map(h => (
                <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((line, i) => (
              <tr key={i} className="border-b border-[#2a3d55]/30">
                <td className="pr-2 py-1"><input type="text" placeholder="Item name" value={line.item_name} onChange={e => onUpdate(i, 'item_name', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                <td className="pr-2 py-1"><input type="text" placeholder="Part #" value={line.part_number_sku} onChange={e => onUpdate(i, 'part_number_sku', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                <td className="pr-2 py-1"><input type="number" placeholder="1" value={line.quantity} onChange={e => onUpdate(i, 'quantity', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                <td className="pr-2 py-1">
                  <select value={line.unit} onChange={e => onUpdate(i, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                    {['ea', 'ft', 'lot', 'hr', 'box', 'roll'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </td>
                <td className="pr-2 py-1">
                  <select value={line.category} onChange={e => onUpdate(i, 'category', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                    <option value="">Category</option>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </td>
                <td className="pr-2 py-1"><input type="text" placeholder="Vendor" value={line.vendor} onChange={e => onUpdate(i, 'vendor', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={line.your_cost_unit} onChange={e => onUpdate(i, 'your_cost_unit', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                <td className="pr-2 py-1"><input type="number" placeholder={String(defaultMarkup)} value={line.markup_percent} onChange={e => onUpdate(i, 'markup_percent', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={line.customer_price_unit} onChange={e => onUpdate(i, 'customer_price_unit', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                <td className="py-1"><button onClick={() => onRemove(i)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={onAddBlank} className="mt-3 text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Line Item</button>
    </div>
  )

  const LaborTable = ({ rows, onUpdate, onRemove, onAddBlank }) => (
    <div>
      <h4 className="text-white font-semibold text-sm mb-3">Labor</h4>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#2a3d55]">
            {['Role', 'Qty', 'Unit', 'Your Cost/hr', 'Markup %', 'Total Labor', ''].map(h => (
              <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((item, i) => (
            <tr key={i} className="border-b border-[#2a3d55]/30">
              <td className="pr-2 py-1"><input type="text" placeholder="e.g. Lead Tech" value={item.role} onChange={e => onUpdate(i, 'role', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
              <td className="pr-2 py-1"><input type="number" placeholder="0" value={item.quantity} onChange={e => onUpdate(i, 'quantity', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
              <td className="pr-2 py-1">
                <select value={item.unit || 'hr'} onChange={e => onUpdate(i, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                  {['hr', 'day', 'lot'].map(u => <option key={u}>{u}</option>)}
                </select>
              </td>
              <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.your_cost} onChange={e => onUpdate(i, 'your_cost', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
              <td className="pr-2 py-1"><input type="number" placeholder={String(defaultMarkup)} value={item.markup} onChange={e => onUpdate(i, 'markup', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
              <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.customer_price || ''} onChange={e => onUpdate(i, 'customer_price', e.target.value)} className="w-20 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold" /></td>
              <td className="py-1"><button onClick={() => onRemove(i)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onAddBlank} className="mt-3 text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Labor</button>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────
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
            <button
              onClick={() => showForm ? setShowForm(false) : openCreateForm()}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
            >
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
              <div className="col-span-1">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Template Name <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. 8 Camera Install"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div className="col-span-1">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
                <select value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  <option value="">Select industry</option>
                  {industries.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
                <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Brief description"
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
            </div>

            <MaterialsTable
              rows={lines}
              onUpdate={updateLine}
              onRemove={i => setLines(prev => prev.filter((_, idx) => idx !== i))}
              onAddBlank={() => setLines(prev => [...prev, emptyLine(defaultMarkup)])}
              showLibraryTarget="create"
            />

            <LaborTable
              rows={laborItems}
              onUpdate={updateLabor}
              onRemove={i => setLaborItems(prev => prev.filter((_, idx) => idx !== i))}
              onAddBlank={() => setLaborItems(prev => [...prev, emptyLaborLine(defaultMarkup)])}
            />

            <div className="flex justify-end gap-3 pt-2 border-t border-[#2a3d55]">
              <button onClick={() => setShowForm(false)} className="px-6 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.name}
                className="px-6 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <input type="text" placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />

        {/* Edit Template Modal */}
        {editingTemplate && isAdmin && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
            <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-white font-bold text-lg mb-5">Edit Template</h3>

              <div className="grid grid-cols-3 gap-4 mb-6">
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

              <div className="space-y-6">
                <MaterialsTable
                  rows={editLines}
                  onUpdate={updateEditLine}
                  onRemove={i => setEditLines(prev => prev.filter((_, idx) => idx !== i))}
                  onAddBlank={() => setEditLines(prev => [...prev, emptyLine(defaultMarkup)])}
                  showLibraryTarget="edit"
                />

                <LaborTable
                  rows={editLaborItems}
                  onUpdate={updateEditLabor}
                  onRemove={i => setEditLaborItems(prev => prev.filter((_, idx) => idx !== i))}
                  onAddBlank={() => setEditLaborItems(prev => [...prev, emptyLaborLine(defaultMarkup)])}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#2a3d55] mt-6">
                <button onClick={() => setEditingTemplate(null)} className="px-6 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={() => saveEdit(editingTemplate)} disabled={editSaving || !editForm.name}
                  className="px-6 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Template List */}
        {loading ? (
          <p className="text-[#8A9AB0]">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-[#1a2d45] rounded-xl p-12 text-center">
            <p className="text-[#8A9AB0] text-lg mb-2">No templates yet</p>
            {isAdmin && <p className="text-[#8A9AB0] text-sm">Click "+ New Template" to create your first one.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(template => {
              const tLines = templateLines[template.id] || []
              const labor = template.labor_items || []
              const isExpanded = expandedId === template.id
              const totalLabor = labor.reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0)

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
                          {template.description && <span>{template.description}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {totalLabor > 0 && <span className="text-[#8A9AB0] text-xs">{fmt(totalLabor)} labor</span>}
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
                    <div className="border-t border-[#2a3d55] p-5 space-y-4">
                      {tLines.length > 0 && (
                        <div>
                          <p className="text-white text-sm font-semibold mb-3">Materials ({tLines.length} items)</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-[#2a3d55]">
                                {['Item', 'Part #', 'Qty', 'Unit', 'Category', 'Your Cost', 'Markup %', 'Customer Price'].map(h => (
                                  <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {tLines.map(l => (
                                <tr key={l.id} className="border-b border-[#2a3d55]/30">
                                  <td className="text-white py-2 pr-4">{l.item_name}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4">{l.part_number_sku || '—'}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4">{l.unit}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4">{l.category || '—'}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4">{fmt(l.your_cost_unit)}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-4">{l.markup_percent}%</td>
                                  <td className="text-white py-2 pr-4 font-semibold">{fmt(l.customer_price_unit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

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
                                  <td className="text-[#C8622A] py-2 pr-4 font-semibold">{fmt(parseFloat(l.customer_price))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {tLines.length === 0 && labor.filter(l => l.role).length === 0 && (
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
