import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import * as XLSX from 'xlsx'

const CATEGORIES = ['Electrical','Mechanical','Audio/Visual','Security','Networking','Material','Roofing Materials','Insulation','Windows & Doors','Flooring','Painting & Finishing','Plumbing','HVAC','Solar','Hardware','Other']

const pricingAge = (dateStr) => {
  if (!dateStr) return null
  return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24))
}

const AgeBadge = ({ days }) => {
  if (days === null) return <span className="text-xs text-[#2a3d55]">No date</span>
  if (days <= 30) return <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Current</span>
  if (days <= 120) return <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">{days}d old</span>
  return <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">Stale — RFQ</span>
}

export default function ProductLibrary({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [products, setProducts] = useState([])   // product_library rows
  const [pricing, setPricing] = useState({})      // { product_id: [pricing rows] }
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterVendor, setFilterVendor] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null) // { added, updated, vendors }
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  // Add product form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ item_name: '', manufacturer: '', part_number: '', category: '', unit: 'ea', description: '' })
  const [saving, setSaving] = useState(false)
  // Add vendor price inline
  const [addingPriceFor, setAddingPriceFor] = useState(null) // product_id
  const [priceForm, setPriceForm] = useState({ vendor: '', your_cost: '', pricing_date: new Date().toISOString().split('T')[0] })
  const [savingPrice, setSavingPrice] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) { setLoading(false); return }
    setOrgId(profile.org_id)

    const { data: prods } = await supabase
      .from('product_library')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('active', true)
      .order('item_name', { ascending: true })

    const { data: prices } = await supabase
      .from('product_library_pricing')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('your_cost', { ascending: true })

    const priceMap = {}
    ;(prices || []).forEach(p => {
      if (!priceMap[p.product_id]) priceMap[p.product_id] = []
      priceMap[p.product_id].push(p)
    })

    setProducts(prods || [])
    setPricing(priceMap)
    setLoading(false)
  }

  // ─── Excel import ─────────────────────────────────────────────────────────
  const handleFileUpload = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setUploading(true); setError(null); setUploadResult(null)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary', cellText: false, cellDates: true })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

        const clean = (val) => String(val || '').replace(/[$, ]/g, '').trim()

        // Fetch existing products for this org to check part numbers
        const { data: existingProds } = await supabase
          .from('product_library')
          .select('id, part_number')
          .eq('org_id', orgId)

        const partNumberMap = {} // part_number → product id
        ;(existingProds || []).forEach(p => { if (p.part_number) partNumberMap[p.part_number.toLowerCase()] = p.id })

        let addedProducts = 0, updatedPrices = 0, addedPrices = 0
        const vendorsImported = new Set()

        for (const r of rows) {
          const itemName = String(r['Item Name'] || r['item_name'] || r['Name'] || r['name'] || '').trim()
          const partNumber = String(r['Part #'] || r['Part Number'] || r['part_number'] || r['SKU'] || '').trim()
          const vendor = String(r['Vendor'] || r['vendor'] || r['Distributor'] || '').trim()
          const costRaw = clean(r['Your Cost'] || r['Cost'] || r['your_cost'] || r['Price'] || r['Unit Cost'] || '')
          const cost = parseFloat(costRaw) || null
          const pricingDateRaw = r['Pricing Date'] || r['pricing_date'] || r['Date'] || ''
          const pricingDate = pricingDateRaw ? String(pricingDateRaw).split('T')[0] : new Date().toISOString().split('T')[0]

          if (!itemName && !partNumber) continue
          if (!cost && cost !== 0) continue

          if (vendor) vendorsImported.add(vendor)

          // 1. Find or create product
          let productId = partNumber ? partNumberMap[partNumber.toLowerCase()] : null

          if (!productId) {
            // Create new product
            const { data: newProd, error: prodErr } = await supabase
              .from('product_library')
              .insert({
                org_id: orgId,
                item_name: itemName || partNumber,
                manufacturer: String(r['Manufacturer'] || r['manufacturer'] || r['Mfr'] || '').trim() || null,
                part_number: partNumber || null,
                category: String(r['Category'] || r['category'] || '').trim() || null,
                unit: String(r['Unit'] || r['unit'] || 'ea').trim().toLowerCase() || 'ea',
                description: String(r['Description'] || r['description'] || '').trim() || null,
                active: true,
              })
              .select('id')
              .single()

            if (prodErr) continue
            productId = newProd.id
            if (partNumber) partNumberMap[partNumber.toLowerCase()] = productId
            addedProducts++
          }

          if (!vendor || !productId) continue

          // 2. Upsert vendor pricing row
          const { data: existingPrice } = await supabase
            .from('product_library_pricing')
            .select('id')
            .eq('product_id', productId)
            .eq('vendor', vendor)
            .single()

          if (existingPrice) {
            await supabase.from('product_library_pricing')
              .update({ your_cost: cost, pricing_date: pricingDate, source: 'excel_import', updated_at: new Date().toISOString() })
              .eq('id', existingPrice.id)
            updatedPrices++
          } else {
            await supabase.from('product_library_pricing')
              .insert({ product_id: productId, org_id: orgId, vendor, your_cost: cost, pricing_date: pricingDate, source: 'excel_import' })
            addedPrices++
          }
        }

        setUploadResult({
          products: addedProducts,
          added: addedPrices,
          updated: updatedPrices,
          vendors: [...vendorsImported],
        })
        fetchAll()
      } catch (err) {
        setError('Import error: ' + err.message)
      }
      setUploading(false)
    }
    reader.readAsBinaryString(file)
    e.target.value = '' // reset input
  }

  // ─── Template download ────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const headers = ['Item Name', 'Manufacturer', 'Part #', 'Category', 'Unit', 'Description', 'Vendor', 'Your Cost', 'Pricing Date']
    const examples = [
      ['IP Camera 4MP', 'Hikvision', 'DS-2CD2143G2-I', 'Security', 'ea', '4MP outdoor fixed dome', 'Anixter', '47.50', '2026-04-01'],
      ['IP Camera 4MP', 'Hikvision', 'DS-2CD2143G2-I', 'Security', 'ea', '4MP outdoor fixed dome', 'Graybar', '49.00', '2026-04-01'],
      ['CAT6 Cable 1000ft', 'Belden', 'REV-9F6004E', 'Networking', 'roll', '', 'Anixter', '89.00', '2026-04-01'],
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples])
    ws['!cols'] = headers.map(() => ({ wch: 22 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Product Library')
    XLSX.writeFile(wb, 'ForgePt_ProductLibrary_Template.xlsx')
  }

  // ─── Add product manually ─────────────────────────────────────────────────
  const handleAddProduct = async () => {
    if (!addForm.item_name) { setError('Item name is required'); return }
    setSaving(true); setError(null)
    const { error: err } = await supabase.from('product_library').insert({
      ...addForm,
      org_id: orgId,
      part_number: addForm.part_number || null,
      active: true,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setAddForm({ item_name: '', manufacturer: '', part_number: '', category: '', unit: 'ea', description: '' })
    setShowAddForm(false); setSaving(false); fetchAll()
  }

  // ─── Add vendor price ─────────────────────────────────────────────────────
  const handleAddPrice = async (productId) => {
    if (!priceForm.vendor || !priceForm.your_cost) return
    setSavingPrice(true)
    const { data: existing } = await supabase.from('product_library_pricing').select('id').eq('product_id', productId).eq('vendor', priceForm.vendor).single()
    if (existing) {
      await supabase.from('product_library_pricing').update({ your_cost: parseFloat(priceForm.your_cost), pricing_date: priceForm.pricing_date || null, source: 'manual', updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('product_library_pricing').insert({ product_id: productId, org_id: orgId, vendor: priceForm.vendor, your_cost: parseFloat(priceForm.your_cost), pricing_date: priceForm.pricing_date || null, source: 'manual' })
    }
    setPriceForm({ vendor: '', your_cost: '', pricing_date: new Date().toISOString().split('T')[0] })
    setAddingPriceFor(null); setSavingPrice(false); fetchAll()
  }

  const handleDeletePrice = async (priceId) => {
    if (!window.confirm('Remove this vendor price?')) return
    await supabase.from('product_library_pricing').delete().eq('id', priceId)
    fetchAll()
  }

  const handleDeleteProduct = async (productId) => {
    if (!window.confirm('Remove this product from the library?')) return
    await supabase.from('product_library').update({ active: false }).eq('id', productId)
    setProducts(prev => prev.filter(p => p.id !== productId))
  }

  // ─── Filters ──────────────────────────────────────────────────────────────
  const allVendors = [...new Set(Object.values(pricing).flat().map(p => p.vendor).filter(Boolean))].sort()
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort()

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      p.item_name.toLowerCase().includes(q) ||
      (p.part_number || '').toLowerCase().includes(q) ||
      (p.manufacturer || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    const matchCategory = !filterCategory || p.category === filterCategory
    const matchVendor = !filterVendor || (pricing[p.id] || []).some(pr => pr.vendor === filterVendor)
    return matchSearch && matchCategory && matchVendor
  })

  const fmt = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
  const inputCls = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-white text-2xl font-bold">Product Library</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">{products.length} products · {Object.values(pricing).flat().length} vendor prices</p>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadTemplate} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">↓ Template</button>
            <label className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors cursor-pointer">
              {uploading ? 'Importing...' : '↑ Import Excel'}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" disabled={uploading} />
            </label>
            <button onClick={() => { setShowAddForm(p => !p); setError(null) }}
              className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              {showAddForm ? 'Cancel' : '+ Add Product'}
            </button>
          </div>
        </div>

        {/* Import result */}
        {uploadResult && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-green-400 text-sm font-semibold">Import complete</p>
              <p className="text-green-400/70 text-xs mt-0.5">
                {uploadResult.products} new products · {uploadResult.added} vendor prices added · {uploadResult.updated} updated
                {uploadResult.vendors.length > 0 && ` · Vendors: ${uploadResult.vendors.join(', ')}`}
              </p>
            </div>
            <button onClick={() => setUploadResult(null)} className="text-[#8A9AB0] hover:text-white text-lg leading-none">×</button>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Add product form */}
        {showAddForm && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">New Product</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Item Name <span className="text-[#C8622A]">*</span></label><input type="text" value={addForm.item_name} onChange={e => setAddForm(p => ({ ...p, item_name: e.target.value }))} className={inputCls} /></div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Manufacturer</label><input type="text" value={addForm.manufacturer} onChange={e => setAddForm(p => ({ ...p, manufacturer: e.target.value }))} className={inputCls} /></div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Part #</label><input type="text" value={addForm.part_number} onChange={e => setAddForm(p => ({ ...p, part_number: e.target.value }))} className={inputCls} /></div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Category</label>
                <select value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))} className={inputCls}>
                  <option value="">— Select —</option>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Unit</label>
                <select value={addForm.unit} onChange={e => setAddForm(p => ({ ...p, unit: e.target.value }))} className={inputCls}>
                  {['ea', 'ft', 'lot', 'roll', 'box', 'hr'].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Description</label><input type="text" value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))} className={inputCls} /></div>
            </div>
            <p className="text-[#8A9AB0] text-xs mb-4">After saving you can add vendor pricing to this product.</p>
            <button onClick={handleAddProduct} disabled={saving || !addForm.item_name}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        )}

        {/* Search + filters */}
        <div className="flex gap-3">
          <input type="text" placeholder="Search by name, part #, manufacturer..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
            className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
            <option value="">All Vendors</option>
            {allVendors.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* Pricing freshness legend */}
        <div className="flex items-center gap-4 text-xs text-[#8A9AB0]">
          <span className="font-semibold">Pricing age:</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> &lt; 30 days — Current</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 30–120 days — Aging</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 120+ days — Stale (RFQ when added to BOM)</span>
        </div>

        {/* Product list */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">All Products ({filtered.length})</h3>

          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-[#2a3d55] rounded w-1/3" />
                  <div className="h-4 bg-[#2a3d55] rounded w-1/6" />
                  <div className="h-4 bg-[#2a3d55] rounded w-1/6" />
                  <div className="h-4 bg-[#2a3d55] rounded w-1/6" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#8A9AB0] mb-2">No products yet.</p>
              <p className="text-[#8A9AB0] text-sm">Upload an Excel price sheet using the template, or add products manually.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => {
                const vendorPrices = pricing[p.id] || []
                const isOpen = expandedId === p.id
                const bestCost = vendorPrices.length > 0 ? Math.min(...vendorPrices.map(v => v.your_cost || Infinity)) : null

                return (
                  <div key={p.id} className="bg-[#0F1C2E] rounded-xl overflow-hidden border border-[#2a3d55]">
                    {/* Product row */}
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#0a1828] transition-colors"
                      onClick={() => setExpandedId(isOpen ? null : p.id)}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{p.item_name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {p.manufacturer && <span className="text-[#8A9AB0] text-xs">{p.manufacturer}</span>}
                            {p.part_number && <span className="text-[#8A9AB0] text-xs font-mono bg-[#1a2d45] px-1.5 py-0.5 rounded">{p.part_number}</span>}
                            {p.category && <span className="text-[#8A9AB0] text-xs">{p.category}</span>}
                            {p.unit !== 'ea' && <span className="text-[#8A9AB0] text-xs">/ {p.unit}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {vendorPrices.length > 0 ? (
                          <div className="text-right">
                            <p className="text-[#C8622A] text-sm font-semibold">{fmt(bestCost)}</p>
                            <p className="text-[#8A9AB0] text-xs">best of {vendorPrices.length} vendor{vendorPrices.length !== 1 ? 's' : ''}</p>
                          </div>
                        ) : (
                          <span className="text-[#2a3d55] text-xs">No pricing</span>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); handleDeleteProduct(p.id) }}
                          className="text-[#2a3d55] hover:text-red-400 text-xs transition-colors"
                        >✕</button>
                        <span className="text-[#8A9AB0] text-xs">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded: vendor pricing rows */}
                    {isOpen && (
                      <div className="border-t border-[#2a3d55] px-4 py-4 space-y-3">
                        {p.description && <p className="text-[#8A9AB0] text-xs italic mb-2">{p.description}</p>}

                        {/* Vendor price table */}
                        {vendorPrices.length > 0 && (
                          <table className="w-full text-sm mb-3">
                            <thead>
                              <tr className="border-b border-[#2a3d55]">
                                {['Vendor', 'Your Cost', 'Pricing Date', 'Age', 'Source', ''].map(h => (
                                  <th key={h} className="text-[#8A9AB0] text-left py-1.5 pr-4 font-normal text-xs">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {vendorPrices.map(vp => {
                                const days = pricingAge(vp.pricing_date)
                                const isBest = vp.your_cost === bestCost
                                return (
                                  <tr key={vp.id} className="border-b border-[#2a3d55]/30">
                                    <td className="py-2 pr-4">
                                      <div className="flex items-center gap-2">
                                        <span className="text-white text-sm">{vp.vendor}</span>
                                        {isBest && vendorPrices.length > 1 && <span className="text-xs px-1.5 py-0.5 rounded bg-[#C8622A]/20 text-[#C8622A] font-semibold">Best</span>}
                                      </div>
                                    </td>
                                    <td className="py-2 pr-4 text-[#C8622A] font-semibold">{fmt(vp.your_cost)}</td>
                                    <td className="py-2 pr-4 text-[#8A9AB0] text-xs">{vp.pricing_date ? new Date(vp.pricing_date).toLocaleDateString() : '—'}</td>
                                    <td className="py-2 pr-4"><AgeBadge days={days} /></td>
                                    <td className="py-2 pr-4">
                                      <span className="text-[#2a3d55] text-xs capitalize">{(vp.source || 'manual').replace('_', ' ')}</span>
                                    </td>
                                    <td className="py-2">
                                      <button onClick={() => handleDeletePrice(vp.id)} className="text-[#2a3d55] hover:text-red-400 text-xs transition-colors">✕</button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        )}

                        {/* Add vendor price */}
                        {addingPriceFor === p.id ? (
                          <div className="bg-[#1a2d45] rounded-lg p-4 space-y-3">
                            <p className="text-white text-xs font-semibold">Add Vendor Price</p>
                            <div className="grid grid-cols-3 gap-3">
                              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Vendor <span className="text-[#C8622A]">*</span></label><input type="text" value={priceForm.vendor} onChange={e => setPriceForm(p => ({ ...p, vendor: e.target.value }))} placeholder="e.g. Anixter" className={inputCls} /></div>
                              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Your Cost <span className="text-[#C8622A]">*</span></label><input type="number" value={priceForm.your_cost} onChange={e => setPriceForm(p => ({ ...p, your_cost: e.target.value }))} placeholder="0.00" className={inputCls} /></div>
                              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Pricing Date</label><input type="date" value={priceForm.pricing_date} onChange={e => setPriceForm(p => ({ ...p, pricing_date: e.target.value }))} className={inputCls} /></div>
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => { setAddingPriceFor(null); setPriceForm({ vendor: '', your_cost: '', pricing_date: new Date().toISOString().split('T')[0] }) }} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Cancel</button>
                              <button onClick={() => handleAddPrice(p.id)} disabled={savingPrice || !priceForm.vendor || !priceForm.your_cost}
                                className="bg-[#C8622A] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                                {savingPrice ? 'Saving...' : 'Add Price'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setAddingPriceFor(p.id); setPriceForm({ vendor: '', your_cost: '', pricing_date: new Date().toISOString().split('T')[0] }) }}
                            className="text-[#C8622A] hover:text-white text-xs transition-colors">+ Add vendor price</button>
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
    </div>
  )
}