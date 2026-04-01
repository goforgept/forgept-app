import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

const AUTO_CHECK_TYPES = [
  { type: 'proposal_signed', label: 'Proposal signed', icon: '✍️' },
  { type: 'po_generated', label: 'Materials ordered (PO generated)', icon: '📦' },
  { type: 'parts_received', label: 'Materials received', icon: '✅' },
  { type: 'invoice_sent', label: 'Invoice sent', icon: '🧾' },
  { type: 'payment_received', label: 'Payment received', icon: '💰' },
  { type: 'email_sent', label: 'Client notified', icon: '✉️' },
  { type: 'scheduled', label: 'Job scheduled', icon: '📅' },
  { type: 'photos_uploaded', label: 'Site photos uploaded', icon: '📷' },
]

const MANUAL_DEFAULTS = [
  'Site walk completed',
  'Permits obtained',
  'Installation complete',
  'System tested & signed off',
  'Punch list cleared',
  'As-built documentation complete',
]

const STATUS_COLORS = {
  'Active': 'bg-green-500/20 text-green-400',
  'On Hold': 'bg-yellow-500/20 text-yellow-400',
  'Completed': 'bg-blue-500/20 text-blue-400',
  'Cancelled': 'bg-red-500/20 text-red-400',
}

export default function JobDetail({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [checklist, setChecklist] = useState([])
  const [changeOrders, setChangeOrders] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('checklist')
  const [savingStatus, setSavingStatus] = useState(false)

  // Bulk BOM edit
  const [editingBOM, setEditingBOM] = useState(false)
  const [editLines, setEditLines] = useState([])
  const [selectedLines, setSelectedLines] = useState(new Set())
  const [bulkField, setBulkField] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [savingBOM, setSavingBOM] = useState(false)
  const [vendors, setVendors] = useState([])

  // Change order modal
  const [showCOModal, setShowCOModal] = useState(false)
  const [coForm, setCoForm] = useState({ name: '', description: '', amount: '' })
  const [savingCO, setSavingCO] = useState(false)

  // Checklist add
  const [newCheckItem, setNewCheckItem] = useState('')
  const [savingCheck, setSavingCheck] = useState(false)

  // Notify customer prompt
  const [showNotifyModal, setShowNotifyModal] = useState(false)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [sendingNotify, setSendingNotify] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, clients(company, email, client_name), profiles(full_name, email)')
      .eq('id', id)
      .single()
    setJob(jobData)

    if (jobData?.proposal_id) {
      const { data: propData } = await supabase
        .from('proposals')
        .select('id, proposal_name, proposal_value, total_your_cost, total_gross_margin_percent, status, client_email, scope_of_work, labor_items, quote_number')
        .eq('id', jobData.proposal_id)
        .single()
      setProposal(propData)

      const { data: lineData } = await supabase
        .from('bom_line_items')
        .select('*')
        .eq('proposal_id', jobData.proposal_id)
      setLineItems(lineData || [])
      setEditLines(lineData || [])

      // Fetch vendors for bulk edit
      if (profileData?.org_id) {
        const { data: vendorData } = await supabase
          .from('vendors')
          .select('id, vendor_name, default_markup_percent')
          .eq('org_id', profileData.org_id)
          .eq('active', true)
          .order('vendor_name')
        setVendors(vendorData || [])
      }
    }

    // Fetch checklist
    const { data: checkData } = await supabase
      .from('job_checklist_items')
      .select('*')
      .eq('job_id', id)
      .order('sort_order', { ascending: true })

    if (checkData && checkData.length > 0) {
      setChecklist(checkData)
    } else {
      // Auto-create default checklist
      await createDefaultChecklist(id, profileData?.org_id)
      const { data: freshCheck } = await supabase
        .from('job_checklist_items')
        .select('*')
        .eq('job_id', id)
        .order('sort_order', { ascending: true })
      setChecklist(freshCheck || [])
    }

    // Fetch change orders
    const { data: coData } = await supabase
      .from('change_orders')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false })
    setChangeOrders(coData || [])

    // Auto-check checklist items based on system data
    await autoCheckItems(id, jobData)

    setLoading(false)
  }

  const createDefaultChecklist = async (jobId, orgId) => {
    const items = [
      // Auto items
      ...AUTO_CHECK_TYPES.map((a, i) => ({
        job_id: jobId, org_id: orgId, label: a.label,
        is_auto: true, auto_check_type: a.type,
        completed: false, sort_order: i
      })),
      // Manual items
      ...MANUAL_DEFAULTS.map((label, i) => ({
        job_id: jobId, org_id: orgId, label,
        is_auto: false, auto_check_type: null,
        completed: false, sort_order: AUTO_CHECK_TYPES.length + i
      }))
    ]
    await supabase.from('job_checklist_items').insert(items)
  }

  const autoCheckItems = async (jobId, jobData) => {
    if (!jobData?.proposal_id) return

    // Check each auto type
    const checks = {}

    // PO generated
    const { data: pos } = await supabase.from('purchase_orders').select('id, status').eq('proposal_id', jobData.proposal_id)
    checks['po_generated'] = (pos || []).length > 0

    // Parts received — all PO line items received
    const { data: bomItems } = await supabase.from('bom_line_items').select('po_status').eq('proposal_id', jobData.proposal_id)
    const hasPOs = (bomItems || []).some(l => l.po_status === 'PO Sent')
    checks['parts_received'] = hasPOs && (bomItems || []).every(l => !l.po_status || l.po_status === 'Received')

    // Invoice sent
    const { data: invoices } = await supabase.from('invoices').select('id, status').eq('proposal_id', jobData.proposal_id)
    checks['invoice_sent'] = (invoices || []).some(i => i.status === 'Sent' || i.status === 'Paid')
    checks['payment_received'] = (invoices || []).some(i => i.status === 'Paid')

    // Photos uploaded
    const { data: photos } = await supabase.from('proposal_photos').select('id').eq('proposal_id', jobData.proposal_id)
    checks['photos_uploaded'] = (photos || []).length > 0

    // Email sent (any activity of type email)
    const { data: activities } = await supabase.from('activities').select('type').eq('proposal_id', jobData.proposal_id)
    checks['email_sent'] = (activities || []).some(a => a.type === 'email')

    // Scheduled — job has a start date
    checks['scheduled'] = !!jobData.start_date

    // Update auto items
    for (const [checkType, isComplete] of Object.entries(checks)) {
      if (isComplete) {
        await supabase.from('job_checklist_items')
          .update({ completed: true, completed_at: new Date().toISOString() })
          .eq('job_id', jobId)
          .eq('auto_check_type', checkType)
          .eq('completed', false)
      }
    }
  }

  const toggleCheckItem = async (item) => {
    if (item.is_auto) return // auto items can't be manually toggled
    const newVal = !item.completed
    await supabase.from('job_checklist_items').update({
      completed: newVal,
      completed_at: newVal ? new Date().toISOString() : null,
      completed_by: profile?.id || null
    }).eq('id', item.id)
    setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, completed: newVal } : c))

    // Check if scheduled and prompt notify
    if (item.auto_check_type === 'scheduled' || item.label.toLowerCase().includes('schedul')) {
      if (newVal && job?.clients?.email) {
        setNotifyMessage(`Hi ${job.clients.client_name || job.clients.company},\n\nYour job has been scheduled. Our team will be on site as planned. Please don't hesitate to reach out if you have any questions.\n\nThank you for your business.`)
        setShowNotifyModal(true)
      }
    }
  }

  const addCheckItem = async () => {
    if (!newCheckItem.trim()) return
    setSavingCheck(true)
    const { data } = await supabase.from('job_checklist_items').insert({
      job_id: id,
      org_id: profile?.org_id,
      label: newCheckItem.trim(),
      is_auto: false,
      completed: false,
      sort_order: checklist.length
    }).select().single()
    if (data) setChecklist(prev => [...prev, data])
    setNewCheckItem('')
    setSavingCheck(false)
  }

  const deleteCheckItem = async (itemId) => {
    await supabase.from('job_checklist_items').delete().eq('id', itemId)
    setChecklist(prev => prev.filter(c => c.id !== itemId))
  }

  const updateJobStatus = async (status) => {
    setSavingStatus(true)
    await supabase.from('jobs').update({ status }).eq('id', id)
    setJob(prev => ({ ...prev, status }))
    setSavingStatus(false)
  }

  const updateJobDates = async (field, value) => {
    await supabase.from('jobs').update({ [field]: value || null }).eq('id', id)
    setJob(prev => ({ ...prev, [field]: value }))
    if (field === 'start_date' && value && job?.clients?.email) {
      setNotifyMessage(`Hi ${job.clients.client_name || job.clients.company},\n\nYour job has been scheduled to start on ${new Date(value).toLocaleDateString()}. We look forward to working with you.\n\nPlease reach out with any questions.`)
      setShowNotifyModal(true)
    }
  }

  // Bulk BOM edit
  const toggleLineSelect = (id) => {
    setSelectedLines(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedLines.size === editLines.length) {
      setSelectedLines(new Set())
    } else {
      setSelectedLines(new Set(editLines.map(l => l.id)))
    }
  }

  const applyBulkEdit = () => {
    if (!bulkField || !bulkValue || selectedLines.size === 0) return
    setEditLines(prev => prev.map(l => {
      if (!selectedLines.has(l.id)) return l
      const updated = { ...l, [bulkField]: bulkValue }
      // Auto-apply vendor markup
      if (bulkField === 'vendor') {
        const vendor = vendors.find(v => v.vendor_name === bulkValue)
        if (vendor?.default_markup_percent) updated.markup_percent = vendor.default_markup_percent
      }
      // Recalculate price if cost/markup changed
      if (bulkField === 'markup_percent' && l.your_cost_unit) {
        updated.customer_price_unit = (parseFloat(l.your_cost_unit) * (1 + parseFloat(bulkValue) / 100)).toFixed(2)
        updated.customer_price_total = (parseFloat(updated.customer_price_unit) * parseFloat(l.quantity || 0)).toFixed(2)
      }
      return updated
    }))
    setBulkField('')
    setBulkValue('')
    setSelectedLines(new Set())
  }

  const saveBOM = async () => {
    setSavingBOM(true)
    for (const line of editLines) {
      await supabase.from('bom_line_items').update({
        item_name: line.item_name,
        manufacturer: line.manufacturer || null,
        part_number_sku: line.part_number_sku || null,
        quantity: parseFloat(line.quantity) || 0,
        unit: line.unit,
        category: line.category,
        vendor: line.vendor,
        your_cost_unit: parseFloat(line.your_cost_unit) || null,
        markup_percent: parseFloat(line.markup_percent) || null,
        customer_price_unit: parseFloat(line.customer_price_unit) || null,
        customer_price_total: (parseFloat(line.customer_price_unit) || 0) * (parseFloat(line.quantity) || 0),
        pricing_status: line.your_cost_unit ? 'Confirmed' : 'Needs Pricing',
      }).eq('id', line.id)
    }
    setLineItems([...editLines])
    setEditingBOM(false)
    setSelectedLines(new Set())
    setSavingBOM(false)
  }

  const updateEditLine = (index, field, value) => {
    setEditLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'your_cost_unit' || field === 'markup_percent') {
        const cost = parseFloat(updated[index].your_cost_unit) || 0
        const markup = parseFloat(updated[index].markup_percent) || 0
        updated[index].customer_price_unit = (cost * (1 + markup / 100)).toFixed(2)
        updated[index].customer_price_total = (parseFloat(updated[index].customer_price_unit) * (parseFloat(updated[index].quantity) || 0)).toFixed(2)
      }
      return updated
    })
  }

  const saveChangeOrder = async () => {
    if (!coForm.name.trim()) return
    setSavingCO(true)
    const { data } = await supabase.from('change_orders').insert({
      job_id: id,
      org_id: profile?.org_id,
      proposal_id: job?.proposal_id || null,
      name: coForm.name,
      description: coForm.description,
      amount: parseFloat(coForm.amount) || 0,
      status: 'Pending'
    }).select().single()
    if (data) setChangeOrders(prev => [data, ...prev])
    setCoForm({ name: '', description: '', amount: '' })
    setShowCOModal(false)
    setSavingCO(false)
  }

  const updateCOStatus = async (coId, status) => {
    await supabase.from('change_orders').update({ status }).eq('id', coId)
    setChangeOrders(prev => prev.map(c => c.id === coId ? { ...c, status } : c))
  }

  const sendNotification = async () => {
    if (!job?.clients?.email || !notifyMessage) return
    setSendingNotify(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followup-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          type: 'ai_email',
          toEmail: job.clients.email,
          toName: job.clients.client_name || job.clients.company,
          fromName: profile?.full_name || '',
          fromEmail: profile?.email || '',
          subject: `Update on your job: ${job.name}`,
          body: notifyMessage,
          clientId: job.client_id,
          orgId: job.org_id,
          sentBy: profile?.id
        })
      })
      await supabase.from('activities').insert({
        proposal_id: job.proposal_id,
        org_id: job.org_id,
        user_id: profile?.id,
        type: 'email',
        title: `Customer notified about job update`
      })
    } catch (e) { console.error(e) }
    setShowNotifyModal(false)
    setSendingNotify(false)
  }

  const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const completedCount = checklist.filter(c => c.completed).length
  const progress = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0
  const totalCOAmount = changeOrders.filter(c => c.status === 'Approved').reduce((sum, c) => sum + (c.amount || 0), 0)
  const categories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Roofing Materials', 'Insulation', 'Windows & Doors', 'Flooring', 'Painting & Finishing', 'Plumbing', 'HVAC', 'Solar', 'Hardware', 'Other']
  const inputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} />

      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <button onClick={() => navigate('/jobs')} className="text-[#8A9AB0] hover:text-white text-xs mb-2 transition-colors">← Jobs</button>
              <div className="flex items-center gap-3">
                {job?.job_number && <span className="text-[#8A9AB0] text-sm font-mono bg-[#0F1C2E] px-2 py-0.5 rounded">{job.job_number}</span>}
                <h2 className="text-white text-2xl font-bold">{job?.name}</h2>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-[#8A9AB0]">
                {job?.clients?.company && <span>🏢 {job.clients.company}</span>}
                {job?.profiles?.full_name && <span>👤 PM: {job.profiles.full_name}</span>}
                {proposal?.quote_number && <span className="font-mono">#{proposal.quote_number}</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {job?.clients?.email && (
                <button onClick={() => setShowNotifyModal(true)}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
                  ✉️ Notify Customer
                </button>
              )}
              <select value={job?.status || 'Active'} onChange={e => updateJobStatus(e.target.value)} disabled={savingStatus}
                className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                {['Active', 'On Hold', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Contract Value</p>
              <p className="text-white font-bold">${fmt(proposal?.proposal_value)}</p>
            </div>
            {totalCOAmount > 0 && (
              <div className="bg-[#0F1C2E] rounded-lg p-3">
                <p className="text-[#8A9AB0] text-xs mb-1">Change Orders</p>
                <p className="text-[#C8622A] font-bold">+${fmt(totalCOAmount)}</p>
              </div>
            )}
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Margin</p>
              <p className="text-[#C8622A] font-bold">{proposal?.total_gross_margin_percent?.toFixed(1) || '—'}%</p>
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">Start Date</p>
              <input type="date" value={job?.start_date || ''} onChange={e => updateJobDates('start_date', e.target.value)}
                className="bg-transparent text-white text-sm font-medium focus:outline-none cursor-pointer w-full" />
            </div>
            <div className="bg-[#0F1C2E] rounded-lg p-3">
              <p className="text-[#8A9AB0] text-xs mb-1">End Date</p>
              <input type="date" value={job?.end_date || ''} onChange={e => updateJobDates('end_date', e.target.value)}
                className="bg-transparent text-white text-sm font-medium focus:outline-none cursor-pointer w-full" />
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[#8A9AB0] text-xs">Overall progress — {completedCount} of {checklist.length} complete</span>
              <span className="text-[#8A9AB0] text-xs">{progress}%</span>
            </div>
            <div className="w-full bg-[#0F1C2E] rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-400' : 'bg-[#C8622A]'}`} style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'checklist', label: `Checklist (${completedCount}/${checklist.length})` },
            { key: 'bom', label: `BOM (${lineItems.length} items)` },
            { key: 'changeorders', label: `Change Orders (${changeOrders.length})` },
            { key: 'proposal', label: 'Proposal' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* CHECKLIST TAB */}
        {activeTab === 'checklist' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-5">Job Checklist</h3>
            <div className="space-y-2 mb-6">
              {checklist.map(item => {
                const autoType = AUTO_CHECK_TYPES.find(a => a.type === item.auto_check_type)
                return (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${item.completed ? 'bg-green-500/5 border-green-500/20' : 'bg-[#0F1C2E] border-[#2a3d55]'}`}>
                    <button onClick={() => toggleCheckItem(item)}
                      disabled={item.is_auto}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.completed ? 'bg-green-500 border-green-500' : 'border-[#2a3d55] hover:border-[#C8622A]'} ${item.is_auto ? 'cursor-default' : 'cursor-pointer'}`}>
                      {item.completed && <span className="text-white text-xs">✓</span>}
                    </button>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${item.completed ? 'text-green-400 line-through' : 'text-white'}`}>
                        {autoType ? `${autoType.icon} ` : ''}{item.label}
                      </p>
                      {item.completed && item.completed_at && (
                        <p className="text-[#8A9AB0] text-xs mt-0.5">Completed {new Date(item.completed_at).toLocaleDateString()}</p>
                      )}
                    </div>
                    {item.is_auto && (
                      <span className="text-[#8A9AB0] text-xs bg-[#2a3d55] px-2 py-0.5 rounded-full">Auto</span>
                    )}
                    {!item.is_auto && (
                      <button onClick={() => deleteCheckItem(item.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">✕</button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Add custom item */}
            <div className="flex gap-2 border-t border-[#2a3d55] pt-4">
              <input type="text" value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                placeholder="Add a custom checklist item..."
                className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
              <button onClick={addCheckItem} disabled={savingCheck || !newCheckItem.trim()}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                Add
              </button>
            </div>
          </div>
        )}

        {/* BOM TAB */}
        {activeTab === 'bom' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Bill of Materials</h3>
              {!editingBOM ? (
                <button onClick={() => { setEditingBOM(true); setEditLines([...lineItems]); setSelectedLines(new Set()) }}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
                  Edit BOM
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => { setEditingBOM(false); setSelectedLines(new Set()) }}
                    className="px-4 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                  <button onClick={saveBOM} disabled={savingBOM}
                    className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {savingBOM ? 'Saving...' : 'Save BOM'}
                  </button>
                </div>
              )}
            </div>

            {/* Bulk action bar */}
            {editingBOM && selectedLines.size > 0 && (
              <div className="bg-[#C8622A]/10 border border-[#C8622A]/30 rounded-xl px-4 py-3 mb-4 flex items-center gap-4 flex-wrap">
                <span className="text-[#C8622A] text-sm font-semibold">{selectedLines.size} item{selectedLines.size !== 1 ? 's' : ''} selected</span>
                <div className="flex gap-2 flex-1 flex-wrap">
                  <select value={bulkField} onChange={e => { setBulkField(e.target.value); setBulkValue('') }}
                    className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]">
                    <option value="">— Bulk edit field —</option>
                    <option value="vendor">Vendor</option>
                    <option value="manufacturer">Manufacturer</option>
                    <option value="category">Category</option>
                    <option value="markup_percent">Markup %</option>
                  </select>
                  {bulkField === 'vendor' && (
                    <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                      className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]">
                      <option value="">— Select vendor —</option>
                      {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                      <option value="Other">Other</option>
                    </select>
                  )}
                  {bulkField === 'category' && (
                    <select value={bulkValue} onChange={e => setBulkValue(e.target.value)}
                      className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]">
                      <option value="">— Select category —</option>
                      {categories.map(c => <option key={c}>{c}</option>)}
                    </select>
                  )}
                  {(bulkField === 'manufacturer' || bulkField === 'markup_percent') && (
                    <input type={bulkField === 'markup_percent' ? 'number' : 'text'} value={bulkValue}
                      onChange={e => setBulkValue(e.target.value)}
                      placeholder={bulkField === 'markup_percent' ? 'e.g. 35' : 'e.g. Hanwha'}
                      className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]" />
                  )}
                  <button onClick={applyBulkEdit} disabled={!bulkField || !bulkValue}
                    className="bg-[#C8622A] text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    Apply
                  </button>
                </div>
                <button onClick={() => setSelectedLines(new Set())} className="text-[#8A9AB0] hover:text-white text-sm transition-colors">Clear</button>
              </div>
            )}

            {lineItems.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No line items on this proposal.</p>
            ) : editingBOM ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      <th className="py-2 pr-2 w-8">
                        <input type="checkbox" checked={selectedLines.size === editLines.length && editLines.length > 0}
                          onChange={toggleSelectAll} className="accent-[#C8622A]" />
                      </th>
                      {['Item', 'Mfr', 'Part #', 'Qty', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price'].map(h => (
                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {editLines.map((line, i) => (
                      <tr key={line.id} className={`border-b border-[#2a3d55]/30 ${selectedLines.has(line.id) ? 'bg-[#C8622A]/5' : ''}`}>
                        <td className="pr-2 py-1">
                          <input type="checkbox" checked={selectedLines.has(line.id)} onChange={() => toggleLineSelect(line.id)} className="accent-[#C8622A]" />
                        </td>
                        {[
                          ['item_name', 'text', 'Item'],
                          ['manufacturer', 'text', 'Mfr'],
                          ['part_number_sku', 'text', 'Part #'],
                          ['quantity', 'number', 'Qty'],
                        ].map(([field, type, placeholder]) => (
                          <td key={field} className="pr-2 py-1">
                            <input type={type} placeholder={placeholder} value={line[field] || ''}
                              onChange={e => updateEditLine(i, field, e.target.value)}
                              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                          </td>
                        ))}
                        <td className="pr-2 py-1">
                          <select value={line.unit || 'ea'} onChange={e => updateEditLine(i, 'unit', e.target.value)}
                            className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                            {['ea', 'ft', 'lot', 'hr', 'box', 'roll'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="pr-2 py-1">
                          <select value={line.category || ''} onChange={e => updateEditLine(i, 'category', e.target.value)}
                            className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                            <option value="">Category</option>
                            {categories.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="pr-2 py-1">
                          <select value={line.vendor || ''} onChange={e => updateEditLine(i, 'vendor', e.target.value)}
                            className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                            <option value="">— Vendor —</option>
                            {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                            <option value="Other">Other</option>
                          </select>
                        </td>
                        <td className="pr-2 py-1">
                          <input type="number" placeholder="0.00" value={line.your_cost_unit || ''}
                            onChange={e => updateEditLine(i, 'your_cost_unit', e.target.value)}
                            className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                        </td>
                        <td className="pr-2 py-1">
                          <input type="number" placeholder="35" value={line.markup_percent || ''}
                            onChange={e => updateEditLine(i, 'markup_percent', e.target.value)}
                            className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                        </td>
                        <td className="pr-2 py-1">
                          <input type="number" placeholder="0.00" value={line.customer_price_unit || ''}
                            onChange={e => updateEditLine(i, 'customer_price_unit', e.target.value)}
                            className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      {['Item', 'Mfr', 'Part #', 'Vendor', 'Qty', 'Unit Price', 'Total', 'Status'].map(h => (
                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map(item => (
                      <tr key={item.id} className="border-b border-[#2a3d55]/50">
                        <td className="text-white py-3 pr-4">{item.item_name}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{item.manufacturer || '—'}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{item.part_number_sku || '—'}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{item.vendor || '—'}</td>
                        <td className="text-white py-3 pr-4">{item.quantity}</td>
                        <td className="text-white py-3 pr-4">${fmt(item.customer_price_unit)}</td>
                        <td className="text-white py-3 pr-4">${fmt(item.customer_price_total)}</td>
                        <td className="py-3">
                          <span className={`text-xs px-2 py-1 rounded font-semibold ${item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' : item.pricing_status === 'Confirmed' ? 'bg-green-500/20 text-green-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                            {item.po_status || item.pricing_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="5" className="text-[#8A9AB0] pt-4 text-right font-semibold">Total</td>
                      <td className="text-[#C8622A] pt-4 font-bold pr-4 text-right">${fmt(lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0))}</td>
                      <td></td><td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CHANGE ORDERS TAB */}
        {activeTab === 'changeorders' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">Change Orders</h3>
              <button onClick={() => setShowCOModal(true)}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                + New Change Order
              </button>
            </div>

            {changeOrders.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-[#2a3d55] rounded-xl">
                <p className="text-[#8A9AB0]">No change orders yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {changeOrders.map(co => (
                  <div key={co.id} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-semibold">{co.name}</p>
                        {co.description && <p className="text-[#8A9AB0] text-sm mt-0.5">{co.description}</p>}
                        <p className="text-[#C8622A] font-bold mt-1">${fmt(co.amount)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded font-semibold ${co.status === 'Approved' ? 'bg-green-500/20 text-green-400' : co.status === 'Rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {co.status}
                        </span>
                        {co.status === 'Pending' && (
                          <div className="flex gap-1">
                            <button onClick={() => updateCOStatus(co.id, 'Approved')}
                              className="bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-green-700 transition-colors">Approve</button>
                            <button onClick={() => updateCOStatus(co.id, 'Rejected')}
                              className="bg-red-600/30 text-red-400 px-3 py-1 rounded text-xs font-semibold hover:bg-red-600/50 transition-colors">Reject</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {totalCOAmount > 0 && (
                  <div className="flex justify-between items-center pt-3 border-t border-[#2a3d55]">
                    <span className="text-[#8A9AB0] font-semibold">Approved Change Orders Total</span>
                    <span className="text-[#C8622A] font-bold text-lg">+${fmt(totalCOAmount)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PROPOSAL TAB */}
        {activeTab === 'proposal' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold text-lg">Linked Proposal</h3>
              {job?.proposal_id && (
                <button onClick={() => navigate(`/proposal/${job.proposal_id}`)}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
                  Open Proposal →
                </button>
              )}
            </div>
            {proposal ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Proposal Name</p><p className="text-white font-medium">{proposal.proposal_name}</p></div>
                  <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Value</p><p className="text-white font-bold">${fmt(proposal.proposal_value)}</p></div>
                  <div className="bg-[#0F1C2E] rounded-lg p-3"><p className="text-[#8A9AB0] text-xs mb-1">Margin</p><p className="text-[#C8622A] font-bold">{proposal.total_gross_margin_percent?.toFixed(1) || '—'}%</p></div>
                </div>
                {proposal.scope_of_work && (
                  <div className="bg-[#0F1C2E] rounded-xl p-4">
                    <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Scope of Work</p>
                    <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap line-clamp-6">{proposal.scope_of_work}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[#8A9AB0]">No proposal linked to this job.</p>
            )}
          </div>
        )}
      </div>

      {/* Notify Customer Modal */}
      {showNotifyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-white font-bold text-lg mb-1">Notify Customer</h3>
            <p className="text-[#8A9AB0] text-sm mb-4">Sending to <span className="text-white">{job?.clients?.email}</span></p>
            <textarea value={notifyMessage} onChange={e => setNotifyMessage(e.target.value)} rows={8}
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setShowNotifyModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Skip</button>
              <button onClick={sendNotification} disabled={sendingNotify || !notifyMessage.trim()}
                className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {sendingNotify ? 'Sending...' : 'Send Notification →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Order Modal */}
      {showCOModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-5">New Change Order</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Name <span className="text-[#C8622A]">*</span></label>
                <input type="text" value={coForm.name} onChange={e => setCoForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Additional camera location" className={`w-full ${inputClass}`} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
                <textarea value={coForm.description} onChange={e => setCoForm(p => ({ ...p, description: e.target.value }))}
                  rows={3} placeholder="Details about the change..."
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Amount ($)</label>
                <input type="number" value={coForm.amount} onChange={e => setCoForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00" className={`w-full ${inputClass}`} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCOModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveChangeOrder} disabled={savingCO || !coForm.name.trim()}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingCO ? 'Saving...' : 'Create Change Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}