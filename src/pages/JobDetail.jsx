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

function JobPOList({ proposalId }) {
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!proposalId) { setLoading(false); return }
    supabase.from('purchase_orders').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false })
      .then(({ data }) => { setPos(data || []); setLoading(false) })
  }, [proposalId])

  const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) return <p className="text-[#8A9AB0] text-sm">Loading...</p>
  if (!proposalId) return <p className="text-[#8A9AB0] text-sm">No proposal linked to this job.</p>
  if (pos.length === 0) return (
    <div className="text-center py-8 border-2 border-dashed border-[#2a3d55] rounded-xl">
      <p className="text-[#8A9AB0]">No purchase orders yet.</p>
      <p className="text-[#8A9AB0] text-xs mt-1">Generate POs from the linked proposal's BOM tab.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {pos.map(po => (
        <div key={po.id} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-white font-semibold font-mono">{po.po_number}</p>
              <p className="text-[#8A9AB0] text-sm mt-0.5">{po.vendor_name}</p>
              <p className="text-[#8A9AB0] text-xs mt-0.5">{po.created_at ? new Date(po.created_at).toLocaleDateString() : ''}</p>
            </div>
            <div className="text-right">
              <p className="text-[#C8622A] font-bold text-lg">${fmt(po.total_amount)}</p>
              <span className={`text-xs px-2 py-1 rounded font-semibold ${po.status === 'Received' ? 'bg-green-500/20 text-green-400' : po.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                {po.status}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function JobDetail({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'admin', isPM = false, isTechnician = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [editingJobName, setEditingJobName] = useState(false)
  const [jobNameDraft, setJobNameDraft] = useState('')
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [checklist, setChecklist] = useState([])
  const [changeOrders, setChangeOrders] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('checklist')
  const [savingStatus, setSavingStatus] = useState(false)
  const [orgProfiles, setOrgProfiles] = useState([])
  const [orgTimezone, setOrgTimezone] = useState('America/Chicago')
  // Freeform PO line items (from purchase_order_line_items where job_id = id)
  const [freeformPOItems, setFreeformPOItems] = useState([])

  // Bulk BOM edit
  const [editingBOM, setEditingBOM] = useState(false)
  const [editLines, setEditLines] = useState([])
  const [selectedLines, setSelectedLines] = useState(new Set())
  const [bulkField, setBulkField] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [savingBOM, setSavingBOM] = useState(false)
  const [vendors, setVendors] = useState([])

  // PO generation
  const [selectedForPO, setSelectedForPO] = useState(new Set())
  const [showPOModal, setShowPOModal] = useState(false)
  const [poVendorEmail, setPOVendorEmail] = useState('')
  const [poNumber, setPONumber] = useState('')
  const [poAutoNumber, setPOAutoNumber] = useState(true)
  const [generatingPO, setGeneratingPO] = useState(false)

  // Change order modal
  const [showCOModal, setShowCOModal] = useState(false)
  const [coForm, setCoForm] = useState({ name: '', description: '', line_items: [], labor_items: [] })
  const [savingCO, setSavingCO] = useState(false)

  // Checklist add
  const [newCheckItem, setNewCheckItem] = useState('')
  const [savingCheck, setSavingCheck] = useState(false)

  // Tech daily logs
  const [techLogs, setTechLogs] = useState([])

  // Notify customer prompt
  const [showNotifyModal, setShowNotifyModal] = useState(false)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [sendingNotify, setSendingNotify] = useState(false)

  // Schedule tech modal
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [schedTechId, setSchedTechId] = useState('')
  const [schedDate, setSchedDate] = useState('')
  const [schedHours, setSchedHours] = useState('4')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [jobSchedules, setJobSchedules] = useState([])

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('*, organizations(org_type)').eq('id', user.id).single()
    setProfile(profileData)

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, clients(company, email, client_name), profiles!jobs_assigned_pm_fkey(full_name, email)')
      .eq('id', id)
      .single()
    setJob(jobData)

    if (profileData?.org_id) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('org_id', profileData.org_id)
        .order('full_name')
      setOrgProfiles(profilesData || [])
      const { data: orgData } = await supabase.from('organizations').select('timezone').eq('id', profileData.org_id).single()
      setOrgTimezone(orgData?.timezone || 'America/Chicago')
    }

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

      if (profileData?.org_id) {
        const { data: vendorData } = await supabase
          .from('vendors')
          .select('id, vendor_name, default_markup_percent, contact_email')
          .eq('org_id', profileData.org_id)
          .eq('active', true)
          .order('vendor_name')
        setVendors(vendorData || [])
      }
    }

    // Fetch freeform PO line items linked to this job
    const { data: poData } = await supabase
      .from('purchase_orders')
      .select('id, po_number, vendor_name, total_amount, description')
      .eq('job_id', id)
    if (poData && poData.length > 0) {
      const poIds = poData.map(p => p.id)
      const { data: poLineData } = await supabase
        .from('purchase_order_line_items')
        .select('*, purchase_orders(po_number, vendor_name, description)')
        .in('po_id', poIds)
      setFreeformPOItems(poLineData || [])
    } else {
      setFreeformPOItems([])
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

    // Fetch tech daily logs
    const { data: logData } = await supabase
      .from('tech_daily_logs')
      .select('*, profiles(full_name)')
      .eq('job_id', id)
      .order('log_date', { ascending: false })
    setTechLogs(logData || [])

    await autoCheckItems(id, jobData)

    // Fetch existing tech schedules for this job
    const { data: schedData } = await supabase
      .from('job_tech_schedules')
      .select('*, profiles(full_name)')
      .eq('job_id', id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
    setJobSchedules(schedData || [])

    setLoading(false)
  }

  const createDefaultChecklist = async (jobId, orgId) => {
    const items = [
      ...AUTO_CHECK_TYPES.map((a, i) => ({
        job_id: jobId, org_id: orgId, label: a.label,
        is_auto: true, auto_check_type: a.type,
        completed: false, sort_order: i
      })),
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
    const checks = {}
    const { data: allBomItems } = await supabase.from('bom_line_items').select('po_status').eq('proposal_id', jobData.proposal_id)
    const orderedItems = (allBomItems || []).filter(l => l.po_status === 'PO Sent' || l.po_status === 'Received')
    checks['po_generated'] = (allBomItems || []).length > 0 && orderedItems.length === (allBomItems || []).length
    const { data: bomItems } = await supabase.from('bom_line_items').select('po_status').eq('proposal_id', jobData.proposal_id)
    const hasPOs = (bomItems || []).some(l => l.po_status === 'PO Sent')
    checks['parts_received'] = hasPOs && (bomItems || []).every(l => !l.po_status || l.po_status === 'Received')
    const { data: invoices } = await supabase.from('invoices').select('id, status').eq('proposal_id', jobData.proposal_id)
    checks['invoice_sent'] = (invoices || []).some(i => i.status === 'Sent' || i.status === 'Paid')
    checks['payment_received'] = (invoices || []).some(i => i.status === 'Paid')
    const { data: photos } = await supabase.from('proposal_photos').select('id').eq('proposal_id', jobData.proposal_id)
    checks['photos_uploaded'] = (photos || []).length > 0
    const { data: activities } = await supabase.from('activities').select('type').eq('proposal_id', jobData.proposal_id)
    checks['email_sent'] = (activities || []).some(a => a.type === 'email')
    checks['scheduled'] = !!jobData.start_date

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
    if (item.is_auto) return
    const newVal = !item.completed
    await supabase.from('job_checklist_items').update({
      completed: newVal,
      completed_at: newVal ? new Date().toISOString() : null,
      completed_by: profile?.id || null
    }).eq('id', item.id)
    setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, completed: newVal } : c))
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
      job_id: id, org_id: profile?.org_id, label: newCheckItem.trim(),
      is_auto: false, completed: false, sort_order: checklist.length
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

  const addToProposalCollaborators = async (userId) => {
    if (!proposal?.id || !userId) return
    const { data: propData } = await supabase.from('proposals').select('collaborator_ids').eq('id', proposal.id).single()
    const existing = propData?.collaborator_ids || []
    if (!existing.includes(userId)) {
      await supabase.from('proposals').update({ collaborator_ids: [...existing, userId] }).eq('id', proposal.id)
    }
  }

  const saveJobName = async () => {
    const trimmed = jobNameDraft.trim()
    if (!trimmed || trimmed === job?.name) { setEditingJobName(false); return }
    await supabase.from('jobs').update({ name: trimmed }).eq('id', id)
    setJob(prev => ({ ...prev, name: trimmed }))
    setEditingJobName(false)
  }

  const assignPM = async (userId) => {
    await supabase.from('jobs').update({ user_id: userId || null }).eq('id', id)
    const pm = orgProfiles.find(p => p.id === userId) || null
    setJob(prev => ({ ...prev, user_id: userId, profiles: pm }))
    if (userId) await addToProposalCollaborators(userId)
  }

  const assignTech = async (userId) => {
    await supabase.from('jobs').update({ tech_id: userId || null }).eq('id', id)
    setJob(prev => ({ ...prev, tech_id: userId }))
    if (userId) await addToProposalCollaborators(userId)
  }

  const toggleLineSelect = (lineId) => {
    setSelectedLines(prev => {
      const next = new Set(prev)
      next.has(lineId) ? next.delete(lineId) : next.add(lineId)
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
      if (bulkField === 'vendor') {
        const vendor = vendors.find(v => v.vendor_name === bulkValue)
        if (vendor?.default_markup_percent) updated.markup_percent = vendor.default_markup_percent
      }
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
        item_name: line.item_name, manufacturer: line.manufacturer || null,
        part_number_sku: line.part_number_sku || null, quantity: parseFloat(line.quantity) || 0,
        unit: line.unit, category: line.category, vendor: line.vendor,
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

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [15, 28, 46]
  }

  const generatePO = async () => {
    if (selectedForPO.size === 0) return
    setGeneratingPO(true)
    try {
      let finalPONumber = poNumber.trim()
      if (poAutoNumber || !finalPONumber) {
        finalPONumber = (await supabase.rpc('get_next_po_number', { org_id_input: profile.org_id })).data
      }
      const selectedItems = lineItems.filter(l => selectedForPO.has(l.id))
      const vendorNames = [...new Set(selectedItems.map(i => i.vendor).filter(Boolean))].join(', ')
      const poTotal = selectedItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('company_name, logo_url, primary_color, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, ship_to_address, ship_to_city, ship_to_state, ship_to_zip')
        .eq('id', profile.id).single()
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const primaryRgb = hexToRgb(profileData?.primary_color || '#0F1C2E')
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.rect(0, 0, pageWidth, 40, 'F')
      if (profileData?.logo_url) {
        const img = new Image()
        img.src = profileData.logo_url
        await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
        const maxW = 50, maxH = 26
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
        doc.addImage(img, 'PNG', 14, 8 + (maxH - img.naturalHeight * ratio) / 2, img.naturalWidth * ratio, img.naturalHeight * ratio)
      } else {
        doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold')
        doc.text(profileData?.company_name || 'ForgePt.', 14, 22)
      }
      doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
      doc.text('PURCHASE ORDER', pageWidth - 14, 18, { align: 'right' })
      doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.text(finalPONumber, pageWidth - 14, 28, { align: 'right' })
      doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 52)
      doc.text(`Project: ${job?.name || ''}`, 14, 60)
      const billLines = [profileData?.company_name || '', profileData?.bill_to_address || '', [profileData?.bill_to_city, profileData?.bill_to_state, profileData?.bill_to_zip].filter(Boolean).join(', ')].filter(Boolean)
      const shipLines = [profileData?.company_name || '', profileData?.ship_to_address || '', [profileData?.ship_to_city, profileData?.ship_to_state, profileData?.ship_to_zip].filter(Boolean).join(', ')].filter(Boolean)
      const col2 = pageWidth / 2 - 10, col3 = pageWidth / 2 + 30
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('VENDOR', 14, 74); doc.text('BILL TO', col2, 74); doc.text('SHIP TO', col3, 74)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(9)
      doc.text(vendorNames || '—', 14, 81)
      billLines.forEach((line, i) => doc.text(line, col2, 81 + i * 6))
      shipLines.forEach((line, i) => doc.text(line, col3, 81 + i * 6))
      const tableStart = 81 + Math.max(billLines.length, shipLines.length) * 6 + 6
      doc.setDrawColor(220, 220, 220)
      doc.line(14, tableStart - 2, pageWidth - 14, tableStart - 2)
      autoTable(doc, {
        startY: tableStart,
        head: [['Item', 'Part #', 'Qty', 'Unit', 'Unit Cost', 'Total']],
        body: selectedItems.map(item => [item.item_name, item.part_number_sku || '—', item.quantity, item.unit || 'ea', `$${(item.your_cost_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${((item.your_cost_unit || 0) * (item.quantity || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]),
        foot: [['', '', '', '', 'Total', `$${poTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 }, showFoot: 'lastPage'
      })
      const { error: poInsertError } = await supabase.from('purchase_orders').insert({
        po_number: finalPONumber, proposal_id: job?.proposal_id || null,
        org_id: profile.org_id, vendor_name: vendorNames || null, status: 'Sent', total_amount: poTotal
      })
      if (poInsertError) throw new Error(poInsertError.message)
      for (const item of selectedItems) {
        await supabase.from('bom_line_items').update({ po_number: finalPONumber, po_status: 'PO Sent' }).eq('id', item.id)
      }
      setLineItems(prev => prev.map(l => selectedForPO.has(l.id) ? { ...l, po_number: finalPONumber, po_status: 'PO Sent' } : l))
      setSelectedForPO(new Set())
      setShowPOModal(false)
      doc.save(`${finalPONumber}.pdf`)
    } catch (err) { alert('Error generating PO: ' + err.message) }
    setGeneratingPO(false)
  }

  const exportCostReport = async () => {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const { data: profileData } = await supabase.from('profiles').select('company_name, logo_url, primary_color').eq('id', profile.id).single()
    const primaryRgb = hexToRgb(profileData?.primary_color || '#0F1C2E')
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 36, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text('Job Cost Report', 14, 16)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, 26)
    doc.text(profileData?.company_name || '', pageWidth - 14, 16, { align: 'right' })

    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(`Job: ${job?.name || ''}`, 14, 48)
    if (job?.job_number) doc.text(`Job #: ${job.job_number}`, 14, 55)
    if (job?.clients?.company) doc.text(`Client: ${job.clients.company}`, 14, 62)
    if (proposal?.quote_number) doc.text(`Quote #: ${proposal.quote_number}`, pageWidth / 2, 48)
    if (job?.start_date) doc.text(`Start: ${new Date(job.start_date).toLocaleDateString()}`, pageWidth / 2, 55)

    const usedByItemId = {}
    techLogs.forEach(log => {
      if (!log.materials_used) return
      try {
        const parsed = JSON.parse(log.materials_used)
        if (Array.isArray(parsed)) parsed.forEach(m => {
          usedByItemId[m.id] = (usedByItemId[m.id] || 0) + (parseFloat(m.qty) || 0)
        })
      } catch {}
    })

    const quotedMaterials = lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)
    const quotedLabor = (proposal?.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
    const costMaterials = lineItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0)
    const costLabor = (proposal?.labor_items || []).reduce((sum, l) => sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const approvedCOs = changeOrders.filter(c => c.status === 'Approved').reduce((sum, c) => sum + (c.amount || 0), 0)
    const costCOs = changeOrders.filter(c => c.status === 'Approved').reduce((sum, co) => {
      const matCost = (co.line_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
      const labCost = (co.labor_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
      return sum + matCost + labCost
    }, 0)
    const freeformPOCost = freeformPOItems.reduce((sum, l) => sum + (l.total || 0), 0)
    const totalRevenue = quotedMaterials + quotedLabor + approvedCOs
    const totalCost = costMaterials + costLabor + costCOs + freeformPOCost
    const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1) : '0.0'
    const hoursLogged = techLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)
    const estimatedHours = (proposal?.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0)

    let y = 74
    const boxW = (pageWidth - 28 - 9) / 4
    const summaryBoxes = [
      { label: 'Contract Value', value: `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Total Cost', value: `$${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
      { label: 'Gross Margin', value: `${grossMargin}%` },
      { label: 'Hours Logged', value: `${hoursLogged.toFixed(1)} / ${estimatedHours > 0 ? estimatedHours.toFixed(1) : '—'} est` },
    ]
    summaryBoxes.forEach((box, i) => {
      const x = 14 + i * (boxW + 3)
      doc.setFillColor(245, 247, 250); doc.rect(x, y, boxW, 22, 'F')
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
      doc.text(box.label.toUpperCase(), x + 4, y + 7)
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text(box.value, x + 4, y + 17)
    })
    y += 30

    const pdfRows = [
      ['Materials', `$${quotedMaterials.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${costMaterials.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(quotedMaterials - costMaterials).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, quotedMaterials > 0 ? `${((quotedMaterials - costMaterials) / quotedMaterials * 100).toFixed(1)}%` : '—'],
      ['Labor', `$${quotedLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${costLabor.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(quotedLabor - costLabor).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, quotedLabor > 0 ? `${((quotedLabor - costLabor) / quotedLabor * 100).toFixed(1)}%` : '—'],
      ...(approvedCOs > 0 ? [['Change Orders (Approved)', `$${approvedCOs.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${costCOs.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(approvedCOs - costCOs).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, approvedCOs > 0 ? `${((approvedCOs - costCOs) / approvedCOs * 100).toFixed(1)}%` : '—']] : []),
      ...(freeformPOCost > 0 ? [['Freeform POs (Job-linked)', '—', `$${freeformPOCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, '—', '—']] : []),
      ['TOTAL', `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(totalRevenue - totalCost).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `${grossMargin}%`],
    ]
    autoTable(doc, {
      startY: y, head: [['Category', 'Revenue (Customer)', 'Your Cost', 'Margin $', 'Margin %']],
      body: pdfRows, headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
      bodyStyles: { fontSize: 9 }, styles: { fontSize: 9 }
    })
    y = doc.lastAutoTable.finalY + 10

    if (lineItems.length > 0) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Materials — Line Item Detail', 14, y); y += 4
      autoTable(doc, {
        startY: y, head: [['Item', 'Vendor', 'Planned Qty', 'Used Qty', 'Remaining', 'Unit Cost', 'Customer Price', 'Margin']],
        body: lineItems.map(item => {
          const used = usedByItemId[item.id] || 0; const planned = parseFloat(item.quantity) || 0
          const remaining = planned - used; const cost = (item.your_cost_unit || 0) * planned; const revenue = item.customer_price_total || 0
          return [item.item_name, item.vendor || '—', `${planned} ${item.unit || ''}`, used > 0 ? `${used} ${item.unit || ''}` : '—', used > 0 ? (remaining < 0 ? `${Math.abs(remaining).toFixed(1)} over` : `${remaining.toFixed(1)} left`) : '—', `$${(item.your_cost_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(item.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(revenue - cost).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
        }),
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 8 }
      })
      y = doc.lastAutoTable.finalY + 10
    }

    if ((proposal?.labor_items || []).length > 0) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Labor — Line Item Detail', 14, y); y += 4
      autoTable(doc, {
        startY: y, head: [['Role', 'Planned Qty', 'Unit', 'Your Cost', 'Customer Price', 'Margin']],
        body: (proposal.labor_items || []).map(l => [l.role || '—', l.quantity || '—', l.unit || 'hr', `$${(parseFloat(l.your_cost) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${((parseFloat(l.customer_price) || 0) - (parseFloat(l.your_cost) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]),
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 8 }
      })
      y = doc.lastAutoTable.finalY + 10
    }

    if (freeformPOItems.length > 0) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Freeform PO Line Items', 14, y); y += 4
      autoTable(doc, {
        startY: y, head: [['PO #', 'Vendor', 'Item', 'Qty', 'Unit Cost', 'Total']],
        body: freeformPOItems.map(l => [l.purchase_orders?.po_number || '—', l.purchase_orders?.vendor_name || '—', l.item_name, `${l.quantity} ${l.unit || ''}`, `$${(l.unit_cost || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(l.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]),
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 8 }
      })
      y = doc.lastAutoTable.finalY + 10
    }

    if (changeOrders.length > 0) {
      doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Change Orders', 14, y); y += 4
      autoTable(doc, {
        startY: y, head: [['Name', 'Status', 'Amount', 'Your Cost']],
        body: changeOrders.map(co => {
          const coCost = (co.line_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0) + (co.labor_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
          return [co.name, co.status, `$${(co.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, coCost > 0 ? `$${coCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—']
        }),
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 8 }
      })
      y = doc.lastAutoTable.finalY + 10
    }

    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal')
    doc.text(`${profileData?.company_name || 'ForgePt.'} · Confidential`, pageWidth / 2, pageHeight - 10, { align: 'center' })
    doc.save(`Cost-Report-${job?.job_number || job?.name || 'job'}.pdf`)
  }

  const saveChangeOrder = async () => {
    if (!coForm.name.trim()) return
    setSavingCO(true)
    const matTotal = (coForm.line_items || []).reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const labTotal = (coForm.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
    const total = matTotal + labTotal
    const { data } = await supabase.from('change_orders').insert({
      job_id: id, org_id: profile?.org_id, proposal_id: job?.proposal_id || null,
      name: coForm.name, description: coForm.description, amount: total,
      line_items: coForm.line_items?.length > 0 ? coForm.line_items : null,
      labor_items: coForm.labor_items?.length > 0 ? coForm.labor_items : null,
      status: 'Pending'
    }).select().single()
    if (data) setChangeOrders(prev => [data, ...prev])
    setCoForm({ name: '', description: '', line_items: [], labor_items: [] })
    setShowCOModal(false)
    setSavingCO(false)
  }

  const updateCOStatus = async (coId, status) => {
    await supabase.from('change_orders').update({ status }).eq('id', coId)
    setChangeOrders(prev => prev.map(c => c.id === coId ? { ...c, status } : c))
  }

  const saveSchedule = async () => {
    if (!schedTechId || !schedDate) return
    setSavingSchedule(true)
    await supabase.from('job_tech_schedules').insert({
      job_id: id,
      tech_id: schedTechId,
      org_id: profile?.org_id,
      date: schedDate,
      hours_allocated: parseFloat(schedHours) || 4,
    })
    // Refresh schedules
    const { data: schedData } = await supabase
      .from('job_tech_schedules')
      .select('*, profiles(full_name)')
      .eq('job_id', id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
    setJobSchedules(schedData || [])
    // Push to calendar (fire and forget — don't block UI)
    const newRow = schedData?.find(s => s.tech_id === schedTechId && s.date === schedDate)
    if (newRow) pushJobScheduleToCalendar(newRow)
    setSchedTechId('')
    setSchedDate('')
    setSchedHours('4')
    setShowScheduleModal(false)
    setSavingSchedule(false)
  }

  const deleteCalendarEvent = async (techId, googleEventId, microsoftEventId) => {
    if (!techId || (!googleEventId && !microsoftEventId)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/delete-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ tech_id: techId, google_event_id: googleEventId || null, microsoft_event_id: microsoftEventId || null }),
      })
    } catch (e) { console.error('Calendar delete error:', e) }
  }

  const removeSchedule = async (scheduleId) => {
    const schedule = jobSchedules.find(s => s.id === scheduleId)
    if (schedule?.google_event_id || schedule?.microsoft_event_id) {
      deleteCalendarEvent(schedule.tech_id, schedule.google_event_id, schedule.microsoft_event_id)
    }
    await supabase.from('job_tech_schedules').delete().eq('id', scheduleId)
    setJobSchedules(prev => prev.filter(s => s.id !== scheduleId))
  }

  const pushJobScheduleToCalendar = async (scheduleRow) => {
    if (!scheduleRow?.id || !scheduleRow?.tech_id) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/push-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          tech_id: scheduleRow.tech_id,
          title: `🔨 ${job?.name || 'Job'}`,
          description: `Job scheduled via ForgePt.\n${job?.clients?.company ? `Client: ${job.clients.company}` : ''}\nHours: ${scheduleRow.hours_allocated}`,
          date: scheduleRow.date,
          start_time: null,
          duration_hours: scheduleRow.hours_allocated,
          record_type: 'job_schedule',
          record_id: scheduleRow.id,
          existing_google_event_id: scheduleRow.google_event_id || null,
          existing_microsoft_event_id: scheduleRow.microsoft_event_id || null,
          timezone: orgTimezone,
        }),
      })
    } catch (e) { console.error('Calendar push error:', e) }
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
          type: 'ai_email', toEmail: job.clients.email, toName: job.clients.client_name || job.clients.company,
          fromName: profile?.full_name || '', fromEmail: profile?.email || '',
          subject: `Update on your job: ${job.name}`, body: notifyMessage,
          clientId: job.client_id, orgId: job.org_id, sentBy: profile?.id
        })
      })
      await supabase.from('activities').insert({
        proposal_id: job.proposal_id, org_id: job.org_id, user_id: profile?.id,
        type: 'email', title: `Customer notified about job update`
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
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <button onClick={() => navigate('/jobs')} className="text-[#8A9AB0] hover:text-white text-xs mb-2 transition-colors">← Jobs</button>
              <div className="flex items-center gap-3">
                {job?.job_number && <span className="text-[#8A9AB0] text-sm font-mono bg-[#0F1C2E] px-2 py-0.5 rounded">{job.job_number}</span>}
                {editingJobName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={jobNameDraft}
                      onChange={e => setJobNameDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveJobName(); if (e.key === 'Escape') setEditingJobName(false) }}
                      className="bg-[#0F1C2E] text-white text-2xl font-bold border-b-2 border-[#C8622A] focus:outline-none px-1"
                    />
                    <button onClick={saveJobName} className="text-[#C8622A] text-sm font-semibold hover:text-white transition-colors">Save</button>
                    <button onClick={() => setEditingJobName(false)} className="text-[#8A9AB0] text-sm hover:text-white transition-colors">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group">
                    <h2 className="text-white text-2xl font-bold">{job?.name}</h2>
                    <button onClick={() => { setJobNameDraft(job?.name || ''); setEditingJobName(true) }}
                      className="opacity-0 group-hover:opacity-100 text-[#8A9AB0] hover:text-white text-xs transition-all">✏️</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-[#8A9AB0]">
                {job?.clients?.company && <span>🏢 {job.clients.company}</span>}
                {proposal?.quote_number && <span className="font-mono">#{proposal.quote_number}</span>}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#8A9AB0] text-xs">👤 PM:</span>
                  <select value={job?.user_id || job?.profiles?.id || ''} onChange={e => assignPM(e.target.value)}
                    className="bg-[#0F1C2E] text-white text-xs border border-[#2a3d55] rounded px-2 py-1 focus:outline-none focus:border-[#C8622A]">
                    <option value="">Unassigned</option>
                    {orgProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[#8A9AB0] text-xs">🔧 Tech:</span>
                  <select value={job?.tech_id || ''} onChange={e => assignTech(e.target.value)}
                    className="bg-[#0F1C2E] text-white text-xs border border-[#2a3d55] rounded px-2 py-1 focus:outline-none focus:border-[#C8622A]">
                    <option value="">Unassigned</option>
                    {orgProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(isAdmin || isPM) && (
                <button onClick={() => setShowScheduleModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors">
                  📅 Schedule Tech
                </button>
              )}
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

          <div className="mt-4">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[#8A9AB0] text-xs">Overall progress — {completedCount} of {checklist.length} complete</span>
              <span className="text-[#8A9AB0] text-xs">{progress}%</span>
            </div>
            <div className="w-full bg-[#0F1C2E] rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-400' : 'bg-[#C8622A]'}`} style={{ width: `${progress}%` }} />
            </div>
          </div>
        {/* Upcoming tech schedules */}
          {jobSchedules.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#2a3d55]">
              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Upcoming Tech Schedule</p>
              <div className="flex flex-wrap gap-2">
                {jobSchedules.map(s => (
                  <div key={s.id} className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5 group">
                    <span className="text-blue-300 text-xs font-semibold">{s.profiles?.full_name}</span>
                    <span className="text-blue-400/70 text-xs">·</span>
                    <span className="text-blue-400/70 text-xs">{new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className="text-blue-400/70 text-xs">· {s.hours_allocated}h</span>
                    {(isAdmin || isPM) && (
                      <button onClick={() => removeSchedule(s.id)} className="opacity-0 group-hover:opacity-100 text-[#8A9AB0] hover:text-red-400 text-xs transition-all ml-1">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'checklist', label: `Checklist (${completedCount}/${checklist.length})` },
            { key: 'pos', label: 'Purchase Orders' },
            { key: 'changeorders', label: `Change Orders (${changeOrders.length})` },
            { key: 'costReport', label: 'Cost Report' },
            { key: 'techlog', label: `Tech Log (${techLogs.length})` },
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
                const isPartiallyOrdered = item.auto_check_type === 'po_generated' && !item.completed &&
                  lineItems.some(l => l.po_status === 'PO Sent' || l.po_status === 'Received') &&
                  !lineItems.every(l => l.po_status === 'PO Sent' || l.po_status === 'Received')
                return (
                  <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${item.completed ? 'bg-green-500/5 border-green-500/20' : isPartiallyOrdered ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-[#0F1C2E] border-[#2a3d55]'}`}>
                    <button onClick={() => toggleCheckItem(item)} disabled={item.is_auto}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${item.completed ? 'bg-green-500 border-green-500' : isPartiallyOrdered ? 'border-yellow-500' : 'border-[#2a3d55] hover:border-[#C8622A]'} ${item.is_auto ? 'cursor-default' : 'cursor-pointer'}`}>
                      {item.completed && <span className="text-white text-xs">✓</span>}
                      {isPartiallyOrdered && <span className="text-yellow-400 text-xs">–</span>}
                    </button>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${item.completed ? 'text-green-400 line-through' : isPartiallyOrdered ? 'text-yellow-400' : 'text-white'}`}>
                        {autoType ? `${autoType.icon} ` : ''}{item.label}
                      </p>
                      {item.completed && item.completed_at && (
                        <p className="text-[#8A9AB0] text-xs mt-0.5">Completed {new Date(item.completed_at).toLocaleDateString()}</p>
                      )}
                      {isPartiallyOrdered && (
                        <p className="text-yellow-500/70 text-xs mt-0.5">
                          {lineItems.filter(l => l.po_status === 'PO Sent' || l.po_status === 'Received').length} of {lineItems.length} lines ordered
                        </p>
                      )}
                    </div>
                    {item.is_auto && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isPartiallyOrdered ? 'text-yellow-400 bg-yellow-500/10' : 'text-[#8A9AB0] bg-[#2a3d55]'}`}>
                        {isPartiallyOrdered ? 'Partially Ordered' : 'Auto'}
                      </span>
                    )}
                    {!item.is_auto && (
                      <button onClick={() => deleteCheckItem(item.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">✕</button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 border-t border-[#2a3d55] pt-4">
              <input type="text" value={newCheckItem} onChange={e => setNewCheckItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCheckItem()}
                placeholder="Add a custom checklist item..."
                className="flex-1 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
              <button onClick={addCheckItem} disabled={savingCheck || !newCheckItem.trim()}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">Add</button>
            </div>
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

        {/* PURCHASE ORDERS TAB */}
        {activeTab === 'pos' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">Purchase Orders</h3>
              <button onClick={() => selectedForPO.size > 0 && setShowPOModal(true)}
                disabled={selectedForPO.size === 0}
                title={selectedForPO.size === 0 ? 'Check items below to select for PO' : `Generate PO for ${selectedForPO.size} items`}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {selectedForPO.size > 0 ? `Generate PO (${selectedForPO.size})` : 'Generate PO'}
              </button>
            </div>
            {lineItems.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No materials on this job's BOM.</p>
            ) : (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      <th className="py-2 pr-2 w-8">
                        <input type="checkbox" className="accent-[#C8622A]"
                          checked={lineItems.filter(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing').every(l => selectedForPO.has(l.id)) && lineItems.some(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing')}
                          onChange={() => {
                            const orderable = lineItems.filter(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing')
                            const allSelected = orderable.every(l => selectedForPO.has(l.id))
                            setSelectedForPO(prev => {
                              const next = new Set(prev)
                              orderable.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id))
                              return next
                            })
                          }} />
                      </th>
                      {['Item', 'Vendor', 'Qty', 'Your Cost', 'PO #', 'Status'].map(h => (
                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map(item => {
                      const isOrdered = item.po_status === 'PO Sent' || item.po_status === 'Received'
                      return (
                        <tr key={item.id} className={`border-b border-[#2a3d55]/50 ${selectedForPO.has(item.id) ? 'bg-[#C8622A]/5' : ''}`}>
                          <td className="pr-2 py-3">
                            {!isOrdered && (
                              <input type="checkbox" className="accent-[#C8622A] cursor-pointer"
                                checked={selectedForPO.has(item.id)}
                                onChange={() => setSelectedForPO(prev => {
                                  const next = new Set(prev)
                                  next.has(item.id) ? next.delete(item.id) : next.add(item.id)
                                  return next
                                })} />
                            )}
                          </td>
                          <td className="py-3 pr-4"><p className="text-white text-sm">{item.item_name}</p>{item.part_number_sku && <p className="text-[#8A9AB0] text-xs">{item.part_number_sku}</p>}</td>
                          <td className="text-[#8A9AB0] py-3 pr-4 text-sm">{item.vendor || '—'}</td>
                          <td className="text-white py-3 pr-4 text-sm">{item.quantity} {item.unit}</td>
                          <td className="text-white py-3 pr-4 text-sm">${fmt((item.your_cost_unit || 0) * (item.quantity || 0))}</td>
                          <td className="py-3 pr-4">{item.po_number ? <span className="text-[#8A9AB0] text-xs font-mono">{item.po_number}</span> : <span className="text-[#2a3d55]">—</span>}</td>
                          <td className="py-3">
                            <span className={`text-xs px-2 py-1 rounded font-semibold ${item.po_status === 'Received' ? 'bg-green-500/20 text-green-400' : item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                              {item.po_status || 'Not Ordered'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <JobPOList proposalId={job?.proposal_id} />
          </div>
        )}

        {/* COST REPORT TAB */}
        {activeTab === 'costReport' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">Job Cost Report</h3>
              <button onClick={exportCostReport}
                className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
                ↓ Export PDF
              </button>
            </div>
            {(() => {
              const quotedMaterials = lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)
              const quotedLabor = (proposal?.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
              const quotedTotal = quotedMaterials + quotedLabor
              const costMaterials = lineItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0)
              const costLabor = (proposal?.labor_items || []).reduce((sum, l) => sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
              const approvedCOs = changeOrders.filter(c => c.status === 'Approved').reduce((sum, c) => sum + (c.amount || 0), 0)
              // CO your_cost side
              const costCOs = changeOrders.filter(c => c.status === 'Approved').reduce((sum, co) => {
                const matCost = (co.line_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
                const labCost = (co.labor_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
                return sum + matCost + labCost
              }, 0)
              // Freeform PO costs (job-linked POs with line items)
              const freeformPOCost = freeformPOItems.reduce((sum, l) => sum + (l.total || 0), 0)
              const hoursLogged = techLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0)
              const totalRevenue = quotedTotal + approvedCOs
              const totalCost = costMaterials + costLabor + costCOs + freeformPOCost
              const grossMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1) : '0.0'
              const budgetBurnPct = totalCost > 0 && (costMaterials + costLabor) > 0
                ? Math.min((totalCost / (costMaterials + costLabor)) * 100, 999)
                : 0
              const overBudget = totalRevenue > 0 && totalCost > totalRevenue
              const nearBudget = !overBudget && totalRevenue > 0 && totalCost / totalRevenue > 0.8

              const rows = [
                { label: 'Quoted Materials', quoted: quotedMaterials, cost: costMaterials, color: 'text-white' },
                { label: 'Quoted Labor', quoted: quotedLabor, cost: costLabor, color: 'text-white' },
                ...(approvedCOs > 0 ? [{ label: 'Approved Change Orders', quoted: approvedCOs, cost: costCOs, color: 'text-[#C8622A]' }] : []),
                ...(freeformPOCost > 0 ? [{ label: 'Freeform POs (Job-linked)', quoted: 0, cost: freeformPOCost, color: 'text-blue-400' }] : []),
              ]

              const usedByItemId = {}
              techLogs.forEach(log => {
                if (!log.materials_used) return
                try {
                  const parsed = JSON.parse(log.materials_used)
                  if (Array.isArray(parsed)) parsed.forEach(m => {
                    usedByItemId[m.id] = (usedByItemId[m.id] || 0) + (parseFloat(m.qty) || 0)
                  })
                } catch {}
              })
              const totalPlannedUnits = lineItems.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)
              const totalUsedUnits = lineItems.reduce((sum, i) => sum + (usedByItemId[i.id] || 0), 0)
              const materialsPct = totalPlannedUnits > 0 ? Math.min((totalUsedUnits / totalPlannedUnits) * 100, 100) : 0
              const materialsOver = totalUsedUnits > totalPlannedUnits
              const estimatedHours = (proposal?.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.quantity) || 0), 0)
              const laborPct = estimatedHours > 0 ? Math.min((hoursLogged / estimatedHours) * 100, 100) : 0
              const laborOver = hoursLogged > estimatedHours
              const checklistTotal = checklist.length
              const checklistDone = checklist.filter(c => c.completed).length
              const checklistPct = checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0
              const actualMaterialCost = lineItems.reduce((sum, i) => sum + ((usedByItemId[i.id] || 0) * (i.your_cost_unit || 0)), 0)
              const laborRate = estimatedHours > 0 ? costLabor / estimatedHours : 0
              const actualLaborCost = hoursLogged * laborRate
              const actualCostTotal = actualMaterialCost + actualLaborCost
              const costBurnPct = totalCost > 0 ? Math.min((actualCostTotal / totalCost) * 100, 100) : 0

              return (
                <div className="space-y-5">

                  {/* Over-budget banner */}
                  {(overBudget || nearBudget) && (
                    <div className={`rounded-xl px-5 py-4 flex items-center gap-3 ${overBudget ? 'bg-red-500/10 border border-red-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'}`}>
                      <span className="text-2xl">{overBudget ? '🔴' : '🟡'}</span>
                      <div>
                        <p className={`font-bold text-sm ${overBudget ? 'text-red-400' : 'text-yellow-400'}`}>
                          {overBudget
                            ? `Over budget by $${fmt(totalCost - totalRevenue)}`
                            : `Approaching budget limit — ${((totalCost / totalRevenue) * 100).toFixed(0)}% of contract value spent`}
                        </p>
                        <p className="text-[#8A9AB0] text-xs mt-0.5">
                          Contract value: ${fmt(totalRevenue)} · Total cost: ${fmt(totalCost)} · Remaining: ${overBudget ? '-' : ''}${fmt(Math.abs(totalRevenue - totalCost))}
                        </p>
                      </div>
                    </div>
                  )}
                  {!overBudget && !nearBudget && totalRevenue > 0 && (
                    <div className="rounded-xl px-5 py-3 flex items-center gap-3 bg-green-500/10 border border-green-500/20">
                      <span className="text-xl">🟢</span>
                      <p className="text-green-400 text-sm font-medium">On budget — ${fmt(totalRevenue - totalCost)} remaining ({((1 - totalCost / totalRevenue) * 100).toFixed(0)}% of contract value)</p>
                    </div>
                  )}

                  {/* True Progress */}
                  <div className="bg-[#0F1C2E] rounded-xl p-5 space-y-4">
                    <p className="text-white font-semibold text-sm">Job Progress</p>
                    {[
                      { label: 'Materials Used', pct: materialsPct, detail: totalPlannedUnits > 0 ? `${totalUsedUnits} of ${totalPlannedUnits} units${materialsOver ? ` (+${(totalUsedUnits - totalPlannedUnits).toFixed(1)} over)` : ''}` : 'No materials logged', over: materialsOver, color: materialsOver ? 'bg-red-500' : 'bg-[#C8622A]' },
                      { label: 'Labor Hours', pct: laborPct, detail: estimatedHours > 0 ? `${hoursLogged.toFixed(1)} of ${estimatedHours.toFixed(1)} hrs est.${laborOver ? ` (+${(hoursLogged - estimatedHours).toFixed(1)} over)` : ''}` : `${hoursLogged.toFixed(1)} hrs logged (no estimate)`, over: laborOver, color: laborOver ? 'bg-red-500' : 'bg-blue-500' },
                      { label: 'Checklist', pct: checklistPct, detail: `${checklistDone} of ${checklistTotal} items complete`, over: false, color: 'bg-green-500' },
                      { label: 'Cost Burned', pct: costBurnPct, detail: totalCost > 0 ? `$${fmt(actualCostTotal)} of $${fmt(totalCost)} budgeted` : 'No cost data', over: actualCostTotal > totalCost, color: actualCostTotal > totalCost ? 'bg-red-500' : 'bg-purple-500' },
                    ].map(({ label, pct, detail, over, color }) => (
                      <div key={label}>
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="text-[#8A9AB0] text-xs">{label}</span>
                          <span className={`text-xs font-semibold ${over ? 'text-red-400' : 'text-white'}`}>{pct.toFixed(0)}%{over ? ' ⚠' : ''}</span>
                        </div>
                        <div className="w-full bg-[#1a2d45] rounded-full h-2 mb-1">
                          <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className={`text-xs ${over ? 'text-red-400' : 'text-[#8A9AB0]'}`}>{detail}</p>
                      </div>
                    ))}
                  </div>

                  {/* Summary cards */}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Total Revenue</p><p className="text-white font-bold text-xl">${fmt(totalRevenue)}</p></div>
                    <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Total Cost</p><p className="text-white font-bold text-xl">${fmt(totalCost)}</p>{freeformPOCost > 0 && <p className="text-blue-400 text-xs mt-1">incl. ${fmt(freeformPOCost)} freeform POs</p>}</div>
                    <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Gross Margin</p><p className={`font-bold text-xl ${parseFloat(grossMargin) >= 30 ? 'text-green-400' : parseFloat(grossMargin) >= 15 ? 'text-[#C8622A]' : 'text-red-400'}`}>{grossMargin}%</p></div>
                    <div className="bg-[#0F1C2E] rounded-xl p-4"><p className="text-[#8A9AB0] text-xs mb-1">Hours Logged</p><p className="text-white font-bold text-xl">{hoursLogged.toFixed(1)}</p></div>
                  </div>

                  {/* Breakdown table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#2a3d55]">
                          <th className="text-[#8A9AB0] text-left py-2 font-normal">Category</th>
                          <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal">Revenue (Customer)</th>
                          <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal">Your Cost</th>
                          <th className="text-[#8A9AB0] text-right py-2 font-normal">Margin $</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i} className="border-b border-[#2a3d55]/50">
                            <td className={`py-3 ${row.color}`}>{row.label}</td>
                            <td className="text-white py-3 pr-4 text-right">{row.quoted > 0 ? `$${fmt(row.quoted)}` : '—'}</td>
                            <td className="text-white py-3 pr-4 text-right">${fmt(row.cost)}</td>
                            <td className={`py-3 text-right font-semibold ${row.quoted - row.cost >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {row.quoted > 0 ? `$${fmt(row.quoted - row.cost)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-[#2a3d55]">
                          <td className="text-white pt-3 font-bold">Total</td>
                          <td className="text-white pt-3 pr-4 text-right font-bold">${fmt(totalRevenue)}</td>
                          <td className="text-white pt-3 pr-4 text-right font-bold">${fmt(totalCost)}</td>
                          <td className="text-green-400 pt-3 text-right font-bold">${fmt(totalRevenue - totalCost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Materials breakdown */}
                  {lineItems.length > 0 && (
                    <div>
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Materials — Line Item Detail</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              {['Item', 'Vendor', 'Planned', 'Used', 'Remaining', 'Your Cost', 'Customer Price', 'Margin $', 'Margin %'].map(h => (
                                <th key={h} className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {lineItems.map(item => {
                              const planned = parseFloat(item.quantity) || 0
                              const used = usedByItemId[item.id] || 0
                              const remaining = planned - used
                              const cost = (item.your_cost_unit || 0) * planned
                              const revenue = item.customer_price_total || 0
                              const margin = revenue - cost
                              const marginPct = revenue > 0 ? ((margin / revenue) * 100).toFixed(1) : '—'
                              const isOver = used > 0 && remaining < 0
                              const isLow = !isOver && used > 0 && planned > 0 && remaining / planned < 0.2
                              return (
                                <tr key={item.id} className="border-b border-[#2a3d55]/30">
                                  <td className="text-white py-2 pr-3 font-medium">{item.item_name}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-3">{item.vendor || '—'}</td>
                                  <td className="text-white py-2 pr-3">{planned} {item.unit}</td>
                                  <td className="py-2 pr-3">{used > 0 ? <span className="text-[#C8622A] font-semibold">{used} {item.unit}</span> : <span className="text-[#2a3d55]">—</span>}</td>
                                  <td className="py-2 pr-3">
                                    {used === 0 ? <span className="text-[#8A9AB0]">—</span>
                                      : isOver ? <span className="text-red-400 font-semibold">{Math.abs(remaining).toFixed(1)} over ⚠</span>
                                      : isLow ? <span className="text-yellow-400 font-semibold">{remaining.toFixed(1)} left ↓</span>
                                      : <span className="text-green-400">{remaining.toFixed(1)} left</span>}
                                  </td>
                                  <td className="text-white py-2 pr-3">${fmt(cost)}</td>
                                  <td className="text-white py-2 pr-3">${fmt(revenue)}</td>
                                  <td className={`py-2 pr-3 font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(margin)}</td>
                                  <td className={`py-2 font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{marginPct}{marginPct !== '—' ? '%' : ''}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-[#2a3d55]">
                              <td colSpan="5" className="text-[#8A9AB0] pt-2 font-semibold">Totals</td>
                              <td className="text-white pt-2 font-semibold pr-3">${fmt(lineItems.reduce((s, i) => s + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0))}</td>
                              <td className="text-white pt-2 font-semibold pr-3">${fmt(lineItems.reduce((s, i) => s + (i.customer_price_total || 0), 0))}</td>
                              <td className="text-green-400 pt-2 font-semibold pr-3">${fmt(lineItems.reduce((s, i) => s + ((i.customer_price_total || 0) - ((i.your_cost_unit || 0) * (i.quantity || 0))), 0))}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Labor detail */}
                  {(proposal?.labor_items || []).length > 0 && (
                    <div>
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Labor — Line Item Detail</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              {['Role', 'Planned Qty', 'Unit', 'Your Cost', 'Customer Price', 'Margin $', 'Margin %'].map(h => (
                                <th key={h} className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(proposal.labor_items || []).map((l, i) => {
                              const cost = parseFloat(l.your_cost) || 0
                              const revenue = parseFloat(l.customer_price) || 0
                              const margin = revenue - cost
                              const marginPct = revenue > 0 ? ((margin / revenue) * 100).toFixed(1) : '—'
                              return (
                                <tr key={i} className="border-b border-[#2a3d55]/30">
                                  <td className="text-white py-2 pr-3 font-medium">{l.role || '—'}</td>
                                  <td className="text-white py-2 pr-3">{l.quantity || '—'}</td>
                                  <td className="text-[#8A9AB0] py-2 pr-3">{l.unit || 'hr'}</td>
                                  <td className="text-white py-2 pr-3">${fmt(cost)}</td>
                                  <td className="text-white py-2 pr-3">${fmt(revenue)}</td>
                                  <td className={`py-2 pr-3 font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>${fmt(margin)}</td>
                                  <td className={`py-2 font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{marginPct}{marginPct !== '—' ? '%' : ''}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Freeform PO line items */}
                  {freeformPOItems.length > 0 && (
                    <div>
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Freeform PO Line Items</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              {['PO #', 'Vendor', 'Description', 'Item', 'Qty', 'Unit Cost', 'Total'].map(h => (
                                <th key={h} className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {freeformPOItems.map((l, i) => (
                              <tr key={i} className="border-b border-[#2a3d55]/30">
                                <td className="text-white py-2 pr-3 font-mono">{l.purchase_orders?.po_number || '—'}</td>
                                <td className="text-[#8A9AB0] py-2 pr-3">{l.purchase_orders?.vendor_name || '—'}</td>
                                <td className="text-[#8A9AB0] py-2 pr-3">{l.purchase_orders?.description || '—'}</td>
                                <td className="text-white py-2 pr-3 font-medium">{l.item_name}</td>
                                <td className="text-white py-2 pr-3">{l.quantity} {l.unit || ''}</td>
                                <td className="text-white py-2 pr-3">${fmt(l.unit_cost)}</td>
                                <td className="text-blue-400 py-2 font-semibold">${fmt(l.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-[#2a3d55]">
                              <td colSpan="6" className="text-[#8A9AB0] pt-2 font-semibold">Freeform PO Total</td>
                              <td className="text-blue-400 pt-2 font-bold">${fmt(freeformPOCost)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Change orders detail */}
                  {changeOrders.length > 0 && (
                    <div className="space-y-4">
                      <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Change Orders</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              {['Name', 'Status', 'Amount', 'Your Cost', 'Margin $'].map(h => (
                                <th key={h} className="text-[#8A9AB0] text-left py-2 pr-3 font-normal">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {changeOrders.map(co => {
                              const coCost = (co.line_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0) + (co.labor_items || []).reduce((s, l) => s + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
                              const coMargin = co.amount - coCost
                              return (
                                <tr key={co.id} className="border-b border-[#2a3d55]/30">
                                  <td className="text-white py-2 pr-3">{co.name}</td>
                                  <td className="py-2 pr-3">
                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${co.status === 'Approved' ? 'bg-green-500/20 text-green-400' : co.status === 'Rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                      {co.status}
                                    </span>
                                  </td>
                                  <td className="text-[#C8622A] py-2 pr-3 font-semibold">${fmt(co.amount)}</td>
                                  <td className="text-white py-2 pr-3">{coCost > 0 ? `$${fmt(coCost)}` : '—'}</td>
                                  <td className={`py-2 font-semibold ${coMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{coCost > 0 ? `$${fmt(coMargin)}` : '—'}</td>
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
            })()}
          </div>
        )}

        {/* TECH LOG TAB */}
        {activeTab === 'techlog' && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="text-white font-bold text-lg">Tech Daily Log</h3>
                <p className="text-[#8A9AB0] text-xs mt-0.5">
                  {techLogs.reduce((sum, l) => sum + (l.hours_worked || 0), 0).toFixed(1)} total hours · {techLogs.length} entries
                </p>
              </div>
              <button onClick={() => window.location.href = '/tech-log'}
                className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
                Open Full Log →
              </button>
            </div>
            {techLogs.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-[#2a3d55] rounded-xl">
                <p className="text-[#8A9AB0]">No log entries yet for this job.</p>
                <button onClick={() => window.location.href = '/tech-log'} className="mt-3 text-[#C8622A] hover:text-white text-sm transition-colors">+ Log Today's Work →</button>
              </div>
            ) : (
              <div className="space-y-3">
                {techLogs.map(log => (
                  <div key={log.id} className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55]">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-[#8A9AB0] text-xs font-mono bg-[#1a2d45] px-2 py-0.5 rounded">
                          {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="text-white text-sm font-medium">{log.profiles?.full_name}</span>
                      </div>
                      <span className="text-[#C8622A] font-bold">{log.hours_worked || 0} hrs</span>
                    </div>
                    <p className="text-[#D6E4F0] text-sm">{log.work_summary}</p>
                    {log.materials_used && (() => {
                      let parsed = null
                      try { parsed = JSON.parse(log.materials_used) } catch {}
                      if (Array.isArray(parsed) && parsed.length > 0) {
                        return (
                          <div className="mt-2">
                            <p className="text-[#8A9AB0] text-xs font-semibold mb-1">📦 Materials Used</p>
                            <div className="space-y-0.5">
                              {parsed.map((m, i) => (
                                <p key={i} className="text-[#8A9AB0] text-xs">· {m.name} — {m.qty} {m.unit}{m.planned && m.qty !== m.planned ? <span className="text-yellow-500/70"> (planned: {m.planned})</span> : null}</p>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      return <p className="text-[#8A9AB0] text-xs mt-1">📦 {log.materials_used}</p>
                    })()}
                    {log.issues && <p className="text-red-400 text-xs mt-1">⚠ {log.issues}</p>}
                  </div>
                ))}
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

      {/* PO Modal */}
      {showPOModal && (() => {
        const selectedItems = lineItems.filter(l => selectedForPO.has(l.id))
        const vendorNames = [...new Set(selectedItems.map(i => i.vendor).filter(Boolean))]
        const poTotal = selectedItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0)
        const vendorEmailSuggestion = (() => {
          if (vendorNames.length !== 1) return null
          const v = vendors.find(v => v.vendor_name === vendorNames[0])
          return v?.contact_email || null
        })()
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
            <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-white font-bold text-lg mb-4">Generate Purchase Order</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor Email <span className="font-normal text-[#8A9AB0]">(optional)</span></label>
                  {vendorNames.length > 0 && <p className="text-[#8A9AB0] text-xs mb-1">Vendors: {vendorNames.join(', ')}</p>}
                  <input type="email" value={poVendorEmail || vendorEmailSuggestion || ''} onChange={e => setPOVendorEmail(e.target.value)} placeholder={vendorEmailSuggestion || 'vendor@company.com'}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-2 block">PO Number</label>
                  <div className="flex gap-2 mb-2">
                    <button onClick={() => setPOAutoNumber(true)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${poAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>Auto-Generate</button>
                    <button onClick={() => setPOAutoNumber(false)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${!poAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>Enter Manually</button>
                  </div>
                  {!poAutoNumber && <input type="text" value={poNumber} onChange={e => setPONumber(e.target.value)} placeholder="e.g. PO-2026-001"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />}
                </div>
                <div className="bg-[#0F1C2E] rounded-lg p-3">
                  <p className="text-[#8A9AB0] text-xs mb-2">{selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''} · Your cost: ${poTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {selectedItems.map(item => (
                      <div key={item.id} className="flex justify-between text-xs py-0.5">
                        <span className="text-white">{item.item_name}</span>
                        <span className="text-[#8A9AB0]">{item.vendor ? `${item.vendor} · ` : ''}Qty: {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowPOModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                  <button onClick={generatePO} disabled={generatingPO || (!poAutoNumber && !poNumber.trim())}
                    className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {generatingPO ? 'Generating...' : `Generate PO (${selectedItems.length} items)`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Schedule Tech Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Schedule Tech</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">{job?.name}</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Technician <span className="text-[#C8622A]">*</span></label>
                <select value={schedTechId} onChange={e => setSchedTechId(e.target.value)} className={`w-full ${inputClass}`}>
                  <option value="">— Select tech —</option>
                  {orgProfiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Date <span className="text-[#C8622A]">*</span></label>
                  <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} className={`w-full ${inputClass}`} />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Hours on this job</label>
                  <select value={schedHours} onChange={e => setSchedHours(e.target.value)} className={`w-full ${inputClass}`}>
                    {['1','2','3','4','5','6','7','8'].map(h => <option key={h} value={h}>{h} {parseInt(h) === 1 ? 'hour' : 'hours'}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[#8A9AB0] text-xs">You can add multiple techs or multiple days by saving and adding again.</p>
              {jobSchedules.length > 0 && (
                <div className="bg-[#0F1C2E] rounded-lg p-3">
                  <p className="text-[#8A9AB0] text-xs font-semibold mb-2">Already scheduled</p>
                  <div className="space-y-1">
                    {jobSchedules.map(s => (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <span className="text-white">{s.profiles?.full_name} · {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {s.hours_allocated}h</span>
                        <button onClick={() => removeSchedule(s.id)} className="text-[#8A9AB0] hover:text-red-400 transition-colors ml-2">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowScheduleModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Close</button>
                <button onClick={saveSchedule} disabled={savingSchedule || !schedTechId || !schedDate}
                  className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {savingSchedule ? 'Saving...' : 'Add to Schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
      {showCOModal && (() => {
        const coInputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
        const matTotal = (coForm.line_items || []).reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
        const labTotal = (coForm.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
        const coTotal = matTotal + labTotal
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
            <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-white font-bold text-lg mb-5">New Change Order</h3>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Name <span className="text-[#C8622A]">*</span></label>
                    <input type="text" value={coForm.name} onChange={e => setCoForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Additional camera location" className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                  </div>
                  <div>
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Description</label>
                    <input type="text" value={coForm.description} onChange={e => setCoForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Brief description..." className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Materials</p>
                    <button onClick={() => setCoForm(p => ({ ...p, line_items: [...(p.line_items || []), { id: crypto.randomUUID(), item_name: '', quantity: 1, unit: 'ea', your_cost_unit: '', markup_percent: 35, customer_price_unit: '' }] }))}
                      className="text-[#C8622A] text-xs hover:text-white transition-colors">+ Add Material</button>
                  </div>
                  {(coForm.line_items || []).length === 0
                    ? <p className="text-[#8A9AB0] text-xs italic">No materials added yet.</p>
                    : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              {['Item Name', 'Qty', 'Unit', 'Your Cost', 'Markup %', 'Unit Price', 'Total', ''].map(h => (
                                <th key={h} className="text-[#8A9AB0] text-left py-1.5 pr-2 font-normal">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(coForm.line_items || []).map((line, i) => {
                              const lineTotal = (parseFloat(line.customer_price_unit) || 0) * (parseFloat(line.quantity) || 0)
                              return (
                                <tr key={line.id} className="border-b border-[#2a3d55]/30">
                                  <td className="pr-2 py-1"><input value={line.item_name} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; li[i] = {...li[i], item_name: e.target.value}; return {...p, line_items: li} })} placeholder="Item name" className={`w-36 ${coInputClass}`} /></td>
                                  <td className="pr-2 py-1"><input type="number" min="0" value={line.quantity} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; li[i] = {...li[i], quantity: e.target.value}; return {...p, line_items: li} })} className={`w-14 ${coInputClass}`} /></td>
                                  <td className="pr-2 py-1"><select value={line.unit} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; li[i] = {...li[i], unit: e.target.value}; return {...p, line_items: li} })} className={coInputClass}>{['ea','ft','lot','hr','box','roll'].map(u => <option key={u}>{u}</option>)}</select></td>
                                  <td className="pr-2 py-1"><input type="number" min="0" step="0.01" placeholder="0.00" value={line.your_cost_unit} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; const cost = parseFloat(e.target.value)||0; const mkp = parseFloat(li[i].markup_percent)||0; li[i] = {...li[i], your_cost_unit: e.target.value, customer_price_unit: (cost*(1+mkp/100)).toFixed(2)}; return {...p, line_items: li} })} className={`w-20 ${coInputClass}`} /></td>
                                  <td className="pr-2 py-1"><input type="number" min="0" placeholder="35" value={line.markup_percent} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; const mkp = parseFloat(e.target.value)||0; const cost = parseFloat(li[i].your_cost_unit)||0; li[i] = {...li[i], markup_percent: e.target.value, customer_price_unit: (cost*(1+mkp/100)).toFixed(2)}; return {...p, line_items: li} })} className={`w-14 ${coInputClass}`} /></td>
                                  <td className="pr-2 py-1"><input type="number" min="0" step="0.01" placeholder="0.00" value={line.customer_price_unit} onChange={e => setCoForm(p => { const li = [...(p.line_items||[])]; li[i] = {...li[i], customer_price_unit: e.target.value}; return {...p, line_items: li} })} className={`w-20 ${coInputClass}`} /></td>
                                  <td className="pr-2 py-1 text-white font-medium">${lineTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                                  <td className="py-1"><button onClick={() => setCoForm(p => ({...p, line_items: (p.line_items||[]).filter((_,idx)=>idx!==i)}))} className="text-[#8A9AB0] hover:text-red-400">✕</button></td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr><td colSpan="6" className="text-[#8A9AB0] text-right pt-2 pr-2 font-semibold">Materials Total</td><td className="text-[#C8622A] font-bold pt-2">${matTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</td><td></td></tr>
                          </tfoot>
                        </table>
                      </div>
                    )
                  }
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Labor</p>
                    <button onClick={() => setCoForm(p => ({ ...p, labor_items: [...(p.labor_items || []), { id: crypto.randomUUID(), role: '', quantity: '', unit: 'hr', your_cost: '', markup: 35, customer_price: '' }] }))}
                      className="text-[#C8622A] text-xs hover:text-white transition-colors">+ Add Labor</button>
                  </div>
                  {(coForm.labor_items || []).length === 0
                    ? <p className="text-[#8A9AB0] text-xs italic">No labor added yet.</p>
                    : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              {['Role', 'Qty', 'Unit', 'Your Cost', 'Markup %', 'Total', ''].map(h => (
                                <th key={h} className="text-[#8A9AB0] text-left py-1.5 pr-2 font-normal">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(coForm.labor_items || []).map((labor, i) => (
                              <tr key={labor.id} className="border-b border-[#2a3d55]/30">
                                <td className="pr-2 py-1"><input value={labor.role} onChange={e => setCoForm(p => { const li = [...(p.labor_items||[])]; li[i] = {...li[i], role: e.target.value}; return {...p, labor_items: li} })} placeholder="e.g. Electrician" className={`w-36 ${coInputClass}`} /></td>
                                <td className="pr-2 py-1"><input type="number" min="0" step="0.5" value={labor.quantity} onChange={e => setCoForm(p => { const li = [...(p.labor_items||[])]; const qty=parseFloat(e.target.value)||0; const cost=parseFloat(li[i].your_cost)||0; const mkp=parseFloat(li[i].markup)||0; li[i]={...li[i],quantity:e.target.value,customer_price:(cost*(1+mkp/100)*qty).toFixed(2)}; return {...p,labor_items:li} })} className={`w-14 ${coInputClass}`} /></td>
                                <td className="pr-2 py-1"><select value={labor.unit} onChange={e => setCoForm(p => { const li=[...(p.labor_items||[])]; li[i]={...li[i],unit:e.target.value}; return {...p,labor_items:li} })} className={coInputClass}>{['hr','day','lot'].map(u => <option key={u}>{u}</option>)}</select></td>
                                <td className="pr-2 py-1"><input type="number" min="0" step="0.01" placeholder="0.00" value={labor.your_cost} onChange={e => setCoForm(p => { const li=[...(p.labor_items||[])]; const cost=parseFloat(e.target.value)||0; const mkp=parseFloat(li[i].markup)||0; const qty=parseFloat(li[i].quantity)||0; li[i]={...li[i],your_cost:e.target.value,customer_price:(cost*(1+mkp/100)*qty).toFixed(2)}; return {...p,labor_items:li} })} className={`w-20 ${coInputClass}`} /></td>
                                <td className="pr-2 py-1"><input type="number" min="0" placeholder="35" value={labor.markup} onChange={e => setCoForm(p => { const li=[...(p.labor_items||[])]; const mkp=parseFloat(e.target.value)||0; const cost=parseFloat(li[i].your_cost)||0; const qty=parseFloat(li[i].quantity)||0; li[i]={...li[i],markup:e.target.value,customer_price:(cost*(1+mkp/100)*qty).toFixed(2)}; return {...p,labor_items:li} })} className={`w-14 ${coInputClass}`} /></td>
                                <td className="pr-2 py-1 text-white font-medium">${(parseFloat(labor.customer_price)||0).toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                                <td className="py-1"><button onClick={() => setCoForm(p => ({...p,labor_items:(p.labor_items||[]).filter((_,idx)=>idx!==i)}))} className="text-[#8A9AB0] hover:text-red-400">✕</button></td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr><td colSpan="5" className="text-[#8A9AB0] text-right pt-2 pr-2 font-semibold">Labor Total</td><td className="text-[#C8622A] font-bold pt-2">${labTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</td><td></td></tr>
                          </tfoot>
                        </table>
                      </div>
                    )
                  }
                </div>

                {((coForm.line_items||[]).length > 0 || (coForm.labor_items||[]).length > 0) && (
                  <div className="bg-[#0F1C2E] rounded-xl p-4 flex justify-between items-center">
                    <div className="text-sm text-[#8A9AB0] space-y-0.5">
                      {(coForm.line_items||[]).length > 0 && <p>Materials: <span className="text-white">${matTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</span></p>}
                      {(coForm.labor_items||[]).length > 0 && <p>Labor: <span className="text-white">${labTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</span></p>}
                    </div>
                    <div className="text-right">
                      <p className="text-[#8A9AB0] text-xs mb-0.5">Change Order Total</p>
                      <p className="text-[#C8622A] font-bold text-xl">${coTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setShowCOModal(false); setCoForm({ name: '', description: '', line_items: [], labor_items: [] }) }}
                    className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                  <button onClick={saveChangeOrder} disabled={savingCO || !coForm.name.trim()}
                    className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {savingCO ? 'Saving...' : 'Create Change Order'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}