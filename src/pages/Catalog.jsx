import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import * as XLSX from 'xlsx'

const emptyForm = {
  name: '', part_number: '', description: '', category: '',
  unit: 'ea', msrp: '', dealer_price: '', distributor_price: '',
  your_cost: '', default_markup_percent: '35'
}

export default function Catalog({ isAdmin, featureProposals = true, featureCRM = false }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [uploadFileName, setUploadFileName] = useState(null)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()
    if (!profile?.org_id) { setLoading(false); return }
    setOrgId(profile.org_id)
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('active', true)
      .order('name', { ascending: true })
    setProducts(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!form.name) { setError('Product name is required'); return }
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('products').insert({
      ...form,
      org_id: orgId,
      msrp: parseFloat(form.msrp) || null,
      dealer_price: parseFloat(form.dealer_price) || null,
      distributor_price: parseFloat(form.distributor_price) || null,
      your_cost: parseFloat(form.your_cost) || null,
      default_markup_percent: parseFloat(form.default_markup_percent) || 35,
    })
    if (error) { setError(error.message); setSaving(false); return }
    setSuccess('Product added')
    setForm(emptyForm)
    setShowForm(false)
    fetchData()
    setSaving(false)
  }

  const handleEdit = async (id) => {
    const { error } = await supabase.from('products').update({
      ...editForm,
      msrp: parseFloat(editForm.msrp) || null,
      dealer_price: parseFloat(editForm.dealer_price) || null,
      distributor_price: parseFloat(editForm.distributor_price) || null,
      your_cost: parseFloat(editForm.your_cost) || null,
      default_markup_percent: parseFloat(editForm.default_markup_percent) || 35,
    }).eq('id', id)
    if (error) { setError(error.message); return }
    setSuccess('Product updated')
    setEditingId(null)
    fetchData()
  }

  const handleDelete = async (id) => {
    await supabase.from('products').update({ active: false }).eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  const downloadTemplate = () => {
    const headers = ['Name', 'Part Number', 'Description', 'Category', 'Unit', 'MSRP', 'Dealer Price', 'Distributor Price', 'Your Cost', 'Default Markup %']
    const example = ['Example Product', 'SKU-001', 'Product description', 'Electrical', 'ea', '100.00', '75.00', '65.00', '50.00', '35']
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Catalog')
    XLSX.writeFile(wb, 'ForgePt_Catalog_Template.xlsx')
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadFileName(file.name)
    setUploading(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: 'binary', cellText: false, cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

      const clean = (val) => {
        if (!val) return ''
        return String(val).replace(/[$,%]/g, '').replace(/,/g, '').trim()
      }

      const parsed = rows.filter(r => r['Name'] || r['name']).map(r => ({
        org_id: orgId,
        name: r['Name'] || r['name'] || '',
        part_number: r['Part Number'] || r['part_number'] || '',
        description: r['Description'] || r['description'] || '',
        category: r['Category'] || r['category'] || '',
        unit: r['Unit'] || r['unit'] || 'ea',
        msrp: parseFloat(clean(r['MSRP'] || r['msrp'])) || null,
        dealer_price: parseFloat(clean(r['Dealer Price'] || r['dealer_price'])) || null,
        distributor_price: parseFloat(clean(r['Distributor Price'] || r['distributor_price'])) || null,
        your_cost: parseFloat(clean(r['Your Cost'] || r['your_cost'])) || null,
        default_markup_percent: parseFloat(clean(r['Default Markup %'] || r['default_markup_percent'])) || 35,
        active: true
      }))

      if (parsed.length > 0) {
        const { error } = await supabase.from('products').insert(parsed)
        if (error) { setError(error.message); setUploading(false); return }
        setUploadedCount(parsed.length)
        setSuccess(`${parsed.length} products imported successfully`)
        fetchData()
      }
      setUploading(false)
    }
    reader.readAsBinaryString(file)
  }

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))]

  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || p.name.toLowerCase().includes(q) ||
      (p.part_number || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
    const matchCategory = !filterCategory || p.category === filterCategory
    return matchSearch && matchCategory
  })

  const fmt = (num) => num != null ? `$${Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  const fields = [
    ['name', 'Product Name', true],
    ['part_number', 'Part Number', false],
    ['description', 'Description', false],
    ['category', 'Category', false],
    ['unit', 'Unit', false],
    ['msrp', 'MSRP', false],
    ['dealer_price', 'Dealer Price', false],
    ['distributor_price', 'Distributor Price', false],
    ['your_cost', 'Your Cost', false],
    ['default_markup_percent', 'Default Markup %', false],
  ]

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-white text-2xl font-bold">Product Catalog</h2>
            <p className="text-[#8A9AB0] text-sm mt-0.5">{products.length} products</p>
          </div>
          <div className="flex gap-2">
            <button onClick={downloadTemplate} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
              ↓ Template
            </button>
            <label className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors cursor-pointer">
              {uploading ? 'Uploading...' : '↑ Import CSV/Excel'}
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
            </label>
            <button onClick={() => { setShowForm(!showForm); setError(null) }} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              {showForm ? 'Cancel' : '+ Add Product'}
            </button>
          </div>
        </div>

        {success && <p className="text-green-400 text-sm">{success}</p>}
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {showForm && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold mb-4">New Product</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {fields.map(([field, label, required]) => (
                <div key={field}>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">{label}{required && <span className="text-[#C8622A]"> *</span>}</label>
                  <input type="text" value={form[field]} onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
              ))}
            </div>
            <button onClick={handleAdd} disabled={saving || !form.name}
              className="bg-[#C8622A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <input type="text" placeholder="Search products, part numbers..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">All Products ({filtered.length})</h3>
          {loading ? (
            // Skeleton rows — keeps layout stable while data loads, no full-page blank
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex gap-4 animate-pulse">
                  <div className="h-4 bg-[#2a3d55] rounded w-1/3" />
                  <div className="h-4 bg-[#2a3d55] rounded w-1/6" />
                  <div className="h-4 bg-[#2a3d55] rounded w-1/6" />
                  <div className="h-4 bg-[#2a3d55] rounded w-1/6" />
                  <div className="h-4 bg-[#2a3d55] rounded w-1/6" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#8A9AB0] mb-2">No products yet.</p>
              <p className="text-[#8A9AB0] text-sm">Import your pricebook using the Excel template or add products manually.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    {['Name', 'Part #', 'Category', 'Unit', 'MSRP', 'Dealer', 'Your Cost', 'Markup %', ''].map(h => (
                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    editingId === p.id ? (
                      <tr key={p.id} className="border-b border-[#2a3d55]/30">
                        {['name', 'part_number', 'category', 'unit', 'msrp', 'dealer_price', 'your_cost', 'default_markup_percent'].map(field => (
                          <td key={field} className="pr-2 py-1">
                            <input type="text" value={editForm[field]} onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))}
                              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                          </td>
                        ))}
                        <td className="py-1">
                          <div className="flex gap-2">
                            <button onClick={() => handleEdit(p.id)} className="text-[#C8622A] hover:text-white text-xs transition-colors">Save</button>
                            <button onClick={() => setEditingId(null)} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Cancel</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} className="border-b border-[#2a3d55]/30 hover:bg-[#0F1C2E]/30 transition-colors">
                        <td className="text-white py-3 pr-4 font-medium">{p.name}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{p.part_number || '—'}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{p.category || '—'}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{p.unit || 'ea'}</td>
                        <td className="text-white py-3 pr-4">{fmt(p.msrp)}</td>
                        <td className="text-white py-3 pr-4">{fmt(p.dealer_price)}</td>
                        <td className="text-[#C8622A] py-3 pr-4 font-semibold">{fmt(p.your_cost)}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{p.default_markup_percent ? `${p.default_markup_percent}%` : '—'}</td>
                        <td className="py-3">
                          <div className="flex gap-3">
                            <button onClick={() => { setEditingId(p.id); setEditForm({ name: p.name, part_number: p.part_number || '', description: p.description || '', category: p.category || '', unit: p.unit || 'ea', msrp: p.msrp || '', dealer_price: p.dealer_price || '', distributor_price: p.distributor_price || '', your_cost: p.your_cost || '', default_markup_percent: p.default_markup_percent || '35' }) }}
                              className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Edit</button>
                            <button onClick={() => handleDelete(p.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}