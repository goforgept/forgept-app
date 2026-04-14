import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import * as XLSX from 'xlsx'

const emptyLine = () => ({
  item_name: '', manufacturer: '', part_number_sku: '', quantity: '', unit: 'ea',
  category: '', vendor: '', your_cost_unit: '', markup_percent: '35',
  customer_price_unit: '', pricing_status: 'Needs Pricing'
})

const emptyLaborLine = () => ({
  role: '', quantity: '', unit: 'hr', your_cost: '', markup: 35, customer_price: 0
})

export default function NewProposal({ featureAiBom = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('inline')
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [orgType, setOrgType] = useState('integrator')
  const [vendors, setVendors] = useState([])
  const [taxRate, setTaxRate] = useState('')
  const [taxExempt, setTaxExempt] = useState(false)
  const [locations, setLocations] = useState([])
  const [selectedLocationId, setSelectedLocationId] = useState(null)
  const [form, setForm] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 45)
    const defaultCloseDate = d.toISOString().split('T')[0]
    return {
      rep_name: '', rep_email: '', client_name: '', company: '',
      client_email: '', close_date: defaultCloseDate, industry: '', job_description: ''
    }
  })
  const [lines, setLines] = useState([emptyLine(), emptyLine(), emptyLine()])
  const [uploadedLines, setUploadedLines] = useState([])
  const [uploadFileName, setUploadFileName] = useState(null)
  const [laborItems, setLaborItems] = useState([emptyLaborLine()])
  const [templates, setTemplates] = useState([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [showAIBOMModal, setShowAIBOMModal] = useState(false)
  const [aiBOMPrompt, setAIBOMPrompt] = useState('')
  const [generatingBOM, setGeneratingBOM] = useState(false)
  const [aiBOMPreview, setAIBOMPreview] = useState([])

  useEffect(() => { fetchProfileAndClients() }, [])

  const fetchProfileAndClients = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    if (profile) {
      setForm(prev => ({ ...prev, rep_name: profile.full_name || '', rep_email: profile.email || user.email || '' }))
      setOrgType(profile.organizations?.org_type || 'integrator')
      if (profile.org_id) {
        const { data: clientsData } = await supabase.from('clients').select('*').eq('org_id', profile.org_id).order('company', { ascending: true })
        setClients(clientsData || [])
        fetchTemplates(profile.org_id)
        const { data: vendorData } = await supabase.from('vendors').select('id, vendor_name, default_markup_percent, contact_email').eq('org_id', profile.org_id).eq('active', true).order('vendor_name')
        setVendors(vendorData || [])
        const { data: orgData } = await supabase.from('organizations').select('default_tax_rate').eq('id', profile.org_id).single()
        setTaxRate(orgData?.default_tax_rate ?? '')
      }
    }
    const params = new URLSearchParams(location.search)
    const clientId = params.get('clientId')
    if (clientId) { setSelectedClientId(clientId); prefillClient(clientId) }
  }

  const fetchTemplates = async (orgId) => {
    setLoadingTemplates(true)
    const { data } = await supabase.from('templates').select('*').eq('org_id', orgId).order('name', { ascending: true })
    setTemplates(data || [])
    setLoadingTemplates(false)
  }

  const loadTemplate = async (template) => {
    const { data: items } = await supabase.from('template_line_items').select('*').eq('template_id', template.id).order('id', { ascending: true })
    if (items && items.length > 0) {
      setLines(items.map(l => ({
        item_name: l.item_name || '', manufacturer: l.manufacturer || '',
        part_number_sku: l.part_number_sku || '', quantity: String(l.quantity || ''),
        unit: l.unit || 'ea', category: l.category || '', vendor: l.vendor || '',
        your_cost_unit: String(l.your_cost_unit || ''), markup_percent: String(l.markup_percent || '35'),
        customer_price_unit: String(l.customer_price_unit || ''),
        pricing_status: l.your_cost_unit ? 'Confirmed' : 'Needs Pricing'
      })))
    }
    if (template.labor_items && template.labor_items.length > 0) setLaborItems(template.labor_items)
    if (template.industry) setForm(prev => ({ ...prev, industry: template.industry }))
    setShowTemplateModal(false)
    setTab('inline')
  }

  const prefillClient = async (clientId) => {
    const { data } = await supabase.from('clients').select('*').eq('id', clientId).single()
    if (data) setForm(prev => ({ ...prev, client_name: data.client_name || '', company: data.company || '', client_email: data.email || '', industry: data.industry || prev.industry }))
    // Fetch locations for this client
    const { data: locs } = await supabase.from('client_locations').select('*').eq('client_id', clientId).order('site_name', { ascending: true })
    setLocations(locs || [])
    // Check if a locationId was pre-selected from URL
    const params = new URLSearchParams(location.search)
    const locationId = params.get('locationId')
    if (locationId && locs?.some(l => l.id === locationId)) {
      setSelectedLocationId(locationId)
    }
  }

  const handleClientSelect = (clientId) => {
    setSelectedClientId(clientId)
    if (clientId) prefillClient(clientId)
    else {
      setForm(prev => ({ ...prev, client_name: '', company: '', client_email: '' }))
      setLocations([])
      setSelectedLocationId(null)
    }
  }

  const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const updateLine = (index, field, value) => {
    setLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'your_cost_unit' || field === 'markup_percent') {
        const cost = parseFloat(updated[index].your_cost_unit) || 0
        const markup = parseFloat(updated[index].markup_percent) || 0
        updated[index].customer_price_unit = (cost * (1 + markup / 100)).toFixed(2)
      }
      return updated
    })
  }

  const addLine = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (index) => setLines(prev => prev.filter((_, i) => i !== index))

  const updateLabor = (index, field, value) => {
    setLaborItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      const qty = parseFloat(updated[index].quantity) || 0
      const cost = parseFloat(updated[index].your_cost) || 0
      const markup = parseFloat(updated[index].markup) || 0
      const cp = parseFloat(updated[index].customer_price) || 0
      if (field === 'your_cost' || field === 'markup' || field === 'quantity') {
        if (cost > 0 && qty > 0) updated[index].customer_price = (cost * (1 + markup / 100) * qty).toFixed(2)
      } else if (field === 'customer_price') {
        if (cp > 0 && qty > 0) {
          if (cost > 0) updated[index].markup = (((cp / qty) / cost - 1) * 100).toFixed(1)
          else if (markup >= 0) updated[index].your_cost = (cp / (1 + markup / 100) / qty).toFixed(2)
        }
      }
      return updated
    })
  }

  const addLaborLine = () => setLaborItems(prev => [...prev, emptyLaborLine()])
  const removeLaborLine = (index) => setLaborItems(prev => prev.filter((_, i) => i !== index))

  const generateAIBOM = async () => {
    if (!aiBOMPrompt.trim()) return
    setGeneratingBOM(true)
    setAIBOMPreview([])
    try {
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-build-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ description: aiBOMPrompt, industry: form.industry || '' })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAIBOMPreview(data.items || [])
    } catch (err) { alert('Error generating BOM: ' + err.message) }
    setGeneratingBOM(false)
  }

  const applyAIBOM = () => {
    const laborAI = aiBOMPreview.filter(i => i.category === 'Labor')
    const materialsAI = aiBOMPreview.filter(i => i.category !== 'Labor')
    const newLines = materialsAI.map(item => ({
      item_name: item.item_name, manufacturer: '', part_number_sku: '',
      quantity: String(item.quantity || '1'), unit: item.unit || 'ea',
      category: item.category || '', vendor: '', your_cost_unit: '',
      markup_percent: '35', customer_price_unit: '', pricing_status: 'Needs Pricing'
    }))
    setLines(prev => [...prev.filter(l => l.item_name.trim() !== ''), ...newLines])
    if (laborAI.length > 0) {
      setLaborItems(prev => [...prev.filter(l => l.role), ...laborAI.map(item => ({
        role: item.item_name, quantity: String(item.quantity || ''),
        unit: item.unit === 'hr' ? 'hr' : item.unit === 'day' ? 'day' : 'lot',
        your_cost: '', markup: 35, customer_price: 0
      }))])
    }
    setShowAIBOMModal(false); setAIBOMPrompt(''); setAIBOMPreview([]); setTab('inline')
  }

  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadFileName(file.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: 'binary', cellText: false, cellDates: true, cellFormula: false })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })
      const clean = (val) => {
        if (val === null || val === undefined || val === '') return ''
        if (String(val).startsWith('=')) return ''
        return String(val).replace(/[$,%]/g, '').replace(/,/g, '').trim()
      }
      const looksLikePartNumber = (s) => /^[A-Z0-9-]{3,}$/i.test(String(s).trim()) && !String(s).includes(' ')
      const parsed = rows.filter(r => r['Item Name'] || r['item_name'] || r['Part #']).map(row => {
        let itemName = row['Item Name'] || row['item_name'] || ''
        let partNum = clean(row['Part Number'] || row['Part #'] || row['part_number_sku'] || '')
        if (looksLikePartNumber(itemName) && !looksLikePartNumber(partNum) && partNum) { const temp = itemName; itemName = partNum; partNum = temp }
        const yourCost = clean(row['Your Cost'] || row['Your Cost (Unit)'] || row['your_cost_unit'] || '')
        const markup = clean(row['Markup %'] || row['markup_percent'] || '35')
        const rawCustomerPrice = clean(row['Customer Price'] || row['Customer Price (Unit)'] || row['customer_price_unit'] || '')
        const qty = clean(row['Quantity'] || row['Qty'] || row['quantity'] || '1')
        const unit = String(row['Unit'] || row['unit'] || 'ea').trim().toLowerCase()
        let finalCustomerPrice = rawCustomerPrice
        if ((!finalCustomerPrice || parseFloat(finalCustomerPrice) === 0) && yourCost && markup) finalCustomerPrice = (parseFloat(yourCost) * (1 + parseFloat(markup) / 100)).toFixed(2)
        return {
          item_name: itemName, manufacturer: row['Manufacturer'] || row['manufacturer'] || row['Mfr'] || '',
          part_number_sku: partNum, quantity: qty, unit: unit || 'ea',
          category: row['Category'] || row['category'] || '', vendor: row['Vendor'] || row['vendor'] || '',
          your_cost_unit: yourCost, markup_percent: markup || '35', customer_price_unit: finalCustomerPrice,
          pricing_status: yourCost ? 'Confirmed' : 'Needs Pricing'
        }
      }).filter(r => r.item_name)
      setUploadedLines(parsed)
    }
    reader.readAsBinaryString(file)
  }

  const downloadTemplate = () => {
    const headers = ['Item Name', 'Manufacturer', 'Part #', 'Quantity', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price']
    const exampleRow = ['Example Item', 'Hanwha', 'ABC-123', '2', 'ea', 'Security', 'ADI', '100.00', '35', '135.00']
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BOM')
    XLSX.writeFile(wb, 'ForgePt_BOM_Template.xlsx')
  }

  const handleSubmit = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()

    // Auto-generate quote number
    let quoteNumber = ''
    if (profile?.org_id) {
      const { data: org } = await supabase.from('organizations').select('quote_counter').eq('id', profile.org_id).single()
      quoteNumber = `Q-${org.quote_counter}`
      await supabase.from('organizations').update({ quote_counter: org.quote_counter + 1 }).eq('id', profile.org_id)
    }
    const params = new URLSearchParams(location.search)
    let clientId = params.get('clientId') || selectedClientId
    if (!clientId && form.company) {
      const { data: newClient } = await supabase.from('clients').insert({
        org_id: profile?.org_id, company: form.company, client_name: form.client_name || '',
        email: form.client_email || '', industry: form.industry || '', active: true
      }).select().single()
      if (newClient) clientId = newClient.id
    }
    const taxRateVal = taxExempt ? 0 : (parseFloat(taxRate) || 0)
    const { data: proposal, error } = await supabase.from('proposals').insert({
      proposal_name: form.job_description, user_id: user.id, org_id: profile?.org_id,
      client_id: clientId || null, location_id: selectedLocationId || null, rep_name: form.rep_name, rep_email: form.rep_email,
      client_name: form.client_name, company: form.company, client_email: form.client_email,
      close_date: form.close_date, industry: form.industry, job_description: form.job_description,
      status: 'Draft', submission_type: tab, labor_items: laborItems, quote_number: quoteNumber,
      tax_rate: taxRateVal, tax_exempt: taxExempt
    }).select().single()
    if (error) { alert('Error saving proposal: ' + error.message); setSaving(false); return }
    const activeLines = tab === 'inline' ? lines : uploadedLines
    const validLines = activeLines.filter(l => l.item_name.trim() !== '')
    if (validLines.length > 0) {
      await supabase.from('bom_line_items').insert(validLines.map(l => ({
        proposal_id: proposal.id, item_name: l.item_name, manufacturer: l.manufacturer || null,
        part_number_sku: l.part_number_sku, quantity: parseFloat(l.quantity) || 0, unit: l.unit,
        category: l.category, vendor: l.vendor, your_cost_unit: parseFloat(l.your_cost_unit) || null,
        markup_percent: parseFloat(l.markup_percent) || null, customer_price_unit: parseFloat(l.customer_price_unit) || null,
        customer_price_total: (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0),
        pricing_status: l.your_cost_unit ? 'Confirmed' : 'Needs Pricing', recurring: false
      })))
    }
    const bomCustomer = validLines.reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const bomCost = validLines.reduce((sum, l) => sum + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const laborCustomer = laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
    const laborCost = laborItems.reduce((sum, l) => sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const totalCustomer = bomCustomer + laborCustomer
    const totalCost = bomCost + laborCost
    const grossMarginDollars = totalCustomer - totalCost
    const grossMarginPercent = totalCustomer > 0 ? (grossMarginDollars / totalCustomer) * 100 : 0
    await supabase.from('proposals').update({
      proposal_value: totalCustomer, total_customer_value: totalCustomer, total_your_cost: totalCost,
      total_gross_margin_dollars: grossMarginDollars, total_gross_margin_percent: grossMarginPercent
    }).eq('id', proposal.id)
    setSaving(false)
    navigate(`/proposal/${proposal.id}`)
  }

  const categories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Labor', 'Roofing Materials', 'Insulation', 'Windows & Doors', 'Flooring', 'Painting & Finishing', 'Plumbing', 'HVAC', 'Solar', 'Hardware', 'Other']
  const liveBOMTotal = lines.reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const liveLaborTotal = laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
  const liveGrandTotal = liveBOMTotal + liveLaborTotal
  const liveBOMCost = lines.reduce((sum, l) => sum + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const liveLaborCost = laborItems.reduce((sum, l) => sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const liveTotalCost = liveBOMCost + liveLaborCost
  const liveMargin = liveGrandTotal > 0 ? ((liveGrandTotal - liveTotalCost) / liveGrandTotal * 100).toFixed(1) : '0.0'

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4 flex justify-between items-center">
        <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <button onClick={() => navigate(-1)} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
      </div>
      <div className="p-6 space-y-6">
        <h2 className="text-white text-2xl font-bold">New Proposal</h2>
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold mb-4">Proposal Details</h3>
          <div className="grid grid-cols-2 gap-4">
            {[['rep_name','Rep Name','text'],['rep_email','Rep Email','text']].map(([f,l,t]) => (
              <div key={f}><label className="text-[#8A9AB0] text-xs mb-1 block">{l}</label>
              <input type={t} value={form[f]} onChange={e => updateForm(f, e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" /></div>
            ))}
            <div className="col-span-2">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Select Client (optional)</label>
              <select value={selectedClientId || ''} onChange={e => handleClientSelect(e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                <option value="">— Select existing client or fill in manually —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company}{c.client_name ? ` — ${c.client_name}` : ''}</option>)}
              </select>
            </div>
            {locations.length > 0 && (
              <div className="col-span-2">
                <label className="text-[#8A9AB0] text-xs mb-1 block">Job Site Location (optional)</label>
                <select value={selectedLocationId || ''} onChange={e => setSelectedLocationId(e.target.value || null)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  <option value="">— Select location —</option>
                  {locations.map(l => {
                    const addr = [l.address, l.city, l.state].filter(Boolean).join(', ')
                    return <option key={l.id} value={l.id}>{l.site_name}{addr ? ` — ${addr}` : ''}</option>
                  })}
                </select>
              </div>
            )}
            {[['client_name','Client Name'],['company','Company'],['client_email','Client Email'],['close_date','Close Date'],].map(([f,l]) => (
              <div key={f}><label className="text-[#8A9AB0] text-xs mb-1 block">{l}</label>
              <input type={f === 'close_date' ? 'date' : 'text'} value={form[f]} onChange={e => updateForm(f, e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" /></div>
            ))}
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Industry</label>
              <select value={form.industry} onChange={e => updateForm('industry', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                <option value="">Select industry</option>
                {['Electrical','Mechanical','Plumbing','HVAC','Audio/Visual','Security','Low Voltage','General Contractor','Roofing','Home Improvement','Flooring','Painting','Landscaping','Solar','Fire Protection','Telecom','IT / Networking','Other'].map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div><label className="text-[#8A9AB0] text-xs mb-1 block">Job Description</label>
            <input type="text" value={form.job_description} onChange={e => updateForm('job_description', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" /></div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Tax Rate %</label>
              <input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)}
                placeholder="e.g. 9.25" disabled={taxExempt}
                className={`w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] ${taxExempt ? 'opacity-40' : ''}`} />
            </div>
            <div className="flex items-center gap-3 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={taxExempt} onChange={e => setTaxExempt(e.target.checked)} className="accent-[#C8622A] w-4 h-4" />
                <span className="text-[#8A9AB0] text-sm">Tax Exempt</span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex gap-2">
              {['inline','upload'].map(t => (
                <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === t ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
                  {t === 'inline' ? 'Type It In' : 'Upload Excel'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {featureAiBom && <button onClick={() => setShowAIBOMModal(true)} className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">✨ AI Build BOM</button>}
              {templates.length > 0 && <button onClick={() => setShowTemplateModal(true)} className="flex items-center gap-2 bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">📋 Load Template</button>}
            </div>
          </div>

          {tab === 'inline' && (<>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    {['Item Name','Mfr','Part #','Qty','Unit','Category','Vendor','Your Cost','Markup %','Customer Price',''].map(h => (
                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className={`border-b border-[#2a3d55]/30 ${line.your_cost_unit ? 'bg-green-500/5' : ''}`}>
                      {[['item_name','text','Item name'],['manufacturer','text','Mfr'],['part_number_sku','text','Part #'],['quantity','number','Qty']].map(([field, type, placeholder]) => (
                        <td key={field} className="pr-2 py-1">
                          <input type={type} placeholder={placeholder} value={line[field]} onChange={e => updateLine(i, field, e.target.value)}
                            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                        </td>
                      ))}
                      <td className="pr-2 py-1">
                        <select value={line.unit} onChange={e => updateLine(i, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                          {['ea','ft','lot','hr','box','roll'].map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="pr-2 py-1">
                        <select value={line.category} onChange={e => updateLine(i, 'category', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                          <option value="">Category</option>
                          {categories.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="pr-2 py-1">
                        <select value={line.vendor}
                          onChange={e => {
                            const sel = vendors.find(v => v.vendor_name === e.target.value)
                            updateLine(i, 'vendor', e.target.value)
                            if (sel?.default_markup_percent) updateLine(i, 'markup_percent', String(sel.default_markup_percent))
                          }}
                          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                          <option value="">— Vendor —</option>
                          {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                          <option value="Other">Other</option>
                        </select>
                      </td>
                      <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={line.your_cost_unit} onChange={e => updateLine(i, 'your_cost_unit', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                      <td className="pr-2 py-1"><input type="number" placeholder="35" value={line.markup_percent} onChange={e => updateLine(i, 'markup_percent', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                      <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={line.customer_price_unit} onChange={e => updateLine(i, 'customer_price_unit', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                      <td className="py-1"><button onClick={() => removeLine(i)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addLine} className="mt-4 text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Line Item</button>

            {orgType !== 'manufacturer' && <div className="mt-8">
              <h3 className="text-white font-bold text-base mb-3">Labor</h3>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[#2a3d55]">{['Role','Qty (hrs)','Unit','Your Cost/hr','Markup %','Total Labor',''].map(h => <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>)}</tr></thead>
                <tbody>
                  {laborItems.map((item, index) => (
                    <tr key={index} className="border-b border-[#2a3d55]/30">
                      <td className="pr-2 py-1"><input type="text" placeholder="e.g. Electrician" value={item.role} onChange={e => updateLabor(index, 'role', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                      <td className="pr-2 py-1"><input type="number" placeholder="0" value={item.quantity} onChange={e => updateLabor(index, 'quantity', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                      <td className="pr-2 py-1"><select value={item.unit || 'hr'} onChange={e => updateLabor(index, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">{['hr','day','lot'].map(u => <option key={u}>{u}</option>)}</select></td>
                      <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.your_cost} onChange={e => updateLabor(index, 'your_cost', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                      <td className="pr-2 py-1"><input type="number" placeholder="35" value={item.markup} onChange={e => updateLabor(index, 'markup', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                      <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.customer_price || ''} onChange={e => updateLabor(index, 'customer_price', e.target.value)} className="w-20 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold" /></td>
                      <td className="py-1"><button onClick={() => removeLaborLine(index)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan="5" className="text-[#8A9AB0] pt-3 text-right font-semibold text-xs">Total Labor</td><td className="text-[#C8622A] pt-3 font-bold pr-2">${liveLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr></tfoot>
              </table>
              <button onClick={addLaborLine} className="mt-4 text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Labor</button>
            </div>}

            <div className="mt-6 border-t border-[#2a3d55] pt-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Materials</span><span className="text-white">${liveBOMTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
              {orgType !== 'manufacturer' && <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Labor</span><span className="text-white">${liveLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
              {!taxExempt && parseFloat(taxRate) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-[#8A9AB0]">Tax ({taxRate}%)</span>
                  <span className="text-white">${(liveBOMTotal * parseFloat(taxRate) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold border-t border-[#2a3d55] pt-2"><span className="text-white">Grand Total</span><span className="text-[#C8622A]">${(liveGrandTotal + (!taxExempt ? liveBOMTotal * (parseFloat(taxRate) || 0) / 100 : 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Gross Margin</span><span className="text-[#C8622A] font-semibold">{liveMargin}%</span></div>
            </div>
          </>)}

          {tab === 'upload' && (
            <div className="space-y-4">
              <div className="flex gap-4 items-center">
                <button onClick={downloadTemplate} className="bg-[#0F1C2E] text-[#8A9AB0] hover:text-white border border-[#2a3d55] px-4 py-2 rounded-lg text-sm transition-colors">↓ Download Template</button>
                <p className="text-[#8A9AB0] text-sm">Download the template, fill it in, then upload below.</p>
              </div>
              <label className="block w-full border-2 border-dashed border-[#2a3d55] rounded-xl p-8 text-center cursor-pointer hover:border-[#C8622A] transition-colors">
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
                {uploadFileName ? (
                  <div><p className="text-green-400 font-semibold">{uploadFileName}</p><p className="text-[#8A9AB0] text-sm mt-1">{uploadedLines.length} line items parsed</p></div>
                ) : (
                  <div><p className="text-white font-semibold">Click to upload or drag and drop</p><p className="text-[#8A9AB0] text-sm mt-1">.xlsx, .xls, or .csv files</p></div>
                )}
              </label>
              {uploadedLines.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-[#2a3d55]">{['Item','Mfr','Part #','Qty','Category','Vendor','Customer Price'].map(h => <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>)}</tr></thead>
                    <tbody>
                      {uploadedLines.map((line, i) => (
                        <tr key={i} className="border-b border-[#2a3d55]/30">
                          <td className="text-white py-2 pr-4">{line.item_name}</td>
                          <td className="text-[#8A9AB0] py-2 pr-4">{line.manufacturer || '—'}</td>
                          <td className="text-[#8A9AB0] py-2 pr-4">{line.part_number_sku || '—'}</td>
                          <td className="text-[#8A9AB0] py-2 pr-4">{line.quantity}</td>
                          <td className="text-[#8A9AB0] py-2 pr-4">{line.category || '—'}</td>
                          <td className="text-[#8A9AB0] py-2 pr-4">{line.vendor || '—'}</td>
                          <td className="text-white py-2 text-right">{line.customer_price_unit || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-4">
          <button onClick={() => navigate(-1)} className="px-6 py-3 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-3 bg-[#C8622A] text-white rounded-lg font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Submit Proposal'}
          </button>
        </div>
      </div>

      {showAIBOMModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-1">✨ AI BOM Builder</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Describe the system or project and AI will generate a complete parts list.</p>
            <div className="space-y-4">
              <textarea value={aiBOMPrompt} onChange={e => setAIBOMPrompt(e.target.value)} rows={3} placeholder="e.g. 8 camera outdoor commercial security system with NVR and PoE switch." className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              <button onClick={generateAIBOM} disabled={generatingBOM || !aiBOMPrompt.trim()} className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                {generatingBOM ? '✨ Building BOM...' : '✨ Generate BOM'}
              </button>
              {aiBOMPreview.length > 0 && (
                <div>
                  <p className="text-white text-sm font-semibold mb-2">{aiBOMPreview.length} items — review before adding</p>
                  <div className="bg-[#0F1C2E] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-[#2a3d55]">{['Item','Qty','Unit','Category'].map(h => <th key={h} className="text-[#8A9AB0] text-left py-2 px-3 font-normal">{h}</th>)}</tr></thead>
                      <tbody>{aiBOMPreview.map((item, i) => <tr key={i} className="border-b border-[#2a3d55]/30"><td className="text-white py-2 px-3">{item.item_name}</td><td className="text-[#8A9AB0] py-2 px-3">{item.quantity}</td><td className="text-[#8A9AB0] py-2 px-3">{item.unit}</td><td className="text-[#8A9AB0] py-2 px-3">{item.category}</td></tr>)}</tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAIBOMModal(false); setAIBOMPreview([]); setAIBOMPrompt('') }} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                {aiBOMPreview.length > 0 && <button onClick={applyAIBOM} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Add {aiBOMPreview.length} Items →</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-1">Load a Template</h3>
            <input type="text" placeholder="Search templates..." value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0] mb-4 mt-3" />
            {loadingTemplates ? <p className="text-[#8A9AB0]">Loading...</p> : (
              <div className="space-y-2">
                {templates.filter(t => { const q = templateSearch.toLowerCase(); return !q || t.name.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q) || (t.industry||'').toLowerCase().includes(q) }).map(template => {
                  const labor = template.labor_items || []
                  const totalLabor = labor.reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0)
                  return (
                    <div key={template.id} onClick={() => loadTemplate(template)} className="flex justify-between items-center bg-[#0F1C2E] hover:bg-[#0a1520] rounded-xl px-4 py-3 cursor-pointer transition-colors border border-[#2a3d55] hover:border-[#C8622A]/40">
                      <div><p className="text-white text-sm font-semibold">{template.name}</p><p className="text-[#8A9AB0] text-xs">{template.industry} {template.description}</p></div>
                      <div className="text-right ml-4">{totalLabor > 0 && <p className="text-[#C8622A] text-xs font-semibold">${totalLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })} labor</p>}<p className="text-[#8A9AB0] text-xs">→ Load</p></div>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={() => { setShowTemplateModal(false); setTemplateSearch('') }} className="mt-5 w-full py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}