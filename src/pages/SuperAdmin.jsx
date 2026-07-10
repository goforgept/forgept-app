import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import GlobalProductsImport from '../components/GlobalProductsImport'
import AccessoriesEditor from '../components/AccessoriesEditor'

const PLANS = [
  { name: 'Trial', rate: 0, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { name: 'Early Adopter', rate: 100, color: 'text-green-400', bg: 'bg-green-500/20' },
  { name: 'Designer Only', rate: 49, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { name: 'Small Team', rate: 99, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { name: 'Team', rate: 149, color: 'text-indigo-400', bg: 'bg-indigo-500/20' },
  { name: 'Business', rate: 199, color: 'text-[#C8622A]', bg: 'bg-[#C8622A]/20' },
  { name: 'QuickBooks Add-on', rate: 25, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { name: 'Enterprise', rate: null, color: 'text-green-400', bg: 'bg-green-500/20' },
]

const ORG_TYPES = [
  { value: 'integrator', label: 'Integrator', desc: 'Trades contractor — full BOM, proposals, POs' },
  { value: 'manufacturer', label: 'Manufacturer', desc: 'Product catalog, quotes, AI email tools' },
  { value: 'distributor', label: 'Distributor', desc: 'Dealer management, price lists, quotes' },
]

const emptyBillingForm = { plan: 'Trial', billing_status: 'trial', monthly_rate: 0, trial_ends_at: '' }

function DesignerMfrPicker({ selected, onChange }) {
  const [manufacturers, setManufacturers] = useState([])
  useEffect(() => {
    supabase.from('global_products').select('manufacturer').eq('is_active', true)
      .then(({ data }) => {
        const unique = [...new Set((data || []).map(r => r.manufacturer).filter(Boolean))].sort()
        setManufacturers(unique)
      })
  }, [])
  const toggle = (mfr) => {
    if (selected.includes(mfr)) onChange(selected.filter(m => m !== mfr))
    else onChange([...selected, mfr])
  }
  if (!manufacturers.length) return <p className="text-[#8A9AB0] text-xs">Loading manufacturers…</p>
  return (
    <div className="max-h-48 overflow-y-auto border border-[#2a3d55] rounded-lg divide-y divide-[#2a3d55]">
      {manufacturers.map(mfr => (
        <label key={mfr} className="flex items-center gap-3 px-3 py-2 bg-[#0F1C2E] cursor-pointer hover:bg-[#1a2d45] transition-colors">
          <input type="checkbox" checked={selected.includes(mfr)} onChange={() => toggle(mfr)}
            className="w-4 h-4 rounded accent-[#C8622A]" />
          <span className="text-white text-sm">{mfr}</span>
        </label>
      ))}
    </div>
  )
}

// Catalog access picker — shown in org edit settings
function CatalogAccessPicker({ selected, onChange }) {
  const [catalogs, setCatalogs] = useState([]) // [{ slug, label, count }]
  useEffect(() => {
    supabase.from('catalog_products')
      .select('catalog_slug, catalog_label')
      .eq('active', true)
      .then(({ data }) => {
        const map = {}
        ;(data || []).forEach(r => {
          if (!map[r.catalog_slug]) map[r.catalog_slug] = { slug: r.catalog_slug, label: r.catalog_label || r.catalog_slug, count: 0 }
          map[r.catalog_slug].count++
        })
        setCatalogs(Object.values(map).sort((a, b) => a.label.localeCompare(b.label)))
      })
  }, [])
  const toggle = (slug) => {
    if (selected.includes(slug)) onChange(selected.filter(s => s !== slug))
    else onChange([...selected, slug])
  }
  if (!catalogs.length) return null
  return (
    <div>
      <p className="text-[#8A9AB0] text-xs font-semibold mb-1.5">Product Catalogs</p>
      <p className="text-[#8A9AB0] text-xs mb-2">Enable manufacturer price sheet catalogs this org can search. Disabled catalogs are completely hidden.</p>
      <div className="border border-[#2a3d55] rounded-lg divide-y divide-[#2a3d55] overflow-hidden">
        {catalogs.map(cat => (
          <label key={cat.slug} className="flex items-center justify-between px-3 py-2.5 bg-[#0F1C2E] cursor-pointer hover:bg-[#1a2d45] transition-colors">
            <div>
              <span className="text-white text-sm">{cat.label}</span>
              <span className="text-[#8A9AB0] text-xs ml-2">({cat.count.toLocaleString()} products)</span>
            </div>
            <button onClick={() => toggle(cat.slug)}
              className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors ${selected.includes(cat.slug) ? 'bg-[#C8622A]' : 'bg-[#4B5563]'}`}>
              <span className={`inline-block w-4 h-4 rounded-full bg-white shadow transition-transform ${selected.includes(cat.slug) ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </label>
        ))}
      </div>
    </div>
  )
}

// Catalogs tab — import and manage global manufacturer price sheet catalogs
function CatalogsTab() {
  const [catalogs, setCatalogs] = useState([]) // [{ slug, label, count, updated }]
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importForm, setImportForm] = useState({ slug: '', label: '' })
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)
  const [showImportForm, setShowImportForm] = useState(false)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { fetchCatalogs() }, [])

  const fetchCatalogs = async () => {
    setLoading(true)
    const { data } = await supabase.from('catalog_products').select('catalog_slug, catalog_label, created_at').eq('active', true)
    const map = {}
    ;(data || []).forEach(r => {
      if (!map[r.catalog_slug]) map[r.catalog_slug] = { slug: r.catalog_slug, label: r.catalog_label || r.catalog_slug, count: 0, updated: r.created_at }
      map[r.catalog_slug].count++
      if (r.created_at > map[r.catalog_slug].updated) map[r.catalog_slug].updated = r.created_at
    })
    setCatalogs(Object.values(map).sort((a, b) => a.label.localeCompare(b.label)))
    setLoading(false)
  }

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return
    if (!importForm.slug.trim() || !importForm.label.trim()) { setImportError('Enter a catalog slug and label first.'); return }
    setImporting(true); setImportError(null); setImportResult(null)
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data)
      const sheetName = wb.SheetNames.find(n => n.trim() === 'HVA Pricelist') || wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]

      // Find the actual header row — scan raw rows until we hit one containing known column names
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const headerRowIdx = raw.findIndex(row =>
        row.some(cell => ['Item #', 'Category', 'Part Number', 'Part #', 'Model Name', 'Item Type'].includes(String(cell).trim()))
      )
      const rows = headerRowIdx >= 0
        ? XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRowIdx })
        : XLSX.utils.sheet_to_json(ws, { defval: '' })

      const items = rows.map(r => {
        // "Item #" / "Item Type" = Hanwha pricebook column names
        const partNumber = String(r['Item #'] || r['Part Number'] || r['Part #'] || r['part_number'] || r['SKU'] || r['sku'] || '').trim()
        const modelName = String(r['Item Type'] || r['Model Name'] || r['Model'] || r['Item Name'] || r['item_name'] || r['Name'] || '').trim()
        const description = String(r['Description'] || r['Sales Description'] || r['description'] || '').trim() || null
        // Fuzzy MSRP lookup — catches "MSRP", "MSRP ", "MSRP (USD)", etc.
        const msrpKey = Object.keys(r).find(k => k.trim().toUpperCase().startsWith('MSRP') || k.trim() === 'List Price' || k.trim() === 'Price')
        const msrpRaw = msrpKey ? r[msrpKey] : ''
        const msrp = parseFloat(String(msrpRaw).replace(/[$,\s]/g, '')) || null
        const category = String(r['Category'] || r['category'] || '').trim()
        const manufacturer = String(r['Manufacturer'] || r['manufacturer'] || r['Brand'] || importForm.label || '').trim()
        const unit = String(r['Unit'] || r['unit'] || 'ea').trim() || 'ea'
        return { catalog_slug: importForm.slug.trim(), catalog_label: importForm.label.trim(), manufacturer, part_number: partNumber, model_name: modelName, description, msrp, category, unit, active: true }
      }).filter(r => r.part_number || r.model_name)

      if (items.length === 0) { setImportError('No valid rows found. Make sure Part Number or Model Name column exists.'); setImporting(false); return }

      // Fetch existing items for this slug so we can UPDATE in place (preserves IDs → dealer pricing links stay intact)
      const { data: existing } = await supabase.from('catalog_products').select('id, part_number').eq('catalog_slug', importForm.slug.trim())
      const existingMap = {}
      ;(existing || []).forEach(e => { if (e.part_number) existingMap[e.part_number] = e.id })

      const toInsert = [], toUpdate = []
      items.forEach(item => {
        const existingId = item.part_number ? existingMap[item.part_number] : null
        if (existingId) toUpdate.push({ id: existingId, ...item })
        else toInsert.push(item)
      })

      const BATCH = 500
      for (let i = 0; i < toInsert.length; i += BATCH) {
        await supabase.from('catalog_products').insert(toInsert.slice(i, i + BATCH))
      }
      for (let i = 0; i < toUpdate.length; i += BATCH) {
        await Promise.all(toUpdate.slice(i, i + BATCH).map(({ id, ...fields }) =>
          supabase.from('catalog_products').update(fields).eq('id', id)
        ))
      }
      setImportResult({ added: toInsert.length, updated: toUpdate.length, slug: importForm.slug.trim() })
      setImportForm({ slug: '', label: '' })
      setShowImportForm(false)
      fetchCatalogs()
    } catch (err) { setImportError(err.message) }
    setImporting(false)
  }

  const deleteCatalog = async (slug) => {
    if (!window.confirm(`Delete all products in catalog "${slug}"? This cannot be undone.`)) return
    setDeleting(slug)
    await supabase.from('catalog_products').delete().eq('catalog_slug', slug)
    setDeleting(null)
    fetchCatalogs()
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-lg">Manufacturer Catalogs</h3>
          <p className="text-[#8A9AB0] text-sm mt-0.5">Global price sheet catalogs — enabled per org, MSRP only, dealers add their own distrib pricing</p>
        </div>
        <button onClick={() => setShowImportForm(v => !v)}
          className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
          {showImportForm ? 'Cancel' : '+ Import Catalog'}
        </button>
      </div>

      {importResult && <p className="text-green-400 text-sm">{importResult.added} added · {importResult.updated} updated in "{importResult.slug}"</p>}
      {importError && <p className="text-red-400 text-sm">{importError}</p>}

      {showImportForm && (
        <div className="bg-[#1a2d45] rounded-xl p-5 space-y-4 border border-[#2a3d55]">
          <p className="text-white font-semibold text-sm">Import Price Sheet</p>
          <p className="text-[#8A9AB0] text-xs">Upload a CSV or Excel file. Expected columns: Part Number, Model Name / Description, MSRP / List Price, Category, Manufacturer (optional). Importing replaces the entire catalog for that slug.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Catalog Slug <span className="text-[#C8622A]">*</span></label>
              <input type="text" placeholder="e.g. hanwha_step" value={importForm.slug}
                onChange={e => setImportForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              <p className="text-[#8A9AB0] text-xs mt-1">Lowercase letters, numbers, underscores only</p>
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Display Name <span className="text-[#C8622A]">*</span></label>
              <input type="text" placeholder="e.g. Hanwha Step Partner" value={importForm.label}
                onChange={e => setImportForm(p => ({ ...p, label: e.target.value }))}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
          </div>
          <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors ${importing ? 'bg-[#2a3d55] text-[#8A9AB0] opacity-50 pointer-events-none' : 'bg-[#2a3d55] text-white hover:bg-[#3a4d65]'}`}>
            {importing ? 'Importing…' : '📂 Choose File (CSV / Excel)'}
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" disabled={importing} />
          </label>
        </div>
      )}

      {loading ? <p className="text-[#8A9AB0]">Loading…</p> : catalogs.length === 0 ? (
        <div className="bg-[#1a2d45] rounded-xl p-10 text-center border border-[#2a3d55]">
          <p className="text-[#8A9AB0]">No catalogs yet. Import a price sheet to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {catalogs.map(cat => (
            <div key={cat.slug} className="bg-[#1a2d45] rounded-xl p-4 border border-[#2a3d55] flex items-center justify-between">
              <div>
                <p className="text-white font-semibold">{cat.label}</p>
                <p className="text-[#8A9AB0] text-xs mt-0.5">
                  Slug: <span className="font-mono text-[#C8622A]">{cat.slug}</span> · {cat.count.toLocaleString()} products · Updated {new Date(cat.updated).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <label className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${importing ? 'opacity-50 pointer-events-none' : 'bg-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}>
                  Re-import
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={async (e) => {
                    setImportForm({ slug: cat.slug, label: cat.label })
                    await handleFile(e)
                  }} className="hidden" disabled={importing} />
                </label>
                <button onClick={() => deleteCatalog(cat.slug)} disabled={deleting === cat.slug}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50">
                  {deleting === cat.slug ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SuperAdmin() {
  const [orgs, setOrgs] = useState([])
  const [profiles, setProfiles] = useState([])
  const [saUsers, setSaUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [roadmapItems, setRoadmapItems] = useState([])
  const [embedUsage, setEmbedUsage] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab,      setActiveTab]      = useState('requests')
  const [showImport,     setShowImport]     = useState(false)
  const [productCount,   setProductCount]   = useState(0)
  const [editingBilling, setEditingBilling] = useState(null)
  const [billingForm, setBillingForm] = useState(emptyBillingForm)
  const [editingOrg, setEditingOrg] = useState(null)
  const [orgForm, setOrgForm] = useState({})
  const [unauthorized, setUnauthorized] = useState(false)
  const [stripeModal, setStripeModal] = useState(null)
  const [stripeForm, setStripeForm] = useState({ plan: 'Early Adopter', qboAddon: false })
  const [creatingSubscription, setCreatingSubscription] = useState(false)
  const [stripeResult, setStripeResult] = useState(null)
  const [deleteModal, setDeleteModal] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingOrg, setDeletingOrg] = useState(false)

  // New state
  const [allProposals, setAllProposals] = useState([])
  const [allClients, setAllClients] = useState([])
  const [expandedOrg, setExpandedOrg] = useState(null)
  const [orgNotes, setOrgNotes] = useState({})
  const [savingNote, setSavingNote] = useState(null)
  const [noteSaved, setNoteSaved] = useState(null)
  const [orgDetail, setOrgDetail] = useState({})
  const [loadingDetail, setLoadingDetail] = useState(null)
  const [orgSearch, setOrgSearch] = useState('')
  const [metricsSortBy, setMetricsSortBy] = useState('health')
  const [pinQuery, setPinQuery] = useState('')
  const [pinResult, setPinResult] = useState(null)
  const [pinLookupLoading, setPinLookupLoading] = useState(false)
  const [pinError, setPinError] = useState(null)

  // Password gate
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordChecking, setPasswordChecking] = useState(false)
  const [unlocked, setUnlocked] = useState(() => !!sessionStorage.getItem('sa_unlocked'))

  // SA Users tab state
  const [saUserEmail, setSaUserEmail] = useState('')
  const [saUserMsg, setSaUserMsg] = useState('')
  const [saUserWorking, setSaUserWorking] = useState(false)

  const navigate = useNavigate()

  const getSaPassword = () => sessionStorage.getItem('sa_password') || ''

  const handleUnlock = async () => {
    if (!passwordInput.trim()) return
    setPasswordChecking(true)
    setPasswordError('')
    const result = await supabase.functions.invoke('superadmin-get-data', {
      body: { sa_password: passwordInput.trim(), probe: true }
    })
    if (result.error || result.data?.error) {
      setPasswordError('Incorrect password.')
      setPasswordChecking(false)
      return
    }
    sessionStorage.setItem('sa_unlocked', 'true')
    sessionStorage.setItem('sa_password', passwordInput.trim())
    setUnlocked(true)
    setPasswordChecking(false)
  }

  useEffect(() => { if (unlocked) fetchData() }, [unlocked])

  const fetchData = async () => {
    const saPassword = getSaPassword()
    const [
      { data: orgsData },
      { data: requestsData },
      { data: proposalsData },
      { data: clientsData },
      profilesResult,
    ] = await Promise.all([
      supabase.from('organizations').select('*').order('created_at', { ascending: false }),
      supabase.from('access_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('proposals').select('id, org_id, created_at, status, proposal_value, proposal_name').order('created_at', { ascending: false }),
      supabase.from('clients').select('id, org_id'),
      supabase.functions.invoke('superadmin-get-data', { body: { sa_password: saPassword } }),
    ])

    if (profilesResult?.data?.error === 'Invalid password') {
      sessionStorage.removeItem('sa_unlocked')
      sessionStorage.removeItem('sa_password')
      setUnlocked(false)
      setLoading(false)
      return
    }

    const profilesData = profilesResult?.data?.profiles || []

    const orgsResult = orgsData || []
    setOrgs(orgsResult)
    setProfiles(profilesData)
    setSaUsers(profilesResult?.data?.sa_users || [])
    setRequests(requestsData || [])
    setAllProposals(proposalsData || [])
    setAllClients(clientsData || [])
    setRoadmapItems(profilesResult?.data?.roadmap_items || [])
    setEmbedUsage(profilesResult?.data?.embed_usage || {})

    const notesMap = {}
    for (const org of orgsResult) {
      if (org.superadmin_notes) notesMap[org.id] = org.superadmin_notes
    }
    setOrgNotes(notesMap)
    setLoading(false)
  }

  const fetchOrgDetail = async (orgId) => {
    if (orgDetail[orgId]) return // already cached
    setLoadingDetail(orgId)
    const { data: activities } = await supabase
      .from('activities')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(8)
    setOrgDetail(prev => ({ ...prev, [orgId]: { activities: activities || [] } }))
    setLoadingDetail(null)
  }

  const toggleExpandedOrg = (orgId) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null)
    } else {
      setExpandedOrg(orgId)
      fetchOrgDetail(orgId)
    }
  }

  const saveOrgNote = async (orgId) => {
    setSavingNote(orgId)
    await supabase.from('organizations').update({ superadmin_notes: orgNotes[orgId] || '' }).eq('id', orgId)
    setSavingNote(null)
    setNoteSaved(orgId)
    setTimeout(() => setNoteSaved(n => n === orgId ? null : n), 2000)
  }


  const impersonateUser = (org, user) => {
    localStorage.setItem('sa_impersonate', JSON.stringify({
      orgId: org.id,
      orgName: org.name,
      userId: user.id,
      userName: user.full_name,
    }))
    window.location.href = '/'
  }

  const lookupPin = async () => {
    if (!/^\d{6}$/.test(pinQuery)) return
    setPinLookupLoading(true)
    setPinError(null)
    setPinResult(null)
    const { data, error } = await supabase.functions.invoke('superadmin-pin-lookup', { body: { pin: pinQuery } })
    setPinLookupLoading(false)
    if (error) { setPinError('Lookup failed. Try again.'); return }
    if (!data?.match) { setPinError('No account found with that PIN.'); return }
    setPinResult(data.match)
  }

  const getOrgHealth = (orgId) => {
    const orgProps = allProposals.filter(p => p.org_id === orgId)
    const orgMembers = profiles.filter(p => p.org_id === orgId)
    const lastLogin = orgMembers.reduce((max, m) => m.last_login && new Date(m.last_login) > max ? new Date(m.last_login) : max, new Date(0))
    const lastProposal = orgProps.length ? new Date(orgProps[0].created_at) : new Date(0)
    const lastActive = lastLogin > lastProposal ? lastLogin : lastProposal
    if (lastActive.getTime() === 0) return { label: 'No activity', dot: 'bg-gray-500', labelColor: 'text-[#8A9AB0]', status: 'silent' }
    const days = Math.floor((Date.now() - lastActive) / 86400000)
    if (days < 7) return { label: `Active ${days}d ago`, dot: 'bg-green-400', labelColor: 'text-green-400', status: 'active' }
    if (days < 30) return { label: `${days}d ago`, dot: 'bg-yellow-400', labelColor: 'text-yellow-400', status: 'moderate' }
    return { label: `Inactive ${days}d ago`, dot: 'bg-red-400', labelColor: 'text-red-400', status: 'inactive' }
  }

  const getOrgStats = (orgId) => {
    const props = allProposals.filter(p => p.org_id === orgId)
    const last30 = props.filter(p => new Date(p.created_at) > new Date(Date.now() - 30 * 86400000))
    const won = props.filter(p => p.status === 'Won')
    return {
      total: props.length,
      last30: last30.length,
      clients: allClients.filter(c => c.org_id === orgId).length,
      won: won.length,
      wonValue: won.reduce((s, p) => s + (p.proposal_value || 0), 0),
      recentProps: props.slice(0, 5),
    }
  }

  const getOrgProfiles = (orgId) => profiles.filter(p => p.org_id === orgId)
  const getOrgAdmin = (orgId) => profiles.find(p => p.org_id === orgId && p.org_role === 'admin')

  const approveRequest = async (request) => {
    try {
      const { data, error } = await supabase.functions.invoke('approve-request', {
        body: { requestId: request.id, fullName: request.full_name, email: request.email, companyName: request.company_name }
      })
      if (error) alert('Error approving request: ' + error.message)
      else if (data?.success) fetchData()
      else alert('Error approving request: ' + (data?.error || 'Unknown error'))
    } catch (err) {
      alert('Error approving request: ' + err.message)
    }
  }

  const rejectRequest = async (requestId) => {
    if (!window.confirm('Reject this request?')) return
    await supabase.from('access_requests').update({ status: 'rejected' }).eq('id', requestId)
    fetchData()
  }

  const suspendOrg = async (orgId) => {
    if (!window.confirm('Suspend this organization?')) return
    await supabase.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
    fetchData()
  }

  const reactivateOrg = async (orgId) => {
    await supabase.from('organizations').update({ status: 'active' }).eq('id', orgId)
    fetchData()
  }

  const deleteOrg = async () => {
    if (!deleteModal || deleteConfirmText !== deleteModal.name) return
    setDeletingOrg(true)
    try {
      const { data, error } = await supabase.functions.invoke('delete-org-users', {
        body: { orgId: deleteModal.id },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.error)

      const deletedId = deleteModal.id
      setDeleteModal(null)
      setDeleteConfirmText('')
      setOrgs(prev => prev.filter(o => o.id !== deletedId))
      setAllProposals(prev => prev.filter(p => p.org_id !== deletedId))
      setAllClients(prev => prev.filter(c => c.org_id !== deletedId))
    } catch (err) {
      alert('Error deleting org: ' + err.message)
    }
    setDeletingOrg(false)
  }

  const startEditingOrg = (org) => {
    setEditingOrg(org.id)
    setOrgForm({
      org_type: org.org_type || 'integrator',
      feature_proposals:      org.feature_proposals !== false,
      feature_crm:            org.feature_crm            || false,
      feature_send_proposal:  org.feature_send_proposal  || false,
      feature_ai_email:       org.feature_ai_email       || false,
      feature_purchase_orders: org.feature_purchase_orders !== false,
      feature_invoices:       org.feature_invoices !== false,
      feature_ai_bom:         org.feature_ai_bom         || false,
      feature_site_photos:    org.feature_site_photos !== false,
      feature_drawing_tool:   org.feature_drawing_tool   || false,
      feature_designer_only:  org.feature_designer_only  || false,
      feature_spec_reader:    org.feature_spec_reader    || false,
      feature_drawing_reader: org.feature_drawing_reader || false,
      feature_api:            org.feature_api            || false,
      feature_embed:          org.feature_embed          || false,
      feature_regions:        org.feature_regions        || false,
      designer_allowed_manufacturers: org.designer_allowed_manufacturers || null,
      enabled_catalogs: org.enabled_catalogs || [],
    })
  }

  const saveOrgSettings = async (orgId) => {
    await supabase.from('organizations').update({
      org_type: orgForm.org_type,
      feature_proposals: orgForm.feature_proposals,
      feature_crm: orgForm.feature_crm,
      feature_send_proposal: orgForm.feature_send_proposal,
      feature_ai_email: orgForm.feature_ai_email,
      feature_purchase_orders: orgForm.feature_purchase_orders,
      feature_invoices: orgForm.feature_invoices,
      feature_ai_bom: orgForm.feature_ai_bom,
      feature_site_photos: orgForm.feature_site_photos,
      feature_drawing_tool:   orgForm.feature_drawing_tool,
      feature_designer_only:  orgForm.feature_designer_only,
      feature_spec_reader:    orgForm.feature_spec_reader,
      feature_drawing_reader: orgForm.feature_drawing_reader,
      feature_api:            orgForm.feature_api,
      feature_embed:          orgForm.feature_embed,
      feature_regions:        orgForm.feature_regions,
      designer_allowed_manufacturers: orgForm.designer_allowed_manufacturers?.length ? orgForm.designer_allowed_manufacturers : null,
      enabled_catalogs: orgForm.enabled_catalogs?.length ? orgForm.enabled_catalogs : [],
    }).eq('id', orgId)
    setEditingOrg(null)
    fetchData()
  }

  const startEditingBilling = (org) => {
    setEditingBilling(org.id)
    setBillingForm({
      plan: org.plan || 'Trial',
      billing_status: org.billing_status || 'trial',
      monthly_rate: org.monthly_rate || 0,
      trial_ends_at: org.trial_ends_at ? new Date(org.trial_ends_at).toISOString().split('T')[0] : ''
    })
  }

  const updateBilling = async (orgId) => {
    await supabase.from('organizations').update({
      plan: billingForm.plan,
      billing_status: billingForm.billing_status,
      monthly_rate: parseFloat(billingForm.monthly_rate) || 0,
      trial_ends_at: billingForm.trial_ends_at || null
    }).eq('id', orgId)
    setEditingBilling(null)
    setBillingForm(emptyBillingForm)
    fetchData()
  }

  const openStripeModal = (org) => {
    const admin = getOrgAdmin(org.id)
    setStripeModal({ org, admin })
    setStripeForm({ plan: org.plan && org.plan !== 'Trial' && org.plan !== 'QuickBooks Add-on' ? org.plan : 'Early Adopter', qboAddon: org.quickbooks_addon || false })
    setStripeResult(null)
  }

  const createSubscription = async () => {
    if (!stripeModal) return
    setCreatingSubscription(true)
    setStripeResult(null)
    try {
      const { data: result, error } = await supabase.functions.invoke('stripe-create-subscription', {
        body: { orgId: stripeModal.org.id, orgName: stripeModal.org.name, adminEmail: stripeModal.admin?.email || '', plan: stripeForm.plan, qboAddon: stripeForm.qboAddon }
      })
      if (error) setStripeResult({ success: false, message: error.message })
      else if (result?.error) setStripeResult({ success: false, message: result.error })
      else { setStripeResult({ success: true, message: `Subscription created! Status: ${result?.status}` }); fetchData() }
    } catch (err) {
      setStripeResult({ success: false, message: err.message })
    }
    setCreatingSubscription(false)
  }

  const getPlanInfo = (planName) => PLANS.find(p => p.name === planName) || PLANS[0]

  const getBillingStatusColor = (status) => {
    if (status === 'active') return 'bg-green-500/20 text-green-400'
    if (status === 'trial') return 'bg-yellow-500/20 text-yellow-400'
    if (status === 'past_due') return 'bg-red-500/20 text-red-400'
    if (status === 'cancelled') return 'bg-[#2a3d55] text-[#8A9AB0]'
    return 'bg-[#2a3d55] text-[#8A9AB0]'
  }

  const getOrgTypeColor = (type) => {
    if (type === 'manufacturer') return 'bg-purple-500/20 text-purple-400'
    if (type === 'distributor') return 'bg-blue-500/20 text-blue-400'
    return 'bg-[#C8622A]/20 text-[#C8622A]'
  }

  const getProposalStatusColor = (status) => {
    if (status === 'Won') return 'bg-green-500/20 text-green-400'
    if (status === 'Lost') return 'bg-red-500/20 text-red-400'
    if (status === 'Sent') return 'bg-blue-500/20 text-blue-400'
    if (status === 'Draft') return 'bg-[#2a3d55] text-[#8A9AB0]'
    return 'bg-yellow-500/20 text-yellow-400'
  }

  const healthSortOrder = { active: 0, moderate: 1, inactive: 2, silent: 3 }

  const getSortedOrgsForMetrics = () => {
    return [...orgs].sort((a, b) => {
      if (metricsSortBy === 'health') {
        const ha = getOrgHealth(a.id)
        const hb = getOrgHealth(b.id)
        return (healthSortOrder[ha.status] ?? 4) - (healthSortOrder[hb.status] ?? 4)
      }
      if (metricsSortBy === 'proposals') return getOrgStats(b.id).total - getOrgStats(a.id).total
      if (metricsSortBy === 'last30') return getOrgStats(b.id).last30 - getOrgStats(a.id).last30
      if (metricsSortBy === 'clients') return getOrgStats(b.id).clients - getOrgStats(a.id).clients
      if (metricsSortBy === 'wonValue') return getOrgStats(b.id).wonValue - getOrgStats(a.id).wonValue
      if (metricsSortBy === 'users') return getOrgProfiles(b.id).length - getOrgProfiles(a.id).length
      if (metricsSortBy === 'name') return a.name.localeCompare(b.name)
      return 0
    })
  }

  const metricsRowColor = (status) => {
    if (status === 'active') return 'border-green-500/20 hover:bg-green-500/5'
    if (status === 'moderate') return 'border-yellow-500/20 hover:bg-yellow-500/5'
    if (status === 'inactive') return 'border-red-500/20 hover:bg-red-500/5'
    return 'border-[#2a3d55] hover:bg-[#2a3d55]/30'
  }

  const pendingRequests = requests.filter(r => r.status === 'pending')
  const mrr = orgs.filter(o => o.billing_status === 'active').reduce((sum, o) => sum + (o.monthly_rate || 0), 0)
  const activeOrgs = orgs.filter(o => o.billing_status === 'active').length
  const trialOrgs = orgs.filter(o => o.billing_status === 'trial').length

  if (!unlocked) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="bg-[#1a2d45] rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-white text-2xl font-bold mb-1">ForgePt<span className="text-[#C8622A]">.</span></h1>
          <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-full font-semibold">Super Admin</span>
          <p className="text-[#8A9AB0] text-sm mt-3">Enter your admin password to continue</p>
        </div>
        <div className="space-y-3">
          <input
            type="password"
            value={passwordInput}
            onChange={e => { setPasswordInput(e.target.value); setPasswordError('') }}
            onKeyDown={e => e.key === 'Enter' && handleUnlock()}
            placeholder="Password"
            className="w-full bg-[#0F1C2E] border border-[#2a3d55] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#C8622A]"
            autoFocus
          />
          {passwordError && <p className="text-red-400 text-xs">{passwordError}</p>}
          <button
            onClick={handleUnlock}
            disabled={passwordChecking || !passwordInput.trim()}
            className="w-full bg-[#C8622A] hover:bg-[#C8622A]/80 disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-sm transition-colors"
          >
            {passwordChecking ? 'Verifying…' : 'Unlock'}
          </button>
          <button onClick={() => navigate('/')} className="w-full text-[#8A9AB0] hover:text-white text-sm py-2 transition-colors">
            ← Back to App
          </button>
        </div>
      </div>
    </div>
  )

  if (unauthorized) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-400 text-lg font-bold mb-2">Access Denied</p>
        <p className="text-[#8A9AB0] text-sm mb-4">You don't have permission to view this page.</p>
        <button onClick={() => navigate('/')} className="text-[#C8622A] hover:text-white text-sm transition-colors">← Back to App</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
          <span className="bg-red-500/20 text-red-400 text-xs px-2 py-1 rounded-full font-semibold">Super Admin</span>
        </div>
        <button onClick={() => navigate('/')} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">← Back to App</button>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Total Orgs</p><p className="text-white text-2xl font-bold">{orgs.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Total Users</p><p className="text-white text-2xl font-bold">{profiles.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Pending Requests</p><p className="text-yellow-400 text-2xl font-bold">{pendingRequests.length}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">Active Paying</p><p className="text-green-400 text-2xl font-bold">{activeOrgs}</p></div>
          <div className="bg-[#1a2d45] rounded-xl p-5"><p className="text-[#8A9AB0] text-sm mb-1">MRR</p><p className="text-[#C8622A] text-2xl font-bold">${mrr.toLocaleString()}</p></div>
        </div>

        {/* Support PIN Lookup */}
        <div className="bg-[#1a2d45] rounded-xl p-5">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <p className="text-white font-semibold text-sm mb-1">Support PIN Lookup</p>
              <p className="text-[#8A9AB0] text-xs mb-3">Enter the 6-digit PIN the user reads to you to identify their account.</p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinQuery}
                  onChange={e => { setPinQuery(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinResult(null); setPinError(null) }}
                  onKeyDown={e => e.key === 'Enter' && lookupPin()}
                  placeholder="000000"
                  className="w-32 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:border-[#C8622A]"
                />
                <button onClick={lookupPin} disabled={pinLookupLoading || pinQuery.length !== 6}
                  className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-40">
                  {pinLookupLoading ? 'Looking up...' : 'Look Up'}
                </button>
                {pinError && <span className="text-red-400 text-sm">{pinError}</span>}
              </div>
            </div>
            {pinResult && (
              <div className="bg-[#0F1C2E] rounded-xl p-4 flex items-center gap-6 min-w-[320px]">
                <div className="flex-1">
                  <p className="text-white font-semibold">{pinResult.full_name}</p>
                  <p className="text-[#8A9AB0] text-xs">{pinResult.email}</p>
                  <p className="text-[#C8622A] text-xs mt-1 font-medium">{pinResult.organizations?.name || pinResult.company_name}</p>
                  {pinResult.organizations?.billing_status && (
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${pinResult.organizations.billing_status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                      {pinResult.organizations.billing_status}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => impersonateUser(
                    { id: pinResult.org_id, name: pinResult.organizations?.name || pinResult.company_name },
                    { id: pinResult.id, full_name: pinResult.full_name }
                  )}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors whitespace-nowrap">
                  View as User
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: 'requests', label: `Access Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` },
            { key: 'orgs',     label: 'Organizations' },
            { key: 'billing',  label: 'Billing & Plans' },
            { key: 'metrics',  label: 'Metrics' },
            { key: 'products', label: 'Global Products' },
            { key: 'catalogs', label: 'Catalogs' },
            { key: 'api',      label: 'API Keys' },
            { key: 'sa_users', label: 'Admin Users' },
            { key: 'roadmap',  label: 'Roadmap' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Access Requests */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : (
              <>
                {[
                  { key: 'pending', label: 'Pending', color: 'text-yellow-400', border: 'border-yellow-500/20', bg: 'bg-yellow-500/20', emptyMsg: 'No pending requests.' },
                  { key: 'approved', label: 'Approved', color: 'text-green-400', border: 'border-green-500/20', bg: 'bg-green-500/20', emptyMsg: 'No approved requests.' },
                  { key: 'rejected', label: 'Rejected', color: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/20', emptyMsg: 'No rejected requests.' },
                ].map(({ key, label, color, border, bg, emptyMsg }) => {
                  const group = requests.filter(r => r.status === key)
                  return (
                    <div key={key} className="bg-[#1a2d45] rounded-xl overflow-hidden">
                      <div className={`flex items-center gap-3 px-6 py-3 border-b ${border}`}>
                        <h3 className={`font-bold text-sm ${color}`}>{label}</h3>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg} ${color}`}>{group.length}</span>
                      </div>
                      {group.length === 0 ? (
                        <p className="text-[#8A9AB0] text-sm px-6 py-4">{emptyMsg}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-[#2a3d55]">
                                {['Name', 'Email', 'Company', 'Role', 'Notes', 'Date', ...(key === 'pending' ? ['Actions'] : [])].map(h => (
                                  <th key={h} className="text-[#8A9AB0] text-left py-2 px-6 font-normal text-xs">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {group.map(req => (
                                <tr key={req.id} className="border-b border-[#2a3d55]/30 last:border-0">
                                  <td className="text-white py-3 px-6 font-medium">{req.full_name}</td>
                                  <td className="text-[#8A9AB0] py-3 pr-4">{req.email}</td>
                                  <td className="text-[#8A9AB0] py-3 pr-4">{req.company_name}</td>
                                  <td className="py-3 pr-4">{req.role ? <span className="bg-[#2a3d55] text-white text-xs px-2 py-1 rounded">{req.role}</span> : <span className="text-[#8A9AB0]">—</span>}</td>
                                  <td className="text-[#8A9AB0] py-3 pr-4 max-w-xs truncate">{req.notes || '—'}</td>
                                  <td className="text-[#8A9AB0] py-3 pr-4 whitespace-nowrap">{new Date(req.created_at).toLocaleDateString()}</td>
                                  {key === 'pending' && (
                                    <td className="py-3 px-6">
                                      <div className="flex gap-2">
                                        <button onClick={() => approveRequest(req)} className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">Approve</button>
                                        <button onClick={() => rejectRequest(req.id)} className="bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors">Reject</button>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* Organizations */}
        {activeTab === 'orgs' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-white font-bold text-lg">All Organizations</h3>
                <span className="text-[#8A9AB0] text-sm">{orgs.length}</span>
              </div>
              <input
                type="text"
                value={orgSearch}
                onChange={e => setOrgSearch(e.target.value)}
                placeholder="Search name or email..."
                className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-[#C8622A] placeholder-[#4a5d75]"
              />
            </div>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : orgs.length === 0 ? <p className="text-[#8A9AB0]">No organizations yet.</p> : (
              <div className="space-y-3">
                {orgs.filter(o => {
                  if (!orgSearch) return true
                  const q = orgSearch.toLowerCase()
                  const adm = getOrgAdmin(o.id)
                  return o.name?.toLowerCase().includes(q) || adm?.email?.toLowerCase().includes(q)
                }).map(org => {
                  const admin = getOrgAdmin(org.id)
                  const memberCount = getOrgProfiles(org.id).length
                  const status = org.status || 'active'
                  const isEditing = editingOrg === org.id
                  const isExpanded = expandedOrg === org.id
                  const health = getOrgHealth(org.id)
                  const stats = getOrgStats(org.id)

                  return (
                    <div key={org.id} className="border border-[#2a3d55] rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${health.dot}`} />
                            <p className="text-white font-semibold">{org.name}</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getOrgTypeColor(org.org_type || 'integrator')}`}>{org.org_type || 'integrator'}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : status === 'suspended' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{status}</span>
                            <span className={`text-xs ${health.labelColor}`}>{health.label}</span>
                          </div>
                          <p className="text-[#8A9AB0] text-xs">{admin?.full_name || '—'} · {admin?.email || '—'} · {memberCount} users</p>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                            {org.feature_crm && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">CRM</span>}
                            {org.feature_send_proposal && <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-medium">Send</span>}
                            {org.feature_ai_email && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">AI Email</span>}
                            {org.feature_ai_bom && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">AI BOM</span>}
                            {org.feature_drawing_tool && <span className="text-xs px-1.5 py-0.5 rounded bg-[#C8622A]/15 text-[#C8622A] font-medium">Designer</span>}
                            {org.feature_drawing_reader && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">Draw Reader</span>}
                            {org.feature_spec_reader && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-medium">Spec Reader</span>}
                            {org.feature_proposals === false && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">No Proposals</span>}
                            {org.feature_purchase_orders === false && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium">No POs</span>}
                            <span className="text-[#4a5d75] text-xs">·</span>
                            <span className="text-xs text-[#8A9AB0]">{stats.total} proposals</span>
                            <span className="text-[#4a5d75] text-xs">·</span>
                            <span className="text-xs text-[#8A9AB0]">{stats.clients} clients</span>
                            {stats.last30 > 0 && <><span className="text-[#4a5d75] text-xs">·</span><span className="text-xs text-green-400">{stats.last30} last 30d</span></>}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <button onClick={() => toggleExpandedOrg(org.id)} className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${isExpanded ? 'bg-[#C8622A]/20 text-[#C8622A] border border-[#C8622A]/40' : 'bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] hover:text-white'}`}>{isExpanded ? 'Hide Details' : 'Details'}</button>
                          <button onClick={() => isEditing ? setEditingOrg(null) : startEditingOrg(org)} className="bg-[#2a3d55] text-white px-3 py-1 rounded text-xs hover:bg-[#3a4d65] transition-colors">{isEditing ? 'Cancel' : 'Edit Settings'}</button>
                          {status === 'active' && <button onClick={() => suspendOrg(org.id)} className="bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-500/30 transition-colors">Suspend</button>}
                          {status === 'suspended' && <button onClick={() => reactivateOrg(org.id)} className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">Reactivate</button>}
                          <button onClick={() => { setDeleteModal(org); setDeleteConfirmText('') }} className="bg-red-900/30 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-900/50 transition-colors">Delete</button>
                        </div>
                      </div>

                      {isEditing && (
                        <div className="mt-4 pt-4 border-t border-[#2a3d55] space-y-4">
                          <div>
                            <label className="text-[#8A9AB0] text-xs mb-2 block font-semibold uppercase tracking-wide">Org Type</label>
                            <div className="grid grid-cols-3 gap-2">
                              {ORG_TYPES.map(type => (
                                <button key={type.value} onClick={() => setOrgForm(p => ({ ...p, org_type: type.value }))}
                                  className={`p-3 rounded-lg border text-left transition-colors ${orgForm.org_type === type.value ? 'border-[#C8622A] bg-[#C8622A]/10' : 'border-[#2a3d55] bg-[#0F1C2E] hover:border-[#3a4d65]'}`}>
                                  <p className={`text-sm font-semibold ${orgForm.org_type === type.value ? 'text-[#C8622A]' : 'text-white'}`}>{type.label}</p>
                                  <p className="text-[#8A9AB0] text-xs mt-0.5">{type.desc}</p>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-4">
                            <label className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Feature Access</label>

                            {Object.entries(
                              [
                                { key: 'feature_proposals',      label: 'Proposals',          group: 'Core' },
                                { key: 'feature_crm',            label: 'CRM',                group: 'Core' },
                                { key: 'feature_send_proposal',  label: 'Send Proposal',      group: 'Core' },
                                { key: 'feature_purchase_orders',label: 'Purchase Orders',    group: 'Core' },
                                { key: 'feature_invoices',       label: 'Invoices',           group: 'Core' },
                                { key: 'feature_site_photos',    label: 'Site Photos',        group: 'Core' },
                                { key: 'feature_ai_email',       label: 'AI Email',           group: 'AI Tools' },
                                { key: 'feature_ai_bom',         label: 'AI BOM',             group: 'AI Tools' },
                                { key: 'feature_drawing_reader', label: 'Drawing Reader',     group: 'AI Tools' },
                                { key: 'feature_spec_reader',    label: 'Spec Reader',        group: 'AI Tools' },
                                { key: 'feature_drawing_tool',   label: 'Designer',           group: 'Designer' },
                                { key: 'feature_designer_only',  label: 'Designer Only Mode', group: 'Designer' },
                                { key: 'feature_api',            label: 'API Access',         group: 'Other' },
                                { key: 'feature_embed',          label: 'Embedded Designer',  group: 'Other', sub: true, requires: 'feature_api' },
                                { key: 'feature_regions',        label: 'Regions',            group: 'Other' },
                              ].reduce((acc, f) => { (acc[f.group] = acc[f.group] || []).push(f); return acc }, {})
                            ).map(([group, flags]) => (
                              <div key={group}>
                                <p className="text-[#8A9AB0] text-xs font-semibold mb-1.5">{group}</p>
                                <div className="divide-y divide-[#2a3d55] border border-[#2a3d55] rounded-lg overflow-hidden">
                                  {flags.map(flag => {
                                    const locked = flag.requires && !orgForm[flag.requires]
                                    return (
                                      <div key={flag.key} className={`flex items-center justify-between py-2.5 bg-[#0F1C2E] ${flag.sub ? 'pl-7 pr-3 border-l-2 border-[#C8622A]/20' : 'px-3'}`}>
                                        <div>
                                          <span className={`text-sm ${locked ? 'text-[#4a5d75]' : 'text-white'}`}>{flag.label}</span>
                                          {flag.sub && locked && <p className="text-[#4a5d75] text-xs mt-0.5">Requires API Access</p>}
                                        </div>
                                        <button
                                          disabled={locked}
                                          onClick={() => setOrgForm(p => {
                                            const next = { ...p, [flag.key]: !p[flag.key] }
                                            if (flag.key === 'feature_designer_only' && !p.feature_designer_only) next.feature_drawing_tool = true
                                            if (flag.key === 'feature_api' && p.feature_api) next.feature_embed = false
                                            return next
                                          })}
                                          className={`relative inline-flex items-center w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${orgForm[flag.key] ? 'bg-[#C8622A]' : 'bg-[#4B5563]'}`}>
                                          <span className={`inline-block w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${orgForm[flag.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            ))}

                            {/* Designer manufacturer filter */}
                            {orgForm.feature_drawing_tool && (
                              <div>
                                <p className="text-[#8A9AB0] text-xs font-semibold mb-1.5">Designer — Allowed Manufacturers</p>
                                <p className="text-[#8A9AB0] text-xs mb-2">Leave all unchecked to show every manufacturer. Check specific ones to restrict this org to only those products.</p>
                                <DesignerMfrPicker
                                  selected={orgForm.designer_allowed_manufacturers || []}
                                  onChange={v => setOrgForm(p => ({ ...p, designer_allowed_manufacturers: v }))}
                                />
                              </div>
                            )}

                            {/* Product Catalogs */}
                            <CatalogAccessPicker
                              selected={orgForm.enabled_catalogs || []}
                              onChange={v => setOrgForm(p => ({ ...p, enabled_catalogs: v }))}
                            />
                          </div>

                          <div className="flex justify-end">
                            <button onClick={() => saveOrgSettings(org.id)} className="bg-[#C8622A] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Save Settings</button>
                          </div>
                        </div>
                      )}

                      {/* Expandable Detail Section */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-[#2a3d55] space-y-5">
                          {loadingDetail === org.id ? (
                            <p className="text-[#8A9AB0] text-sm">Loading details...</p>
                          ) : (
                            <>
                              {/* Metric Cards */}
                              <div className="grid grid-cols-4 gap-3">
                                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs mb-1">Total Proposals</p>
                                  <p className="text-white text-xl font-bold">{stats.total}</p>
                                </div>
                                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs mb-1">Won Proposals</p>
                                  <p className="text-green-400 text-xl font-bold">{stats.won}</p>
                                </div>
                                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs mb-1">Clients</p>
                                  <p className="text-white text-xl font-bold">{stats.clients}</p>
                                </div>
                                <div className="bg-[#0F1C2E] rounded-lg p-3 border border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs mb-1">Won Value</p>
                                  <p className="text-[#C8622A] text-xl font-bold">${stats.wonValue.toLocaleString()}</p>
                                </div>
                              </div>

                              {/* Recent Proposals */}
                              {stats.recentProps.length > 0 && (
                                <div>
                                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Recent Proposals</p>
                                  <div className="bg-[#0F1C2E] rounded-lg border border-[#2a3d55] overflow-hidden">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-[#2a3d55]">
                                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Name</th>
                                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Status</th>
                                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Value</th>
                                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Date</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {stats.recentProps.map(prop => (
                                          <tr key={prop.id} className="border-b border-[#2a3d55]/30 last:border-0">
                                            <td className="text-white py-2 px-3">{prop.proposal_name || '—'}</td>
                                            <td className="py-2 px-3">
                                              <span className={`px-2 py-0.5 rounded font-semibold ${getProposalStatusColor(prop.status)}`}>{prop.status || 'Draft'}</span>
                                            </td>
                                            <td className="text-[#8A9AB0] py-2 px-3">{prop.proposal_value ? `$${prop.proposal_value.toLocaleString()}` : '—'}</td>
                                            <td className="text-[#8A9AB0] py-2 px-3">{new Date(prop.created_at).toLocaleDateString()}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Team Members & Impersonation */}
                              <div>
                                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Team Members</p>
                                <div className="space-y-1.5">
                                  {getOrgProfiles(org.id).map(member => (
                                    <div key={member.id} className="flex items-center justify-between bg-[#0F1C2E] rounded-lg px-3 py-2 border border-[#2a3d55]">
                                      <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-[#C8622A]/20 flex items-center justify-center text-[#C8622A] text-xs font-bold flex-shrink-0">
                                          {(member.full_name || member.email || '?')[0].toUpperCase()}
                                        </div>
                                        <div>
                                          <p className="text-white text-xs font-medium">{member.full_name || '—'}</p>
                                          <p className="text-[#8A9AB0] text-xs">{member.email}</p>
                                          <p className="text-[#8A9AB0] text-xs">
                                            {member.last_login
                                              ? `Last login: ${new Date(member.last_login).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                                              : 'Never logged in'}
                                          </p>
                                        </div>
                                      </div>
                                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${member.org_role === 'admin' ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                                        {member.org_role || 'member'}
                                      </span>
                                    </div>
                                  ))}
                                  {getOrgProfiles(org.id).length === 0 && (
                                    <p className="text-[#8A9AB0] text-xs">No team members found.</p>
                                  )}
                                </div>
                              </div>

                              {/* Recent Activity */}
                              {orgDetail[org.id]?.activities?.length > 0 && (
                                <div>
                                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Recent Activity</p>
                                  <div className="space-y-1.5">
                                    {orgDetail[org.id].activities.map(act => (
                                      <div key={act.id} className="flex items-start gap-2 bg-[#0F1C2E] rounded-lg px-3 py-2 border border-[#2a3d55]">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[#C8622A] mt-1.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-white text-xs">{act.title || act.type || 'Activity'}</p>
                                          <p className="text-[#8A9AB0] text-xs">{new Date(act.created_at).toLocaleString()}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Notes */}
                              <div>
                                <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Internal Notes</p>
                                <textarea
                                  value={orgNotes[org.id] || ''}
                                  onChange={e => setOrgNotes(prev => ({ ...prev, [org.id]: e.target.value }))}
                                  placeholder="Add private notes about this org..."
                                  rows={3}
                                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none placeholder-[#4a5d75]"
                                />
                                <div className="flex items-center justify-end gap-3 mt-2">
                                  {noteSaved === org.id && (
                                    <span className="text-green-400 text-xs font-semibold">Saved!</span>
                                  )}
                                  <button
                                    onClick={() => saveOrgNote(org.id)}
                                    disabled={savingNote === org.id}
                                    className="bg-[#C8622A] text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
                                  >
                                    {savingNote === org.id ? 'Saving...' : 'Save Note'}
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Billing & Plans */}
        {activeTab === 'billing' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white font-bold text-lg">Billing & Plans</h3>
              <div className="flex gap-4">
                <div className="text-center"><p className="text-[#8A9AB0] text-xs">MRR</p><p className="text-[#C8622A] font-bold">${mrr.toLocaleString()}</p></div>
                <div className="text-center"><p className="text-[#8A9AB0] text-xs">Paying</p><p className="text-green-400 font-bold">{activeOrgs}</p></div>
                <div className="text-center"><p className="text-[#8A9AB0] text-xs">Trial</p><p className="text-yellow-400 font-bold">{trialOrgs}</p></div>
              </div>
            </div>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : orgs.length === 0 ? <p className="text-[#8A9AB0]">No organizations yet.</p> : (
              <div className="space-y-3">
                {orgs.map(org => {
                  const admin = getOrgAdmin(org.id)
                  const plan = getPlanInfo(org.plan || 'Trial')
                  const isEditing = editingBilling === org.id
                  const trialDaysLeft = org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)) : null
                  const hasStripe = !!org.stripe_customer_id

                  return (
                    <div key={org.id} className="border border-[#2a3d55] rounded-xl p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-white font-semibold">{org.name}</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${getOrgTypeColor(org.org_type || 'integrator')}`}>{org.org_type || 'integrator'}</span>
                          </div>
                          <p className="text-[#8A9AB0] text-xs">{admin?.email || '—'}</p>
                          {hasStripe && <p className="text-green-400 text-xs mt-1">✓ Stripe connected</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${plan.bg} ${plan.color}`}>{org.plan || 'Trial'}</span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${getBillingStatusColor(org.billing_status)}`}>{org.billing_status || 'trial'}</span>
                          {org.monthly_rate > 0 && <span className="text-white text-sm font-bold">${org.monthly_rate}/mo</span>}
                          <button onClick={() => openStripeModal(org)} className="bg-green-500/20 text-green-400 px-3 py-1 rounded text-xs font-semibold hover:bg-green-500/30 transition-colors">{hasStripe ? 'Update Subscription' : 'Create Subscription'}</button>
                          <button onClick={() => isEditing ? setEditingBilling(null) : startEditingBilling(org)} className="bg-[#2a3d55] text-white px-3 py-1 rounded text-xs hover:bg-[#3a4d65] transition-colors">{isEditing ? 'Cancel' : 'Manual Edit'}</button>
                        </div>
                      </div>
                      {org.billing_status === 'trial' && trialDaysLeft !== null && (
                        <p className={`text-xs mt-2 ${trialDaysLeft <= 3 ? 'text-red-400' : 'text-yellow-400'}`}>{trialDaysLeft > 0 ? `Trial ends in ${trialDaysLeft} days` : 'Trial expired'}</p>
                      )}
                      {isEditing && (
                        <div className="mt-4 grid grid-cols-4 gap-3 pt-4 border-t border-[#2a3d55]">
                          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Plan</label><select value={billingForm.plan} onChange={e => setBillingForm(p => ({ ...p, plan: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">{PLANS.map(p => <option key={p.name} value={p.name}>{p.name}{p.rate ? ` — $${p.rate}/mo` : p.rate === 0 ? ' — Free' : ' — Custom'}</option>)}</select></div>
                          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Billing Status</label><select value={billingForm.billing_status} onChange={e => setBillingForm(p => ({ ...p, billing_status: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">{['trial', 'active', 'past_due', 'cancelled'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Monthly Rate ($)</label><input type="number" value={billingForm.monthly_rate} onChange={e => setBillingForm(p => ({ ...p, monthly_rate: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]" /></div>
                          <div><label className="text-[#8A9AB0] text-xs mb-1 block">Trial End Date</label><input type="date" value={billingForm.trial_ends_at} onChange={e => setBillingForm(p => ({ ...p, trial_ends_at: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]" /></div>
                          <div className="col-span-4 flex justify-end"><button onClick={() => updateBilling(org.id)} className="bg-[#C8622A] text-white px-4 py-1.5 rounded text-xs font-semibold hover:bg-[#b5571f] transition-colors">Save Changes</button></div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === 'metrics' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">Org Metrics</h3>
              <div className="flex items-center gap-2">
                <span className="text-[#8A9AB0] text-xs">Sort by:</span>
                {[
                  { key: 'health', label: 'Health' },
                  { key: 'proposals', label: 'Proposals' },
                  { key: 'last30', label: 'Last 30d' },
                  { key: 'clients', label: 'Clients' },
                  { key: 'wonValue', label: 'Won Value' },
                  { key: 'users', label: 'Users' },
                  { key: 'name', label: 'Name' },
                ].map(s => (
                  <button key={s.key} onClick={() => setMetricsSortBy(s.key)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${metricsSortBy === s.key ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] hover:text-white'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            {loading ? <p className="text-[#8A9AB0]">Loading...</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      {['Org Name', 'Type', 'Plan', 'Health', 'Proposals', 'Last 30d', 'Clients', 'Won Value', 'Users', 'Trial End'].map(h => (
                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {getSortedOrgsForMetrics().map(org => {
                      const health = getOrgHealth(org.id)
                      const stats = getOrgStats(org.id)
                      const plan = getPlanInfo(org.plan || 'Trial')
                      const trialDaysLeft = org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)) : null
                      const userCount = getOrgProfiles(org.id).length

                      return (
                        <tr key={org.id} className={`border-b transition-colors cursor-pointer ${metricsRowColor(health.status)}`} onClick={() => { setActiveTab('orgs'); setExpandedOrg(org.id); fetchOrgDetail(org.id) }}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${health.dot}`} />
                              <span className="text-white font-medium">{org.name}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${getOrgTypeColor(org.org_type || 'integrator')}`}>{org.org_type || 'integrator'}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${plan.bg} ${plan.color}`}>{org.plan || 'Trial'}</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs ${health.labelColor}`}>{health.label}</span>
                          </td>
                          <td className="text-white py-3 pr-4 font-semibold">{stats.total}</td>
                          <td className="text-[#8A9AB0] py-3 pr-4">{stats.last30}</td>
                          <td className="text-[#8A9AB0] py-3 pr-4">{stats.clients}</td>
                          <td className="text-[#C8622A] py-3 pr-4 font-semibold">{stats.wonValue > 0 ? `$${stats.wonValue.toLocaleString()}` : '—'}</td>
                          <td className="text-[#8A9AB0] py-3 pr-4">{userCount}</td>
                          <td className="py-3 pr-4">
                            {org.billing_status === 'trial' && trialDaysLeft !== null ? (
                              <span className={`text-xs ${trialDaysLeft <= 3 ? 'text-red-400' : 'text-yellow-400'}`}>
                                {trialDaysLeft > 0 ? `${trialDaysLeft}d left` : 'Expired'}
                              </span>
                            ) : (
                              <span className="text-[#8A9AB0] text-xs">—</span>
                            )}
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
      </div>

      {activeTab === 'catalogs' && <CatalogsTab />}

      {/* Global Products tab */}
        {activeTab === 'products' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-lg">Global Product Library</h3>
                <p className="text-[#8A9AB0] text-sm mt-0.5">
                  Manufacturer products available to all organizations in the symbol picker
                </p>
              </div>
              <button onClick={() => setShowImport(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#C8622A] text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                Import Products
              </button>
            </div>
            <AddProductForm onAdded={() => {}} />
            <GlobalProductStats onRefresh={() => {}} />
          </div>
        )}

      {/* Import modal */}
      {showImport && (
        <GlobalProductsImport
          onClose={() => setShowImport(false)}
          onImported={() => setShowImport(false)}
        />
      )}

      {/* Delete Org Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-red-400 text-xl">⚠</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-1 text-center">Delete Organization</h3>
            <p className="text-[#8A9AB0] text-sm mb-2 text-center">This will permanently delete <span className="text-white font-semibold">{deleteModal.name}</span> and all associated data:</p>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 mb-4 text-xs text-red-400 space-y-1">
              <p>• All proposals and BOM line items</p>
              <p>• All clients and contacts</p>
              <p>• All invoices and purchase orders</p>
              <p>• All activity, tasks, and emails</p>
              <p>• All user accounts for this org</p>
              <p className="text-white font-semibold mt-2">This cannot be undone.</p>
            </div>
            <div className="mb-4">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Type <span className="text-white font-mono">{deleteModal.name}</span> to confirm</label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation()
                  if (e.key === 'Enter' && deleteConfirmText === deleteModal.name && !deletingOrg) deleteOrg()
                }}
                placeholder={deleteModal.name}
                autoFocus
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setDeleteModal(null); setDeleteConfirmText('') }}
                className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button type="button" onClick={deleteOrg} disabled={deletingOrg || deleteConfirmText !== deleteModal.name}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                {deletingOrg ? 'Deleting...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      {stripeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">{stripeModal.org.stripe_subscription_id ? 'Update' : 'Create'} Stripe Subscription</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">{stripeModal.org.name} · {stripeModal.admin?.email || 'No admin email'}</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Base Plan</label>
                <select value={stripeForm.plan} onChange={e => setStripeForm(p => ({ ...p, plan: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  <option value="Early Adopter">Early Adopter — $100/mo</option>
                  <option value="Designer Only">Designer Only — $49/mo</option>
                  <option value="Small Team">Small Team — $99/mo</option>
                  <option value="Team">Team — $149/mo</option>
                  <option value="Business">Business — $199/mo</option>
                </select>
              </div>
              <label className="flex items-center gap-3 bg-[#0F1C2E] rounded-lg px-4 py-3 cursor-pointer">
                <input type="checkbox" checked={stripeForm.qboAddon} onChange={e => setStripeForm(p => ({ ...p, qboAddon: e.target.checked }))} className="w-4 h-4 rounded accent-[#C8622A]" />
                <div>
                  <p className="text-white text-sm font-medium">QuickBooks Add-on <span className="text-[#C8622A] font-semibold">+$25/mo</span></p>
                  <p className="text-[#8A9AB0] text-xs">Added as a separate line item on the same subscription</p>
                </div>
              </label>
              <div className="bg-[#0F1C2E] rounded-lg p-3 text-xs text-[#8A9AB0]">
                <p className="font-semibold text-white mb-1">What this does:</p>
                <p>• Creates or updates a Stripe customer for {stripeModal.org.name}</p>
                <p>• {stripeModal.org.stripe_subscription_id ? 'Updates the existing' : 'Creates a'} {stripeForm.plan} subscription at ${{ 'Early Adopter': 100, 'Designer Only': 49, 'Small Team': 99, 'Team': 149, 'Business': 199 }[stripeForm.plan]}/mo{stripeForm.qboAddon ? ' + $25/mo QBO' : ''}</p>
                <p>• Stripe auto-sends invoices each cycle once a payment method is added</p>
                <p>• Updates billing status in ForgePt.</p>
                <p className="mt-2 text-yellow-400">Note: Customer will need to add a payment method before charges begin.</p>
              </div>
              {stripeResult && <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${stripeResult.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{stripeResult.message}</div>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setStripeModal(null); setStripeResult(null) }} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={createSubscription} disabled={creatingSubscription} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{creatingSubscription ? 'Saving...' : stripeModal.org.stripe_subscription_id ? 'Update Subscription' : 'Create Subscription'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── API KEYS TAB ── */}
      {activeTab === 'api' && <APIKeysPanel orgs={orgs} embedUsage={embedUsage} />}

      {activeTab === 'sa_users' && (
        <div className="space-y-6">
          {/* Add new superadmin */}
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-white font-semibold mb-1">Add Admin User</p>
            <p className="text-[#8A9AB0] text-xs mb-3">Enter the email of an existing ForgePt user to grant superadmin access.</p>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <input
                  type="email"
                  value={saUserEmail}
                  onChange={e => { setSaUserEmail(e.target.value); setSaUserMsg('') }}
                  placeholder="user@example.com"
                  className="w-full bg-[#0F1C2E] border border-[#2a3d55] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
              <button
                disabled={saUserWorking || !saUserEmail.trim()}
                onClick={async () => {
                  setSaUserWorking(true); setSaUserMsg('')
                  const { data, error } = await supabase.functions.invoke('superadmin-manage-sa-user', {
                    body: { sa_password: getSaPassword(), action: 'add', email: saUserEmail.trim() }
                  })
                  if (error || data?.error) setSaUserMsg(`Error: ${data?.error || error?.message}`)
                  else { setSaUserMsg('Access granted.'); setSaUserEmail(''); fetchData() }
                  setSaUserWorking(false)
                }}
                className="px-4 py-2 bg-[#C8622A] hover:bg-[#C8622A]/80 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {saUserWorking ? 'Working…' : 'Grant Access'}
              </button>
            </div>
            {saUserMsg && <p className={`text-xs mt-2 ${saUserMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>{saUserMsg}</p>}
          </div>

          {/* Current admins */}
          <div className="bg-[#1a2d45] rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2a3d55]">
              <p className="text-white font-semibold">Admin Users ({saUsers.length})</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3d55]">
                  <th className="text-left px-5 py-3 text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-3 text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Last Login</th>
                  <th className="text-left px-5 py-3 text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Member Since</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {saUsers.map(u => (
                  <tr key={u.id} className="border-b border-[#0F1C2E]/60 hover:bg-[#0F1C2E]/30 transition-colors">
                    <td className="px-5 py-3 text-white font-medium">{u.full_name || '—'}</td>
                    <td className="px-5 py-3 text-[#8A9AB0]">{u.email}</td>
                    <td className="px-5 py-3 text-[#8A9AB0]">
                      {u.last_login
                        ? new Date(u.last_login).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                        : 'Never'}
                    </td>
                    <td className="px-5 py-3 text-[#8A9AB0]">{u.created_at?.slice(0, 10)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={async () => {
                          if (!confirm(`Remove superadmin access for ${u.email}?`)) return
                          setSaUserWorking(true)
                          const { data, error } = await supabase.functions.invoke('superadmin-manage-sa-user', {
                            body: { sa_password: getSaPassword(), action: 'remove', user_id: u.id }
                          })
                          if (error || data?.error) alert(data?.error || error?.message)
                          else fetchData()
                          setSaUserWorking(false)
                        }}
                        className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lock SuperAdmin */}
          <div className="flex justify-end">
            <button
              onClick={() => {
                sessionStorage.removeItem('sa_unlocked')
                sessionStorage.removeItem('sa_password')
                setUnlocked(false)
              }}
              className="text-[#8A9AB0] hover:text-white text-sm transition-colors"
            >
              🔒 Lock SuperAdmin
            </button>
          </div>
        </div>
      )}

      {/* ── ROADMAP TAB ── */}
      {activeTab === 'roadmap' && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={async () => {
                const result = await supabase.functions.invoke('superadmin-get-data', { body: { sa_password: getSaPassword() } })
                setRoadmapItems(result?.data?.roadmap_items || [])
              }}
              className="bg-[#2a3d55] text-[#8A9AB0] hover:text-white px-3 py-1.5 rounded-lg text-xs transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
          <SAoadmapPanel
            items={roadmapItems}
            orgs={orgs}
            onStatusChange={async (id, status) => {
              await supabase.from('roadmap_items').update({ status }).eq('id', id)
              setRoadmapItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
            }}
            onDelete={async (id) => {
              if (!window.confirm('Delete this roadmap item?')) return
              await supabase.from('roadmap_items').delete().eq('id', id)
              setRoadmapItems(prev => prev.filter(i => i.id !== id))
            }}
          />
        </>
      )}

    </div>
  )
}

// ─── SAoadmapPanel ─────────────────────────────────────────────────────────────
const SA_STATUS_META = {
  backlog:     { label: 'Backlog',     dot: 'bg-[#8A9AB0]',  badge: 'bg-[#8A9AB0]/20 text-[#8A9AB0]' },
  planned:     { label: 'Planned',     dot: 'bg-yellow-400', badge: 'bg-yellow-500/20 text-yellow-400' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-400',   badge: 'bg-blue-500/20 text-blue-400' },
  released:    { label: 'Released',    dot: 'bg-green-400',  badge: 'bg-green-500/20 text-green-400' },
  declined:    { label: 'Declined',    dot: 'bg-red-400',    badge: 'bg-red-500/20 text-red-400' },
}
const SA_CATEGORY_COLORS = {
  feature:     'bg-blue-500/20 text-blue-400',
  product:     'bg-purple-500/20 text-purple-400',
  improvement: 'bg-yellow-500/20 text-yellow-400',
  bug_fix:     'bg-red-500/20 text-red-400',
}
const SA_CATEGORY_LABELS = { feature: 'Feature', product: 'Product', improvement: 'Improvement', bug_fix: 'Bug Fix' }
const SA_COLUMNS = ['backlog', 'planned', 'in_progress', 'released', 'declined']
const SA_NEXT = {
  backlog:     [{ v: 'planned', l: 'Approve' }, { v: 'declined', l: 'Decline' }],
  planned:     [{ v: 'in_progress', l: 'Start' }, { v: 'released', l: 'Release' }, { v: 'backlog', l: 'Back' }],
  in_progress: [{ v: 'released', l: 'Release' }, { v: 'planned', l: 'Back' }],
  released:    [{ v: 'in_progress', l: 'Reopen' }],
  declined:    [{ v: 'backlog', l: 'Reopen' }],
}

function SAoadmapPanel({ items, orgs, onStatusChange, onDelete }) {
  const [filter, setFilter] = useState('')
  const [orgFilter, setOrgFilter] = useState('')
  const [view, setView] = useState('board') // 'board' | 'list'

  const orgMap = Object.fromEntries(orgs.map(o => [o.id, o.company_name]))

  const filtered = items.filter(i => {
    if (orgFilter && i.org_id !== orgFilter) return false
    if (filter && !i.title.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  const byStatus = (s) => filtered.filter(i => i.status === s)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <input type="text" placeholder="Search items..." value={filter} onChange={e => setFilter(e.target.value)}
          className="bg-[#1a2d45] border border-[#2a3d55] text-white text-xs rounded-lg px-3 py-2 w-52 focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
        <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)}
          className="bg-[#1a2d45] border border-[#2a3d55] text-[#8A9AB0] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#C8622A]">
          <option value="">All Organizations</option>
          {orgs.filter(o => items.some(i => i.org_id === o.id)).map(o => (
            <option key={o.id} value={o.id}>{o.company_name}</option>
          ))}
        </select>
        <div className="flex bg-[#1a2d45] border border-[#2a3d55] rounded-lg p-1 gap-1 ml-auto">
          <button onClick={() => setView('board')} className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${view === 'board' ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>Board</button>
          <button onClick={() => setView('list')}  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${view === 'list'  ? 'bg-[#C8622A] text-white' : 'text-[#8A9AB0] hover:text-white'}`}>List</button>
        </div>
        <span className="text-[#8A9AB0] text-xs">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Board */}
      {view === 'board' && (
        <div className="grid grid-cols-5 gap-3">
          {SA_COLUMNS.map(status => {
            const meta = SA_STATUS_META[status]
            const col  = byStatus(status)
            return (
              <div key={status} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                  <span className="text-xs font-semibold text-[#8A9AB0] uppercase tracking-wide">{meta.label}</span>
                  <span className="text-[#8A9AB0] text-xs ml-auto">{col.length}</span>
                </div>
                {col.length === 0 && (
                  <div className="border border-dashed border-[#2a3d55] rounded-xl p-3 text-center">
                    <p className="text-[#8A9AB0] text-xs">Empty</p>
                  </div>
                )}
                {col.map(item => (
                  <div key={item.id} className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-3 hover:border-[#C8622A]/30 transition-colors group">
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <p className="text-white text-xs font-semibold leading-tight flex-1">{item.title}</p>
                      <button onClick={() => onDelete(item.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">✕</button>
                    </div>
                    {item.description && <p className="text-[#8A9AB0] text-xs mb-2 line-clamp-2">{item.description}</p>}
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${SA_CATEGORY_COLORS[item.category] || 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                        {SA_CATEGORY_LABELS[item.category] || item.category}
                      </span>
                      {item.target_quarter && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#C8622A]/10 text-[#C8622A] font-medium">{item.target_quarter}</span>
                      )}
                    </div>
                    {(item.requester?.full_name || item.org?.company_name) && (
                      <p className="text-[#8A9AB0] text-xs mb-2 truncate">
                        {item.requester?.full_name && <span>{item.requester.full_name}</span>}
                        {item.org?.company_name && <span className="text-[#C8622A]"> · {item.org.company_name}</span>}
                      </p>
                    )}
                    <div className="flex flex-col gap-1">
                      {(SA_NEXT[status] || []).map(m => (
                        <button key={m.v} onClick={() => onStatusChange(item.id, m.v)}
                          className="w-full text-left text-xs px-2 py-1 rounded-lg bg-[#0F1C2E] text-[#8A9AB0] hover:text-white hover:bg-[#2a3d55] transition-colors">
                          {m.l} →
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-[#0F1C2E] border-b border-[#2a3d55]">
              <tr>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Category</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Org</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Requested By</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Target</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-[#8A9AB0]">No items found.</td></tr>
              )}
              {filtered.map(item => {
                const meta = SA_STATUS_META[item.status] || SA_STATUS_META.backlog
                return (
                  <tr key={item.id} className="hover:bg-[#0F1C2E]/50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white font-semibold">{item.title}</p>
                      {item.description && <p className="text-[#8A9AB0] mt-0.5 line-clamp-1">{item.description}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                        <span className={`px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(SA_NEXT[item.status] || []).map(m => (
                          <button key={m.v} onClick={() => onStatusChange(item.id, m.v)}
                            className="px-1.5 py-0.5 rounded bg-[#0F1C2E] text-[#8A9AB0] hover:text-white transition-colors">
                            {m.l}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${SA_CATEGORY_COLORS[item.category] || 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                        {SA_CATEGORY_LABELS[item.category] || item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#8A9AB0]">{item.org?.company_name || orgMap[item.org_id] || '-'}</td>
                    <td className="px-4 py-3 text-[#8A9AB0]">{item.requester?.full_name || '-'}</td>
                    <td className="px-4 py-3 text-[#C8622A] font-medium">{item.target_quarter || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => onDelete(item.id)} className="text-[#8A9AB0] hover:text-red-400 transition-colors">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── APIKeysPanel ─────────────────────────────────────────────────────────────
function APIKeysPanel({ orgs, embedUsage = {} }) {
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false })
      setKeys(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const getOrgName = (orgId) => orgs.find(o => o.id === orgId)?.name || orgId

  const filtered = keys.filter(k => {
    if (!search) return true
    const q = search.toLowerCase()
    return k.name.toLowerCase().includes(q) || getOrgName(k.org_id).toLowerCase().includes(q)
  })

  const activeKeys = keys.filter(k => k.is_active)
  const usedLast30 = keys.filter(k => k.last_used_at && (Date.now() - new Date(k.last_used_at)) < 30 * 24 * 60 * 60 * 1000)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-white font-bold text-lg">API Keys</h3>
          <p className="text-[#8A9AB0] text-sm mt-0.5">All API keys across all organizations</p>
        </div>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search org or key name..."
          className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:border-[#C8622A] placeholder-[#4a5d75]" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Keys', value: keys.length },
          { label: 'Active Keys', value: activeKeys.length },
          { label: 'Used Last 30 Days', value: usedLast30.length },
        ].map(s => (
          <div key={s.label} className="bg-[#1a2d45] rounded-xl p-4 border border-[#2a3d55]">
            <p className="text-[#8A9AB0] text-xs mb-1">{s.label}</p>
            <p className="text-white text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-[#8A9AB0] text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-[#1a2d45] rounded-xl p-8 text-center border border-[#2a3d55]">
          <p className="text-[#8A9AB0]">{search ? 'No keys match your search.' : 'No API keys have been created yet.'}</p>
        </div>
      ) : (
        <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a3d55] bg-[#0F1C2E]">
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Organization</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Key Name</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Prefix</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Scopes</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Last Used</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Created</th>
                <th className="text-left px-4 py-3 text-[#8A9AB0] font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3d55]/50">
              {filtered.map(k => {
                const daysSinceUsed = k.last_used_at ? Math.floor((Date.now() - new Date(k.last_used_at)) / (1000 * 60 * 60 * 24)) : null
                return (
                  <tr key={k.id} className="hover:bg-[#0F1C2E]/30">
                    <td className="px-4 py-3 text-white font-medium">{getOrgName(k.org_id)}</td>
                    <td className="px-4 py-3 text-[#8A9AB0]">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-[#8A9AB0] text-xs">{k.key_prefix}…</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {k.scopes.map(s => (
                          <span key={s} className="text-xs bg-[#C8622A]/15 text-[#C8622A] px-2 py-0.5 rounded font-medium">
                            {s.replace('read:', '')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {k.last_used_at ? (
                        <span className={daysSinceUsed === 0 ? 'text-green-400' : daysSinceUsed <= 7 ? 'text-[#C8622A]' : 'text-[#8A9AB0]'}>
                          {daysSinceUsed === 0 ? 'Today' : `${daysSinceUsed}d ago`}
                        </span>
                      ) : (
                        <span className="text-[#4a5d75]">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#8A9AB0] text-xs">{new Date(k.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${k.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {k.is_active ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Embed Usage / Billing */}
      {Object.keys(embedUsage).length > 0 && (
        <div className="space-y-3">
          <div>
            <p className="text-white font-semibold text-sm">Embed Usage</p>
            <p className="text-[#8A9AB0] text-xs mt-0.5">Unique users and sessions per org — use this for billing.</p>
          </div>
          <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[#0F1C2E] border-b border-[#2a3d55]">
                <tr>
                  <th className="text-left px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Organization</th>
                  <th className="text-right px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Unique Users (30d)</th>
                  <th className="text-right px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Unique Users (all)</th>
                  <th className="text-right px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Sessions (30d)</th>
                  <th className="text-right px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Sessions (all)</th>
                  <th className="text-right px-4 py-3 text-[#8A9AB0] font-semibold uppercase tracking-wide">Last Session</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a3d55]/50">
                {Object.entries(embedUsage)
                  .sort((a, b) => (b[1].sessions_30d - a[1].sessions_30d))
                  .map(([orgId, stats]) => {
                    const orgName = orgs.find(o => o.id === orgId)?.company_name || orgId.slice(0, 8) + '…'
                    return (
                      <tr key={orgId} className="hover:bg-[#0F1C2E]/50 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{orgName}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${stats.unique_users_30d > 0 ? 'text-[#C8622A]' : 'text-[#4a5d75]'}`}>
                            {stats.unique_users_30d}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[#8A9AB0]">{stats.unique_users_total}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${stats.sessions_30d > 0 ? 'text-white' : 'text-[#4a5d75]'}`}>
                            {stats.sessions_30d}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[#8A9AB0]">{stats.sessions_total}</td>
                        <td className="px-4 py-3 text-right text-[#8A9AB0]">
                          {stats.last_session ? new Date(stats.last_session).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── GlobalProductStats ───────────────────────────────────────────────────────
function GlobalProductStats() {
  const [stats,      setStats]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState(null) // manufacturer name
  const [products,   setProducts]   = useState([])
  const [loadingP,      setLoadingP]      = useState(false)
  const [editingProduct, setEditingProduct] = useState(null) // product being edited
  const [showAccessories, setShowAccessories] = useState(false)

  const load = async () => {
      const { data } = await supabase
        .from('global_products')
        .select('manufacturer, industry, is_active')
        .order('manufacturer')

      if (data) {
        const grouped = {}
        data.forEach(p => {
          if (!grouped[p.manufacturer]) grouped[p.manufacturer] = { count: 0, industries: new Set(), active: 0 }
          grouped[p.manufacturer].count++
          grouped[p.manufacturer].industries.add(p.industry)
          if (p.is_active) grouped[p.manufacturer].active++
        })
        setStats(Object.entries(grouped)
          .map(([mfr, d]) => ({ manufacturer: mfr, count: d.count, active: d.active, industries: [...d.industries] }))
          .sort((a, b) => b.count - a.count))
      }
      setLoading(false)
    }

    const loadProducts = async (manufacturer) => {
      setLoadingP(true)
      const { data } = await supabase
        .from('global_products')
        .select('*')
        .eq('manufacturer', manufacturer)
        .order('category').order('name')
      setProducts(data || [])
      setLoadingP(false)
    }
  useEffect(() => {
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <svg className="w-5 h-5 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  )

  const total = stats.reduce((s, r) => s + r.count, 0)

  return (
    <>
      <div className="flex items-center gap-6 text-sm">
        <div><span className="text-[#8A9AB0]">Total products</span><span className="ml-2 text-white font-bold">{total.toLocaleString()}</span></div>
        <div><span className="text-[#8A9AB0]">Manufacturers</span><span className="ml-2 text-white font-bold">{stats.length}</span></div>
      </div>

      <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2a3d55] bg-[#0F1C2E]">
              <th className="text-left px-4 py-2.5 font-medium text-[#8A9AB0]">Manufacturer</th>
              <th className="text-left px-4 py-2.5 font-medium text-[#8A9AB0]">Industries</th>
              <th className="text-center px-4 py-2.5 font-medium text-[#8A9AB0]">Active</th>
              <th className="text-right px-4 py-2.5 font-medium text-[#8A9AB0]">Total</th>
              <th className="px-4 py-2.5"/>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a3d55]/50">
            {stats.map(row => (
              <>
                <tr key={row.manufacturer}
                  className="hover:bg-[#0F1C2E]/50 cursor-pointer"
                  onClick={() => {
                    if (expanded === row.manufacturer) {
                      setExpanded(null)
                      setProducts([])
                    } else {
                      setExpanded(row.manufacturer)
                      loadProducts(row.manufacturer)
                    }
                  }}>
                  <td className="px-4 py-2.5 text-white font-medium flex items-center gap-2">
                    <svg className={`w-3 h-3 text-[#8A9AB0] transition-transform ${expanded === row.manufacturer ? 'rotate-90' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                    </svg>
                    {row.manufacturer}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {row.industries.map(ind => (
                        <span key={ind} className="text-xs px-1.5 py-0.5 rounded bg-[#2a3d55] text-[#8A9AB0] capitalize">
                          {ind.replace('_', ' ')}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center text-green-400 font-medium">{row.active}</td>
                  <td className="px-4 py-2.5 text-right text-[#C8622A] font-bold">{row.count}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (!window.confirm(`Delete ALL ${row.count} products from ${row.manufacturer}?`)) return
                        await supabase.from('global_products').delete().eq('manufacturer', row.manufacturer)
                        load()
                        setExpanded(null)
                        setProducts([])
                      }}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors">
                      Delete All
                    </button>
                  </td>
                </tr>

                {/* Expanded product list */}
                {expanded === row.manufacturer && (
                  <tr key={`${row.manufacturer}-expanded`}>
                    <td colSpan={5} className="bg-[#0F1C2E] px-4 py-3">
                      {loadingP ? (
                        <div className="flex items-center gap-2 text-xs text-[#8A9AB0] py-2">
                          <svg className="w-4 h-4 animate-spin text-[#C8622A]" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                          Loading products...
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-64 overflow-y-auto">
                          <div className="grid grid-cols-5 gap-2 text-xs text-[#8A9AB0] font-medium pb-1 border-b border-[#2a3d55] sticky top-0 bg-[#0F1C2E]">
                            <span>Part Number</span>
                            <span>Name</span>
                            <span>Category</span>
                            <span>FOV°</span>
                            <span className="text-right">Actions</span>
                          </div>
                          {products.map(p => (
                            <EditableProductRow
                              key={p.id}
                              product={p}
                              onSaved={() => { loadProducts(row.manufacturer); load() }}
                              onDelete={() => { loadProducts(row.manufacturer); load() }}
                              onEditAccessories={() => { setEditingProduct(p); setShowAccessories(true) }}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
           ))}
          </tbody>
        </table>
      </div>

    {/* Accessories Editor Modal */}
    {showAccessories && editingProduct && (
      <AccessoriesEditor
        product={editingProduct}
        onClose={() => { setShowAccessories(false); setEditingProduct(null) }}
        onSaved={(updated) => {
          setProducts(prev => prev.map(p => p.id === updated.id ? updated : p))
          setShowAccessories(false)
          setEditingProduct(null)
        }}
      />
    )}
  </>
  )
}

// ─── EditableProductRow ───────────────────────────────────────────────────────
function EditableProductRow({ product, onSaved, onDelete, onEditAccessories }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm]       = useState({
    part_number:  product.part_number,
    name:         product.name,
    category:     product.category,
    manufacturer: product.manufacturer,
    fov_angle:    product.specs?.fov_angle    || '',
    ir_range:     product.specs?.ir_range     || '',
    power_watts:  product.specs?.power_watts  || '',
    is_active:    product.is_active,
  })
  const [saving, setSaving] = useState(false)

  const CATEGORIES = [
    'Dome Camera','Bullet Camera','PTZ Camera','Multi-Lens Camera','Fisheye Camera',
    'LPR Camera','NVR','Access Reader','Access Control Door','Controller',
    'Motion Sensor','Sensor','Intercom','Wireless Lock','Guard Tour',
    'Speaker','Display','Projector','Amplifier','DSP','Network',
    'Rack','UPS','Data Drop','Patch Panel','Cable Tray',
    'Smoke Detector','Heat Detector','Horn Strobe','Pull Station','FACP',
    'Panel','Outlet','Thermostat','Other'
  ]

  const inputClass = "w-full bg-[#0a1628] text-white border border-[#C8622A]/40 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-[#C8622A]"

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('global_products').update({
      part_number:  form.part_number,
      name:         form.name,
      category:     form.category,
      manufacturer: form.manufacturer,
      is_active:    form.is_active,
      specs: {
        ...product.specs,
        ...(form.fov_angle   ? { fov_angle:   parseFloat(form.fov_angle)   } : {}),
        ...(form.ir_range    ? { ir_range:    parseFloat(form.ir_range)    } : {}),
        ...(form.power_watts ? { power_watts: parseFloat(form.power_watts) } : {}),
      }
    }).eq('id', product.id)
    setSaving(false)
    setEditing(false)
    onSaved()
  }

  if (editing) return (
    <div className="grid grid-cols-5 gap-1.5 text-xs py-1.5 bg-[#1a2d45] rounded px-1 border border-[#C8622A]/30">
      <input value={form.part_number} onChange={e => setForm(p => ({ ...p, part_number: e.target.value }))} className={inputClass} placeholder="Part #" />
      <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={inputClass} placeholder="Name" />
      <input value={form.manufacturer} onChange={e => setForm(p => ({ ...p, manufacturer: e.target.value }))} className={inputClass} placeholder="Manufacturer" />
      <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={inputClass}>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <div className="flex gap-1">
        <input value={form.fov_angle}   onChange={e => setForm(p => ({ ...p, fov_angle: e.target.value }))}   className={inputClass} placeholder="FOV°" type="number" />
        <input value={form.ir_range}    onChange={e => setForm(p => ({ ...p, ir_range: e.target.value }))}    className={inputClass} placeholder="IR ft" type="number" />
        <input value={form.power_watts} onChange={e => setForm(p => ({ ...p, power_watts: e.target.value }))} className={inputClass} placeholder="W"    type="number" />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <button onClick={handleSave} disabled={saving} className="text-xs bg-[#C8622A] text-white px-2 py-0.5 rounded hover:bg-[#b5571f] transition-colors">
          {saving ? '...' : 'Save'}
        </button>
        <button onClick={() => setEditing(false)} className="text-xs text-[#8A9AB0] hover:text-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-5 gap-2 text-xs py-1 hover:bg-[#1a2d45] rounded px-1 group">
      <span className="font-mono text-[#C8622A] truncate">{product.part_number}</span>
      <span className="text-white truncate">{product.name}</span>
      <span className="text-[#8A9AB0]">{product.category}</span>
      <div className="flex gap-2 text-[#8A9AB0]">
        <span>{product.specs?.fov_angle ? `${product.specs.fov_angle}°` : '—'}</span>
        {product.specs?.power_watts && <span className="text-yellow-500/70">{product.specs.power_watts}W</span>}
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setEditing(true)} className="text-xs text-[#8A9AB0] hover:text-white transition-colors opacity-0 group-hover:opacity-100">
          Edit
        </button>
        <button
          onClick={async () => {
            await supabase.from('global_products').update({ is_active: !product.is_active }).eq('id', product.id)
            onSaved()
          }}
          className={`text-xs ${product.is_active ? 'text-green-400' : 'text-[#4a5a6a]'} hover:text-white transition-colors`}>
          {product.is_active ? 'Active' : 'Inactive'}
        </button>
        <button onClick={onEditAccessories} className="text-xs text-[#C8622A] hover:text-white transition-colors">
          Accessories
        </button>
        <button
          onClick={async () => {
            if (!window.confirm(`Delete ${product.part_number}?`)) return
            await supabase.from('global_products').delete().eq('id', product.id)
            onDelete()
          }}
          className="text-red-400 hover:text-red-300 transition-colors">
          ✕
        </button>
      </div>
    </div>
  )
}

// ─── AddProductForm ───────────────────────────────────────────────────────────
function AddProductForm({ onAdded }) {
  const emptyRow = () => ({
    part_number: '', name: '', manufacturer: '', category: 'Dome Camera',
    industry: 'security', fov_angle: '', ir_range: '', power_watts: '', _id: Math.random()
  })

  const [rows,    setRows]    = useState([emptyRow()])
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(null)
  const [error,   setError]   = useState(null)

  const CATEGORIES = [
    'Dome Camera','Bullet Camera','PTZ Camera','Multi-Lens Camera','Fisheye Camera',
    'LPR Camera','NVR','Access Reader','Access Control Door','Controller',
    'Motion Sensor','Sensor','Intercom','Wireless Lock','Guard Tour',
    'Speaker','Display','Projector','Amplifier','DSP','Network',
    'Rack','UPS','Data Drop','Patch Panel','Cable Tray',
    'Smoke Detector','Heat Detector','Horn Strobe','Pull Station','FACP',
    'Panel','Outlet','Thermostat','Other'
  ]

  const INDUSTRIES = ['security','av','fire_alarm','low_voltage','hvac','electrical']

  const update = (idx, field, value) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const addRow = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx))

  const handleSave = async () => {
    const valid = rows.filter(r => r.part_number.trim() && r.manufacturer.trim())
    if (!valid.length) { setError('At least one product with part number and manufacturer required'); return }

    setSaving(true)
    setError(null)
    setSuccess(null)

    const toInsert = valid.map(r => ({
      part_number:  r.part_number.trim().toUpperCase(),
      name:         r.name.trim() || `${r.manufacturer.trim()} ${r.part_number.trim()}`,
      manufacturer: r.manufacturer.trim(),
      category:     r.category,
      industry:     r.industry,
      is_active:    true,
      is_basic:     false,
      specs: {
        ...(r.fov_angle   ? { fov_angle:   parseFloat(r.fov_angle)   } : {}),
        ...(r.ir_range    ? { ir_range:    parseFloat(r.ir_range)    } : {}),
        ...(r.power_watts ? { power_watts: parseFloat(r.power_watts) } : {}),
      }
    }))

    const { error: err } = await supabase
      .from('global_products')
      .upsert(toInsert, { onConflict: 'part_number' })

    setSaving(false)
    if (err) { setError(err.message); return }
    setSuccess(`${valid.length} product${valid.length !== 1 ? 's' : ''} saved successfully`)
    setRows([emptyRow()])
    onAdded()
  }

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] placeholder-[#4a5a6a]"
  const selectClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]"

  return (
    <div className="bg-[#1a2d45] border border-[#2a3d55] rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-white font-bold text-sm">Add Products Manually</h3>
          <p className="text-[#8A9AB0] text-xs mt-0.5">Add one or more products directly — no Excel needed</p>
        </div>
        <button onClick={addRow}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a3d55] text-white text-xs rounded-lg hover:bg-[#3a4d65] transition-colors">
          + Add Row
        </button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-12 gap-1.5 mb-1.5 px-1">
        {['Part Number *', 'Name', 'Manufacturer *', 'Category', 'Industry', 'FOV°', 'IR ft', 'Watts', ''].map(h => (
          <div key={h} className={`text-[#8A9AB0] text-xs font-medium ${
            h === 'Part Number *'  ? 'col-span-2' :
            h === 'Name'           ? 'col-span-2' :
            h === 'Manufacturer *' ? 'col-span-2' :
            h === 'Category'       ? 'col-span-2' :
            'col-span-1'
          }`}>{h}</div>
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {rows.map((row, idx) => (
          <div key={row._id} className="grid grid-cols-12 gap-1.5 items-center">
            <div className="col-span-2">
              <input placeholder="e.g. KT-400" value={row.part_number}
                onChange={e => update(idx, 'part_number', e.target.value)}
                className={inputClass} />
            </div>
            <div className="col-span-2">
              <input placeholder="e.g. 4-Door Controller" value={row.name}
                onChange={e => update(idx, 'name', e.target.value)}
                className={inputClass} />
            </div>
            <div className="col-span-2">
              <input placeholder="e.g. Kantech" value={row.manufacturer}
                onChange={e => update(idx, 'manufacturer', e.target.value)}
                className={inputClass} />
            </div>
            <div className="col-span-2">
              <select value={row.category} onChange={e => update(idx, 'category', e.target.value)}
                className={selectClass}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-span-1">
              <select value={row.industry} onChange={e => update(idx, 'industry', e.target.value)}
                className={selectClass}>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="col-span-1">
              <input placeholder="90" value={row.fov_angle}
                onChange={e => update(idx, 'fov_angle', e.target.value)}
                className={inputClass} type="number" />
            </div>
            <div className="col-span-1">
              <input placeholder="30" value={row.ir_range}
                onChange={e => update(idx, 'ir_range', e.target.value)}
                className={inputClass} type="number" />
            </div>
            <div className="col-span-1">
              <input placeholder="7.5" value={row.power_watts}
                onChange={e => update(idx, 'power_watts', e.target.value)}
                className={inputClass} type="number" />
            </div>
            <div className="col-span-1 flex justify-center">
              {rows.length > 1 && (
                <button onClick={() => removeRow(idx)}
                  className="text-red-400 hover:text-red-300 transition-colors text-xs">✕</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2a3d55]">
        <div>
          {error   && <p className="text-red-400 text-xs">{error}</p>}
          {success && <p className="text-green-400 text-xs">{success}</p>}
        </div>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 bg-[#C8622A] text-white text-sm font-semibold rounded-lg hover:bg-[#b5571f] transition-colors disabled:opacity-50">
          {saving ? 'Saving...' : `Save ${rows.filter(r => r.part_number).length || ''} Product${rows.filter(r => r.part_number).length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}