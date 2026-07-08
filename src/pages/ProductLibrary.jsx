import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import * as XLSX from 'xlsx'
import { useProfile } from '../context/ProfileContext'

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

export default function ProductLibrary({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, featureSla = false, featureMonitoring = false, isSalesManager = false, isPM = false, isTechnician = false }) {
  const { profile, features } = useProfile()
  const featureMsrp = features.msrp
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
  const [activeTab, setActiveTab] = useState('library') // 'library' | catalog slug
  // Add product form
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ item_name: '', manufacturer: '', part_number: '', category: '', unit: 'ea', description: '', msrp: '' })
  const [saving, setSaving] = useState(false)
  // Add vendor price inline
  const [addingPriceFor, setAddingPriceFor] = useState(null) // product_id or `cat_${catalog_product_id}`
  const [priceForm, setPriceForm] = useState({ vendor: '', your_cost: '', pricing_date: new Date().toISOString().split('T')[0] })
  const [savingPrice, setSavingPrice] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editForm, setEditForm] = useState({})
  // Catalogs
  const [enabledCatalogs, setEnabledCatalogs] = useState([]) // [{ slug, label }]
  const [catalogItems, setCatalogItems] = useState([])        // catalog_products rows for active slugs
  const [catalogCopied, setCatalogCopied] = useState({})      // { catalog_product_id: product_library_id }

  useEffect(() => { if (profile?.org_id) fetchAll() }, [profile?.org_id])

  const fetchAll = async () => {
    setLoading(true)
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

    // Track which catalog items have already been copied to this org's library
    const copiedMap = {}
    ;(prods || []).forEach(p => { if (p.catalog_product_id) copiedMap[p.catalog_product_id] = p.id })
    setCatalogCopied(copiedMap)

    // Fetch enabled catalogs for this org
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('enabled_catalogs')
      .eq('id', profile.org_id)
      .single()

    const slugs = orgRow?.enabled_catalogs || []
    if (slugs.length > 0) {
      const { data: catProds } = await supabase
        .from('catalog_products')
        .select('*')
        .in('catalog_slug', slugs)
        .eq('active', true)
        .order('model_name', { ascending: true })

      const uniqueCatalogs = []
      const seen = new Set()
      ;(catProds || []).forEach(r => {
        if (!seen.has(r.catalog_slug)) {
          seen.add(r.catalog_slug)
          uniqueCatalogs.push({ slug: r.catalog_slug, label: r.catalog_label || r.catalog_slug })
        }
      })
      setEnabledCatalogs(uniqueCatalogs)
      setCatalogItems(catProds || [])
    } else {
      setEnabledCatalogs([])
      setCatalogItems([])
    }

    setLoading(false)
  }

  // Copy a catalog item to this org's product_library, then open the pricing form
  const copyAndAddPricing = async (catItem) => {
    // If already copied, just open pricing form for existing product_library row
    if (catalogCopied[catItem.id]) {
      setExpandedId(catalogCopied[catItem.id])
      setAddingPriceFor(catalogCopied[catItem.id])
      setPriceForm({ vendor: '', your_cost: '', pricing_date: new Date().toISOString().split('T')[0] })
      setActiveTab('library')
      return
    }
    // Copy to product_library
    const { data: newProd } = await supabase.from('product_library').insert({
      org_id: profile.org_id,
      item_name: catItem.model_name || catItem.part_number,
      manufacturer: catItem.manufacturer || null,
      part_number: catItem.part_number || null,
      category: catItem.category || null,
      unit: catItem.unit || 'ea',
      description: catItem.description || null,
      msrp: catItem.msrp || null,
      catalog_product_id: catItem.id,
      active: true,
    }).select('id').single()
    if (newProd?.id) {
      await fetchAll()
      setExpandedId(newProd.id)
      setAddingPriceFor(newProd.id)
      setPriceForm({ vendor: '', your_cost: '', pricing_date: new Date().toISOString().split('T')[0] })
      setActiveTab('library')
    }
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

// QuickBooks category → ForgePt category mapping
const qbCategoryMap = {
  'network camera': 'Security',
  'dvr': 'Security',
  'access control': 'Security',
  'networking': 'Networking',
  'cabling': 'Material',
  'audio': 'Audio/Visual',
  'music': 'Audio/Visual',
  'digital signage': 'Audio/Visual',
  'wifi': 'Networking',
  'ups power supply battery backup': 'Electrical',
  'storage': 'Material',
  'phones': 'Other',
  'pos': 'Other',
  'maintenance': 'Other',
  'service call': 'Other',
  'camera software licensing': 'Security',
  'computers and accessories': 'Other',
}

const mapCategory = (cat) => {
  if (!cat) return null
  const lower = cat.toLowerCase().trim()
  return qbCategoryMap[lower] || null
}

// QB service types to skip — these are labor/service line items not products
const skipTypes = ['service']
const skipNames = [
  'fuel', 'travel expenses', 'paypal', 'overpayment', 'discount',
  'services', 'telephone number', 'starlink'
]

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
  const itemName = String(r['Item Name'] || r['Product/Service Name'] || r['item_name'] || r['Name'] || r['name'] || '').trim()
  const partNumber = String(r['Part #'] || r['Part Number'] || r['part_number'] || r['SKU'] || '').trim()
  const vendor = String(r['Vendor'] || r['vendor'] || r['Distributor'] || '').trim()
  const itemType = String(r['Item type'] || r['Type'] || '').trim().toLowerCase()
  const rawCategory = String(r['Category'] || r['category'] || '').trim()
  const category = mapCategory(rawCategory) || rawCategory || null
  const description = String(r['Sales Description'] || r['Purchase Description'] || r['Description'] || r['description'] || '').trim() || null
  const manufacturer = String(r['Manufacturer'] || r['manufacturer'] || r['Mfr'] || '').trim() || null

  // Skip pure service items from QuickBooks
  if (itemType === 'service') continue

  // Skip known non-product names
  if (skipNames.some(s => itemName.toLowerCase().includes(s))) continue

  // For QB imports, use Cost column as your_cost
  const costRaw = clean(r['Your Cost'] || r['Cost'] || r['your_cost'] || r['Unit Cost'] || '')
  const cost = parseFloat(costRaw) || null

  // For QB imports, use Price as a fallback if no cost
  const priceRaw = clean(r['Price'] || r['your_cost'] || '')
  const price = parseFloat(priceRaw) || null

  const pricingDateRaw = r['Pricing Date'] || r['pricing_date'] || r['Date'] || ''
  const pricingDate = pricingDateRaw ? String(pricingDateRaw).split('T')[0] : new Date().toISOString().split('T')[0]

  if (!itemName && !partNumber) continue

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
    manufacturer,
    part_number: partNumber || null,
    category,
    unit: String(r['Unit'] || r['unit'] || 'ea').trim().toLowerCase() || 'ea',
    description,
    active: true,
  })
              .select('id')
              .single()

            if (prodErr) continue
            productId = newProd.id
            if (partNumber) partNumberMap[partNumber.toLowerCase()] = productId
            addedProducts++
          }

          // For QB imports with no vendor, still import the product — just skip pricing row
if (!vendor || !productId) continue

// Use cost if available, otherwise use price as fallback
const finalCost = cost && cost > 0 ? cost : (price && price > 0 ? price : null)
if (!finalCost) continue

          // 2. Upsert vendor pricing row
          const { data: existingPrice } = await supabase
            .from('product_library_pricing')
            .select('id')
            .eq('product_id', productId)
            .eq('vendor', vendor)
            .single()

          if (existingPrice) {
            await supabase.from('product_library_pricing')
              .update({ your_cost: finalCost, pricing_date: pricingDate, source: 'excel_import', updated_at: new Date().toISOString() })
              .eq('id', existingPrice.id)
            updatedPrices++
          } else {
            await supabase.from('product_library_pricing')
              .insert({ product_id: productId, org_id: orgId, vendor, your_cost: finalCost, pricing_date: pricingDate, source: 'excel_import' })
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
      msrp: addForm.msrp ? parseFloat(addForm.msrp) : null,
      active: true,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setAddForm({ item_name: '', manufacturer: '', part_number: '', category: '', unit: 'ea', description: '', msrp: '' })
    setShowAddForm(false); setSaving(false)
    const { data: newProd } = await supabase
      .from('product_library')
      .select('id')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    await fetchAll()
    if (newProd?.id) {
      setExpandedId(newProd.id)
      setAddingPriceFor(newProd.id)
      setPriceForm({ vendor: '', your_cost: '', pricing_date: new Date().toISOString().split('T')[0] })
    }
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
    fetchAll()
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

  const filteredCatalog = activeTab !== 'library'
    ? catalogItems.filter(c => {
        if (c.catalog_slug !== activeTab) return false
        const q = search.toLowerCase()
        return !q ||
          (c.model_name || '').toLowerCase().includes(q) ||
          (c.part_number || '').toLowerCase().includes(q) ||
          (c.manufacturer || '').toLowerCase().includes(q) ||
          (c.category || '').toLowerCase().includes(q)
      })
    : []

  const fmt = (n) => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
  const inputCls = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} featureSla={featureSla} featureMonitoring={featureMonitoring} isSalesManager={isSalesManager} isPM={isPM} isTechnician={isTechnician} />

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
              {featureMsrp && <div><label className="text-[#8A9AB0] text-xs mb-1 block">MSRP</label><input type="number" placeholder="0.00" value={addForm.msrp} onChange={e => setAddForm(p => ({ ...p, msrp: e.target.value }))} className={inputCls} /></div>}
            </div>
            <p className="text-[#8A9AB0] text-xs mb-4">After saving, the vendor pricing form will open automatically so you can add costs right away.</p>
            <button onClick={handleAddProduct} disabled={saving || !addForm.item_name}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        )}

        {/* Tabs: My Library + enabled catalogs */}
        {enabledCatalogs.length > 0 && (
          <div className="flex gap-1 bg-[#1a2d45] rounded-xl p-1 w-fit">
            <button onClick={() => setActiveTab('library')}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'library' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>
              My Library
            </button>
            {enabledCatalogs.map(cat => (
              <button key={cat.slug} onClick={() => setActiveTab(cat.slug)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === cat.slug ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Search + filters */}
        <div className="flex gap-3">
          <input type="text" placeholder="Search by name, part #, manufacturer..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
          {activeTab === 'library' && <>
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
          </>}
        </div>

        {/* Pricing freshness legend (library tab only) */}
        {activeTab === 'library' && (
          <div className="flex items-center gap-4 text-xs text-[#8A9AB0]">
            <span className="font-semibold">Pricing age:</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> &lt; 30 days — Current</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> 30–120 days — Aging</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> 120+ days — Stale (RFQ when added to BOM)</span>
          </div>
        )}

        {/* Catalog product list */}
        {activeTab !== 'library' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">
                {enabledCatalogs.find(c => c.slug === activeTab)?.label || activeTab}
                <span className="text-[#8A9AB0] font-normal text-sm ml-2">({filteredCatalog.length.toLocaleString()} products)</span>
              </h3>
              <p className="text-[#8A9AB0] text-xs">MSRP pricing only. Click "Add Pricing" to copy to your library and enter your distributor cost.</p>
            </div>
            {filteredCatalog.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm py-8 text-center">{search ? 'No matching products.' : 'No products in this catalog.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      {['Part #', 'Model / Description', 'Category', 'MSRP', ''].map(h => (
                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalog.map(item => {
                      const inLibrary = !!catalogCopied[item.id]
                      return (
                        <tr key={item.id} className="border-b border-[#2a3d55]/30 hover:bg-[#0F1C2E]/50">
                          <td className="py-2 pr-4 font-mono text-[#8A9AB0] text-xs whitespace-nowrap">{item.part_number || '—'}</td>
                          <td className="py-2 pr-4">
                            <p className="text-white text-sm font-medium">{item.model_name || item.part_number}</p>
                            {item.description && <p className="text-[#8A9AB0] text-xs mt-0.5 truncate max-w-xs">{item.description}</p>}
                          </td>
                          <td className="py-2 pr-4 text-[#8A9AB0] text-xs whitespace-nowrap">{item.category || '—'}</td>
                          <td className="py-2 pr-4 text-white font-semibold whitespace-nowrap">{fmt(item.msrp)}</td>
                          <td className="py-2">
                            <button onClick={() => copyAndAddPricing(item)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${inLibrary ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-[#C8622A]/10 text-[#C8622A] hover:bg-[#C8622A]/20'}`}>
                              {inLibrary ? '✓ In Library' : '+ Add Pricing'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Product list (library tab) */}
        {activeTab === 'library' && <div className="bg-[#1a2d45] rounded-xl p-6">
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
                          title="Delete product"
                          className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors px-1"
                        >✕</button>
                        <span className="text-[#8A9AB0] text-xs">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded: vendor pricing rows */}
                    {isOpen && (
  <div className="border-t border-[#2a3d55] px-4 py-4 space-y-3">
    {editingProductId === p.id ? (
      <div className="bg-[#1a2d45] rounded-lg p-4 space-y-3 mb-3">
        <p className="text-white text-xs font-semibold">Edit Product</p>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Item Name</label>
            <input type="text" value={editForm.item_name || ''} onChange={e => setEditForm(p => ({ ...p, item_name: e.target.value }))} className={inputCls} />
          </div>
          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Manufacturer</label>
            <input type="text" value={editForm.manufacturer || ''} onChange={e => setEditForm(p => ({ ...p, manufacturer: e.target.value }))} className={inputCls} />
          </div>
          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Part #</label>
            <input type="text" value={editForm.part_number || ''} onChange={e => setEditForm(p => ({ ...p, part_number: e.target.value }))} className={inputCls} />
          </div>
          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Category</label>
            <select value={editForm.category || ''} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))} className={inputCls}>
              <option value="">— Select —</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Unit</label>
            <select value={editForm.unit || 'ea'} onChange={e => setEditForm(p => ({ ...p, unit: e.target.value }))} className={inputCls}>
              {['ea', 'ft', 'lot', 'roll', 'box', 'hr'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
            <input type="text" value={editForm.description || ''} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} className={inputCls} />
          </div>
          {featureMsrp && (
            <div><label className="text-[#8A9AB0] text-xs mb-1 block">MSRP</label>
              <input type="number" placeholder="0.00" value={editForm.msrp || ''} onChange={e => setEditForm(p => ({ ...p, msrp: e.target.value }))} className={inputCls} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setEditingProductId(null)} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Cancel</button>
          <button onClick={async () => {
            const { error: updErr } = await supabase.from('product_library').update({
              item_name: editForm.item_name,
              manufacturer: editForm.manufacturer || null,
              part_number: editForm.part_number || null,
              category: editForm.category || null,
              unit: editForm.unit || 'ea',
              description: editForm.description || null,
              msrp: editForm.msrp ? parseFloat(editForm.msrp) : null,
            }).eq('id', p.id)
            if (updErr) { setError(updErr.message); return }
            setEditingProductId(null)
            fetchAll()
          }} className="bg-[#C8622A] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    ) : (
      <div className="flex items-center justify-between mb-2">
        {p.description && <p className="text-[#8A9AB0] text-xs italic">{p.description}</p>}
        {!p.description && <span />}
        <button onClick={() => { setEditingProductId(p.id); setEditForm({ item_name: p.item_name, manufacturer: p.manufacturer, part_number: p.part_number, category: p.category, unit: p.unit, description: p.description, msrp: p.msrp ?? '' }) }}
          className="text-[#8A9AB0] hover:text-white text-xs transition-colors">✎ Edit</button>
      </div>
    )}

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
        </div>}
      </div>
    </div>
  )
}