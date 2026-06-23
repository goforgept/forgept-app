import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import { useProfile } from '../context/ProfileContext'
import ChecklistTab from '../components/job/ChecklistTab'
import ChangeOrdersTab from '../components/job/ChangeOrdersTab'
import POTab from '../components/job/POTab'
import CostReportTab from '../components/job/CostReportTab'
import TechLogTab from '../components/job/TechLogTab'
import PhotosTab from '../components/job/PhotosTab'
import ProposalTab from '../components/job/ProposalTab'
import POModal from '../components/job/POModal'
import ScheduleModal from '../components/job/ScheduleModal'
import NotifyModal from '../components/job/NotifyModal'
import ChangeOrderModal from '../components/job/ChangeOrderModal'
import AIATab from '../components/job/AIATab'

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

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })


export default function JobDetail({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'admin', isPM = false, isTechnician = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useProfile()
  const [job, setJob] = useState(null)
  const [editingJobName, setEditingJobName] = useState(false)
  const [jobNameDraft, setJobNameDraft] = useState('')
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [checklist, setChecklist] = useState([])
  const [changeOrders, setChangeOrders] = useState([])
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

  // Site photos
  const [photos, setPhotos] = useState([])
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoCategory, setPhotoCategory] = useState('Other')

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

  useEffect(() => { if (profile?.org_id) fetchAll() }, [id, profile?.org_id])

  const fetchAll = async () => {
    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, clients(company, email, client_name), profiles!jobs_assigned_pm_fkey(full_name, email)')
      .eq('id', id)
      .single()
    setJob(jobData)

    if (profile?.org_id) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('org_id', profile.org_id)
        .order('full_name')
      setOrgProfiles(profilesData || [])
      const { data: orgData } = await supabase.from('organizations').select('timezone').eq('id', profile.org_id).single()
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

      if (profile?.org_id) {
        const { data: vendorData } = await supabase
          .from('vendors')
          .select('id, vendor_name, default_markup_percent, contact_email')
          .eq('org_id', profile.org_id)
          .eq('active', true)
          .order('vendor_name')
        setVendors(vendorData || [])
      }
    }

    setFreeformPOItems([])

    // Fetch checklist
    const { data: checkData } = await supabase
      .from('job_checklist_items')
      .select('*')
      .eq('job_id', id)
      .order('sort_order', { ascending: true })

    if (checkData && checkData.length > 0) {
      setChecklist(checkData)
    } else {
      await createDefaultChecklist(id, profile?.org_id)
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

    // Fetch job photos
    const { data: photoData } = await supabase
      .from('job_photos')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: true })

    // Generate R2 signed URLs
    const { getR2Url, BUCKETS } = await import('../r2')
    const photosWithUrls = await Promise.all((photoData || []).map(async (photo) => {
      if (photo.url?.startsWith('http')) return photo // old Supabase URL
      const signedUrl = await getR2Url(photo.storage_path, 60 * 60 * 24, BUCKETS.PHOTOS)
      return { ...photo, url: signedUrl || photo.url }
    }))
    setPhotos(photosWithUrls)

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

  const updateBillingType = async (billing_type) => {
    await supabase.from('jobs').update({ billing_type }).eq('id', id)
    setJob(prev => ({ ...prev, billing_type }))
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
        po_number: finalPONumber, proposal_id: job?.proposal_id || null, job_id: id,
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

  const uploadJobPhoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a JPEG, PNG, or WEBP image.')
      return
    }
    setUploadingPhoto(true)
    try {
      const fileExt = file.name.split('.').pop()
      const storagePath = `${profile?.org_id}/${id}/${Date.now()}.${fileExt}`
      const { uploadToR2, BUCKETS } = await import('../r2')
      await uploadToR2(storagePath, file, file.type, BUCKETS.PHOTOS)
      await supabase.from('job_photos').insert({
        job_id: id,
        org_id: profile?.org_id,
        uploaded_by: profile?.id,
        storage_path: storagePath,
        url: storagePath, // store path not URL
        category: photoCategory,
        caption: ''
      })
      await fetchAll()
    } catch (err) { alert('Error uploading photo: ' + err.message) }
    setUploadingPhoto(false)
  }

  const deleteJobPhoto = async (photoId, storagePath) => {
    if (!window.confirm('Delete this photo?')) return
    // R2 cleanup handled via maintenance — just delete DB record
    await supabase.from('job_photos').delete().eq('id', photoId)
    setPhotos(prev => prev.filter(p => p.id !== photoId))
  }

  const updateJobPhotoCaption = async (photoId, caption) => {
    await supabase.from('job_photos').update({ caption }).eq('id', photoId)
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, caption } : p))
  }

  const downloadAllPhotos = async () => {
    if (photos.length === 0) return
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    const folder = zip.folder(`${job?.name || 'Job'}-Photos`)

    for (const photo of photos) {
      try {
        const response = await fetch(photo.url)
        const blob = await response.blob()
        const ext = photo.storage_path.split('.').pop() || 'jpg'
        const fileName = `${photo.category}-${photo.caption || photo.id}.${ext}`
          .replace(/[^a-z0-9.\-_]/gi, '_')
        folder.file(fileName, blob)
      } catch (e) { console.error('Photo download error:', e) }
    }

    const content = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(content)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job?.name || 'Job'}-Photos.zip`
    a.click()
    URL.revokeObjectURL(url)
  }

  const generateFinalJobPacket = async () => {
    try {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')

    // Header
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 40, 'F')

    if (profile?.logo_url) {
      const img = new Image()
      img.src = profile.logo_url
      await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
      const maxW = 50, maxH = 26
      const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
      doc.addImage(img, 'PNG', 14, 8 + (maxH - img.naturalHeight * ratio) / 2, img.naturalWidth * ratio, img.naturalHeight * ratio)
    } else {
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text(profile?.company_name || 'ForgePt.', 14, 24)
    }

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Job Completion Packet', pageWidth - 14, 20, { align: 'right' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(new Date().toLocaleDateString(), pageWidth - 14, 30, { align: 'right' })

    // Job details
    let y = 52
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(job?.name || '', 14, y)
    y += 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    if (job?.clients?.company) { doc.text(`Client: ${job.clients.company}`, 14, y); y += 6 }
    if (job?.job_number) { doc.text(`Job #: ${job.job_number}`, 14, y); y += 6 }
    if (proposal?.quote_number) { doc.text(`Quote #: ${proposal.quote_number}`, 14, y); y += 6 }
    if (job?.start_date) { doc.text(`Start Date: ${new Date(job.start_date).toLocaleDateString()}`, 14, y); y += 6 }
    if (job?.end_date) { doc.text(`Completion Date: ${new Date(job.end_date).toLocaleDateString()}`, 14, y); y += 6 }
    y += 4

    // Divider
    doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.line(14, y, pageWidth - 14, y)
    y += 8

    // Scope of Work
    if (proposal?.scope_of_work) {
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Scope of Work', 14, y)
      y += 6
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const sowLines = doc.splitTextToSize(proposal.scope_of_work, pageWidth - 28)
      const pageHeight = doc.internal.pageSize.getHeight()
      for (const line of sowLines) {
        if (y > pageHeight - 20) { doc.addPage(); y = 20 }
        doc.text(line, 14, y)
        y += 5
      }
      y += 6
    }

    // Approved Change Orders
    const approvedCOs = changeOrders.filter(c => c.status === 'Approved')
    if (approvedCOs.length > 0) {
      if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, y, pageWidth - 14, y)
      y += 8
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Approved Change Orders', 14, y)
      y += 6
      for (const co of approvedCOs) {
        if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(40, 40, 40)
        doc.text(`• ${co.name}`, 14, y)
        y += 5
        if (co.description) {
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(100, 100, 100)
          const coLines = doc.splitTextToSize(co.description, pageWidth - 32)
          for (const line of coLines) {
            if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
            doc.text(line, 20, y)
            y += 5
          }
        }
        y += 2
      }
      y += 4
    }

    // Completion Statement
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20 }
    doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.line(14, y, pageWidth - 14, y)
    y += 8
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Completion Statement', 14, y)
    y += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    const statement = `All work has been completed per the agreed scope of work for ${job?.clients?.company || 'the client'}. ${profile?.company_name || 'The contractor'} has performed all installation, testing, and commissioning as outlined in the original proposal${approvedCOs.length > 0 ? ' and approved change orders' : ''}.`
    const stLines = doc.splitTextToSize(statement, pageWidth - 28)
    for (const line of stLines) {
      if (y > doc.internal.pageSize.getHeight() - 20) { doc.addPage(); y = 20 }
      doc.text(line, 14, y)
      y += 5
    }
    y += 10

    // Client signature line
    doc.setDrawColor(180, 180, 180)
    doc.line(14, y, 100, y)
    doc.line(120, y, pageWidth - 14, y)
    y += 5
    doc.setFontSize(8)
    doc.setTextColor(100, 100, 100)
    doc.text('Client Signature', 14, y)
    doc.text('Date', 120, y)

    // Site Photos organized by category
    const photoCategories = ['Before', 'During', 'After', 'Issue/Defect', 'Equipment', 'Panel/Rack', 'Cable Run', 'Other']
    for (const category of photoCategories) {
      const categoryPhotos = photos.filter(p => p.category === category)
      if (categoryPhotos.length === 0) continue

      doc.addPage()
      y = 20
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text(`Site Photos — ${category}`, 14, y)
      y += 4
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, y, pageWidth - 14, y)
      y += 8

      const photoWidth = (pageWidth - 42) / 2
      const photoHeight = 65
      let photoX = 14
      const pageHeight = doc.internal.pageSize.getHeight()

      for (let i = 0; i < categoryPhotos.length; i++) {
        try {
          const response = await fetch(categoryPhotos[i].url)
          const blob = await response.blob()
          const base64 = await new Promise(resolve => {
            const img2 = new Image()
            img2.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img2.naturalWidth
              canvas.height = img2.naturalHeight
              const ctx = canvas.getContext('2d')
              ctx.drawImage(img2, 0, 0)
              resolve(canvas.toDataURL('image/jpeg', 0.85))
            }
            img2.src = URL.createObjectURL(blob)
          })

          if (y + photoHeight + 10 > pageHeight - 20) {
            doc.addPage()
            y = 20
            photoX = 14
          }

          doc.addImage(base64, 'JPEG', photoX, y, photoWidth, photoHeight)

          if (categoryPhotos[i].caption) {
            doc.setFontSize(7)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(80, 80, 80)
            doc.text(categoryPhotos[i].caption, photoX, y + photoHeight + 4, { maxWidth: photoWidth })
          }

          if (i % 2 === 0) {
            photoX = photoX + photoWidth + 14
          } else {
            photoX = 14
            y = y + photoHeight + 14
          }
        } catch (e) { console.error('Photo load error:', e) }
      }
    }

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`${profile?.company_name || 'ForgePt.'} · Job Completion Packet`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' })

    doc.save(`${job?.name || 'Job'}-Completion-Packet.pdf`)
  } catch (err) { console.error('Error generating final job packet:', err); alert('Error generating packet: ' + err.message) }
  }

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
                <div className="flex items-center gap-1.5">
                  <span className="text-[#8A9AB0] text-xs">💰 Billing:</span>
                  <select value={job?.billing_type || 'Lump Sum'} onChange={e => updateBillingType(e.target.value)}
                    className="bg-[#0F1C2E] text-white text-xs border border-[#2a3d55] rounded px-2 py-1 focus:outline-none focus:border-[#C8622A]">
                    {['Lump Sum', 'T&M', 'AIA', 'Unit Price'].map(b => <option key={b}>{b}</option>)}
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
              <button onClick={generateFinalJobPacket}
                className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
                📄 Final Packet
              </button>
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
            { key: 'photos', label: `📷 Photos (${photos.length})` },
            ...(job?.billing_type === 'AIA' ? [{ key: 'aia', label: 'AIA Applications' }] : []),
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === t.key ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* CHECKLIST TAB */}
        {activeTab === 'checklist' && (
          <ChecklistTab
            checklist={checklist}
            lineItems={lineItems}
            newCheckItem={newCheckItem}
            setNewCheckItem={setNewCheckItem}
            savingCheck={savingCheck}
            onToggleItem={toggleCheckItem}
            onAddItem={addCheckItem}
            onDeleteItem={deleteCheckItem}
          />
        )}

        {/* CHANGE ORDERS TAB */}
        {activeTab === 'changeorders' && (
          <ChangeOrdersTab
            changeOrders={changeOrders}
            totalCOAmount={totalCOAmount}
            onOpenCOModal={() => setShowCOModal(true)}
            onUpdateCOStatus={updateCOStatus}
          />
        )}

        {/* PURCHASE ORDERS TAB */}
        {activeTab === 'pos' && (
          <POTab
            lineItems={lineItems}
            selectedForPO={selectedForPO}
            setSelectedForPO={setSelectedForPO}
            job={job}
            onOpenPOModal={() => setShowPOModal(true)}
          />
        )}

        {/* COST REPORT TAB */}
        {activeTab === 'costReport' && (
          <CostReportTab
            job={job}
            proposal={proposal}
            lineItems={lineItems}
            freeformPOItems={freeformPOItems}
            changeOrders={changeOrders}
            techLogs={techLogs}
            checklist={checklist}
            onExportPDF={exportCostReport}
          />
        )}

        {/* TECH LOG TAB */}
        {activeTab === 'techlog' && (
          <TechLogTab techLogs={techLogs} />
        )}

        {/* PHOTOS TAB */}
        {activeTab === 'photos' && (
          <PhotosTab
            photos={photos}
            photoCategory={photoCategory}
            setPhotoCategory={setPhotoCategory}
            uploadingPhoto={uploadingPhoto}
            onUpload={uploadJobPhoto}
            onDownloadAll={downloadAllPhotos}
            onUpdateCaption={updateJobPhotoCaption}
            onDelete={deleteJobPhoto}
          />
        )}

        {/* PROPOSAL TAB */}
        {activeTab === 'proposal' && (
          <ProposalTab job={job} proposal={proposal} navigate={navigate} />
        )}

        {/* AIA TAB */}
        {activeTab === 'aia' && (
          <AIATab job={job} profile={profile} lineItems={lineItems} proposal={proposal} changeOrders={changeOrders} />
        )}
      </div>

      {showPOModal && (
        <POModal
          lineItems={lineItems}
          selectedForPO={selectedForPO}
          vendors={vendors}
          poVendorEmail={poVendorEmail}
          setPOVendorEmail={setPOVendorEmail}
          poNumber={poNumber}
          setPONumber={setPONumber}
          poAutoNumber={poAutoNumber}
          setPOAutoNumber={setPOAutoNumber}
          generatingPO={generatingPO}
          onGenerate={generatePO}
          onClose={() => setShowPOModal(false)}
        />
      )}

      {showScheduleModal && (
        <ScheduleModal
          job={job}
          orgProfiles={orgProfiles}
          jobSchedules={jobSchedules}
          schedTechId={schedTechId}
          setSchedTechId={setSchedTechId}
          schedDate={schedDate}
          setSchedDate={setSchedDate}
          schedHours={schedHours}
          setSchedHours={setSchedHours}
          savingSchedule={savingSchedule}
          onSave={saveSchedule}
          onRemoveSchedule={removeSchedule}
          onClose={() => setShowScheduleModal(false)}
        />
      )}

      {showNotifyModal && (
        <NotifyModal
          job={job}
          notifyMessage={notifyMessage}
          setNotifyMessage={setNotifyMessage}
          sendingNotify={sendingNotify}
          onSend={sendNotification}
          onClose={() => setShowNotifyModal(false)}
        />
      )}

      {showCOModal && (
        <ChangeOrderModal
          coForm={coForm}
          setCoForm={setCoForm}
          savingCO={savingCO}
          onSave={saveChangeOrder}
          onClose={() => { setShowCOModal(false); setCoForm({ name: '', description: '', line_items: [], labor_items: [] }) }}
        />
      )}
    </div>
  )
}