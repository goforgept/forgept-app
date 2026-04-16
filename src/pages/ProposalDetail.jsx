import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import POList from '../components/POList'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType } from 'docx'

export default function ProposalDetail({ isAdmin, featureProposals = true, featureCRM = false, featureAiBom = false, featureSitePhotos = true }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [laborItems, setLaborItems] = useState([
    { role: '', quantity: '', unit: 'hr', your_cost: '', markup: 35, customer_price: 0 }
  ])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingBOM, setEditingBOM] = useState(false)
  const [editLines, setEditLines] = useState([])
  const [saving, setSaving] = useState(false)
  const [generatingSOW, setGeneratingSOW] = useState(false)
  const [showPOModal, setShowPOModal] = useState(false)
  const [selectedForPO, setSelectedForPO] = useState(new Set())
  const [poVendor, setPOVendor] = useState(null)
  const [poNumber, setPONumber] = useState('')
  const [poAutoNumber, setPOAutoNumber] = useState(true)
  const [generatingPO, setGeneratingPO] = useState(false)
  const [aiNotes, setAiNotes] = useState('')
  const [showSentPrompt, setShowSentPrompt] = useState(false)
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [orgType, setOrgType] = useState('integrator')
  const [featureSendProposal, setFeatureSendProposal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendingProposal, setSendingProposal] = useState(false)
  const [sendForm, setSendForm] = useState({ subject: '', message: '' })
  const [collaborators, setCollaborators] = useState([])
  const [showShareModal, setShowShareModal] = useState(false)
  const [orgProfiles, setOrgProfiles] = useState([])
  const [sharingProposal, setSharingProposal] = useState(false)
  const [clientAddress, setClientAddress] = useState('')
  const [locationName, setLocationName] = useState('')
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [orderVendor, setOrderVendor] = useState('')
  const [orderAutoNumber, setOrderAutoNumber] = useState(true)
  const [orderNumber, setOrderNumber] = useState('')
  const [orderExpectedShip, setOrderExpectedShip] = useState('')
  const [creatingOrder, setCreatingOrder] = useState(false)
  const [activity, setActivity] = useState([])
  const [newActivityNote, setNewActivityNote] = useState('')
  const [savingActivity, setSavingActivity] = useState(false)
  const [renewalDates, setRenewalDates] = useState({})
  const [savingRenewal, setSavingRenewal] = useState(false)
  const [showRenewalModal, setShowRenewalModal] = useState(false)
  const [pendingRenewalItems, setPendingRenewalItems] = useState([])
  const [pendingRenewalDates, setPendingRenewalDates] = useState({})
  const [showRFQModal, setShowRFQModal] = useState(false)
  const [showLibrarySearch, setShowLibrarySearch] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryResults, setLibraryResults] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [librarySelectedVendor, setLibrarySelectedVendor] = useState({})
  const [librarySelectedItems, setLibrarySelectedItems] = useState(new Set())
  const [rfqVendorData, setRfqVendorData] = useState({})
  const [sendingRFQs, setSendingRFQs] = useState(false)
  const [showAIBOMModal, setShowAIBOMModal] = useState(false)
  const [aiBOMPrompt, setAIBOMPrompt] = useState('')
  const [generatingBOM, setGeneratingBOM] = useState(false)
  const [aiBOMPreview, setAIBOMPreview] = useState([])
  const [showDrawingModal, setShowDrawingModal] = useState(false)
  const [drawingFile, setDrawingFile] = useState(null)
  const [drawingInstructions, setDrawingInstructions] = useState('')
  const [drawingPreview, setDrawingPreview] = useState([])
  const [analyzingDrawing, setAnalyzingDrawing] = useState(false)
  const [showSpecModal, setShowSpecModal] = useState(false)
  const [specFile, setSpecFile] = useState(null)
  const [analyzingSpec, setAnalyzingSpec] = useState(false)
  const [specSummary, setSpecSummary] = useState(null)
  const [showDealSummaryModal, setShowDealSummaryModal] = useState(false)
  const [dealSummary, setDealSummary] = useState(null)
  const [generatingDealSummary, setGeneratingDealSummary] = useState(false)
  const [photos, setPhotos] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showEditClientModal, setShowEditClientModal] = useState(false)
  const [editClientForm, setEditClientForm] = useState({ client_name: '', company: '', client_email: '' })
  const [savingClient, setSavingClient] = useState(false)
  const [allClients, setAllClients] = useState([])
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingProposal, setDeletingProposal] = useState(false)
  const [qboConnected, setQboConnected] = useState(false)
  const [sendingToQBO, setSendingToQBO] = useState(false)
  const [qboInvoiceId, setQboInvoiceId] = useState(null)
  const [vendors, setVendors] = useState([])
  const [poVendorEmail, setPOVendorEmail] = useState('')
  const [bulkField, setBulkField] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkSelectedLines, setBulkSelectedLines] = useState(new Set())
  // E-signing
  const [requestingSignature, setRequestingSignature] = useState(false)
  const [editingProposalName, setEditingProposalName] = useState(false)
  const [proposalNameDraft, setProposalNameDraft] = useState('')
  const [editingQuoteNumber, setEditingQuoteNumber] = useState(false)
  const [quoteNumberDraft, setQuoteNumberDraft] = useState('')
  const [quoteNumberError, setQuoteNumberError] = useState('')
  const [editingSOW, setEditingSOW] = useState(false)
  const [sowDraft, setSowDraft] = useState('')
  const [uploadingSignedPDF, setUploadingSignedPDF] = useState(false)
  const [sections, setSections] = useState([])
  const [showPricingModal, setShowPricingModal] = useState(false)
  const [editSections, setEditSections] = useState([])
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveLineIndex, setMoveLineIndex] = useState(null)
  const [moveType, setMoveType] = useState('move') // 'move' or 'copy'
  const [slaContracts, setSlaContracts] = useState([])
  const [monitoringContracts, setMonitoringContracts] = useState([])
  const [orgSLASettings, setOrgSLASettings] = useState(null)
  const [contractNotification, setContractNotification] = useState(null)
  const [showSLAModal, setShowSLAModal] = useState(false)
  const [showMonitoringModal, setShowMonitoringModal] = useState(false)
  const [editSLAForm, setEditSLAForm] = useState({})
  const [editMonitoringForm, setEditMonitoringForm] = useState({})
  const [editingAgreementIdx, setEditingAgreementIdx] = useState(null)
  const [savingContract, setSavingContract] = useState(false)
  const [showContractStartModal, setShowContractStartModal] = useState(false)
  const [pendingContractItems, setPendingContractItems] = useState([])
  const [pendingContractDates, setPendingContractDates] = useState({})
  const [savingContractDates, setSavingContractDates] = useState(false)
  const [session, setSession] = useState(null)

  useEffect(() => {
    fetchProposal()
    fetchLineItems()
    fetchSections()
    fetchProfile()
    fetchActivity()
    fetchPhotos()
    fetchVendors()
  }, [])

  const fetchProposal = async () => {
    const { data } = await supabase
      .from('proposals')
      .select('id,proposal_name,company,client_name,client_email,client_id,rep_name,rep_email,industry,status,close_date,proposal_value,total_customer_value,total_your_cost,total_gross_margin_dollars,total_gross_margin_percent,labor_items,created_at,org_id,user_id,collaborator_ids,has_recurring,scope_of_work,job_description,submission_type,quote_number,lump_sum_pricing,hide_material_prices,hide_labor_breakdown,tax_rate,tax_exempt,qbo_invoice_id,location_id,signing_token,signature_name,signature_at,signed_pdf_url,sla_contracts,monitoring_contracts,sla_contract,monitoring_contract')
      .eq('id', id)
      .single()

    setProposal(data)
    setCollaborators(data?.collaborator_ids || [])
    setQboInvoiceId(data?.qbo_invoice_id || null)

    // Backward-compat: fall back to old singular columns if new arrays are empty
    let slaArr = (data?.sla_contracts?.length > 0) ? data.sla_contracts : (data?.sla_contract ? [data.sla_contract] : [])
    let monArr = (data?.monitoring_contracts?.length > 0) ? data.monitoring_contracts : (data?.monitoring_contract ? [data.monitoring_contract] : [])
    setSlaContracts(slaArr)
    setMonitoringContracts(monArr)

    // Load org SLA settings and auto-attach if applicable
    if (data?.org_id) {
      const { data: orgSLA } = await supabase.from('organizations')
        .select('feature_sla, sla_auto_attach, sla_templates, feature_monitoring, monitoring_auto_attach, monitoring_templates')
        .eq('id', data.org_id).single()
      setOrgSLASettings(orgSLA)
      const notifications = []
      const updates = {}
      if (orgSLA?.feature_sla && orgSLA?.sla_auto_attach && slaArr.length === 0) {
        const tmpl = orgSLA.sla_templates?.[data.industry]
        if (tmpl?.enabled) {
          const newArr = [{ ...tmpl }]
          updates.sla_contracts = newArr; setSlaContracts(newArr); slaArr = newArr; notifications.push('SLA contract')
        }
      }
      if (orgSLA?.feature_monitoring && orgSLA?.monitoring_auto_attach && monArr.length === 0) {
        const tmpl = orgSLA.monitoring_templates?.[data.industry]
        if (tmpl?.enabled) {
          const newArr = [{ ...tmpl }]
          updates.monitoring_contracts = newArr; setMonitoringContracts(newArr); monArr = newArr; notifications.push('Monitoring contract')
        }
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('proposals').update(updates).eq('id', data.id)
        setContractNotification(`${notifications.join(' and ')} auto-attached based on industry (${data.industry}).`)
        setTimeout(() => setContractNotification(null), 8000)
      }
    }

    if (data?.labor_items && data.labor_items.length > 0) {
      setLaborItems(data.labor_items)
    }

    if (data?.client_id) {
      const { data: clientData } = await supabase
        .from('clients')
        .select('address, city, state, zip')
        .eq('id', data.client_id)
        .single()
      if (clientData) {
        const addr = [clientData.address, clientData.city, clientData.state, clientData.zip].filter(Boolean).join(', ')
        setClientAddress(addr)
      }
    }
    if (data?.location_id) {
      const { data: locData } = await supabase
        .from('client_locations')
        .select('site_name, address, city, state, zip')
        .eq('id', data.location_id)
        .single()
      if (locData) {
        setLocationName(locData.site_name)
        const locAddr = [locData.address, locData.city, locData.state, locData.zip].filter(Boolean).join(', ')
        if (locAddr) setClientAddress(locAddr)
      }
    }

    setLoading(false)
  }

  const fetchLineItems = async () => {
    const { data } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('proposal_id', id)
    setLineItems(data || [])
    setEditLines(data || [])
    const dates = {}
    ;(data || []).forEach(l => { if (l.renewal_date) dates[l.id] = l.renewal_date })
    setRenewalDates(dates)
  }

  const fetchSections = async () => {
    const { data } = await supabase
      .from('proposal_sections')
      .select('*')
      .eq('proposal_id', id)
      .order('sort_order', { ascending: true })
    setSections(data || [])
  }

  const fetchProfile = async () => {
    const { data: { session: currentSession } } = await supabase.auth.refreshSession()
    setSession(currentSession)
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('profiles')
      .select('*, organizations(org_type, feature_send_proposal)')
      .eq('id', user.id)
      .single()
    setProfile(data)
    setOrgType(data?.organizations?.org_type || 'integrator')
    setFeatureSendProposal(data?.organizations?.feature_send_proposal || false)
    if (data?.org_id) {
      const { data: orgData } = await supabase.from('organizations').select('qbo_connected').eq('id', data.org_id).single()
      setQboConnected(orgData?.qbo_connected || false)
    }
    if (data?.org_id) {
      const { data: teamData } = await supabase.from('profiles').select('id, full_name, email').eq('org_id', data.org_id)
      setOrgProfiles(teamData || [])
    }
  }

  const fetchVendors = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!prof?.org_id) return
    const { data } = await supabase.from('vendors').select('id, vendor_name, contact_email').eq('org_id', prof.org_id).eq('active', true).order('vendor_name')
    setVendors(data || [])
  }

  const fetchActivity = async () => {
    const { data } = await supabase
      .from('activities')
      .select('*, profiles(full_name)')
      .eq('proposal_id', id)
      .order('created_at', { ascending: false })
    setActivity(data || [])
  }

  const logActivity = async (event, type = 'note') => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activities').insert({
      proposal_id: id,
      client_id: proposal?.client_id || null,
      org_id: proposal?.org_id,
      user_id: user.id,
      type,
      title: event
    })
    fetchActivity()
  }

  const addManualActivity = async () => {
    const title = typeof newActivityNote === 'string' ? newActivityNote.trim() : newActivityNote?.title?.trim()
    const type = typeof newActivityNote === 'string' ? 'note' : (newActivityNote?.type || 'note')
    if (!title) return
    setSavingActivity(true)
    await logActivity(title, type)
    setNewActivityNote('')
    setSavingActivity(false)
  }

  const updateStatus = async (newStatus) => {
    if (newStatus === 'Won' && proposal?.status !== 'Won') {
      try {
        const { data: orgData } = await supabase.from('organizations').select('job_counter').eq('id', proposal.org_id).single()
        const jobNumber = `JOB-${orgData?.job_counter || 1000}`
        await supabase.from('organizations').update({ job_counter: (orgData?.job_counter || 1000) + 1 }).eq('id', proposal.org_id)
        await supabase.from('jobs').insert({
          org_id: proposal.org_id,
          proposal_id: id,
          client_id: proposal.client_id || null,
          job_number: jobNumber,
          name: proposal.proposal_name,
          status: 'Active',
        })
      } catch (e) { console.log('Job creation error:', e) }
    }
    if (newStatus === 'Won') {
      const recurringMissingDate = lineItems.filter(l => l.recurring && !l.renewal_date && !(renewalDates[l.id]))
      if (recurringMissingDate.length > 0) {
        const initialDates = {}
        recurringMissingDate.forEach(l => { initialDates[l.id] = '' })
        setPendingRenewalItems(recurringMissingDate)
        setPendingRenewalDates(initialDates)
        setShowRenewalModal(true)
        await supabase.from('proposals').update({ status: newStatus }).eq('id', id)
        setProposal(prev => ({ ...prev, status: newStatus }))
        return
      }
      // Check agreements missing a start date
      const allAgreements = [
        ...slaContracts.map((c, i) => ({ ...c, _type: 'sla', _idx: i })),
        ...monitoringContracts.map((c, i) => ({ ...c, _type: 'monitoring', _idx: i })),
      ]
      const agreementsMissingDate = allAgreements.filter(c => !c.start_date)
      if (agreementsMissingDate.length > 0) {
        const initialDates = {}
        agreementsMissingDate.forEach(c => { initialDates[`${c._type}_${c._idx}`] = '' })
        setPendingContractItems(agreementsMissingDate)
        setPendingContractDates(initialDates)
        await supabase.from('proposals').update({ status: newStatus }).eq('id', id)
        setProposal(prev => ({ ...prev, status: newStatus }))
        setShowContractStartModal(true)
        return
      }
      // All agreements have dates — create contract rows now
      await createContractRows(slaContracts, monitoringContracts)
    }
    await supabase.from('proposals').update({ status: newStatus }).eq('id', id)
    setProposal(prev => ({ ...prev, status: newStatus }))
    logActivity(`Status changed to ${newStatus}`)
  }

  const saveRenewalModalDates = async () => {
    setSavingRenewal(true)
    for (const item of pendingRenewalItems) {
      const date = pendingRenewalDates[item.id]
      if (date) {
        await supabase.from('bom_line_items').update({ renewal_date: date }).eq('id', item.id)
      }
    }
    setRenewalDates(prev => ({ ...prev, ...pendingRenewalDates }))
    setLineItems(prev => prev.map(l => {
      if (pendingRenewalDates[l.id]) return { ...l, renewal_date: pendingRenewalDates[l.id] }
      return l
    }))
    setShowRenewalModal(false)
    setPendingRenewalItems([])
    setPendingRenewalDates({})
    setSavingRenewal(false)
  }

  const updateCloseDate = async (newDate) => {
    await supabase.from('proposals').update({ close_date: newDate }).eq('id', id)
    setProposal(prev => ({ ...prev, close_date: newDate }))
    logActivity(`Close date updated to ${newDate}`)
  }

  const toggleLumpSum = async () => {
    const newVal = !proposal?.lump_sum_pricing
    await supabase.from('proposals').update({ lump_sum_pricing: newVal }).eq('id', id)
    setProposal(prev => ({ ...prev, lump_sum_pricing: newVal }))
  }

  const toggleHideMaterialPrices = async () => {
    const newVal = !proposal?.hide_material_prices
    await supabase.from('proposals').update({ hide_material_prices: newVal, lump_sum_pricing: newVal }).eq('id', id)
    setProposal(prev => ({ ...prev, hide_material_prices: newVal, lump_sum_pricing: newVal }))
  }

  const toggleHideLaborBreakdown = async () => {
    const newVal = !proposal?.hide_labor_breakdown
    await supabase.from('proposals').update({ hide_labor_breakdown: newVal }).eq('id', id)
    setProposal(prev => ({ ...prev, hide_labor_breakdown: newVal }))
  }

  const saveProposalName = async () => {
    const trimmed = proposalNameDraft.trim()
    if (!trimmed || trimmed === proposal?.proposal_name) { setEditingProposalName(false); return }
    await supabase.from('proposals').update({ proposal_name: trimmed }).eq('id', id)
    setProposal(prev => ({ ...prev, proposal_name: trimmed }))
    setEditingProposalName(false)
  }

  const updateTaxRate = async (val) => {
    const num = parseFloat(val) || null
    await supabase.from('proposals').update({ tax_rate: num }).eq('id', id)
    setProposal(prev => ({ ...prev, tax_rate: num }))
  }

  const updateTaxExempt = async (val) => {
    await supabase.from('proposals').update({ tax_exempt: val, tax_rate: val ? null : proposal?.tax_rate }).eq('id', id)
    setProposal(prev => ({ ...prev, tax_exempt: val, tax_rate: val ? null : prev?.tax_rate }))
  }

  const applyBulkEdit = () => {
    if (!bulkField || !bulkValue || bulkSelectedLines.size === 0) return
    setEditLines(prev => prev.map(l => {
      if (!bulkSelectedLines.has(l.id || l.item_name + l.quantity)) return l
      if (bulkField === 'section') {
        return { ...l, section_id: bulkValue === 'general' ? null : bulkValue }
      }
      const updated = { ...l, [bulkField]: bulkValue }
      if (bulkField === 'markup_percent' && l.your_cost_unit) {
        updated.customer_price_unit = (parseFloat(l.your_cost_unit) * (1 + parseFloat(bulkValue) / 100)).toFixed(2)
        updated.customer_price_total = (parseFloat(updated.customer_price_unit) * parseFloat(l.quantity || 0)).toFixed(2)
      }
      return updated
    }))
    setBulkField('')
    setBulkValue('')
    setBulkSelectedLines(new Set())
  }

  const saveQuoteNumber = async () => {
    const trimmed = quoteNumberDraft.trim()
    if (!trimmed) { setQuoteNumberError('Quote number cannot be empty'); return }
    // Check for duplicates within org
    const { data: existing } = await supabase
      .from('proposals')
      .select('id')
      .eq('org_id', proposal.org_id)
      .eq('quote_number', trimmed)
      .neq('id', id)
    if (existing && existing.length > 0) {
      setQuoteNumberError(`Quote number "${trimmed}" is already in use`)
      return
    }
    await supabase.from('proposals').update({ quote_number: trimmed }).eq('id', id)
    setProposal(prev => ({ ...prev, quote_number: trimmed }))
    setEditingQuoteNumber(false)
    setQuoteNumberError('')
    logActivity(`Quote number updated to ${trimmed}`)
  }

  const saveSOW = async () => {
    await supabase.from('proposals').update({ scope_of_work: sowDraft }).eq('id', id)
    setProposal(prev => ({ ...prev, scope_of_work: sowDraft }))
    setEditingSOW(false)
    logActivity('Scope of Work edited manually')
  }

  const requestSignature = async () => {
    if (!proposal?.client_email) { alert('No client email on this proposal.'); return }
    setRequestingSignature(true)
    const signingUrl = `${window.location.origin}/sign/${proposal.signing_token}`
    try {
      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-signature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({
          toEmail: proposal.client_email,
          toName: proposal.client_name || '',
          fromName: profile?.full_name || '',
          fromEmail: profile?.email || '',
          subject: `Please sign your proposal: ${proposal.proposal_name}`,
          proposalName: proposal.proposal_name,
          signingUrl,
          orgId: proposal.org_id,
          logoUrl: profile?.logo_url || null,
          companyName: profile?.company_name || proposal.company || '',
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      logActivity(`Signature request sent to ${proposal.client_email}`)
      alert(`✓ Signature request sent to ${proposal.client_email}`)
    } catch (e) {
      alert(`Could not send email. Share this link manually:\n${signingUrl}`)
    }
    setRequestingSignature(false)
  }

  const uploadSignedPDF = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingSignedPDF(true)
    try {
      const fileName = `${id}/uploaded-signed-${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('signed-proposals')
        .upload(fileName, file, { contentType: 'application/pdf', upsert: true })
      if (uploadError) throw uploadError
      const { data: urlData } = await supabase.storage.from('signed-proposals').createSignedUrl(fileName, 60 * 60 * 24 * 365)
      await supabase.from('proposals').update({ signed_pdf_url: urlData.signedUrl }).eq('id', id)
      setProposal(prev => ({ ...prev, signed_pdf_url: urlData.signedUrl }))
      logActivity('Signed agreement uploaded manually')
    } catch (err) {
      alert('Error uploading signed PDF: ' + err.message)
    }
    setUploadingSignedPDF(false)
  }

  // Collect all enabled SLA tiers across all industries
  const allSLATiers = () => {
    const tiers = []
    Object.entries(orgSLASettings?.sla_templates || {}).forEach(([industry, tmpl]) => {
      if (tmpl?.tiers) tmpl.tiers.forEach(t => tiers.push({ ...t, _industry: industry }))
    })
    return tiers
  }

  const allMonitoringTemplates = () => {
    const templates = []
    Object.entries(orgSLASettings?.monitoring_templates || {}).forEach(([industry, tmpl]) => {
      if (tmpl?.enabled) templates.push({ ...tmpl, _industry: industry })
    })
    return templates
  }

  const openSLAModal = (idx = null) => {
    setEditingAgreementIdx(idx)
    if (idx !== null) {
      const c = slaContracts[idx]
      setEditSLAForm({
        tier_id: c.tier_id || '', tier_name: c.tier_name || c.name || '',
        name: c.name || 'Service Level Agreement',
        response_time_hours: c.response_time_hours ?? '',
        billing_frequency: c.billing_frequency || 'Quarterly',
        labor_rate: c.labor_rate || 100, emergency_rate: c.emergency_rate ?? '',
        maintenance_calls_per_year: c.maintenance_calls_per_year || 0,
        initial_fee: c.initial_fee || 0, recurring_fee: c.recurring_fee || 0,
        body: c.body || '', start_date: c.start_date || '', end_date: c.end_date || '', auto_renew: c.auto_renew || false,
      })
    } else {
      const tiers = allSLATiers()
      const first = tiers[0] || {}
      setEditSLAForm({
        tier_id: first.id || '', tier_name: first.name || '',
        name: first.name || 'Service Level Agreement',
        response_time_hours: first.response_time_hours ?? '',
        billing_frequency: first.billing_frequency || 'Quarterly',
        labor_rate: first.labor_rate || 100, emergency_rate: first.emergency_rate ?? '',
        maintenance_calls_per_year: first.maintenance_calls_per_year || 0,
        initial_fee: first.initial_fee || 0, recurring_fee: first.recurring_fee || 0,
        body: first.body || '', start_date: '', end_date: '', auto_renew: false,
      })
    }
    setShowSLAModal(true)
  }

  const saveSLAContract = async () => {
    setSavingContract(true)
    const newArr = editingAgreementIdx !== null
      ? slaContracts.map((c, i) => i === editingAgreementIdx ? editSLAForm : c)
      : [...slaContracts, editSLAForm]
    await supabase.from('proposals').update({ sla_contracts: newArr }).eq('id', id)
    setSlaContracts(newArr)
    setShowSLAModal(false)
    logActivity(editingAgreementIdx !== null ? 'Service agreement updated' : 'Service agreement added')
    setSavingContract(false)
  }

  const removeSLAContract = async (idx) => {
    if (!window.confirm('Remove this service agreement?')) return
    const newArr = slaContracts.filter((_, i) => i !== idx)
    await supabase.from('proposals').update({ sla_contracts: newArr }).eq('id', id)
    setSlaContracts(newArr)
    logActivity('Service agreement removed')
  }

  const openMonitoringModal = (idx = null) => {
    setEditingAgreementIdx(idx)
    if (idx !== null) {
      const c = monitoringContracts[idx]
      setEditMonitoringForm({
        name: c.name || 'Monitoring Contract', monthly_fee: c.monthly_fee || 49,
        monitored_systems: c.monitored_systems || '', billing_frequency: c.billing_frequency || 'Monthly',
        escalation_contacts: c.escalation_contacts || 2, body: c.body || '',
        start_date: c.start_date || '', end_date: c.end_date || '', auto_renew: c.auto_renew || false,
      })
    } else {
      const tmpls = allMonitoringTemplates()
      const first = tmpls[0] || {}
      setEditMonitoringForm({
        name: first.name || 'Monitoring Contract', monthly_fee: first.monthly_fee || 49,
        monitored_systems: first.monitored_systems || '', billing_frequency: first.billing_frequency || 'Monthly',
        escalation_contacts: first.escalation_contacts || 2, body: first.body || '',
        start_date: '', end_date: '', auto_renew: false,
      })
    }
    setShowMonitoringModal(true)
  }

  const saveMonitoringContract = async () => {
    setSavingContract(true)
    const newArr = editingAgreementIdx !== null
      ? monitoringContracts.map((c, i) => i === editingAgreementIdx ? editMonitoringForm : c)
      : [...monitoringContracts, editMonitoringForm]
    await supabase.from('proposals').update({ monitoring_contracts: newArr }).eq('id', id)
    setMonitoringContracts(newArr)
    setShowMonitoringModal(false)
    logActivity(editingAgreementIdx !== null ? 'Monitoring contract updated' : 'Monitoring contract added')
    setSavingContract(false)
  }

  const removeMonitoringContract = async (idx) => {
    if (!window.confirm('Remove this monitoring contract?')) return
    const newArr = monitoringContracts.filter((_, i) => i !== idx)
    await supabase.from('proposals').update({ monitoring_contracts: newArr }).eq('id', id)
    setMonitoringContracts(newArr)
    logActivity('Monitoring contract removed')
  }

  const createContractRows = async (slaArr, monArr) => {
    const rows = [
      ...(slaArr || []).map(c => ({
        org_id: proposal?.org_id, proposal_id: id, client_id: proposal?.client_id || null,
        user_id: profile?.id, type: 'sla', name: c.name || 'Service Level Agreement',
        status: 'Active', start_date: c.start_date || null, end_date: c.end_date || null,
        auto_renew: c.auto_renew || false,
      })),
      ...(monArr || []).map(c => ({
        org_id: proposal?.org_id, proposal_id: id, client_id: proposal?.client_id || null,
        user_id: profile?.id, type: 'monitoring', name: c.name || 'Monitoring Contract',
        status: 'Active', start_date: c.start_date || null, end_date: c.end_date || null,
        auto_renew: c.auto_renew || false,
      })),
    ]
    if (rows.length > 0) {
      const { error } = await supabase.from('contracts').insert(rows)
      if (error) alert('Contract insert error: ' + error.message)
    }
  }

  const saveContractStartDates = async () => {
    setSavingContractDates(true)
    const newSla = slaContracts.map((c, i) => {
      const key = `sla_${i}`
      if (!pendingContractDates[key]) return c
      const start = pendingContractDates[key]
      const endDate = new Date(start); endDate.setFullYear(endDate.getFullYear() + 1)
      return { ...c, start_date: start, end_date: endDate.toISOString().split('T')[0] }
    })
    const newMon = monitoringContracts.map((c, i) => {
      const key = `monitoring_${i}`
      if (!pendingContractDates[key]) return c
      const start = pendingContractDates[key]
      const endDate = new Date(start); endDate.setFullYear(endDate.getFullYear() + 1)
      return { ...c, start_date: start, end_date: endDate.toISOString().split('T')[0] }
    })
    await supabase.from('proposals').update({ sla_contracts: newSla, monitoring_contracts: newMon }).eq('id', id)
    setSlaContracts(newSla)
    setMonitoringContracts(newMon)
    await createContractRows(newSla, newMon)
    setShowContractStartModal(false)
    setPendingContractItems([])
    setPendingContractDates({})
    setSavingContractDates(false)
    logActivity('Contract start dates set')
  }

  const generateSOW = async () => {
    setGeneratingSOW(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/generate-sow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentSession?.access_token}`
        },
        body: JSON.stringify({
          proposalId: id,
          company: profile?.company_name,
          clientName: proposal.client_name,
          jobDesc: proposal.job_description,
          industry: proposal.industry,
          repName: proposal.rep_name,
          laborItems: laborItems,
          aiNotes: aiNotes,
          lineItems: lineItems.map(l => ({
            itemName: l.item_name,
            quantity: l.quantity,
            customerPriceUnit: l.customer_price_unit,
            customerPriceTotal: l.customer_price_total
          }))
        })
      })
      await fetchProposal()
      logActivity('Scope of Work generated')
    } catch (err) {
      console.log('SOW generation error:', err)
    }
    setGeneratingSOW(false)
  }

  const searchLibrary = async (q) => {
    setLibrarySearch(q)
    if (!q.trim()) { setLibraryResults([]); return }
    setLibraryLoading(true)
    const { data: prods } = await supabase
      .from('product_library')
      .select('*, product_library_pricing(*)')
      .eq('org_id', proposal?.org_id)
      .eq('active', true)
      .or(`item_name.ilike.%${q}%,part_number.ilike.%${q}%,manufacturer.ilike.%${q}%,category.ilike.%${q}%`)
      .limit(30)
    setLibraryResults(prods || [])
    setLibraryLoading(false)
  }

  const addLibraryItemsToBOM = () => {
    const STALE_DAYS = 120
    const newLines = []
    libraryResults.forEach(prod => {
      if (!librarySelectedItems.has(prod.id)) return
      const selectedPricing = librarySelectedVendor[prod.id] || prod.product_library_pricing?.[0]
      if (!selectedPricing) return
      const days = selectedPricing.pricing_date
        ? Math.floor((new Date() - new Date(selectedPricing.pricing_date)) / (1000 * 60 * 60 * 24))
        : null
      const isStale = days === null || days > STALE_DAYS
      const cost = parseFloat(selectedPricing.your_cost) || 0
      newLines.push({
        proposal_id: id,
        item_name: prod.item_name,
        manufacturer: prod.manufacturer || '',
        part_number_sku: prod.part_number || '',
        quantity: '1',
        unit: prod.unit || 'ea',
        category: prod.category || '',
        vendor: selectedPricing.vendor || '',
        your_cost_unit: isStale ? '' : String(cost),
        markup_percent: '35',
        customer_price_unit: isStale ? '' : (cost * 1.35).toFixed(2),
        customer_price_total: '',
        pricing_status: isStale ? 'Needs Pricing' : 'Confirmed',
      })
    })
    if (!editingBOM) {
      setEditLines([...lineItems.map(l => ({ ...l })), ...newLines])
      setEditingBOM(true)
    } else {
      setEditLines(prev => [...prev, ...newLines])
    }
    setShowLibrarySearch(false)
    setLibrarySearch('')
    setLibraryResults([])
    setLibrarySelectedItems(new Set())
    setLibrarySelectedVendor({})
  }

  const openRFQModal = () => {
    const needsPricing = lineItems.filter(l => l.pricing_status === 'Needs Pricing' && l.vendor)
    if (needsPricing.length === 0) {
      alert('No items need pricing or no vendors assigned.')
      return
    }
    const byVendor = needsPricing.reduce((acc, item) => {
      const vendor = item.vendor || 'Unknown Vendor'
      if (!acc[vendor]) acc[vendor] = []
      acc[vendor].push(item)
      return acc
    }, {})
    const initData = {}
    Object.keys(byVendor).forEach(v => {
      const found = vendors.find(vr => vr.vendor_name === v)
      initData[v] = { email: found?.contact_email || '', attachExcel: false }
    })
    setRfqVendorData(initData)
    setShowRFQModal(true)
  }

  const sendAllRFQs = async () => {
    setSendingRFQs(true)
    const needsPricing = lineItems.filter(l => l.pricing_status === 'Needs Pricing' && l.vendor)
    const byVendor = needsPricing.reduce((acc, item) => {
      const vendor = item.vendor || 'Unknown Vendor'
      if (!acc[vendor]) acc[vendor] = []
      acc[vendor].push(item)
      return acc
    }, {})

    const { data: vendorRecords } = await supabase
      .from('vendors')
      .select('vendor_name, pricing_valid_days')
      .eq('org_id', proposal?.org_id)

    const vendorExpiryMap = {}
    ;(vendorRecords || []).forEach(v => { vendorExpiryMap[v.vendor_name] = v.pricing_valid_days || 30 })

    for (const [vendorName, items] of Object.entries(byVendor)) {
      const vendorInfo = rfqVendorData[vendorName]
      if (!vendorInfo?.email) continue

      const expiryDays = vendorExpiryMap[vendorName] || 30
      const expiresAt = new Date()
      expiresAt.setDate(expiresAt.getDate() + expiryDays)
      const expiresAtStr = expiresAt.toISOString().split('T')[0]

      let excelBase64 = null
      if (vendorInfo.attachExcel) {
        const XLSX = await import('xlsx')
        const wsData = [
          ['Item Name', 'Manufacturer', 'Part #', 'Qty', 'Unit', 'Your Price (fill in)'],
          ...items.map(i => [i.item_name, i.manufacturer || '', i.part_number_sku || '', i.quantity, i.unit || 'ea', ''])
        ]
        const ws = XLSX.utils.aoa_to_sheet(wsData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'RFQ')
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' })
        excelBase64 = wbout
      }

      try {
        const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-rfq', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentSession?.access_token}`
          },
          body: JSON.stringify({
            lineItemIds: items.map(i => i.id),
            items: items.map(i => ({
              itemName: i.item_name,
              manufacturer: i.manufacturer || '',
              partNumber: i.part_number_sku || '',
              quantity: i.quantity,
              unit: i.unit || 'ea'
            })),
            vendorEmail: vendorInfo.email,
            vendorName,
            proposalName: proposal.proposal_name,
            repName: proposal.rep_name,
            repEmail: proposal.rep_email,
            company: profile?.company_name || proposal.company,
            excelBase64: excelBase64,
            expiresAt: expiresAtStr
          })
        })

        for (const item of items) {
          await supabase.from('bom_line_items').update({ rfq_expires_at: expiresAtStr }).eq('id', item.id)
        }
      } catch (err) {
        console.log(`RFQ error for ${vendorName}:`, err)
      }
    }

    await fetchLineItems()
    setShowRFQModal(false)
    setSendingRFQs(false)
    alert('RFQs sent successfully.')
  }

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [15, 28, 46]
  }

  const markAsSent = async () => {
    await supabase.from('proposals').update({ status: 'Sent' }).eq('id', id)
    setProposal(prev => ({ ...prev, status: 'Sent' }))
    setShowSentPrompt(false)
  }

  const downloadPDF = async () => {
    if (proposal?.status === 'Draft') setShowSentPrompt(true)
    const doc = await generatePDFDoc()
    doc.save(`${proposal?.proposal_name || 'Proposal'}.pdf`)
  }

  const downloadDOCX = async () => {
    if (proposal?.status === 'Draft') setShowSentPrompt(true)

    const { data: freshProposal } = await supabase
      .from('proposals')
      .select('hide_material_prices, hide_labor_breakdown, lump_sum_pricing, tax_rate, tax_exempt, scope_of_work, labor_items, proposal_name')
      .eq('id', id)
      .single()
      .single()
    const p = freshProposal ? { ...proposal, ...freshProposal } : proposal

    const primaryColor = (profile?.primary_color || '#0F1C2E').replace('#', '')

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
    const borders = { top: border, bottom: border, left: border, right: border }
    const isLumpSum = p?.hide_material_prices || p?.lump_sum_pricing
    const colWidths = isLumpSum ? [4200, 1400, 1200] : [2800, 1400, 800, 1000, 1000]
    const headers = isLumpSum ? ['Item', 'Part #', 'Qty'] : ['Item', 'Part #', 'Qty', 'Unit Price', 'Total']

    const headerRow = new TableRow({
      children: headers.map((h, i) =>
        new TableCell({
          borders,
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: primaryColor, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })]
          })]
        })
      )
    })

    const itemRows = lineItems.map(item =>
      new TableRow({
        children: (isLumpSum
          ? [item.item_name, item.part_number_sku || '—', String(item.quantity || 0)]
          : [
              item.item_name,
              item.part_number_sku || '—',
              String(item.quantity || 0),
              `$${(item.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              `$${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
            ]
        ).map((val, i) =>
          new TableCell({
            borders,
            width: { size: colWidths[i], type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              children: [new TextRun({ text: val, size: 18 })]
            })]
          })
        )
      })
    )

    const matTotal = lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)
    const totalRow = new TableRow({
      children: [
        new TableCell({
          borders, columnSpan: isLumpSum ? 2 : 4,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: primaryColor, type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Total', bold: true, color: 'FFFFFF', size: 18 })]
          })]
        }),
        new TableCell({
          borders, width: { size: isLumpSum ? 1200 : 1000, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: primaryColor, type: ShadingType.CLEAR },
          children: [new Paragraph({
            children: [new TextRun({
              text: `$${matTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              bold: true, color: 'FFFFFF', size: 18
            })]
          })]
        })
      ]
    })

    const docxTaxRate = (!p?.tax_exempt && p?.tax_rate) ? parseFloat(p.tax_rate) : 0
    const docxTaxAmt = Math.round(matTotal * (docxTaxRate / 100) * 100) / 100

    const children = [
      new Paragraph({ children: [new TextRun({ text: profile?.company_name || proposal?.company || 'ForgePt.', bold: true, size: 36, color: primaryColor })] }),
      new Paragraph({ children: [new TextRun({ text: proposal?.proposal_name || 'Proposal', bold: true, size: 48 })] }),
      new Paragraph({ children: [new TextRun({ text: `Prepared for: ${proposal?.company || ''} — ${proposal?.client_name || ''}`, size: 20, color: '666666' })] }),
      new Paragraph({ children: [new TextRun({ text: clientAddress ? `Address: ${clientAddress}` : `Email: ${proposal?.client_email || ''}`, size: 20, color: '666666' })] }),
      new Paragraph({ children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString()}`, size: 20, color: '666666' })] }),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
    ]

    if (p?.scope_of_work) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: 'Scope of Work', bold: true, size: 28, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...proposal.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim().split('\n').map(line =>
          new Paragraph({ children: [new TextRun({ text: line, size: 20 })] })
        ),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
      )
    }

    const docxLaborItems = p?.labor_items || []
    const docxMatTotal = lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)

    if (lineItems.length > 0) {
      const hasDocxLabor = (p?.labor_items || []).some(l => l.role)
      children.push(
        new Paragraph({ children: [new TextRun({ text: 'Materials & Pricing', bold: true, size: 28, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
      )

      if (sections.length > 0) {
        // Unsectioned items
        const unsectioned = lineItems.filter(l => !l.section_id)
        if (unsectioned.length > 0) {
          children.push(
            new Paragraph({ children: [new TextRun({ text: 'General', bold: true, size: 22, color: primaryColor })] }),
            new Table({
              width: { size: isLumpSum ? 6800 : 9800, type: WidthType.DXA }, columnWidths: colWidths,
              rows: [headerRow, ...unsectioned.map(item =>
                new TableRow({
                  children: (isLumpSum
                    ? [item.item_name, item.part_number_sku || '—', String(item.quantity || 0)]
                    : [item.item_name, item.part_number_sku || '—', String(item.quantity || 0), `$${(item.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
                  ).map((val, i) => new TableCell({ borders, width: { size: colWidths[i], type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })] })] }))
                })
              )]
            }),
            new Paragraph({ children: [new TextRun({ text: '' })] }),
          )
        }

        // Each section
        for (const section of sections) {
          const secItems = lineItems.filter(l => l.section_id === section.id)
          const secLabor = section.include_labor ? (section.labor_items || []).filter(l => l.role) : []
          if (secItems.length === 0 && secLabor.length === 0) continue
          const secMatTotal = secItems.reduce((s, i) => s + (i.customer_price_total || 0), 0)
          const secLaborTotal = secLabor.reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0)
          const secTotal = secMatTotal + secLaborTotal

          // Section header row spanning full width
          const secHeaderRow = new TableRow({
            children: [new TableCell({
              columnSpan: isLumpSum ? 3 : 5,
              borders, width: { size: isLumpSum ? 6800 : 9800, type: WidthType.DXA },
              shading: { fill: primaryColor, type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: section.name || 'Untitled Section', bold: true, color: 'FFFFFF', size: 20 })] })]
            })]
          })

          const secItemRows = secItems.map(item =>
            new TableRow({
              children: (isLumpSum
                ? [item.item_name, item.part_number_sku || '—', String(item.quantity || 0)]
                : [item.item_name, item.part_number_sku || '—', String(item.quantity || 0), `$${(item.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
              ).map((val, i) => new TableCell({ borders, width: { size: colWidths[i], type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })] })] }))
            })
          )

          children.push(
            new Table({ width: { size: isLumpSum ? 6800 : 9800, type: WidthType.DXA }, columnWidths: colWidths, rows: [secHeaderRow, headerRow, ...secItemRows] }),
            new Paragraph({ children: [new TextRun({ text: '' })] }),
          )

          // Section labor
          if (secLabor.length > 0) {
            const lb = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
            const lbs = { top: lb, bottom: lb, left: lb, right: lb }
            const hideLabor = p?.hide_labor_breakdown
            const slcw = hideLabor ? [4800, 1200, 1200] : [3000, 1200, 1200, 2400]
            const slHeaders = hideLabor ? ['Role', 'Qty', 'Unit'] : ['Role', 'Qty', 'Unit', 'Total Labor']
            const slHeaderRow = new TableRow({
              children: slHeaders.map((h, i) => new TableCell({ borders: lbs, width: { size: slcw[i], type: WidthType.DXA }, shading: { fill: primaryColor, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })] })] }))
            })
            const slRows = secLabor.map(l => new TableRow({
              children: (hideLabor ? [l.role, String(l.quantity || ''), l.unit || 'hr'] : [l.role, String(l.quantity || ''), l.unit || 'hr', `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`])
                .map((val, i) => new TableCell({ borders: lbs, width: { size: slcw[i], type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })] })] }))
            }))
            children.push(
              new Paragraph({ children: [new TextRun({ text: 'Section Labor', bold: true, size: 18, color: '666666' })] }),
              new Table({ width: { size: 7800, type: WidthType.DXA }, columnWidths: slcw, rows: [slHeaderRow, ...slRows] }),
              new Paragraph({ children: [new TextRun({ text: '' })] }),
            )
          }
          children.push(
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${section.name || 'Section'} Total: $${secTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, bold: true, size: 18, color: primaryColor })] }),
            new Paragraph({ children: [new TextRun({ text: '' })] }),
          )
        }

      } else {
        // No sections — original flat table
        children.push(
          new Table({ width: { size: isLumpSum ? 6800 : 9800, type: WidthType.DXA }, columnWidths: colWidths, rows: [headerRow, ...itemRows, totalRow] }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),
        )
      }
    }

    if (docxLaborItems.length > 0 && docxLaborItems.some(l => l.role)) {
      const lb = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
      const lbs = { top: lb, bottom: lb, left: lb, right: lb }

      const hideLabor = p?.hide_labor_breakdown
      const lHeaders = hideLabor ? ['Role', 'Qty', 'Unit'] : ['Role', 'Qty', 'Unit', 'Total Labor']
      const lcw = hideLabor ? [4800, 1200, 1200] : [3000, 1200, 1200, 2400]

      const lHeaderRow = new TableRow({
        children: lHeaders.map((h, i) =>
          new TableCell({
            borders: lbs, width: { size: lcw[i], type: WidthType.DXA },
            shading: { fill: primaryColor, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })] })]
          })
        )
      })

      const lRows = docxLaborItems.filter(l => l.role).map(l =>
        new TableRow({
          children: (hideLabor
            ? [l.role, String(l.quantity || ''), l.unit || 'hr']
            : [l.role, String(l.quantity || ''), l.unit || 'hr', `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
          ).map((val, i) =>
            new TableCell({
              borders: lbs, width: { size: lcw[i], type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })] })]
            })
          )
        })
      )

      const laborTotal = docxLaborItems.filter(l => l.role).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)

      const lTotalRow = new TableRow({
        children: [
          new TableCell({
            borders: lbs, columnSpan: hideLabor ? 2 : 3,
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            shading: { fill: primaryColor, type: ShadingType.CLEAR },
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Total Labor', bold: true, color: 'FFFFFF', size: 18 })] })]
          }),
          new TableCell({
            borders: lbs, width: { size: 2400, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            shading: { fill: primaryColor, type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: `$${laborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, bold: true, color: 'FFFFFF', size: 18 })] })]
          })
        ]
      })

      children.push(
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Labor', bold: true, size: 28, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Table({ width: { size: 7800, type: WidthType.DXA }, columnWidths: lcw, rows: [lHeaderRow, ...lRows, lTotalRow] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
      )
    }

    // Unified summary — always shown
    const docxProposalLaborTotal = docxLaborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
    const docxSectionLaborTotal = sections.reduce((sum, s) => sum + (s.include_labor ? (s.labor_items || []).reduce((ss, l) => ss + (parseFloat(l.customer_price) || 0), 0) : 0), 0)
    const docxAllLaborTotal = docxProposalLaborTotal + docxSectionLaborTotal
    const docxGrandTotal = docxMatTotal + docxAllLaborTotal + docxTaxAmt

    children.push(
      new Paragraph({ children: [new TextRun({ text: `Materials Total: $${docxMatTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, size: 20, color: '444444' })] }),
      ...(docxAllLaborTotal > 0 ? [new Paragraph({ children: [new TextRun({ text: `Labor Total: $${docxAllLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, size: 20, color: '444444' })] })] : []),
      ...(docxTaxRate > 0 ? [new Paragraph({ children: [new TextRun({ text: `Tax (${docxTaxRate}% on materials): $${docxTaxAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, size: 20, color: '666666' })] })] : []),
      new Paragraph({ children: [new TextRun({ text: `Grand Total: $${docxGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, bold: true, size: 28, color: primaryColor })] }),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
    )

    if (profile?.terms_and_conditions) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: 'Terms and Conditions', bold: true, size: 28, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...profile.terms_and_conditions.split('\n').map(line =>
          new Paragraph({ children: [new TextRun({ text: line, size: 18, color: '444444' })] })
        )
      )
    }

    const sigLine = () => new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' } },
      children: [new TextRun({ text: ' ', size: 24 })]
    })

    children.push(
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Accepted and Agreed', bold: true, size: 28, color: primaryColor })] }),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Client Signature', size: 18, color: '888888' })] }),
      sigLine(),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Date', size: 18, color: '888888' })] }),
      sigLine(),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Printed Name', size: 18, color: '888888' })] }),
      sigLine(),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({ children: [new TextRun({ text: 'Title', size: 18, color: '888888' })] }),
      sigLine(),
    )

    for (const slaC of slaContracts) {
      const resolvedSLABody = (slaC.body || '')
        .replace(/\{\{companyName\}\}/g, profile?.company_name || proposal?.company || '')
        .replace(/\{\{clientName\}\}/g, proposal?.company || '')
        .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
        .replace(/\{\{responseTime\}\}/g, slaC.response_time_hours ? `${slaC.response_time_hours} hours` : 'as scheduled')
        .replace(/\{\{billingFrequency\}\}/g, slaC.billing_frequency || 'Quarterly')
        .replace(/\{\{laborRate\}\}/g, `${slaC.labor_rate || 100}`)
        .replace(/\{\{emergencyRate\}\}/g, `${slaC.emergency_rate || 150}`)
        .replace(/\{\{tierName\}\}/g, slaC.tier_name || slaC.name || '')
        .replace(/\{\{maintenanceCalls\}\}/g, `${slaC.maintenance_calls_per_year || 0}`)
        .replace(/\{\{initialFee\}\}/g, `${slaC.initial_fee || 0}`)
        .replace(/\{\{recurringFee\}\}/g, `${slaC.recurring_fee || 0}`)
      children.push(
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: slaC.name || 'Service Level Agreement', bold: true, size: 28, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...[
          slaC.response_time_hours ? `Response Time: ${slaC.response_time_hours} hours` : null,
          `Billing: ${slaC.billing_frequency || 'Quarterly'}`,
          `Standard Rate: $${slaC.labor_rate || 100}/hr`,
          slaC.emergency_rate ? `Emergency Rate: $${slaC.emergency_rate}/hr` : null,
          slaC.maintenance_calls_per_year > 0 ? `Included Maintenance Visits: ${slaC.maintenance_calls_per_year}/year` : null,
          slaC.recurring_fee > 0 ? `Recurring Fee: $${slaC.recurring_fee} (${slaC.billing_frequency || 'Quarterly'})` : null,
          slaC.start_date ? `Term: ${new Date(slaC.start_date).toLocaleDateString()} – ${slaC.end_date ? new Date(slaC.end_date).toLocaleDateString() : 'TBD'}` : null,
          slaC.auto_renew ? 'Auto-Renew: Yes' : null,
        ].filter(Boolean).map(t => new Paragraph({ children: [new TextRun({ text: t, size: 18 })] })),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...resolvedSLABody.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line, size: 18, color: '444444' })] })),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Service Agreement Acceptance', bold: true, size: 22, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Client Signature', size: 18, color: '888888' })] }),
        sigLine(),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Date', size: 18, color: '888888' })] }),
        sigLine(),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Printed Name', size: 18, color: '888888' })] }),
        sigLine(),
      )
    }

    for (const monC of monitoringContracts) {
      const resolvedMonBody = (monC.body || '')
        .replace(/\{\{companyName\}\}/g, profile?.company_name || proposal?.company || '')
        .replace(/\{\{clientName\}\}/g, proposal?.company || '')
        .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
        .replace(/\{\{monthlyFee\}\}/g, `${monC.monthly_fee || 49}`)
        .replace(/\{\{monitoredSystems\}\}/g, monC.monitored_systems || '')
        .replace(/\{\{billingFrequency\}\}/g, monC.billing_frequency || 'Monthly')
        .replace(/\{\{escalationContacts\}\}/g, `${monC.escalation_contacts || 2}`)
      children.push(
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: monC.name || 'Monitoring Contract', bold: true, size: 28, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...[
          `Monthly Fee: $${monC.monthly_fee || 49}/mo`,
          `Billing: ${monC.billing_frequency || 'Monthly'}`,
          monC.monitored_systems ? `Monitored Systems: ${monC.monitored_systems}` : null,
          `Escalation Contacts: ${monC.escalation_contacts || 2}`,
          monC.start_date ? `Term: ${new Date(monC.start_date).toLocaleDateString()} – ${monC.end_date ? new Date(monC.end_date).toLocaleDateString() : 'TBD'}` : null,
          monC.auto_renew ? 'Auto-Renew: Yes' : null,
        ].filter(Boolean).map(t => new Paragraph({ children: [new TextRun({ text: t, size: 18 })] })),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...resolvedMonBody.split('\n').map(line => new Paragraph({ children: [new TextRun({ text: line, size: 18, color: '444444' })] })),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Monitoring Contract Acceptance', bold: true, size: 22, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Client Signature', size: 18, color: '888888' })] }),
        sigLine(),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Date', size: 18, color: '888888' })] }),
        sigLine(),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Printed Name', size: 18, color: '888888' })] }),
        sigLine(),
      )
    }

    if (photos && photos.length > 0) {
      const { ImageRun } = await import('docx')
      children.push(
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Paragraph({ children: [new TextRun({ text: 'Site Photos', bold: true, size: 28, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
      )
      for (const photo of photos) {
        try {
          const response = await fetch(photo.url)
          const arrayBuffer = await response.arrayBuffer()
          children.push(
            new Paragraph({ children: [new ImageRun({ data: arrayBuffer, transformation: { width: 400, height: 250 }, type: 'jpg' })] })
          )
          if (photo.caption) {
            children.push(new Paragraph({ children: [new TextRun({ text: photo.caption, size: 16, color: '888888', italics: true })] }))
          }
          children.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
        } catch (e) { console.log('DOCX photo error:', e) }
      }
    }

    const doc = new Document({
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children
      }]
    })

    const buffer = await Packer.toBlob(doc)
    const url = URL.createObjectURL(buffer)
    const a = document.createElement('a')
    a.href = url
    a.download = `${proposal?.proposal_name || 'Proposal'}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }

  const generatePO = async () => {
    if (selectedForPO.size === 0) return
    setGeneratingPO(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = await supabase
        .from('profiles')
        .select('org_id, company_name, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, ship_to_address, ship_to_city, ship_to_state, ship_to_zip')
        .eq('id', user.id)
        .single()

      let finalPONumber = poNumber
      if (poAutoNumber) {
        const { data: org } = await supabase.from('organizations').select('po_counter').eq('id', profileData.org_id).single()
        finalPONumber = `PO-${org.po_counter}`
        await supabase.from('organizations').update({ po_counter: org.po_counter + 1 }).eq('id', profileData.org_id)
      }

      const selectedItems = lineItems.filter(l => selectedForPO.has(l.id))
      const vendorNames = [...new Set(selectedItems.map(i => i.vendor).filter(Boolean))].join(', ')
      const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()

      doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.rect(0, 0, pageWidth, 40, 'F')

      if (profile?.logo_url) {
        const img = new Image()
        img.src = profile.logo_url
        await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
        const maxW = 50, maxH = 26
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
        const logoW = img.naturalWidth * ratio
        const logoH = img.naturalHeight * ratio
        const logoY = 8 + (maxH - logoH) / 2
        doc.addImage(img, 'PNG', 14, logoY, logoW, logoH)
      } else {
        doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold')
        doc.text(profile?.company_name || 'ForgePt.', 14, 22)
      }

      doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
      doc.text('PURCHASE ORDER', pageWidth - 14, 18, { align: 'right' })
      doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.text(finalPONumber, pageWidth - 14, 28, { align: 'right' })

      const billToLines = [profileData?.company_name || '', profileData?.bill_to_address || '', [profileData?.bill_to_city, profileData?.bill_to_state, profileData?.bill_to_zip].filter(Boolean).join(', ')].filter(Boolean)
      const shipToLines = [profileData?.company_name || '', profileData?.ship_to_address || '', [profileData?.ship_to_city, profileData?.ship_to_state, profileData?.ship_to_zip].filter(Boolean).join(', ')].filter(Boolean)

      doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 52)
      doc.text(`Project: ${proposal?.proposal_name || ''}`, 14, 60)

      const col1 = 14, col2 = pageWidth / 2 - 10, col3 = pageWidth / 2 + 30
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('VENDOR', col1, 74); doc.text('BILL TO', col2, 74); doc.text('SHIP TO', col3, 74)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(9)
      doc.text(vendorNames || poVendorEmail || '—', col1, 81)
      billToLines.forEach((line, i) => doc.text(line, col2, 81 + i * 6))
      shipToLines.forEach((line, i) => doc.text(line, col3, 81 + i * 6))

      const tableStart = 81 + Math.max(billToLines.length, shipToLines.length) * 6 + 6
      doc.setDrawColor(220, 220, 220)
      doc.line(14, tableStart - 2, pageWidth - 14, tableStart - 2)

      autoTable(doc, {
        startY: tableStart,
        head: [['Item', 'Part #', 'Qty', 'Unit', 'Unit Cost', 'Total']],
        body: selectedItems.map(item => [item.item_name, item.part_number_sku || '—', item.quantity, item.unit || 'ea', `$${(item.your_cost_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${((item.your_cost_unit || 0) * (item.quantity || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]),
        foot: [['', '', '', '', 'Total', `$${selectedItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 }, showFoot: 'lastPage'
      })

      const totalAmount = selectedItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0)
      await supabase.from('purchase_orders').insert({ po_number: finalPONumber, proposal_id: id, org_id: profileData.org_id, vendor_name: vendorNames || null, status: 'Sent', total_amount: totalAmount })
      for (const item of selectedItems) {
        await supabase.from('bom_line_items').update({ po_number: finalPONumber, po_status: 'PO Sent' }).eq('id', item.id)
      }

      await fetchLineItems()
      logActivity(`Purchase Order ${finalPONumber} generated — ${selectedItems.length} items`)
      doc.save(`${finalPONumber}.pdf`)
      setSelectedForPO(new Set())
      setShowPOModal(false)
    } catch (err) {
      alert('Error generating PO: ' + err.message)
    }
    setGeneratingPO(false)
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    try {
      const data = await file.arrayBuffer()
      const workbook = XLSX.read(data, { cellText: false, cellDates: true, cellFormula: false })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

      const clean = (val) => {
        if (val === null || val === undefined || val === '') return ''
        if (String(val).startsWith('=')) return ''
        return String(val).replace(/[$,%]/g, '').replace(/,/g, '').trim()
      }

      const mapped = rows.filter(r => r['Item Name'] || r['item_name'] || r['Part #'] || r['part_number_sku']).map(r => {
        let itemName = r['Item Name'] || r['item_name'] || ''
        let partNum = clean(r['Part Number'] || r['Part #'] || r['part_number_sku'] || '')
        const looksLikePartNumber = (s) => /^[A-Z0-9\-]{3,}$/i.test(String(s).trim()) && !String(s).includes(' ')
        if (looksLikePartNumber(itemName) && !looksLikePartNumber(partNum) && partNum) {
          const temp = itemName; itemName = partNum; partNum = temp
        }
        const yourCost = clean(r['Your Cost'] || r['Your Cost (Unit)'] || r['your_cost_unit'] || '')
        const markup = clean(r['Markup %'] || r['markup_percent'] || '35')
        const rawCustomerPrice = clean(r['Customer Price'] || r['Customer Price (Unit)'] || r['customer_price_unit'] || '')
        const qty = clean(r['Quantity'] || r['Qty'] || r['quantity'] || '1')
        const unit = String(r['Unit'] || r['unit'] || 'ea').trim().toLowerCase()
        let finalCustomerPrice = rawCustomerPrice
        if ((!finalCustomerPrice || parseFloat(finalCustomerPrice) === 0) && yourCost && markup) {
          finalCustomerPrice = (parseFloat(yourCost) * (1 + parseFloat(markup) / 100)).toFixed(2)
        }
        return {
          proposal_id: id, item_name: itemName, part_number_sku: partNum, quantity: qty || '1', unit: unit || 'ea',
          category: r['Category'] || r['category'] || '', vendor: r['Vendor'] || r['vendor'] || '',
          your_cost_unit: yourCost, markup_percent: markup || '35', customer_price_unit: finalCustomerPrice,
          customer_price_total: finalCustomerPrice && qty ? (parseFloat(finalCustomerPrice) * parseFloat(qty)).toFixed(2) : '',
          pricing_status: yourCost ? 'Confirmed' : 'Needs Pricing'
        }
      })

      setEditLines(mapped)
      setTimeout(() => { setEditingBOM(true) }, 0)
    } catch (err) {
      console.log('Excel upload error:', err)
      alert('Could not read Excel file')
    }
  }

  const startEditing = () => {
    setEditLines(lineItems.map(l => ({ ...l })))
    setEditSections(sections.map(s => ({ ...s, labor_items: s.labor_items || [] })))
    setEditingBOM(true)
  }

  const addSection = () => {
    const newSection = {
      id: `new_${Date.now()}`,
      proposal_id: id,
      org_id: profile?.org_id,
      name: '',
      sort_order: editSections.length,
      include_labor: false,
      labor_items: [],
      isNew: true,
    }
    setEditSections(prev => [...prev, newSection])
  }

  const updateSection = (sectionId, field, value) => {
    setEditSections(prev => prev.map(s => s.id === sectionId ? { ...s, [field]: value } : s))
  }

  const deleteSection = (sectionId) => {
    // Move all lines from this section to general (null section_id)
    setEditLines(prev => prev.map(l => l.section_id === sectionId ? { ...l, section_id: null } : l))
    setEditSections(prev => prev.filter(s => s.id !== sectionId))
  }

  const moveLineToSection = (lineIndex, targetSectionId, type = 'move') => {
    if (type === 'copy') {
      const lineCopy = { ...editLines[lineIndex], id: undefined, section_id: targetSectionId === 'general' ? null : targetSectionId }
      setEditLines(prev => [...prev, lineCopy])
    } else {
      setEditLines(prev => prev.map((l, i) => i === lineIndex ? { ...l, section_id: targetSectionId === 'general' ? null : targetSectionId } : l))
    }
    setShowMoveModal(false)
    setMoveLineIndex(null)
  }

  const updateSectionLabor = (sectionId, index, field, value) => {
    setEditSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s
      const updated = [...(s.labor_items || [])]
      updated[index] = { ...updated[index], [field]: value }
      const qty = parseFloat(updated[index].quantity) || 0
      const cost = parseFloat(updated[index].your_cost) || 0
      const markup = parseFloat(updated[index].markup) || 0
      if (field === 'your_cost' || field === 'markup' || field === 'quantity') {
        if (cost > 0 && qty > 0) updated[index].customer_price = (cost * (1 + markup / 100) * qty).toFixed(2)
      }
      return { ...s, labor_items: updated }
    }))
  }

  const addSectionLaborLine = (sectionId) => {
    setEditSections(prev => prev.map(s => s.id === sectionId
      ? { ...s, labor_items: [...(s.labor_items || []), { role: '', quantity: '', unit: 'hr', your_cost: '', markup: 35, customer_price: 0 }] }
      : s
    ))
  }

  const removeSectionLaborLine = (sectionId, index) => {
    setEditSections(prev => prev.map(s => s.id === sectionId
      ? { ...s, labor_items: (s.labor_items || []).filter((_, i) => i !== index) }
      : s
    ))
  }

  const updateEditLine = (index, field, value) => {
    setEditLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      if (field === 'your_cost_unit' || field === 'markup_percent') {
        const cost = parseFloat(updated[index].your_cost_unit) || 0
        const markup = parseFloat(updated[index].markup_percent) || 0
        updated[index].customer_price_unit = (cost * (1 + markup / 100)).toFixed(2)
      }
      const price = parseFloat(updated[index].customer_price_unit) || 0
      const qty = parseFloat(updated[index].quantity) || 0
      updated[index].customer_price_total = (price * qty).toFixed(2)
      return updated
    })
  }

  const updateLabor = (index, field, value) => {
    setLaborItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      const qty = parseFloat(updated[index].quantity) || 0
      const cost = parseFloat(updated[index].your_cost) || 0
      const markup = parseFloat(updated[index].markup) || 0
      const cp = parseFloat(updated[index].customer_price) || 0
      if (field === 'your_cost' || field === 'markup' || field === 'quantity') {
        if (cost > 0 && qty > 0) { updated[index].customer_price = (cost * (1 + markup / 100) * qty).toFixed(2) }
      } else if (field === 'customer_price') {
        if (cp > 0 && qty > 0) {
          if (cost > 0) { updated[index].markup = (((cp / qty) / cost - 1) * 100).toFixed(1) }
          else if (markup >= 0) { updated[index].your_cost = (cp / (1 + markup / 100) / qty).toFixed(2) }
        }
      }
      return updated
    })
  }

  const addEditLine = () => {
    setEditLines(prev => [...prev, {
      proposal_id: id, item_name: '', part_number_sku: '', quantity: '', unit: 'ea', category: '',
      vendor: '', your_cost_unit: '', markup_percent: '35', customer_price_unit: '', customer_price_total: '', pricing_status: 'Needs Pricing'
    }])
  }

  const removeEditLine = (index) => {
    setEditLines(prev => prev.filter((_, i) => i !== index))
  }

  const saveBOM = async () => {
    setSaving(true)

    // Save/update sections first so we have real IDs
    const sectionIdMap = {} // maps temp 'new_xxx' ids to real db ids
    for (const s of editSections) {
      if (s.isNew) {
        const { data: newSec } = await supabase.from('proposal_sections').insert({
          proposal_id: id, org_id: profile?.org_id, name: s.name || 'Untitled Section',
          sort_order: s.sort_order, include_labor: s.include_labor, labor_items: s.labor_items || []
        }).select().single()
        if (newSec) sectionIdMap[s.id] = newSec.id
      } else {
        await supabase.from('proposal_sections').update({
          name: s.name, sort_order: s.sort_order,
          include_labor: s.include_labor, labor_items: s.labor_items || []
        }).eq('id', s.id)
        sectionIdMap[s.id] = s.id
      }
    }
    // Delete removed sections
    const currentSectionIds = editSections.filter(s => !s.isNew).map(s => s.id)
    const originalSectionIds = sections.map(s => s.id)
    const deletedIds = originalSectionIds.filter(id => !currentSectionIds.includes(id))
    for (const sid of deletedIds) {
      await supabase.from('proposal_sections').delete().eq('id', sid)
    }

    const { error: deleteError } = await supabase.from('bom_line_items').delete().eq('proposal_id', id)
    if (deleteError) { alert('Error clearing old line items'); setSaving(false); return }

    const validLines = editLines.filter(l => l.item_name.trim() !== '')
    if (validLines.length > 0) {
      const { error: insertError } = await supabase.from('bom_line_items').insert(
        validLines.map(l => {
          // resolve temp section ids to real ids
          const resolvedSectionId = l.section_id
            ? (sectionIdMap[l.section_id] || l.section_id)
            : null
          return {
            proposal_id: id, item_name: l.item_name, manufacturer: l.manufacturer || null,
            part_number_sku: l.part_number_sku, quantity: parseFloat(l.quantity) || 0, unit: l.unit, category: l.category,
            vendor: l.vendor === '__custom__' ? null : l.vendor,
            your_cost_unit: parseFloat(l.your_cost_unit) || null, markup_percent: parseFloat(l.markup_percent) || null,
            customer_price_unit: parseFloat(l.customer_price_unit) || null,
            customer_price_total: (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0),
            pricing_status: l.your_cost_unit ? 'Confirmed' : 'Needs Pricing', recurring: l.recurring || false,
            section_id: resolvedSectionId,
          }
        })
      )
      if (insertError) { alert('Error saving line items'); setSaving(false); return }
    }

    const bomCustomer = validLines.reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const bomCost = validLines.reduce((sum, l) => sum + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const laborCustomer = laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
    const laborCost = laborItems.reduce((sum, l) => sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const sectionLaborCustomer = editSections.reduce((sum, s) => sum + (s.include_labor ? (s.labor_items || []).reduce((ss, l) => ss + (parseFloat(l.customer_price) || 0), 0) : 0), 0)
    const sectionLaborCost = editSections.reduce((sum, s) => sum + (s.include_labor ? (s.labor_items || []).reduce((ss, l) => ss + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0) : 0), 0)
    const totalCustomer = bomCustomer + laborCustomer + sectionLaborCustomer
    const totalCost = bomCost + laborCost + sectionLaborCost
    const taxRateVal = (!proposal?.tax_exempt && proposal?.tax_rate) ? parseFloat(proposal.tax_rate) : 0
    const taxAmt = Math.round(bomCustomer * (taxRateVal / 100) * 100) / 100
    const grandTotalWithTax = totalCustomer + taxAmt
    const grossMarginDollars = totalCustomer - totalCost
    const grossMarginPercent = totalCustomer > 0 ? (grossMarginDollars / totalCustomer) * 100 : 0

    await supabase.from('proposals').update({
      proposal_value: grandTotalWithTax, total_customer_value: grandTotalWithTax, total_your_cost: totalCost,
      total_gross_margin_dollars: grossMarginDollars, total_gross_margin_percent: grossMarginPercent, labor_items: laborItems,
    }).eq('id', id)

    await fetchLineItems()
    await fetchSections()
    await fetchProposal()
    logActivity(`BOM updated — ${validLines.length} line items`)
    setBulkSelectedLines(new Set())
    setEditSections([])
    setEditingBOM(false)
    setSaving(false)
  }

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const { data: template, error } = await supabase.from('templates').insert({
      org_id: profileData.org_id, name: templateName.trim(), industry: proposal?.industry || '',
      description: proposal?.job_description || '', labor_items: laborItems.filter(l => l.role) || []
    }).select().single()

    if (!error && lineItems.length > 0) {
      await supabase.from('template_line_items').insert(
        lineItems.map(l => ({
          template_id: template.id, item_name: l.item_name, manufacturer: l.manufacturer || null,
          part_number_sku: l.part_number_sku, quantity: l.quantity, unit: l.unit, category: l.category,
          vendor: l.vendor, your_cost_unit: l.your_cost_unit, markup_percent: l.markup_percent, customer_price_unit: l.customer_price_unit,
        }))
      )
    }
    setSavingTemplate(false)
    setShowSaveTemplateModal(false)
    setTemplateName('')
    alert(`Template "${templateName}" saved successfully!`)
  }

  const shareProposal = async (profileId) => {
    setSharingProposal(true)
    const newCollabs = collaborators.includes(profileId) ? collaborators.filter(id => id !== profileId) : [...collaborators, profileId]
    await supabase.from('proposals').update({ collaborator_ids: newCollabs }).eq('id', id)
    setCollaborators(newCollabs)
    setProposal(prev => ({ ...prev, collaborator_ids: newCollabs }))
    const sharedWithProfile = orgProfiles.find(p => p.id === profileId)
    if (!collaborators.includes(profileId) && sharedWithProfile) { logActivity(`Deal shared with ${sharedWithProfile.full_name}`) }
    if (!collaborators.includes(profileId)) {
      const sharedWith = orgProfiles.find(p => p.id === profileId)
      if (sharedWith?.email) {
        try {
          const { data: { session: currentSession } } = await supabase.auth.refreshSession()
          await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followup-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
            body: JSON.stringify({ type: 'share_notification', toEmail: sharedWith.email, toName: sharedWith.full_name, fromName: profile?.full_name || 'A teammate', proposalName: proposal?.proposal_name, proposalId: id })
          })
        } catch (e) { console.log('Share notification error', e) }
      }
    }
    setSharingProposal(false)
  }

  const toggleRecurring = async (itemId, currentValue) => {
    await supabase.from('bom_line_items').update({ recurring: !currentValue }).eq('id', itemId)
    setLineItems(prev => prev.map(l => l.id === itemId ? { ...l, recurring: !currentValue } : l))
    const updatedItems = lineItems.map(l => l.id === itemId ? { ...l, recurring: !currentValue } : l)
    const hasAny = updatedItems.some(l => l.recurring)
    await supabase.from('proposals').update({ has_recurring: hasAny }).eq('id', id)
    setProposal(prev => ({ ...prev, has_recurring: hasAny }))
  }

  const saveRenewalDate = async (itemId, date) => {
    setSavingRenewal(true)
    await supabase.from('bom_line_items').update({ renewal_date: date || null }).eq('id', itemId)
    setLineItems(prev => prev.map(l => l.id === itemId ? { ...l, renewal_date: date } : l))
    setRenewalDates(prev => ({ ...prev, [itemId]: date }))
    setSavingRenewal(false)
  }

  const createOrder = async () => {
    setCreatingOrder(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = await supabase.from('profiles').select('org_id, company_name').eq('id', user.id).single()
      let finalOrderNumber = orderNumber
      if (orderAutoNumber) {
        const { data: org } = await supabase.from('organizations').select('po_counter').eq('id', profileData.org_id).single()
        finalOrderNumber = `ORD-${org.po_counter}`
        await supabase.from('organizations').update({ po_counter: org.po_counter + 1 }).eq('id', profileData.org_id)
      }
      const totalValue = lineItems.reduce((sum, l) => sum + (l.customer_price_total || 0), 0)
      const { data: order, error } = await supabase.from('manufacturer_orders').insert({
        org_id: profileData.org_id, proposal_id: id, order_number: finalOrderNumber, vendor_name: proposal?.company || '',
        status: 'Draft', expected_ship_date: orderExpectedShip || null, ship_to_address: clientAddress || null, total_cost: totalValue
      }).select().single()
      if (error) throw error
      await supabase.from('manufacturer_order_items').insert(
        lineItems.map(l => ({ order_id: order.id, item_name: l.item_name, part_number_sku: l.part_number_sku, quantity: l.quantity, unit: l.unit, your_cost_unit: l.customer_price_unit, total_cost: l.customer_price_total || 0, received_qty: 0, status: 'Pending' }))
      )
      logActivity(`Fulfillment order ${finalOrderNumber} created — ${lineItems.length} items`)
      setShowOrderModal(false)
      setOrderNumber('')
      setOrderExpectedShip('')
      alert(`Order ${finalOrderNumber} created — ${lineItems.length} items ready to fulfill.`)
    } catch (err) { alert('Error creating order: ' + err.message) }
    setCreatingOrder(false)
  }

  const openEditClientModal = async () => {
    setEditClientForm({ client_name: proposal?.client_name || '', company: proposal?.company || '', client_email: proposal?.client_email || '', client_id: proposal?.client_id || '' })
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const { data: clientsData } = await supabase.from('clients').select('id, company, client_name, email').eq('org_id', profileData.org_id).order('company', { ascending: true })
    setAllClients(clientsData || [])
    setShowEditClientModal(true)
  }

  const saveClientInfo = async () => {
    setSavingClient(true)
    const selectedClientId = editClientForm.client_id || null
    let finalForm = { ...editClientForm }
    if (selectedClientId && selectedClientId !== proposal?.client_id) {
      const found = allClients.find(c => c.id === selectedClientId)
      if (found) { finalForm = { ...finalForm, client_name: found.client_name || finalForm.client_name, company: found.company || finalForm.company, client_email: found.email || finalForm.client_email } }
    }
    await supabase.from('proposals').update({ client_id: selectedClientId, client_name: finalForm.client_name, company: finalForm.company, client_email: finalForm.client_email }).eq('id', id)
    if (selectedClientId) { await supabase.from('clients').update({ client_name: finalForm.client_name, company: finalForm.company, email: finalForm.client_email }).eq('id', selectedClientId) }
    setProposal(prev => ({ ...prev, client_id: selectedClientId, client_name: finalForm.client_name, company: finalForm.company, client_email: finalForm.client_email }))
    logActivity('Client info updated')
    setShowEditClientModal(false)
    setSavingClient(false)
  }

  const sendToQBO = async () => {
    setSendingToQBO(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/qbo-create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({ proposalId: id })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setQboInvoiceId(data.invoiceId)
      logActivity(`Invoice sent to QuickBooks${data.invoiceNumber ? ` — #${data.invoiceNumber}` : ''} · $${(data.totalAmt || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`)
      alert(`✓ Invoice created in QuickBooks${data.invoiceNumber ? ` — #${data.invoiceNumber}` : ''}`)
    } catch (err) { alert('QuickBooks error: ' + err.message) }
    setSendingToQBO(false)
  }

  const deleteProposal = async () => {
    if (deleteConfirmText !== proposal?.proposal_name) return
    setDeletingProposal(true)
    const photoData = await supabase.from('proposal_photos').select('url').eq('proposal_id', id)
    for (const photo of (photoData.data || [])) {
      const path = photo.url.split('/proposal-photos/')[1]
      if (path) await supabase.storage.from('proposal-photos').remove([path])
    }
    await supabase.from('proposal_photos').delete().eq('proposal_id', id)
    await supabase.from('activities').delete().eq('proposal_id', id)
    await supabase.from('bom_line_items').delete().eq('proposal_id', id)
    await supabase.from('purchase_orders').delete().eq('proposal_id', id)
    await supabase.from('proposals').delete().eq('id', id)
    navigate('/proposals')
  }

  const fetchPhotos = async () => {
    const { data } = await supabase.from('proposal_photos').select('*').eq('proposal_id', id).order('created_at', { ascending: true })
    setPhotos(data || [])
  }
const generateDealSummary = async () => {
    setGeneratingDealSummary(true)
    setDealSummary(null)
    try {
      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-deal-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({
          proposalName: proposal?.proposal_name,
          company: proposal?.company,
          industry: proposal?.industry,
          status: proposal?.status,
          proposalValue: proposal?.proposal_value,
          totalCost: proposal?.total_your_cost,
          grossMarginPercent: proposal?.total_gross_margin_percent,
          laborItems: laborItems.filter(l => l.role),
          lineItems: lineItems,
          scopeOfWork: proposal?.scope_of_work,
          closeDate: proposal?.close_date,
          sections: sections
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDealSummary(data.summary || null)
    } catch (err) { alert('Error generating deal summary: ' + err.message) }
    setGeneratingDealSummary(false)
  }

const analyzeSpec = async () => {
    if (!specFile) return
    setAnalyzingSpec(true)
    setSpecSummary(null)
    try {
      const reader = new FileReader()
      const fileBase64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(specFile)
      })
      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-read-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({
          fileBase64,
          mediaType: specFile.type,
          industry: proposal?.industry || ''
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSpecSummary(data.summary || null)
      await supabase.from('proposals').update({ spec_summary: data.summary }).eq('id', id)
      logActivity('Spec document analyzed and saved')
    } catch (err) { alert('Error analyzing spec: ' + err.message) }
    setAnalyzingSpec(false)
  }

const analyzeDrawing = async () => {
    if (!drawingFile) return
    setAnalyzingDrawing(true)
    setDrawingPreview([])
    try {
      const reader = new FileReader()
      const fileBase64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(drawingFile)
      })
      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-read-drawing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({
          fileBase64,
          mediaType: drawingFile.type,
          instructions: drawingInstructions || '',
          industry: proposal?.industry || ''
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setDrawingPreview(data.items || [])
    } catch (err) { alert('Error analyzing drawing: ' + err.message) }
    setAnalyzingDrawing(false)
  }

  const applyDrawingBOM = async () => {
    if (drawingPreview.length === 0) return
    const laborItems = drawingPreview.filter(i => i.category === 'Labor')
    const materials = drawingPreview.filter(i => i.category !== 'Labor')
    const newLines = materials.map(item => ({
      proposal_id: id, item_name: item.item_name, part_number_sku: '', quantity: item.quantity,
      unit: item.unit || 'ea', category: item.category || '', vendor: '', your_cost_unit: '',
      markup_percent: '35', customer_price_unit: '', customer_price_total: '',
      pricing_status: 'Needs Pricing', recurring: false
    }))
    setEditLines([...lineItems.map(l => ({ ...l })), ...newLines])
    if (laborItems.length > 0) {
      const newLaborItems = laborItems.map(item => ({
        role: item.item_name, quantity: String(item.quantity),
        unit: item.unit === 'hr' ? 'hr' : item.unit === 'day' ? 'day' : 'lot',
        your_cost: '', markup: 35, customer_price: 0
      }))
      setLaborItems(prev => [...prev.filter(l => l.role), ...newLaborItems])
    }
    setEditingBOM(true)
    setShowDrawingModal(false)
    setDrawingFile(null)
    setDrawingInstructions('')
    setDrawingPreview([])
    logActivity(`Drawing analyzed — ${materials.length} materials, ${laborItems.length} labor items added`)
  }


  const generateAIBOM = async () => {
    if (!aiBOMPrompt.trim()) return
    setGeneratingBOM(true)
    setAIBOMPreview([])
    try {
      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-build-bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({ description: aiBOMPrompt, industry: proposal?.industry || '' })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAIBOMPreview(data.items || [])
    } catch (err) { alert('Error generating BOM: ' + err.message) }
    setGeneratingBOM(false)
  }

  const applyAIBOM = async () => {
    if (aiBOMPreview.length === 0) return
    const laborAI = aiBOMPreview.filter(i => i.category === 'Labor')
    const materialsAI = aiBOMPreview.filter(i => i.category !== 'Labor')
    const newLines = materialsAI.map(item => ({
      proposal_id: id, item_name: item.item_name, part_number_sku: '', quantity: item.quantity, unit: item.unit || 'ea',
      category: item.category || '', vendor: '', your_cost_unit: '', markup_percent: '35', customer_price_unit: '', customer_price_total: '', pricing_status: 'Needs Pricing', recurring: false
    }))
    setEditLines([...lineItems.map(l => ({ ...l })), ...newLines])
    if (laborAI.length > 0) {
      const newLaborItems = laborAI.map(item => ({ role: item.item_name, quantity: String(item.quantity), unit: item.unit === 'hr' ? 'hr' : item.unit === 'day' ? 'day' : 'lot', your_cost: '', markup: 35, customer_price: 0 }))
      setLaborItems(prev => { const existing = prev.filter(l => l.role); return [...existing, ...newLaborItems] })
    }
    setEditingBOM(true)
    setShowAIBOMModal(false)
    setAIBOMPrompt('')
    setAIBOMPreview([])
    logActivity(`AI BOM generated — ${materialsAI.length} materials, ${laborAI.length} labor items added`)
  }

  const uploadPhoto = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${id}/${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('proposal-photos').upload(fileName, file, { upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('proposal-photos').getPublicUrl(fileName)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('proposal_photos').insert({ proposal_id: id, org_id: proposal?.org_id, user_id: user.id, url: urlData.publicUrl, caption: '' })
      await fetchPhotos()
      logActivity(`Site photo added`)
    } catch (err) { alert('Error uploading photo: ' + err.message) }
    setUploadingPhoto(false)
  }

  const deletePhoto = async (photoId, url) => {
    if (!window.confirm('Delete this photo?')) return
    const path = url.split('/proposal-photos/')[1]
    await supabase.storage.from('proposal-photos').remove([path])
    await supabase.from('proposal_photos').delete().eq('id', photoId)
    await fetchPhotos()
  }

  const updatePhotoCaption = async (photoId, caption) => {
    await supabase.from('proposal_photos').update({ caption }).eq('id', photoId)
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, caption } : p))
  }

  const generatePDFDoc = async () => {
    const { data: freshProposal } = await supabase
      .from('proposals')
      .select('hide_material_prices, hide_labor_breakdown, lump_sum_pricing, tax_rate, tax_exempt, scope_of_work, labor_items, proposal_name')
      .eq('id', id)
      .single()
    const p = freshProposal ? { ...proposal, ...freshProposal } : proposal
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')

    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 40, 'F')

    if (profile?.logo_url) {
      const img = new Image()
      img.src = profile.logo_url
      await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
      const maxW = 50, maxH = 26
      const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
      const logoW = img.naturalWidth * ratio
      const logoH = img.naturalHeight * ratio
      const logoY = 8 + (maxH - logoH) / 2
      doc.addImage(img, 'PNG', 14, logoY, logoW, logoH)
    } else {
      doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont('helvetica', 'bold')
      doc.text(profile?.company_name || proposal?.company || 'ForgePt.', 14, 20)
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 98, 42)
      doc.text('Scope it. Send it. Close it.', 14, 30)
    }

    doc.setTextColor(0, 0, 0); doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text(proposal?.proposal_name || 'Proposal', 14, 55)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
    doc.text(`Prepared for: ${proposal?.company || ''} — ${proposal?.client_name || ''}`, 14, 65)
    if (clientAddress) doc.text(`Address: ${clientAddress}`, 14, 72)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, clientAddress ? 79 : 72)

    let yPos = 92

    if (p?.scope_of_work) {
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Scope of Work', 14, yPos)
      yPos += 8
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
      const cleanSOW = p.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim()
      const sowLines = doc.splitTextToSize(cleanSOW, pageWidth - 28)
      doc.text(sowLines, 14, yPos)
      yPos += sowLines.length * 5 + 12
    }

    if (lineItems.length > 0) {
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Materials & Pricing', 14, yPos)
      yPos += 6
      const materialsTotal = lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
      const isLumpSum = p?.hide_material_prices || p?.lump_sum_pricing
      const pdfHead = isLumpSum ? [['Item', 'Part #', 'Qty']] : [['Item', 'Part #', 'Qty', 'Unit Price', 'Total']]
      const pdfRow = (item) => isLumpSum
        ? [item.item_name, item.part_number_sku || '—', item.quantity]
        : [item.item_name, item.part_number_sku || '—', item.quantity, `$${(item.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
      const pdfFoot = (total) => isLumpSum
        ? [['', 'Section Total', `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]]
        : [['', '', '', 'Section Total', `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]]
      const pdfMatFoot = (total) => isLumpSum
        ? [['', 'Materials Total', `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]]
        : [['', '', '', 'Materials Total', `$${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]]
      const tableStyles = { headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 9 }, showFoot: 'lastPage' }

      if (sections.length > 0) {
        // Unsectioned items first
        const unsectioned = lineItems.filter(l => !l.section_id)
        if (unsectioned.length > 0) {
          doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
          doc.text('General', 14, yPos + 4)
          doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
          doc.line(14, yPos + 6, pageWidth - 14, yPos + 6)
          yPos += 8
          const unsecTotal = unsectioned.reduce((s, i) => s + (i.customer_price_total || 0), 0)
          autoTable(doc, { startY: yPos, head: pdfHead, body: unsectioned.map(pdfRow), foot: pdfFoot(unsecTotal), ...tableStyles })
          yPos = doc.lastAutoTable.finalY + 8
        }
        // Each section
        for (const section of sections) {
          const secItems = lineItems.filter(l => l.section_id === section.id)
          const secLabor = section.include_labor ? (section.labor_items || []).filter(l => l.role) : []
          if (secItems.length === 0 && secLabor.length === 0) continue
          const secMatTotal = secItems.reduce((s, i) => s + (i.customer_price_total || 0), 0)
          const secLaborTotal = secLabor.reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0)
          const secTotal = secMatTotal + secLaborTotal
          // Section header bar
          doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
          doc.rect(14, yPos, pageWidth - 28, 8, 'F')
          doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
          doc.text(section.name || 'Untitled Section', 17, yPos + 5.5)
          yPos += 10
          if (secItems.length > 0) {
            autoTable(doc, { startY: yPos, head: pdfHead, body: secItems.map(pdfRow), ...tableStyles, showFoot: false })
            yPos = doc.lastAutoTable.finalY + 4
          }
          if (secLabor.length > 0) {
            doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(100, 100, 100)
            doc.text('Section Labor', 14, yPos + 4); yPos += 6
            const lHead = p?.hide_labor_breakdown ? [['Role', 'Qty', 'Unit']] : [['Role', 'Qty', 'Unit', 'Total Labor']]
            const lRow = (l) => p?.hide_labor_breakdown
              ? [l.role, l.quantity, l.unit || 'hr']
              : [l.role, l.quantity, l.unit || 'hr', `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
            autoTable(doc, { startY: yPos, head: lHead, body: secLabor.map(lRow), ...tableStyles, showFoot: false })
            yPos = doc.lastAutoTable.finalY + 4
          }
          // Section subtotal line
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
          doc.text(`${section.name || 'Section'} Total: $${secTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos, { align: 'right' })
          yPos += 8
        }
      } else {
        // No sections — original flat render
        autoTable(doc, { startY: yPos, head: pdfHead, body: lineItems.map(pdfRow), foot: pdfMatFoot(materialsTotal), ...tableStyles })
      }
    }

    const pdfLaborItems = p?.labor_items || []
    const pdfMaterialsTotal = lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
    const pdfTaxRate = (!p?.tax_exempt && p?.tax_rate) ? parseFloat(p.tax_rate) : 0
    const pdfTaxAmount = Math.round(pdfMaterialsTotal * (pdfTaxRate / 100) * 100) / 100
    const proposalLaborTotal = pdfLaborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
    const sectionLaborTotal = sections.reduce((sum, s) => sum + (s.include_labor ? (s.labor_items || []).reduce((ss, l) => ss + (parseFloat(l.customer_price) || 0), 0) : 0), 0)
    const allLaborTotal = proposalLaborTotal + sectionLaborTotal
    const grandTotal = pdfMaterialsTotal + allLaborTotal + pdfTaxAmount

    if (pdfLaborItems.length > 0 && pdfLaborItems.some(l => l.role)) {
      const tableEnd = sections.length > 0 ? yPos + 6 : (doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : yPos + 12)
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Labor', 14, tableEnd)
      const namedLaborItems = pdfLaborItems.filter(l => l.role)
      const namedLaborTotal = namedLaborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
      if (p?.hide_labor_breakdown) {
        autoTable(doc, {
          startY: tableEnd + 6,
          head: [['Role', 'Qty', 'Unit']],
          body: namedLaborItems.map(l => [l.role, l.quantity, l.unit || 'hr']),
          foot: [['', '', `Total Labor: $${namedLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
          headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
          footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 9 }, showFoot: 'lastPage'
        })
      } else {
        autoTable(doc, {
          startY: tableEnd + 6,
          head: [['Role', 'Qty', 'Unit', 'Total Labor']],
          body: namedLaborItems.map(l => [l.role, l.quantity, l.unit || 'hr', `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]),
          foot: [['', '', 'Total Labor', `$${namedLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
          headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
          footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
          alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 9 }, showFoot: 'lastPage'
        })
      }
      yPos = doc.lastAutoTable.finalY + 8
    } else {
      yPos = sections.length > 0 ? yPos + 4 : (doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : yPos + 10)
    }

    // Grand total summary — always shown
    const pageHeight = doc.internal.pageSize.getHeight()
    const summaryHeight = 16 + (allLaborTotal > 0 ? 7 : 0) + (pdfTaxRate > 0 ? 7 : 0) + 12
    if (yPos + summaryHeight > pageHeight - 20) { doc.addPage(); yPos = 20 }
    const summaryX = pageWidth - 96
    doc.setDrawColor(200, 200, 200)
    doc.line(summaryX, yPos, pageWidth - 14, yPos)
    yPos += 6
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
    doc.text('Materials Total:', summaryX, yPos)
    doc.text(`$${pdfMaterialsTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos, { align: 'right' })
    yPos += 7
    if (allLaborTotal > 0) {
      doc.text('Labor Total:', summaryX, yPos)
      doc.text(`$${allLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos, { align: 'right' })
      yPos += 7
    }
    if (pdfTaxRate > 0) {
      doc.text(`Tax (${pdfTaxRate}% on materials):`, summaryX, yPos)
      doc.text(`$${pdfTaxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos, { align: 'right' })
      yPos += 7
    }
    doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.line(summaryX, yPos - 2, pageWidth - 14, yPos - 2)
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Grand Total:', summaryX, yPos + 4)
    doc.setTextColor(200, 98, 42)
    doc.text(`$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos + 4, { align: 'right' })

    if (profile?.terms_and_conditions) {
      doc.addPage()
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Terms and Conditions', 14, 20)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
      const termsLines = doc.splitTextToSize(profile.terms_and_conditions, pageWidth - 28)
      doc.text(termsLines, 14, 32)
      const tLen = termsLines.length
      const afterTermsY = 32 + tLen * 4.5 + 16
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Accepted and Agreed', 14, afterTermsY)
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60); doc.setDrawColor(180, 180, 180)
      const s1 = afterTermsY + 18
      doc.text('Client Signature:', 14, s1); doc.line(50, s1, 140, s1)
      doc.text('Date:', 150, s1); doc.line(163, s1, pageWidth - 14, s1)
      const s2 = s1 + 20; doc.text('Printed Name:', 14, s2); doc.line(50, s2, pageWidth - 14, s2)
      const s3 = s2 + 20; doc.text('Title:', 14, s3); doc.line(30, s3, pageWidth - 14, s3)
    } else {
      const afterY = yPos + 20
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Accepted and Agreed', 14, afterY)
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60); doc.setDrawColor(180, 180, 180)
      const s1 = afterY + 18
      doc.text('Client Signature:', 14, s1); doc.line(50, s1, 140, s1)
      doc.text('Date:', 150, s1); doc.line(163, s1, pageWidth - 14, s1)
      const s2 = s1 + 20; doc.text('Printed Name:', 14, s2); doc.line(50, s2, pageWidth - 14, s2)
      const s3 = s2 + 20; doc.text('Title:', 14, s3); doc.line(30, s3, pageWidth - 14, s3)
    }

    for (const slaC of slaContracts) {
      doc.addPage()
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text(slaC.name || 'Service Level Agreement', 14, 20)
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, 24, pageWidth - 14, 24)
      let slaY = 34
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60)
      const slaDetails = [
        slaC.response_time_hours ? ['Response Time', `${slaC.response_time_hours} hours`] : null,
        ['Billing', slaC.billing_frequency || 'Quarterly'],
        ['Labor Rate', `$${slaC.labor_rate || 100}/hr`],
        slaC.emergency_rate ? ['Emergency Rate', `$${slaC.emergency_rate}/hr`] : null,
        slaC.maintenance_calls_per_year > 0 ? ['Maintenance Visits', `${slaC.maintenance_calls_per_year}/year included`] : null,
        slaC.initial_fee > 0 ? ['Initial Fee', `$${slaC.initial_fee} (billed with job)`] : null,
        slaC.recurring_fee > 0 ? ['Recurring Fee', `$${slaC.recurring_fee} (${slaC.billing_frequency || 'Quarterly'})`] : null,
        slaC.start_date ? ['Term', `${new Date(slaC.start_date).toLocaleDateString()} – ${slaC.end_date ? new Date(slaC.end_date).toLocaleDateString() : 'TBD'}`] : null,
        slaC.auto_renew ? ['Auto-Renew', 'Yes'] : null,
      ].filter(Boolean)
      slaDetails.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, 14, slaY)
        doc.setFont('helvetica', 'normal'); doc.text(value, 70, slaY)
        slaY += 7
      })
      if (slaC.body) {
        slaY += 4
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
        const resolvedSLABody = slaC.body
          .replace(/\{\{companyName\}\}/g, profile?.company_name || proposal?.company || '')
          .replace(/\{\{clientName\}\}/g, proposal?.company || '')
          .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
          .replace(/\{\{tierName\}\}/g, slaC.tier_name || slaC.name || '')
          .replace(/\{\{responseTime\}\}/g, slaC.response_time_hours ? `${slaC.response_time_hours} hours` : 'as scheduled')
          .replace(/\{\{billingFrequency\}\}/g, slaC.billing_frequency || 'Quarterly')
          .replace(/\{\{laborRate\}\}/g, `${slaC.labor_rate || 100}`)
          .replace(/\{\{emergencyRate\}\}/g, `${slaC.emergency_rate || 150}`)
          .replace(/\{\{maintenanceCalls\}\}/g, `${slaC.maintenance_calls_per_year || 0}`)
          .replace(/\{\{initialFee\}\}/g, `${slaC.initial_fee || 0}`)
          .replace(/\{\{recurringFee\}\}/g, `${slaC.recurring_fee || 0}`)
        const bodyLines = doc.splitTextToSize(resolvedSLABody, pageWidth - 28)
        doc.text(bodyLines, 14, slaY)
        slaY += bodyLines.length * 4.5 + 10
      } else { slaY += 10 }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Service Agreement Acceptance', 14, slaY)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60); doc.setDrawColor(180, 180, 180)
      const ss1 = slaY + 14
      doc.text('Client Signature:', 14, ss1); doc.line(50, ss1, 140, ss1)
      doc.text('Date:', 150, ss1); doc.line(163, ss1, pageWidth - 14, ss1)
      const ss2 = ss1 + 16; doc.text('Printed Name:', 14, ss2); doc.line(50, ss2, pageWidth - 14, ss2)
    }

    for (const monC of monitoringContracts) {
      doc.addPage()
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text(monC.name || 'Monitoring Contract', 14, 20)
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, 24, pageWidth - 14, 24)
      let monY = 34
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60)
      const monDetails = [
        ['Monthly Fee', `$${monC.monthly_fee || 49}/mo`],
        ['Monitored Systems', monC.monitored_systems || '—'],
        ['Billing Frequency', monC.billing_frequency || 'Monthly'],
        ['Escalation Contacts', monC.escalation_contacts || '2'],
        monC.start_date ? ['Term', `${new Date(monC.start_date).toLocaleDateString()} – ${monC.end_date ? new Date(monC.end_date).toLocaleDateString() : 'TBD'}`] : null,
        monC.auto_renew ? ['Auto-Renew', 'Yes'] : null,
      ].filter(Boolean)
      monDetails.forEach(([label, value]) => {
        doc.setFont('helvetica', 'bold'); doc.text(`${label}:`, 14, monY)
        doc.setFont('helvetica', 'normal'); doc.text(String(value), 70, monY)
        monY += 7
      })
      if (monC.body) {
        monY += 4
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
        const resolvedMonBody = monC.body
          .replace(/\{\{companyName\}\}/g, profile?.company_name || proposal?.company || '')
          .replace(/\{\{clientName\}\}/g, proposal?.company || '')
          .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
          .replace(/\{\{monthlyFee\}\}/g, `${monC.monthly_fee || 49}`)
          .replace(/\{\{monitoredSystems\}\}/g, monC.monitored_systems || '')
          .replace(/\{\{billingFrequency\}\}/g, monC.billing_frequency || 'Monthly')
          .replace(/\{\{escalationContacts\}\}/g, `${monC.escalation_contacts || 2}`)
        const monBodyLines = doc.splitTextToSize(resolvedMonBody, pageWidth - 28)
        doc.text(monBodyLines, 14, monY)
        monY += monBodyLines.length * 4.5 + 10
      } else { monY += 10 }
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Monitoring Contract Acceptance', 14, monY)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60); doc.setDrawColor(180, 180, 180)
      const ms1 = monY + 14
      doc.text('Client Signature:', 14, ms1); doc.line(50, ms1, 140, ms1)
      doc.text('Date:', 150, ms1); doc.line(163, ms1, pageWidth - 14, ms1)
      const ms2 = ms1 + 16; doc.text('Printed Name:', 14, ms2); doc.line(50, ms2, pageWidth - 14, ms2)
    }

    if (photos && photos.length > 0) {
      doc.addPage()
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Site Photos', 14, 20)
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, 23, pageWidth - 14, 23)
      let photoX = 14, photoY = 30
      const photoWidth = (pageWidth - 42) / 2
      const photoHeight = 60
      for (let i = 0; i < photos.length; i++) {
        try {
          const response = await fetch(photos[i].url)
          const blob = await response.blob()
          const base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob) })
          const ext = photos[i].url.split('.').pop()?.split('?')[0]?.toUpperCase() || 'JPEG'
          const imgFormat = ['PNG', 'JPG', 'JPEG', 'WEBP'].includes(ext) ? ext : 'JPEG'
          doc.addImage(base64, imgFormat === 'JPG' ? 'JPEG' : imgFormat, photoX, photoY, photoWidth, photoHeight)
          if (photos[i].caption) { doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100); doc.text(photos[i].caption, photoX, photoY + photoHeight + 4, { maxWidth: photoWidth }) }
          if (i % 2 === 0) { photoX = photoX + photoWidth + 14 } else { photoX = 14; photoY = photoY + photoHeight + 16; if (photoY > 250) { doc.addPage(); photoY = 20 } }
        } catch (e) { console.log('Photo load error:', e) }
      }
    }
    return doc
  }

  const sendProposal = async () => {
    if (!proposal?.client_email) { alert('No client email on this proposal.'); return }
    setSendingProposal(true)
    try {
      const pdfDoc = await generatePDFDoc()
      const pdfBase64 = pdfDoc.output('datauristring').split(',')[1]
      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({
          proposalId: id, clientEmail: proposal.client_email, clientName: proposal.client_name || 'there',
          repName: proposal.rep_name || profile?.full_name || '', repEmail: proposal.rep_email || profile?.email || '',
          companyName: profile?.company_name || proposal.company || '', proposalName: proposal.proposal_name || 'Proposal',
          subject: sendForm.subject, message: sendForm.message, logoUrl: profile?.logo_url || null, pdfBase64
        })
      })
      setProposal(prev => ({ ...prev, status: 'Sent' }))
      logActivity(`Proposal sent to ${proposal.client_email}`)
      setShowSendModal(false)
      setSendForm({ subject: '', message: '' })
    } catch (err) { console.error('Send proposal error:', err); alert('Error sending proposal: ' + err.message) }
    setSendingProposal(false)
  }

  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'
  const categories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Labor', 'Roofing Materials', 'Insulation', 'Windows & Doors', 'Flooring', 'Painting & Finishing', 'Plumbing', 'HVAC', 'Solar', 'Hardware', 'Other']

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />
      <div className="flex-1 p-6 space-y-6">
        {contractNotification && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 text-lg">ℹ</span>
              <p className="text-blue-300 text-sm font-medium">{contractNotification}</p>
            </div>
            <button onClick={() => setContractNotification(null)} className="text-[#8A9AB0] hover:text-white text-xl leading-none">×</button>
          </div>
        )}

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div>
              {editingProposalName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={proposalNameDraft}
                    onChange={e => setProposalNameDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveProposalName(); if (e.key === 'Escape') setEditingProposalName(false) }}
                    className="bg-[#0F1C2E] text-white text-2xl font-bold border-b-2 border-[#C8622A] focus:outline-none px-1 w-96"
                  />
                  <button onClick={saveProposalName} className="text-[#C8622A] text-sm font-semibold hover:text-white transition-colors">Save</button>
                  <button onClick={() => setEditingProposalName(false)} className="text-[#8A9AB0] text-sm hover:text-white transition-colors">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h2 className="text-white text-2xl font-bold">{proposal?.proposal_name}</h2>
                  <button onClick={() => { setProposalNameDraft(proposal?.proposal_name || ''); setEditingProposalName(true) }}
                    className="opacity-0 group-hover:opacity-100 text-[#8A9AB0] hover:text-white text-xs transition-all">✏️</button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[#8A9AB0]">{proposal?.company} · {proposal?.client_name}</p>
                <button onClick={openEditClientModal} className="text-[#8A9AB0] hover:text-[#C8622A] text-xs transition-colors" title="Edit client info">✏️</button>
              </div>
              <p className="text-[#8A9AB0] text-sm">{proposal?.client_email}</p>
              {locationName && <span className="inline-flex items-center gap-1 bg-[#2a3d55] text-[#8A9AB0] text-xs px-2 py-0.5 rounded-full mt-1">📍 {locationName}</span>}
              {proposal?.signature_name && (
                <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full mt-1">
                  <span>✍️</span>
                  <span>Signed by {proposal.signature_name} · {proposal.signature_at ? new Date(proposal.signature_at).toLocaleDateString() : ''}</span>
                </div>
              )}
              {collaborators.length > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[#8A9AB0] text-xs">Shared with:</span>
                  {collaborators.map(cid => {
                    const cp = orgProfiles.find(p => p.id === cid)
                    return cp ? <span key={cid} className="bg-[#C8622A]/20 text-[#C8622A] text-xs px-2 py-0.5 rounded-full">{cp.full_name}</span> : null
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowShareModal(true)} className="bg-[#2a3d55] text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-[#3a4d65] transition-colors flex items-center gap-1">
                👥 Share{collaborators.length > 0 ? ` (${collaborators.length})` : ''}
              </button>
              {isAdmin && proposal?.status !== 'Won' && (
                <button onClick={() => { setDeleteConfirmText(''); setShowDeleteModal(true) }} className="bg-red-900/30 text-red-400 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-red-900/50 transition-colors">Delete</button>
              )}
              <select value={proposal?.status} onChange={e => updateStatus(e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                {['Draft', 'Sent', 'Won', 'Lost'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-4 mt-6">
            <div><p className="text-[#8A9AB0] text-xs">Rep</p><p className="text-white text-sm font-medium">{proposal?.rep_name}</p></div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Quote #</p>
              {editingQuoteNumber ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={quoteNumberDraft}
                      onChange={e => { setQuoteNumberDraft(e.target.value); setQuoteNumberError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') saveQuoteNumber(); if (e.key === 'Escape') { setEditingQuoteNumber(false); setQuoteNumberError('') } }}
                      className="w-24 bg-[#0F1C2E] text-white border border-[#C8622A]/50 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-[#C8622A]"
                      autoFocus
                    />
                    <button onClick={saveQuoteNumber} className="text-green-400 hover:text-green-300 text-xs">✓</button>
                    <button onClick={() => { setEditingQuoteNumber(false); setQuoteNumberError('') }} className="text-[#8A9AB0] hover:text-white text-xs">✕</button>
                  </div>
                  {quoteNumberError && <p className="text-red-400 text-xs">{quoteNumberError}</p>}
                </div>
              ) : (
                <button
                  onClick={() => { setQuoteNumberDraft(proposal?.quote_number || ''); setEditingQuoteNumber(true) }}
                  className="text-white text-sm font-medium hover:text-[#C8622A] transition-colors group flex items-center gap-1"
                  title="Click to edit quote number">
                  {proposal?.quote_number || <span className="text-[#8A9AB0] italic">Add #</span>}
                  <span className="text-[#2a3d55] group-hover:text-[#C8622A] text-xs transition-colors">✏️</span>
                </button>
              )}
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs">Close Date</p>
              <input type="date" value={proposal?.close_date || ''} onChange={e => updateCloseDate(e.target.value)} className="bg-transparent text-white text-sm font-medium focus:outline-none focus:border-b focus:border-[#C8622A] cursor-pointer" />
            </div>
            <div><p className="text-[#8A9AB0] text-xs">Industry</p><p className="text-white text-sm font-medium">{proposal?.industry}</p></div>
            <div><p className="text-[#8A9AB0] text-xs">Margin</p><p className="text-[#C8622A] text-sm font-medium">{proposal?.total_gross_margin_percent ? `${proposal.total_gross_margin_percent.toFixed(1)}%` : '—'}</p></div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Tax Exempt</p>
              <button onClick={() => updateTaxExempt(!proposal?.tax_exempt)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${proposal?.tax_exempt ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-[#0F1C2E] text-[#8A9AB0] border border-[#2a3d55] hover:text-white'}`}>
                {proposal?.tax_exempt ? 'Exempt' : 'Taxable'}
              </button>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs mb-1">Tax Rate %</p>
              {proposal?.tax_exempt ? (
                <p className="text-[#8A9AB0] text-sm">—</p>
              ) : (
                <input type="number" step="0.01" placeholder="e.g. 8.5" value={proposal?.tax_rate ?? ''}
                  onChange={e => updateTaxRate(e.target.value)}
                  className="w-full bg-transparent text-white text-sm font-medium border-b border-[#2a3d55] focus:outline-none focus:border-[#C8622A]" />
              )}
            </div>
          </div>
        </div>

        {/* Scope of Work */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-lg">Scope of Work</h3>
            <div className="flex gap-2 flex-wrap">
              {featureSendProposal && proposal?.client_email && (
                <button onClick={() => { setSendForm({ subject: `Proposal: ${proposal.proposal_name}`, message: `Hi ${proposal.client_name || 'there'},\n\nPlease find your proposal attached. Don't hesitate to reach out with any questions.\n\nLooking forward to working with you.` }); setShowSendModal(true) }}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
                  ✉ Send Proposal
                </button>
              )}
              {proposal?.client_email && proposal?.status === 'Sent' && !proposal?.signature_name && (
                <button onClick={requestSignature} disabled={requestingSignature}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
                  {requestingSignature ? 'Sending...' : '✍️ Request Signature'}
                </button>
              )}
              {proposal?.signed_pdf_url && (
                <a href={proposal.signed_pdf_url} target="_blank" rel="noopener noreferrer"
                  className="bg-green-600/20 text-green-400 border border-green-600/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-600/30 transition-colors flex items-center gap-1">
                  ⬇ Signed Copy
                </a>
              )}
              <label className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1 ${uploadingSignedPDF ? 'bg-[#2a3d55] text-[#8A9AB0] opacity-50 cursor-not-allowed' : 'bg-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}
                title="Upload a physically signed or externally signed agreement PDF">
                {uploadingSignedPDF ? 'Uploading...' : '📎 Upload Signed'}
                <input type="file" accept=".pdf" onChange={uploadSignedPDF} className="hidden" disabled={uploadingSignedPDF} />
              </label>
              {qboConnected && proposal?.status === 'Won' && (
                <button onClick={sendToQBO} disabled={sendingToQBO}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${qboInvoiceId ? 'bg-green-600/20 text-green-400 border border-green-600/30' : 'bg-[#2CA01C] text-white hover:bg-[#259018]'}`}>
                  {sendingToQBO ? 'Sending...' : qboInvoiceId ? '✓ In QuickBooks' : '🟢 Send to QuickBooks'}
                </button>
              )}
              <button onClick={() => setShowPricingModal(true)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${(proposal?.hide_material_prices || proposal?.hide_labor_breakdown) ? 'bg-[#C8622A] text-white' : 'bg-[#2a3d55] text-[#8A9AB0] hover:text-white'}`}>
                ⚙ Pricing
              </button>
              <button onClick={downloadPDF} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">↓ PDF</button>
              <button onClick={downloadDOCX} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">↓ DOCX</button>
              {featureSitePhotos && (
                <button onClick={() => setShowPhotosModal(true)} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors flex items-center gap-2">
                  📷 Photos{photos.length > 0 ? ` (${photos.length})` : ''}
                </button>
              )}
              <button onClick={generateSOW} disabled={generatingSOW} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {generatingSOW ? 'Generating...' : proposal?.scope_of_work ? 'Regenerate SOW' : 'Generate SOW'}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-white text-sm font-semibold block mb-1">AI Notes (Optional)</label>
            <p className="text-[#8A9AB0] text-xs mb-2">Describe what you want the Scope of Work to include, how it should sound, or anything important.</p>
            <textarea value={aiNotes} onChange={e => setAiNotes(e.target.value)}
              placeholder="Example: This is for a commercial install. Keep it professional, emphasize safety, and make it easy for a non-technical client to understand."
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] min-h-[100px]" />
          </div>

          {editingSOW ? (
            <div className="space-y-3">
              <textarea
                value={sowDraft}
                onChange={e => setSowDraft(e.target.value)}
                rows={14}
                className="w-full bg-[#0F1C2E] text-white border border-[#C8622A]/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-y leading-relaxed"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditingSOW(false)} className="px-4 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveSOW} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Save SOW</button>
              </div>
            </div>
          ) : proposal?.scope_of_work ? (
            <div className="relative group">
              <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{proposal.scope_of_work}</p>
              <button
                onClick={() => { setSowDraft(proposal.scope_of_work); setEditingSOW(true) }}
                className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[#2a3d55] text-[#8A9AB0] hover:text-white px-2 py-1 rounded text-xs">
                ✏️ Edit
              </button>
            </div>
          ) : (
            <p className="text-[#8A9AB0] text-sm">No Scope of Work yet. Click Generate SOW to create one.</p>
          )}
        </div>

        {/* BOM */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="mb-4 relative">
          <input
            type="text"
            placeholder="🔍 Search product library..."
            value={librarySearch}
            onChange={e => { setShowLibrarySearch(true); searchLibrary(e.target.value) }}
            onFocus={() => setShowLibrarySearch(true)}
            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
          />
          {librarySearch && (
            <button onClick={() => { setLibrarySearch(''); setLibraryResults([]); setShowLibrarySearch(false) }}
              className="absolute right-3 top-2.5 text-[#8A9AB0] hover:text-white text-lg leading-none">×</button>
          )}
          {showLibrarySearch && (libraryLoading || libraryResults.length > 0) && (
            <div className="absolute top-full left-0 right-0 z-40 bg-[#1a2d45] border border-[#2a3d55] rounded-xl mt-1 max-h-96 overflow-y-auto shadow-2xl">
              {libraryLoading ? (
                <p className="text-[#8A9AB0] text-sm p-4">Searching...</p>
              ) : (
                <>
                  <div className="p-3 space-y-1">
                    {libraryResults.map(prod => {
                      const prices = (prod.product_library_pricing || []).sort((a, b) => a.your_cost - b.your_cost)
                      const selected = librarySelectedVendor[prod.id] || prices[0]
                      const isChecked = librarySelectedItems.has(prod.id)
                      return (
                        <div key={prod.id}
                          className={`rounded-lg p-3 border transition-colors cursor-pointer ${isChecked ? 'border-[#C8622A] bg-[#C8622A]/5' : 'border-[#2a3d55] hover:border-[#3a4d65]'}`}
                          onClick={() => setLibrarySelectedItems(prev => { const next = new Set(prev); next.has(prod.id) ? next.delete(prod.id) : next.add(prod.id); return next })}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              <input type="checkbox" checked={isChecked} readOnly className="accent-[#C8622A] mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-white text-sm font-semibold truncate">{prod.item_name}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {prod.manufacturer && <span className="text-[#8A9AB0] text-xs">{prod.manufacturer}</span>}
                                  {prod.part_number && <span className="text-[#8A9AB0] text-xs font-mono bg-[#0F1C2E] px-1.5 py-0.5 rounded">{prod.part_number}</span>}
                                  {prod.category && <span className="text-[#8A9AB0] text-xs">{prod.category}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 text-right" onClick={e => e.stopPropagation()}>
                              {prices.length === 0 ? (
                                <span className="text-[#2a3d55] text-xs">No pricing</span>
                              ) : prices.length === 1 ? (
                                <div>
                                  <p className="text-[#C8622A] text-sm font-semibold">${Number(prices[0].your_cost).toFixed(2)}</p>
                                  <p className="text-[#8A9AB0] text-xs">{prices[0].vendor}</p>
                                  {(() => { const days = prices[0].pricing_date ? Math.floor((new Date() - new Date(prices[0].pricing_date)) / (1000 * 60 * 60 * 24)) : null; if (days > 120) return <span className="text-xs text-red-400">⚠ Stale — will RFQ</span>; if (days > 30) return <span className="text-xs text-yellow-400">{days}d old</span>; return <span className="text-xs text-green-400">Current</span> })()}
                                </div>
                              ) : (
                                <div>
                                  <select
                                    value={selected?.id || ''}
                                    onChange={e => { const picked = prices.find(p => p.id === e.target.value); setLibrarySelectedVendor(prev => ({ ...prev, [prod.id]: picked })) }}
                                    className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] mb-1"
                                  >
                                    {prices.map(p => <option key={p.id} value={p.id}>{p.vendor} — ${Number(p.your_cost).toFixed(2)}</option>)}
                                  </select>
                                  {(() => {
                                    if (!selected || prices.length < 2) return null
                                    const best = prices[0]
                                    if (best.id === selected.id) return null
                                    const pct = ((selected.your_cost - best.your_cost) / best.your_cost * 100)
                                    if (pct > 5) return null
                                    return <p className="text-blue-400 text-xs">💡 {best.vendor} is {pct.toFixed(1)}% less (${Number(best.your_cost).toFixed(2)})</p>
                                  })()}
                                  {(() => { const days = selected?.pricing_date ? Math.floor((new Date() - new Date(selected.pricing_date)) / (1000 * 60 * 60 * 24)) : null; if (days > 120) return <span className="text-xs text-red-400 block">⚠ Stale — will RFQ</span>; if (days > 30) return <span className="text-xs text-yellow-400 block">{days}d old</span>; return <span className="text-xs text-green-400 block">Current</span> })()}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {librarySelectedItems.size > 0 && (
                    <div className="border-t border-[#2a3d55] px-4 py-3 flex items-center justify-between sticky bottom-0 bg-[#1a2d45]">
                      <p className="text-[#8A9AB0] text-xs">{librarySelectedItems.size} item{librarySelectedItems.size !== 1 ? 's' : ''} selected</p>
                      <button onClick={addLibraryItemsToBOM} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Add to BOM →</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-lg">BOM Line Items ({lineItems.length})</h3>
            {!editingBOM ? (
              <div className="flex gap-2 flex-wrap">
                {proposal?.status === 'Won' && lineItems.length > 0 && orgType === 'manufacturer' && (
                  <button onClick={() => setShowOrderModal(true)} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">🏭 Convert to Order</button>
                )}
                {orgType !== 'manufacturer' && (
                  <button onClick={() => selectedForPO.size > 0 && setShowPOModal(true)}
                    disabled={selectedForPO.size === 0}
                    title={selectedForPO.size === 0 ? 'Check items below to select for PO' : `Generate PO for ${selectedForPO.size} items`}
                    className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {selectedForPO.size > 0 ? `Generate PO (${selectedForPO.size})` : 'Generate PO'}
                  </button>
                )}
                {orgType !== 'manufacturer' && (
                  <button onClick={openRFQModal} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">Send All RFQs</button>
                )}
                <button onClick={() => { setTemplateName(proposal?.proposal_name || ''); setShowSaveTemplateModal(true) }} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">Save as Template</button>
                {featureAiBom && (
                  <>
                  <button onClick={() => setShowAIBOMModal(true)} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">✨ AI Build BOM</button>
                  <button onClick={() => { setShowDrawingModal(true); setDrawingInstructions(proposal?.industry === 'Security' ? 'Focus on cameras, access control readers, door contacts, and NVR/DVR equipment.' : proposal?.industry === 'Audio/Visual' ? 'Focus on displays, speakers, amplifiers, source equipment, and cable runs.' : '') }} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">📐 Read Drawing</button>
                  <button onClick={() => { setShowSpecModal(true); setSpecSummary(proposal?.spec_summary || null) }} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">📋 Read Spec</button>
<button onClick={() => { setShowDealSummaryModal(true); setDealSummary(null) }} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors">🧠 Deal Summary</button>
                  </>
                )}
                <button onClick={startEditing} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">Edit BOM</button>
                <label className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors cursor-pointer">
                  Upload Excel
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
                </label>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditingBOM(false)} className="px-4 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={saveBOM} disabled={saving} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{saving ? 'Saving...' : 'Save BOM'}</button>
              </div>
            )}
          </div>

         {/* BOM View Mode */}
          {!editingBOM ? (
            lineItems.length === 0 ? (
              <p className="text-[#8A9AB0]">No line items yet. Click Edit BOM to add items.</p>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const ViewTable = ({ items }) => (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#2a3d55]">
                            <th className="py-2 pr-2 w-8">
                              <input type="checkbox" className="accent-[#C8622A]"
                                checked={items.filter(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing').every(l => selectedForPO.has(l.id)) && items.some(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing')}
                                onChange={() => {
                                  const orderable = items.filter(l => !l.po_status || l.po_status === 'Confirmed' || l.po_status === 'Needs Pricing')
                                  const allSelected = orderable.every(l => selectedForPO.has(l.id))
                                  setSelectedForPO(prev => {
                                    const next = new Set(prev)
                                    orderable.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id))
                                    return next
                                  })
                                }} />
                            </th>
                            <th className="text-[#8A9AB0] text-left py-2 pr-4">Item</th>
                            <th className="text-[#8A9AB0] text-left py-2 pr-4">Mfr</th>
                            <th className="text-[#8A9AB0] text-left py-2 pr-4">Part #</th>
                            <th className="text-[#8A9AB0] text-left py-2 pr-4">Category</th>
                            <th className="text-[#8A9AB0] text-left py-2 pr-4">Vendor</th>
                            <th className="text-[#8A9AB0] text-right py-2 pr-4">Qty</th>
                            <th className="text-[#8A9AB0] text-right py-2 pr-4">Unit Price</th>
                            <th className="text-[#8A9AB0] text-right py-2 pr-4">Total</th>
                            <th className="text-[#8A9AB0] text-left py-2">Status</th>
                            <th className="text-[#8A9AB0] text-center py-2 pr-2">🔄</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => {
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
                                <td className="text-white py-3 pr-4">{item.item_name}</td>
                                <td className="text-[#8A9AB0] py-3 pr-4">{item.manufacturer || '—'}</td>
                                <td className="text-[#8A9AB0] py-3 pr-4">{item.part_number_sku || '—'}</td>
                                <td className="text-[#8A9AB0] py-3 pr-4">{item.category}</td>
                                <td className="text-[#8A9AB0] py-3 pr-4">{item.vendor}</td>
                                <td className="text-white py-3 pr-4 text-right">{item.quantity}</td>
                                <td className="text-white py-3 pr-4 text-right">${fmt(item.customer_price_unit)}</td>
                                <td className="text-white py-3 pr-4 text-right">${fmt(item.customer_price_total)}</td>
                                <td className="py-3">
                                  <div className="flex flex-col gap-1">
                                    <span className={`text-xs font-semibold px-2 py-1 rounded ${item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' : item.pricing_status === 'RFQ Sent' ? 'bg-yellow-500/20 text-yellow-400' : item.pricing_status === 'Confirmed' ? 'bg-green-500/20 text-green-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                                      {item.po_status || item.pricing_status}
                                    </span>
                                    {item.rfq_expires_at && item.pricing_status === 'RFQ Sent' && (() => {
                                      const expired = new Date(item.rfq_expires_at) < new Date()
                                      return expired ? <span className="text-xs font-semibold px-2 py-1 rounded bg-red-500/20 text-red-400">⚠ Pricing Expired</span> : <span className="text-xs px-2 py-0.5 rounded bg-[#2a3d55] text-[#8A9AB0]">Exp {new Date(item.rfq_expires_at).toLocaleDateString()}</span>
                                    })()}
                                  </div>
                                </td>
                                <td className="py-3 pr-2 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <input type="checkbox" checked={!!item.recurring} onChange={() => toggleRecurring(item.id, !!item.recurring)} className="accent-[#C8622A] cursor-pointer" title="Mark as recurring" />
                                    {item.recurring && proposal?.status === 'Won' && (
                                      <input type="date" value={renewalDates[item.id] || item.renewal_date || ''} onChange={e => saveRenewalDate(item.id, e.target.value)}
                                        className="bg-[#0F1C2E] text-[#C8622A] border border-[#C8622A]/40 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#C8622A] w-28" />
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )

                  const unsectioned = lineItems.filter(l => !l.section_id)
                  const materialsTotal = lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
                  const laborTotal = proposal?.labor_items?.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0) || 0
                  const taxRate = (!proposal?.tax_exempt && proposal?.tax_rate) ? parseFloat(proposal.tax_rate) : 0
                  const taxAmount = materialsTotal * (taxRate / 100)
                  const grandTotal = materialsTotal + laborTotal + taxAmount

                  return (
                    <>
                      {/* Unsectioned items */}
                      {unsectioned.length > 0 && (
                        <div>
                          {sections.length > 0 && (
                            <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">General</p>
                          )}
                          <ViewTable items={unsectioned} />
                        </div>
                      )}

                      {/* Sectioned items */}
                      {sections.map(section => {
                        const secItems = lineItems.filter(l => l.section_id === section.id)
                        if (secItems.length === 0 && (!section.labor_items || section.labor_items.length === 0)) return null
                        const secMat = secItems.reduce((s, l) => s + (l.customer_price_total || 0), 0)
                        const secLab = section.include_labor ? (section.labor_items || []).reduce((s, l) => s + (parseFloat(l.customer_price) || 0), 0) : 0
                        const secTotal = secMat + secLab
                        return (
                          <div key={section.id} className="border border-[#2a3d55] rounded-xl overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-3 bg-[#0F1C2E] border-b border-[#2a3d55]">
                              <div className="flex items-center gap-2">
                                <div className="w-1.5 h-5 rounded-full bg-[#C8622A]" />
                                <span className="text-white font-semibold text-sm">{section.name || 'Untitled Section'}</span>
                              </div>
                              <span className="text-[#8A9AB0] text-xs">Section Total: <span className="text-white font-bold">${secTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></span>
                            </div>
                            <div className="p-4">
                              {secItems.length > 0 && <ViewTable items={secItems} />}
                              {section.include_labor && (section.labor_items || []).filter(l => l.role).length > 0 && (
                                <div className="mt-4 pt-4 border-t border-[#2a3d55]">
                                  <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Section Labor</p>
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-[#2a3d55]">
                                        {['Role', 'Qty', 'Unit', 'Total'].map(h => <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>)}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(section.labor_items || []).filter(l => l.role).map((l, i) => (
                                        <tr key={i} className="border-b border-[#2a3d55]/30">
                                          <td className="text-white py-2 pr-4">{l.role}</td>
                                          <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                          <td className="text-[#8A9AB0] py-2 pr-4">{l.unit || 'hr'}</td>
                                          <td className="text-white py-2 pr-4">${fmt(parseFloat(l.customer_price) || 0)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}

                      {/* Global Labor — items not assigned to a section */}
                      {proposal?.labor_items?.filter(l => l.role).length > 0 && (
                        <div className="border border-[#2a3d55] rounded-xl overflow-hidden">
                          <div className="px-4 py-3 bg-[#0F1C2E] border-b border-[#2a3d55]">
                            <span className="text-white font-semibold text-sm">Labor</span>
                          </div>
                          <div className="p-4">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-[#2a3d55]">
                                  {['Role','Qty','Unit','Total'].map(h => <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {proposal.labor_items.filter(l => l.role).map((l, i) => (
                                  <tr key={i} className="border-b border-[#2a3d55]/30">
                                    <td className="text-white py-2 pr-4">{l.role}</td>
                                    <td className="text-[#8A9AB0] py-2 pr-4">{l.quantity}</td>
                                    <td className="text-[#8A9AB0] py-2 pr-4">{l.unit || 'hr'}</td>
                                    <td className="text-white py-2 pr-4">${fmt(parseFloat(l.customer_price) || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Grand totals */}
                      {(() => {
                        const sectionLaborTotal = sections.reduce((sum, s) => sum + (s.include_labor ? (s.labor_items || []).reduce((ss, l) => ss + (parseFloat(l.customer_price) || 0), 0) : 0), 0)
                        const adjustedGrandTotal = materialsTotal + laborTotal + sectionLaborTotal + taxAmount
                        return (
                      <table className="w-full text-sm">
                        <tfoot>
                          <tr><td colSpan="6" className="text-[#8A9AB0] pt-4 text-right font-semibold">Materials Total</td><td className="text-white pt-4 text-right font-bold pr-4">${materialsTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>
                          {laborTotal > 0 && <tr><td colSpan="6" className="text-[#8A9AB0] pt-1 text-right font-semibold">General Labor</td><td className="text-white pt-1 text-right font-bold pr-4">${laborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>}
                          {sectionLaborTotal > 0 && <tr><td colSpan="6" className="text-[#8A9AB0] pt-1 text-right font-semibold">Section Labor</td><td className="text-white pt-1 text-right font-bold pr-4">${sectionLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>}
                          {taxRate > 0 && <tr><td colSpan="6" className="text-[#8A9AB0] pt-1 text-right font-semibold">Tax ({taxRate}% on materials)</td><td className="text-white pt-1 text-right font-bold pr-4">${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>}
                          <tr className="border-t border-[#2a3d55]"><td colSpan="6" className="text-[#8A9AB0] pt-3 text-right font-semibold">Grand Total</td><td className="text-[#C8622A] pt-3 text-right font-bold text-lg pr-4">${adjustedGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td></td></tr>
                        </tfoot>
                      </table>
                        )
                      })()}
                    </>
                  )
                })()}
              </div>
            )
          ) : (
           /* BOM Edit Mode */
            <div>
              {/* Add Section Button */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-[#8A9AB0] text-xs">
                  {editSections.length > 0 ? `${editSections.length} section${editSections.length !== 1 ? 's' : ''} — items without a section appear in General` : 'No sections — add a section to group items by area or system'}
                </p>
                <button onClick={addSection} className="bg-[#2a3d55] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#3a4d65] transition-colors">
                  + Add Section
                </button>
              </div>

              {/* Bulk Edit Bar */}
              <div className="flex items-center gap-2 mb-4 p-3 bg-[#0F1C2E] rounded-lg border border-[#2a3d55] flex-wrap">
                <span className="text-[#8A9AB0] text-xs font-semibold whitespace-nowrap">
                  Bulk Edit {bulkSelectedLines.size > 0 ? <span className="text-[#C8622A]">({bulkSelectedLines.size} selected)</span> : <span className="text-[#2a3d55]">(check rows below)</span>}
                </span>
                <select value={bulkField} onChange={e => { setBulkField(e.target.value); setBulkValue('') }}
                  className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                  <option value="">— Field —</option>
                  <option value="manufacturer">Manufacturer</option>
                  <option value="category">Category</option>
                  <option value="vendor">Vendor</option>
                  <option value="markup_percent">Markup %</option>
                  {editSections.length > 0 && <option value="section">Move to Section</option>}
                </select>
                {bulkField === 'category' ? (
                  <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                    <option value="">— Category —</option>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                ) : bulkField === 'vendor' ? (
                  <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                    <option value="">— Vendor —</option>
                    {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                  </select>
                ) : bulkField === 'section' ? (
                  <select value={bulkValue} onChange={e => setBulkValue(e.target.value)} className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A]">
                    <option value="">— Section —</option>
                    <option value="general">General (no section)</option>
                    {editSections.map(s => <option key={s.id} value={s.id}>{s.name || 'Untitled Section'}</option>)}
                  </select>
                ) : (
                  <input type={bulkField === 'markup_percent' ? 'number' : 'text'} placeholder={bulkField ? `Enter ${bulkField}` : ''} value={bulkValue} onChange={e => setBulkValue(e.target.value)} disabled={!bulkField}
                    className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1.5 text-xs focus:outline-none focus:border-[#C8622A] disabled:opacity-40" />
                )}
                <button onClick={applyBulkEdit} disabled={!bulkField || !bulkValue || bulkSelectedLines.size === 0}
                  className="bg-[#C8622A] text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-40 whitespace-nowrap">
                  Apply to Selected
                </button>
                {bulkSelectedLines.size > 0 && (
                  <button onClick={() => setBulkSelectedLines(new Set())} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Clear</button>
                )}
              </div>

              {/* BOM Table Helper */}
              {(() => {
                const BOMTable = ({ sectionId, sectionLabel }) => {
                  const sectionLines = editLines
                    .map((l, i) => ({ ...l, _idx: i }))
                    .filter(l => sectionId === 'general' ? !l.section_id : l.section_id === sectionId)
                  return (
                    <div className="overflow-x-auto mb-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#2a3d55]">
                            <th className="py-2 pr-2 w-8">
                              <input type="checkbox" className="accent-[#C8622A]"
                                checked={sectionLines.length > 0 && sectionLines.every(l => bulkSelectedLines.has(l.id || l.item_name + l.quantity))}
                                onChange={() => {
                                  const keys = sectionLines.map(l => l.id || l.item_name + l.quantity)
                                  const allSel = keys.every(k => bulkSelectedLines.has(k))
                                  setBulkSelectedLines(prev => {
                                    const next = new Set(prev)
                                    keys.forEach(k => allSel ? next.delete(k) : next.add(k))
                                    return next
                                  })
                                }} />
                            </th>
                            {['Item Name', 'Manufacturer', 'Part #', 'Qty', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price', '🔄', ''].map(h => (
                              <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                            ))}
                            {editSections.length > 0 && <th className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">Move</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {sectionLines.map(line => {
                            const i = line._idx
                            const rowKey = line.id || line.item_name + line.quantity
                            return (
                              <tr key={i} className={`border-b border-[#2a3d55]/30 ${bulkSelectedLines.has(rowKey) ? 'bg-[#C8622A]/5' : ''}`}>
                                <td className="pr-2 py-1">
                                  <input type="checkbox" className="accent-[#C8622A] cursor-pointer"
                                    checked={bulkSelectedLines.has(rowKey)}
                                    onChange={() => setBulkSelectedLines(prev => {
                                      const next = new Set(prev)
                                      next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey)
                                      return next
                                    })} />
                                </td>
                                {[['item_name','text','Item name'],['manufacturer','text','Manufacturer'],['part_number_sku','text','Part #'],['quantity','number','Qty']].map(([field,type,placeholder]) => (
                                  <td key={field} className="pr-2 py-1">
                                    <input type={type} placeholder={placeholder} value={line[field] || ''} onChange={e => updateEditLine(i, field, e.target.value)}
                                      className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                                  </td>
                                ))}
                                <td className="pr-2 py-1">
                                  <select value={line.unit || 'ea'} onChange={e => updateEditLine(i, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                                    {['ea','ft','lot','hr','box','roll'].map(u => <option key={u}>{u}</option>)}
                                  </select>
                                </td>
                                <td className="pr-2 py-1">
                                  <select value={line.category || ''} onChange={e => updateEditLine(i, 'category', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                                    <option value="">Category</option>
                                    {categories.map(c => <option key={c}>{c}</option>)}
                                  </select>
                                </td>
                                <td className="pr-2 py-1 min-w-[120px]">
                                  <select value={vendors.some(v => v.vendor_name === line.vendor) ? line.vendor : (line.vendor ? '__other__' : '')}
                                    onChange={e => updateEditLine(i, 'vendor', e.target.value === '__other__' ? '__custom__' : e.target.value)}
                                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                                    <option value="">— Vendor —</option>
                                    {vendors.map(v => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                                    <option value="__other__">Other...</option>
                                  </select>
                                  {line.vendor && !vendors.some(v => v.vendor_name === line.vendor) && (
                                    <input type="text" placeholder="Vendor name" value={line.vendor === '__custom__' ? '' : line.vendor}
                                      onChange={e => updateEditLine(i, 'vendor', e.target.value || '__custom__')}
                                      className="w-full mt-1 bg-[#0F1C2E] text-white border border-[#C8622A]/40 rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                                  )}
                                </td>
                                <td className="pr-2 py-1">
                                  <input type="number" placeholder="0.00" value={line.your_cost_unit || ''} onChange={e => updateEditLine(i, 'your_cost_unit', e.target.value)}
                                    className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                                </td>
                                <td className="pr-2 py-1">
                                  <input type="number" placeholder="35" value={line.markup_percent || ''} onChange={e => updateEditLine(i, 'markup_percent', e.target.value)}
                                    className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                                </td>
                                <td className="pr-2 py-1">
                                  <input type="number" placeholder="0.00" value={line.customer_price_unit || ''} onChange={e => updateEditLine(i, 'customer_price_unit', e.target.value)}
                                    className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                                </td>
                                <td className="py-1 text-center">
                                  <input type="checkbox" checked={!!line.recurring} onChange={e => updateEditLine(i, 'recurring', e.target.checked)} className="accent-[#C8622A] cursor-pointer" title="Recurring" />
                                </td>
                                <td className="py-1">
                                  <button onClick={() => setEditLines(prev => prev.filter((_, idx) => idx !== i))} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button>
                                </td>
                                {editSections.length > 0 && (
                                  <td className="py-1">
                                    <button onClick={() => { setMoveLineIndex(i); setMoveType('move'); setShowMoveModal(true) }}
                                      className="bg-[#2a3d55] hover:bg-[#C8622A]/20 hover:text-[#C8622A] text-[#8A9AB0] text-xs px-2 py-1 rounded transition-colors whitespace-nowrap" title="Move to section">⇄ Move</button>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <button onClick={() => setEditLines(prev => [...prev, {
                        proposal_id: id, item_name: '', part_number_sku: '', quantity: '', unit: 'ea', category: '',
                        vendor: '', your_cost_unit: '', markup_percent: '35', customer_price_unit: '', customer_price_total: '',
                        pricing_status: 'Needs Pricing', section_id: sectionId === 'general' ? null : sectionId
                      }])} className="mt-2 text-[#C8622A] hover:text-white text-xs transition-colors">
                        + Add Item{sectionLabel ? ` to ${sectionLabel}` : ''}
                      </button>
                    </div>
                  )
                }

                return (
                  <div className="space-y-6">
                    {/* General items */}
                    <div>
                      {editSections.length > 0 && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">General</span>
                          <span className="text-[#2a3d55] text-xs">— items not assigned to a section</span>
                        </div>
                      )}
                      <BOMTable sectionId="general" sectionLabel={null} />
                    </div>

                    {/* Section containers */}
                    {editSections.map(section => (
                      <div key={section.id} className="border border-[#2a3d55] rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-3 bg-[#0F1C2E] border-b border-[#2a3d55]">
                          <div className="w-1.5 h-6 rounded-full bg-[#C8622A] flex-shrink-0" />
                          <input type="text" value={section.name} onChange={e => updateSection(section.id, 'name', e.target.value)}
                            placeholder="Section name (e.g. Floor 1, Server Room)"
                            className="flex-1 bg-transparent text-white font-semibold text-sm focus:outline-none placeholder-[#2a3d55]" />
                          <label className="flex items-center gap-2 cursor-pointer">
                            <span className="text-[#8A9AB0] text-xs">Include Labor</span>
                            <button onClick={() => updateSection(section.id, 'include_labor', !section.include_labor)}
                              className={`w-9 h-5 rounded-full transition-colors relative ${section.include_labor ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${section.include_labor ? 'left-4' : 'left-0.5'}`} />
                            </button>
                          </label>
                          <button onClick={() => deleteSection(section.id)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors ml-2">✕ Remove</button>
                        </div>
                        <div className="p-4">
                          <BOMTable sectionId={section.id} sectionLabel={section.name || 'this section'} />
                          {section.include_labor && (
                            <div className="mt-4 pt-4 border-t border-[#2a3d55]">
                              <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-3">Section Labor</p>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-[#2a3d55]">
                                    {['Role','Qty','Unit','Your Cost/hr','Markup %','Total Labor',''].map(h => (
                                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(section.labor_items || []).map((item, idx) => (
                                    <tr key={idx} className="border-b border-[#2a3d55]/30">
                                      <td className="pr-2 py-1"><input type="text" placeholder="Role" value={item.role || ''} onChange={e => updateSectionLabor(section.id, idx, 'role', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                                      <td className="pr-2 py-1"><input type="number" placeholder="0" value={item.quantity || ''} onChange={e => updateSectionLabor(section.id, idx, 'quantity', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                                      <td className="pr-2 py-1">
                                        <select value={item.unit || 'hr'} onChange={e => updateSectionLabor(section.id, idx, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                                          {['hr','day','lot'].map(u => <option key={u}>{u}</option>)}
                                        </select>
                                      </td>
                                      <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.your_cost || ''} onChange={e => updateSectionLabor(section.id, idx, 'your_cost', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                                      <td className="pr-2 py-1"><input type="number" placeholder="35" value={item.markup || ''} onChange={e => updateSectionLabor(section.id, idx, 'markup', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                                      <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.customer_price || ''} onChange={e => updateSectionLabor(section.id, idx, 'customer_price', e.target.value)} className="w-20 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold" /></td>
                                      <td className="py-1"><button onClick={() => removeSectionLaborLine(section.id, idx)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              <button onClick={() => addSectionLaborLine(section.id)} className="mt-2 text-[#C8622A] hover:text-white text-xs transition-colors">+ Add Labor</button>
                            </div>
                          )}
                          {(() => {
                            const secLines = editLines.filter(l => l.section_id === section.id)
                            const secMat = secLines.reduce((s,l) => s+((parseFloat(l.customer_price_unit)||0)*(parseFloat(l.quantity)||0)),0)
                            const secLab = section.include_labor ? (section.labor_items||[]).reduce((s,l) => s+(parseFloat(l.customer_price)||0),0) : 0
                            const secCostMat = secLines.reduce((s,l) => s+((parseFloat(l.your_cost_unit)||0)*(parseFloat(l.quantity)||0)),0)
                            const secCostLab = section.include_labor ? (section.labor_items||[]).reduce((s,l) => s+((parseFloat(l.your_cost)||0)*(parseFloat(l.quantity)||0)),0) : 0
                            const secTotal = secMat + secLab
                            const secCost = secCostMat + secCostLab
                            const secMargin = secTotal > 0 ? ((secTotal-secCost)/secTotal*100).toFixed(1) : '0.0'
                            return (
                              <div className="flex justify-between items-center mt-3 pt-3 border-t border-[#2a3d55] text-xs">
                                <div className="flex gap-4">
                                  <span className="text-[#8A9AB0]">Materials: <span className="text-white font-semibold">${secMat.toLocaleString('en-US',{minimumFractionDigits:2})}</span></span>
                                  {section.include_labor && secLab > 0 && <span className="text-[#8A9AB0]">Labor: <span className="text-white font-semibold">${secLab.toLocaleString('en-US',{minimumFractionDigits:2})}</span></span>}
                                  <span className="text-[#8A9AB0]">Margin: <span className="text-[#C8622A] font-semibold">{secMargin}%</span></span>
                                </div>
                                <span className="text-[#8A9AB0]">Section Total: <span className="text-white font-bold">${secTotal.toLocaleString('en-US',{minimumFractionDigits:2})}</span></span>
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Labor Section */}
              <div className="mt-8">
                <h3 className="text-white font-bold text-base mb-3">Labor</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      {['Role', 'Qty (hrs)', 'Unit', 'Your Cost/hr', 'Markup %', 'Total Labor', ''].map(h => (
                        <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {laborItems.map((item, index) => (
                      <tr key={index} className="border-b border-[#2a3d55]/30">
                        <td className="pr-2 py-1"><input type="text" placeholder="e.g. Electrician" value={item.role} onChange={e => updateLabor(index, 'role', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                        <td className="pr-2 py-1"><input type="number" placeholder="0" value={item.quantity || ''} onChange={e => updateLabor(index, 'quantity', e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                        <td className="pr-2 py-1">
                          <select value={item.unit || 'hr'} onChange={e => updateLabor(index, 'unit', e.target.value)} className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                            {['hr', 'day', 'lot'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.your_cost || ''} onChange={e => updateLabor(index, 'your_cost', e.target.value)} className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                        <td className="pr-2 py-1"><input type="number" placeholder="35" value={item.markup || ''} onChange={e => updateLabor(index, 'markup', e.target.value)} className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" /></td>
                        <td className="pr-2 py-1"><input type="number" placeholder="0.00" value={item.customer_price || ''} onChange={e => updateLabor(index, 'customer_price', e.target.value)} className="w-20 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold" /></td>
                        <td className="py-1">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setLaborItems(prev => prev.filter((_, i) => i !== index))} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button>
                            {editSections.length > 0 && (
                              <select
                                value=""
                                onChange={e => {
                                  if (!e.target.value) return
                                  const targetId = e.target.value
                                  const laborLine = laborItems[index]
                                  setEditSections(prev => prev.map(s => s.id === targetId
                                    ? { ...s, include_labor: true, labor_items: [...(s.labor_items || []), { ...laborLine }] }
                                    : s
                                  ))
                                  setLaborItems(prev => prev.filter((_, i) => i !== index))
                                }}
                                className="bg-[#1a2d45] text-[#8A9AB0] hover:text-white border border-[#2a3d55] rounded px-2 py-0.5 text-xs focus:outline-none focus:border-[#C8622A] cursor-pointer"
                              >
                                <option value="">→ Section</option>
                                {editSections.map(s => <option key={s.id} value={s.id}>{s.name || 'Untitled'}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="5" className="text-[#8A9AB0] pt-3 text-right font-semibold text-xs">Total Labor</td>
                      <td className="text-[#C8622A] pt-3 font-bold pr-2">${laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                <button onClick={() => setLaborItems(prev => [...prev, { role: '', quantity: '', unit: 'hr', your_cost: '', markup: 35, customer_price: 0 }])} className="mt-4 text-[#C8622A] hover:text-white text-sm transition-colors">+ Add Labor</button>
              </div>

              {/* Live running total */}
              <div className="mt-6 border-t border-[#2a3d55] pt-4 space-y-2">
                {(() => {
                  const liveBOMTotal = editLines.reduce((sum, l) => sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
                  const liveLaborTotal = laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
                  const liveTaxRate = (!proposal?.tax_exempt && proposal?.tax_rate) ? parseFloat(proposal.tax_rate) : 0
                  const liveTaxAmount = liveBOMTotal * (liveTaxRate / 100)
                  const liveGrandTotal = liveBOMTotal + liveLaborTotal + liveTaxAmount
                  const liveBOMCost = editLines.reduce((sum, l) => sum + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
                  const liveLaborCost = laborItems.reduce((sum, l) => sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
                  const liveTotalCost = liveBOMCost + liveLaborCost
                  const liveMargin = liveGrandTotal > 0 ? ((liveGrandTotal - liveTotalCost) / liveGrandTotal * 100).toFixed(1) : '0.0'
                  return (
                    <>
                      <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Materials</span><span className="text-white">${liveBOMTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Labor</span><span className="text-white">${liveLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                      {liveTaxRate > 0 && <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Tax ({liveTaxRate}% on materials)</span><span className="text-white">${liveTaxAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>}
                      <div className="flex justify-between text-base font-bold border-t border-[#2a3d55] pt-2"><span className="text-white">Grand Total</span><span className="text-[#C8622A]">${liveGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-[#8A9AB0]">Gross Margin</span><span className="text-[#C8622A] font-semibold">{liveMargin}%</span></div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>

        {/* Recurring Items Summary */}
        {proposal?.status === 'Won' && lineItems.some(l => l.recurring) && (
          <div className="bg-[#1a2d45] border border-[#C8622A]/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#C8622A] text-lg">🔄</span>
              <h3 className="text-white font-bold">Recurring Line Items</h3>
            </div>
            <div className="space-y-2">
              {lineItems.filter(l => l.recurring).map(item => (
                <div key={item.id} className="flex justify-between items-center bg-[#0F1C2E] rounded-lg px-4 py-3">
                  <div>
                    <p className="text-white text-sm font-medium">{item.item_name}</p>
                    <p className="text-[#8A9AB0] text-xs">${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} / renewal</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.renewal_date ? <span className="text-[#C8622A] text-xs font-semibold">Renews {new Date(item.renewal_date).toLocaleDateString()}</span> : <span className="text-yellow-400 text-xs">⚠ Set renewal date</span>}
                    <input type="date" value={renewalDates[item.id] || item.renewal_date || ''} onChange={e => saveRenewalDate(item.id, e.target.value)}
                      className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Service Agreement Section */}
        {orgSLASettings?.feature_sla && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <span className="text-lg">📋</span>
                <h3 className="text-white font-bold text-lg">Service Agreements</h3>
                {slaContracts.length > 0 && <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full">{slaContracts.length} attached</span>}
              </div>
              <button onClick={() => openSLAModal(null)} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Add Service Agreement</button>
            </div>
            {slaContracts.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No service agreements attached. Click "Add Service Agreement" to add one.</p>
            ) : (
              <div className="space-y-4">
                {slaContracts.map((slaC, idx) => (
                  <div key={idx} className="bg-[#0F1C2E] rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-white font-semibold">{slaC.name || 'Service Level Agreement'}</p>
                        {slaC.tier_name && <span className="inline-block bg-[#C8622A]/20 text-[#C8622A] text-xs font-semibold px-2 py-0.5 rounded-full mt-1">{slaC.tier_name}</span>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openSLAModal(idx)} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Edit</button>
                        <button onClick={() => removeSLAContract(idx)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Remove</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {slaC.response_time_hours && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Response Time</p><p className="text-white text-sm font-semibold">{slaC.response_time_hours} hours</p></div>}
                      <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Billing</p><p className="text-white text-sm font-semibold">{slaC.billing_frequency}</p></div>
                      <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Standard Rate</p><p className="text-white text-sm font-semibold">${slaC.labor_rate}/hr</p></div>
                      {slaC.emergency_rate && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Emergency Rate</p><p className="text-white text-sm font-semibold">${slaC.emergency_rate}/hr</p></div>}
                      {slaC.maintenance_calls_per_year > 0 && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Maintenance/Year</p><p className="text-white text-sm font-semibold">{slaC.maintenance_calls_per_year}</p></div>}
                      {slaC.recurring_fee > 0 && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Recurring Fee</p><p className="text-white text-sm font-semibold">${slaC.recurring_fee}/{slaC.billing_frequency}</p></div>}
                      {slaC.initial_fee > 0 && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Initial Fee</p><p className="text-white text-sm font-semibold">${slaC.initial_fee} <span className="text-[#8A9AB0] font-normal text-xs">w/ job</span></p></div>}
                      {slaC.start_date && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Term</p><p className="text-white text-sm font-semibold">{new Date(slaC.start_date).toLocaleDateString()} – {slaC.end_date ? new Date(slaC.end_date).toLocaleDateString() : 'TBD'}</p></div>}
                      {slaC.auto_renew && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Auto-Renew</p><p className="text-green-400 text-sm font-semibold">Yes</p></div>}
                    </div>
                    {slaC.body && (
                      <div className="border-t border-[#2a3d55] pt-3">
                        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Contract Language</p>
                        <p className="text-[#D6E4F0] text-xs leading-relaxed whitespace-pre-wrap">{slaC.body
                          .replace(/\{\{companyName\}\}/g, profile?.company_name || proposal?.company || '')
                          .replace(/\{\{clientName\}\}/g, proposal?.company || '')
                          .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
                          .replace(/\{\{tierName\}\}/g, slaC.tier_name || slaC.name || '')
                          .replace(/\{\{responseTime\}\}/g, slaC.response_time_hours ? `${slaC.response_time_hours} hours` : 'as scheduled')
                          .replace(/\{\{billingFrequency\}\}/g, slaC.billing_frequency || 'Quarterly')
                          .replace(/\{\{laborRate\}\}/g, `${slaC.labor_rate || 100}`)
                          .replace(/\{\{emergencyRate\}\}/g, `${slaC.emergency_rate || 150}`)
                          .replace(/\{\{maintenanceCalls\}\}/g, `${slaC.maintenance_calls_per_year || 0}`)
                          .replace(/\{\{initialFee\}\}/g, `${slaC.initial_fee || 0}`)
                          .replace(/\{\{recurringFee\}\}/g, `${slaC.recurring_fee || 0}`)
                        }</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Monitoring Contract Section */}
        {orgSLASettings?.feature_monitoring && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <span className="text-lg">📡</span>
                <h3 className="text-white font-bold text-lg">Monitoring Contracts</h3>
                {monitoringContracts.length > 0 && <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full">{monitoringContracts.length} attached</span>}
              </div>
              <button onClick={() => openMonitoringModal(null)} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">+ Add Monitoring Contract</button>
            </div>
            {monitoringContracts.length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No monitoring contracts attached. Click "Add Monitoring Contract" to add one.</p>
            ) : (
              <div className="space-y-4">
                {monitoringContracts.map((monC, idx) => (
                  <div key={idx} className="bg-[#0F1C2E] rounded-xl p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <p className="text-white font-semibold">{monC.name || 'Monitoring Contract'}</p>
                      <div className="flex gap-2">
                        <button onClick={() => openMonitoringModal(idx)} className="text-[#8A9AB0] hover:text-white text-xs transition-colors">Edit</button>
                        <button onClick={() => removeMonitoringContract(idx)} className="text-[#8A9AB0] hover:text-red-400 text-xs transition-colors">Remove</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Monthly Fee</p><p className="text-white text-sm font-semibold">${monC.monthly_fee}/mo</p></div>
                      <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Billing</p><p className="text-white text-sm font-semibold">{monC.billing_frequency}</p></div>
                      <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Escalation Contacts</p><p className="text-white text-sm font-semibold">{monC.escalation_contacts}</p></div>
                      {monC.monitored_systems && <div className="bg-[#1a2d45] rounded-lg p-2 col-span-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Monitored Systems</p><p className="text-white text-sm">{monC.monitored_systems}</p></div>}
                      {monC.start_date && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Term</p><p className="text-white text-sm font-semibold">{new Date(monC.start_date).toLocaleDateString()} – {monC.end_date ? new Date(monC.end_date).toLocaleDateString() : 'TBD'}</p></div>}
                      {monC.auto_renew && <div className="bg-[#1a2d45] rounded-lg p-2"><p className="text-[#8A9AB0] text-xs mb-0.5">Auto-Renew</p><p className="text-green-400 text-sm font-semibold">Yes</p></div>}
                    </div>
                    {monC.body && (
                      <div className="border-t border-[#2a3d55] pt-3">
                        <p className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-2">Contract Language</p>
                        <p className="text-[#D6E4F0] text-xs leading-relaxed whitespace-pre-wrap">{monC.body
                          .replace(/\{\{companyName\}\}/g, profile?.company_name || proposal?.company || '')
                          .replace(/\{\{clientName\}\}/g, proposal?.company || '')
                          .replace(/\{\{proposalName\}\}/g, proposal?.proposal_name || '')
                          .replace(/\{\{monthlyFee\}\}/g, `${monC.monthly_fee || 49}`)
                          .replace(/\{\{monitoredSystems\}\}/g, monC.monitored_systems || '')
                          .replace(/\{\{billingFrequency\}\}/g, monC.billing_frequency || 'Monthly')
                          .replace(/\{\{escalationContacts\}\}/g, `${monC.escalation_contacts || 2}`)
                        }</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Activity Feed */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-4">Activity</h3>
          <div className="bg-[#0F1C2E] rounded-xl p-4 mb-5 space-y-3">
            <div className="flex gap-2">
              {[{value:'note',label:'Note',icon:'📝'},{value:'call',label:'Call',icon:'📞'},{value:'email',label:'Email',icon:'✉️'},{value:'meeting',label:'Meeting',icon:'🤝'}].map(t => (
                <button key={t.value} onClick={() => setNewActivityNote(prev => ({ ...prev, type: t.value }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${(newActivityNote?.type || 'note') === t.value ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text"
                value={typeof newActivityNote === 'string' ? newActivityNote : (newActivityNote?.title || '')}
                onChange={e => setNewActivityNote(prev => typeof prev === 'string' ? { type: 'note', title: e.target.value } : { ...prev, title: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && addManualActivity()}
                placeholder="Log a note, call, follow-up..."
                className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]" />
              <button onClick={addManualActivity} disabled={savingActivity || !(typeof newActivityNote === 'string' ? newActivityNote.trim() : newActivityNote?.title?.trim())}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">Log</button>
            </div>
          </div>
          {activity.length === 0 ? (
            <p className="text-[#8A9AB0] text-sm">No activity yet. Changes and notes will appear here.</p>
          ) : (
            <div className="space-y-0">
              {activity.map((item, i) => {
                const icons = { call: '📞', email: '✉️', meeting: '🤝', note: '📝' }
                const icon = icons[item.type] || '📝'
                return (
                  <div key={item.id} className="flex gap-3 relative">
                    {i < activity.length - 1 && <div className="absolute left-4 top-8 bottom-0 w-px bg-[#2a3d55]" />}
                    <div className="w-8 h-8 rounded-full bg-[#0F1C2E] border border-[#2a3d55] flex items-center justify-center text-sm shrink-0 z-10">{icon}</div>
                    <div className="flex-1 pb-4">
                      <div className="flex justify-between items-start">
                        <p className="text-white text-sm font-medium">{item.title}</p>
                        <span className="text-[#8A9AB0] text-xs shrink-0 ml-2">{new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {item.body && <p className="text-[#8A9AB0] text-xs mt-1 leading-relaxed">{item.body}</p>}
                      <p className="text-[#2a3d55] text-xs mt-0.5">{item.profiles?.full_name || 'System'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <POList proposalId={id} />

      </div>

      {/* RFQ Modal */}
      {showRFQModal && (() => {
        const needsPricing = lineItems.filter(l => l.pricing_status === 'Needs Pricing' && l.vendor)
        const byVendor = needsPricing.reduce((acc, item) => { const vendor = item.vendor || 'Unknown Vendor'; if (!acc[vendor]) acc[vendor] = []; acc[vendor].push(item); return acc }, {})
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
            <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
              <h3 className="text-white font-bold text-lg mb-1">Send RFQs</h3>
              <p className="text-[#8A9AB0] text-sm mb-5">Verify vendor emails and choose delivery options for each vendor.</p>
              <div className="space-y-4">
                {Object.entries(byVendor).map(([vendorName, items]) => (
                  <div key={vendorName} className="bg-[#0F1C2E] rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div><p className="text-white font-semibold text-sm">{vendorName}</p><p className="text-[#8A9AB0] text-xs">{items.length} item{items.length !== 1 ? 's' : ''}</p></div>
                    </div>
                    <div className="mb-3 space-y-1">
                      {items.map(item => (
                        <div key={item.id} className="flex justify-between text-xs py-0.5">
                          <span className="text-[#8A9AB0]">{item.item_name}</span>
                          <div className="flex gap-3 text-[#8A9AB0]">
                            {item.manufacturer && <span className="text-[#C8622A]">{item.manufacturer}</span>}
                            <span>Qty: {item.quantity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mb-2">
                      <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor Email</label>
                      <input type="email" value={rfqVendorData[vendorName]?.email || ''} onChange={e => setRfqVendorData(prev => ({ ...prev, [vendorName]: { ...prev[vendorName], email: e.target.value } }))} placeholder="vendor@company.com" className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={rfqVendorData[vendorName]?.attachExcel || false} onChange={e => setRfqVendorData(prev => ({ ...prev, [vendorName]: { ...prev[vendorName], attachExcel: e.target.checked } }))} className="accent-[#C8622A]" />
                      <span className="text-[#8A9AB0] text-xs">Attach Excel spreadsheet for pricing</span>
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowRFQModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={sendAllRFQs} disabled={sendingRFQs || !Object.values(rfqVendorData).some(v => v.email)}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {sendingRFQs ? 'Sending...' : `Send ${Object.values(rfqVendorData).filter(v => v.email).length} RFQ${Object.values(rfqVendorData).filter(v => v.email).length !== 1 ? 's' : ''} →`}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Edit Client Modal */}
      {showEditClientModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Edit Client Info</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Link to an existing client or edit the contact details directly.</p>
            <div className="space-y-3">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Link to Client Record</label>
                <select value={editClientForm.client_id || ''} onChange={e => { const cid = e.target.value; const found = allClients.find(c => c.id === cid); setEditClientForm(p => ({ ...p, client_id: cid, ...(found ? { company: found.company || p.company, client_name: found.client_name || p.client_name, client_email: found.email || p.client_email } : {}) })) }}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                  <option value="">— No client linked —</option>
                  {allClients.map(c => <option key={c.id} value={c.id}>{c.company}{c.client_name ? ` — ${c.client_name}` : ''}</option>)}
                </select>
                {editClientForm.client_id && <p className="text-green-400 text-xs mt-1">✓ Linked — changes below will also update the client record</p>}
              </div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Company</label><input type="text" value={editClientForm.company} onChange={e => setEditClientForm(p => ({ ...p, company: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" /></div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Client Name</label><input type="text" value={editClientForm.client_name} onChange={e => setEditClientForm(p => ({ ...p, client_name: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" /></div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Email</label><input type="email" value={editClientForm.client_email} onChange={e => setEditClientForm(p => ({ ...p, client_email: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditClientModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={saveClientInfo} disabled={savingClient} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingClient ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Proposal Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4"><span className="text-red-400 text-xl">⚠</span></div>
            <h3 className="text-white font-bold text-lg mb-1 text-center">Delete Proposal</h3>
            <p className="text-[#8A9AB0] text-sm mb-4 text-center">This will permanently delete this proposal and all associated data including BOM, photos, and activity. This cannot be undone.</p>
            <div className="mb-4">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Type <span className="text-white font-mono">{proposal?.proposal_name}</span> to confirm</label>
              <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder={proposal?.proposal_name}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={deleteProposal} disabled={deletingProposal || deleteConfirmText !== proposal?.proposal_name}
                className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                {deletingProposal ? 'Deleting...' : 'Delete Proposal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI BOM Builder Modal */}
      {showAIBOMModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-1">✨ AI BOM Builder</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Describe the system or project and AI will generate a complete parts list. You'll review before adding.</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Describe the system you need</label>
                <textarea value={aiBOMPrompt} onChange={e => setAIBOMPrompt(e.target.value)} rows={3}
                  placeholder="e.g. 8 camera outdoor commercial security system with NVR, remote access, and PoE switch. No specific brands."
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>
              <button onClick={generateAIBOM} disabled={generatingBOM || !aiBOMPrompt.trim()} className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                {generatingBOM ? '✨ Building BOM...' : '✨ Generate BOM'}
              </button>
              {aiBOMPreview.length > 0 && (
                <div>
                  <p className="text-white text-sm font-semibold mb-2">{aiBOMPreview.length} items generated — review before adding</p>
                  <div className="bg-[#0F1C2E] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-[#2a3d55]"><th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Item</th><th className="text-[#8A9AB0] text-right py-2 px-3 font-normal">Qty</th><th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Unit</th><th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Category</th><th className="py-2 px-3"></th></tr></thead>
                      <tbody>
                        {aiBOMPreview.map((item, i) => (
                          <tr key={i} className="border-b border-[#2a3d55]/30">
                            <td className="text-white py-2 px-3">{item.item_name}</td><td className="text-[#8A9AB0] py-2 px-3 text-right">{item.quantity}</td><td className="text-[#8A9AB0] py-2 px-3">{item.unit}</td><td className="text-[#8A9AB0] py-2 px-3">{item.category}</td>
                            <td className="py-2 px-3"><button onClick={() => setAIBOMPreview(prev => prev.filter((_, idx) => idx !== i))} className="text-[#8A9AB0] hover:text-red-400 transition-colors text-base leading-none">×</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[#8A9AB0] text-xs mt-2">Items will be added to your BOM in Edit mode. Add your costs and markup after.</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAIBOMModal(false); setAIBOMPreview([]); setAIBOMPrompt('') }} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                {aiBOMPreview.length > 0 && (
                  <button onClick={applyAIBOM} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Add {aiBOMPreview.length} Items to BOM →</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
{/* Deal Summary Modal */}
      {showDealSummaryModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-1">🧠 Deal Summary</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">AI analyzes your proposal and returns a plain English summary with risk flags and action items.</p>
            <div className="space-y-4">
              {!dealSummary && (
                <button onClick={generateDealSummary} disabled={generatingDealSummary}
                  className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                  {generatingDealSummary ? '🧠 Analyzing Deal...' : '🧠 Analyze This Deal'}
                </button>
              )}
              {dealSummary && (
                <div className="space-y-4">
                  {/* Headline */}
                  <div className="bg-[#0F1C2E] rounded-xl p-4 border border-[#C8622A]/30">
                    <p className="text-white font-semibold text-sm">{dealSummary.headline}</p>
                  </div>

                  {/* Readiness */}
                  <div className={`rounded-xl p-4 border ${
                    dealSummary.readiness === 'ready' ? 'bg-green-500/10 border-green-500/20' :
                    dealSummary.readiness === 'needs_work' ? 'bg-yellow-500/10 border-yellow-500/20' :
                    'bg-red-500/10 border-red-500/20'
                  }`}>
                    <p className={`font-semibold text-sm mb-1 ${
                      dealSummary.readiness === 'ready' ? 'text-green-400' :
                      dealSummary.readiness === 'needs_work' ? 'text-yellow-400' :
                      'text-red-400'
                    }`}>
                      {dealSummary.readiness === 'ready' ? '✓ Ready to Send' :
                       dealSummary.readiness === 'needs_work' ? '⚠ Needs Work' :
                       '✗ Incomplete'}
                    </p>
                    <p className="text-[#8A9AB0] text-xs">{dealSummary.readiness_note}</p>
                  </div>

                  {/* Strength */}
                  {dealSummary.strength && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-green-400 font-semibold text-xs mb-1 uppercase tracking-wide">Strength</p>
                      <p className="text-white text-sm">{dealSummary.strength}</p>
                    </div>
                  )}

                  {/* Margin + Close */}
                  <div className="grid grid-cols-2 gap-3">
                    {dealSummary.margin_note && (
                      <div className="bg-[#0F1C2E] rounded-xl p-4">
                        <p className="text-[#C8622A] font-semibold text-xs mb-1 uppercase tracking-wide">Margin</p>
                        <p className="text-[#8A9AB0] text-xs">{dealSummary.margin_note}</p>
                      </div>
                    )}
                    {dealSummary.close_note && (
                      <div className="bg-[#0F1C2E] rounded-xl p-4">
                        <p className="text-[#C8622A] font-semibold text-xs mb-1 uppercase tracking-wide">Close Timeline</p>
                        <p className="text-[#8A9AB0] text-xs">{dealSummary.close_note}</p>
                      </div>
                    )}
                  </div>

                  {/* Risks */}
                  {dealSummary.risks?.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <p className="text-red-400 font-semibold text-xs mb-2 uppercase tracking-wide">Risks</p>
                      {dealSummary.risks.map((r, i) => (
                        <p key={i} className="text-red-300 text-xs mb-1">• {r}</p>
                      ))}
                    </div>
                  )}

                  {/* Action Items */}
                  {dealSummary.actions?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-xs mb-2 uppercase tracking-wide">Action Items</p>
                      {dealSummary.actions.map((a, i) => (
                        <p key={i} className="text-[#8A9AB0] text-xs mb-1">→ {a}</p>
                      ))}
                    </div>
                  )}

                  <button onClick={() => { setDealSummary(null) }}
                    className="text-[#8A9AB0] hover:text-white text-xs transition-colors">
                    ↺ Re-analyze
                  </button>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowDealSummaryModal(false); setDealSummary(null) }}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

{/* Spec Reader Modal */}
      {showSpecModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-1">📋 Spec Reader</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Upload a project specification document and AI will extract manufacturers, compliance requirements, submittals, and scope notes.</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Upload Spec Document (PDF)</label>
                <input type="file" accept=".pdf,image/jpeg,image/png"
                  onChange={e => setSpecFile(e.target.files[0] || null)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                {specFile && <p className="text-[#8A9AB0] text-xs mt-1">{specFile.name} — {(specFile.size / 1024 / 1024).toFixed(2)} MB</p>}
              </div>
              <button onClick={analyzeSpec} disabled={analyzingSpec || !specFile}
                className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                {analyzingSpec ? '📋 Reading Spec...' : '📋 Read Spec'}
              </button>
              {specSummary && (
                <div className="space-y-4">
                  {specSummary.flags?.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                      <p className="text-red-400 font-semibold text-sm mb-2">⚠ Flags — Review Carefully</p>
                      {specSummary.flags.map((f, i) => <p key={i} className="text-red-300 text-xs mb-1">• {f}</p>)}
                    </div>
                  )}
                  {specSummary.manufacturers?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-sm mb-2">Approved Manufacturers</p>
                      {specSummary.manufacturers.map((m, i) => (
                        <div key={i} className="mb-2">
                          <p className="text-[#C8622A] text-xs font-semibold">{m.category}</p>
                          <p className="text-white text-xs">{m.approved?.join(', ')}</p>
                          {m.notes && <p className="text-[#8A9AB0] text-xs italic">{m.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {specSummary.compliance?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-sm mb-2">Compliance & Codes</p>
                      {specSummary.compliance.map((c, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {c}</p>)}
                    </div>
                  )}
                  {specSummary.scope_notes?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-sm mb-2">Scope Notes</p>
                      {specSummary.scope_notes.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                    </div>
                  )}
                  {specSummary.submittals?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-sm mb-2">Submittals Required</p>
                      {specSummary.submittals.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                    </div>
                  )}
                  {specSummary.installation?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-sm mb-2">Installation Standards</p>
                      {specSummary.installation.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                    </div>
                  )}
                  {specSummary.testing?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-sm mb-2">Testing & Commissioning</p>
                      {specSummary.testing.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                    </div>
                  )}
                  {specSummary.warranty?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-sm mb-2">Warranty Requirements</p>
                      {specSummary.warranty.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                    </div>
                  )}
                  {specSummary.exclusions?.length > 0 && (
                    <div className="bg-[#0F1C2E] rounded-xl p-4">
                      <p className="text-white font-semibold text-sm mb-2">Exclusions</p>
                      {specSummary.exclusions.map((s, i) => <p key={i} className="text-[#8A9AB0] text-xs mb-1">• {s}</p>)}
                    </div>
                  )}
                  <p className="text-green-400 text-xs">✓ Spec summary saved to this proposal</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowSpecModal(false); setSpecFile(null) }}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

{/* Drawing Reader Modal */}
      {showDrawingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-1">📐 Drawing Reader</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Upload a floor plan or technical drawing and AI will count devices and build a BOM. You'll review before adding.</p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Upload Drawing (PDF or Image)</label>
                <input type="file" accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={e => setDrawingFile(e.target.files[0] || null)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                {drawingFile && <p className="text-[#8A9AB0] text-xs mt-1">{drawingFile.name} — {(drawingFile.size / 1024 / 1024).toFixed(2)} MB</p>}
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Instructions — what to look for</label>
                <textarea value={drawingInstructions} onChange={e => setDrawingInstructions(e.target.value)} rows={3}
                  placeholder="e.g. Only count cameras and access control readers. Ignore data drops and AV equipment."
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>
              <button onClick={analyzeDrawing} disabled={analyzingDrawing || !drawingFile}
                className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                {analyzingDrawing ? '📐 Analyzing Drawing...' : '📐 Analyze Drawing'}
              </button>
              {drawingPreview.length > 0 && (
                <div>
                  <p className="text-white text-sm font-semibold mb-2">{drawingPreview.length} items found — review before adding</p>
                  <div className="bg-[#0F1C2E] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#2a3d55]">
                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Item</th>
                          <th className="text-[#8A9AB0] text-right py-2 px-3 font-normal">Qty</th>
                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Category</th>
                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Notes</th>
                          <th className="py-2 px-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {drawingPreview.map((item, i) => (
                          <tr key={i} className="border-b border-[#2a3d55]/30">
                            <td className="text-white py-2 px-3">{item.item_name}</td>
                            <td className="text-[#8A9AB0] py-2 px-3 text-right">{item.quantity}</td>
                            <td className="text-[#8A9AB0] py-2 px-3">{item.category}</td>
                            <td className="text-[#8A9AB0] py-2 px-3 text-xs italic">{item.notes}</td>
                            <td className="py-2 px-3"><button onClick={() => setDrawingPreview(prev => prev.filter((_, idx) => idx !== i))} className="text-[#8A9AB0] hover:text-red-400 transition-colors text-base leading-none">×</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[#8A9AB0] text-xs mt-2">Review quantities carefully — AI counts may need adjustment. Items added to BOM in Edit mode.</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowDrawingModal(false); setDrawingFile(null); setDrawingInstructions(''); setDrawingPreview([]) }}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                {drawingPreview.length > 0 && (
                  <button onClick={applyDrawingBOM}
                    className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                    Add {drawingPreview.length} Items to BOM →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Site Photos Modal */}
      {showPhotosModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <div><h3 className="text-white font-bold text-lg">📷 Site Photos</h3><p className="text-[#8A9AB0] text-sm mt-0.5">Attach job site photos to this proposal</p></div>
              <label className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors cursor-pointer">
                {uploadingPhoto ? 'Uploading...' : '+ Upload Photo'}
                <input type="file" accept="image/*" onChange={uploadPhoto} className="hidden" disabled={uploadingPhoto} />
              </label>
            </div>
            {photos.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[#2a3d55] rounded-xl"><p className="text-[#8A9AB0] text-lg mb-2">📷</p><p className="text-[#8A9AB0] text-sm">No photos yet.</p></div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {photos.map(photo => (
                  <div key={photo.id} className="bg-[#0F1C2E] rounded-xl overflow-hidden">
                    <img src={photo.url} alt={photo.caption || 'Site photo'} className="w-full h-48 object-cover" />
                    <div className="p-3 flex items-center gap-2">
                      <input type="text" value={photo.caption || ''} placeholder="Add caption..." onChange={e => updatePhotoCaption(photo.id, e.target.value)} onBlur={e => updatePhotoCaption(photo.id, e.target.value)}
                        className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                      <button onClick={() => deletePhoto(photo.id, photo.url)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setShowPhotosModal(false)} className="mt-5 w-full py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Done</button>
          </div>
        </div>
      )}

      {/* Convert to Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Convert to Manufacturer Order</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Create an order from this proposal's BOM to track fulfillment.</p>
            <div className="space-y-4">
              <div className="bg-[#0F1C2E] rounded-lg p-3 max-h-48 overflow-y-auto">
                <p className="text-[#8A9AB0] text-xs mb-2">{lineItems.length} item{lineItems.length !== 1 ? 's' : ''} to fulfill</p>
                {lineItems.map(item => <div key={item.id} className="flex justify-between text-xs py-1 border-b border-[#2a3d55]/30"><span className="text-white">{item.item_name}</span><span className="text-[#8A9AB0]">Qty: {item.quantity}</span></div>)}
                <div className="flex justify-between text-xs pt-2 font-semibold"><span className="text-[#8A9AB0]">Order Value</span><span className="text-[#C8622A]">${lineItems.reduce((sum, l) => sum + (l.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Order Number</label>
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setOrderAutoNumber(true)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${orderAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>Auto-Generate</button>
                  <button onClick={() => setOrderAutoNumber(false)} className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${!orderAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>Enter Manually</button>
                </div>
                {!orderAutoNumber && <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="e.g. ORD-2026-001" className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />}
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Expected Ship Date (optional)</label>
                <input type="date" value={orderExpectedShip} onChange={e => setOrderExpectedShip(e.target.value)} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              {clientAddress && <div className="bg-[#0F1C2E] rounded-lg px-4 py-3 text-xs text-[#8A9AB0]"><p className="text-white font-medium mb-0.5">Ship to:</p><p>{clientAddress}</p></div>}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowOrderModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={createOrder} disabled={creatingOrder || (!orderAutoNumber && !orderNumber)} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{creatingOrder ? 'Creating...' : 'Create Order'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SLA Agreement Modal */}
      {showSLAModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">📋 {editingAgreementIdx !== null ? 'Edit' : 'Add'} Service Agreement</h3>
              <button onClick={() => setShowSLAModal(false)} className="text-[#8A9AB0] hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              {/* Template picker — all enabled tiers across all industries */}
              {allSLATiers().length > 0 && (
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Start from a template</label>
                  <select value={editSLAForm.tier_id || ''} onChange={e => {
                    const tier = allSLATiers().find(t => t.id === e.target.value)
                    if (tier) setEditSLAForm(p => ({ ...p, tier_id: tier.id, tier_name: tier.name, name: tier.name, response_time_hours: tier.response_time_hours ?? '', labor_rate: tier.labor_rate || 100, emergency_rate: tier.emergency_rate ?? '', billing_frequency: tier.billing_frequency || 'Quarterly', maintenance_calls_per_year: tier.maintenance_calls_per_year || 0, initial_fee: tier.initial_fee || 0, recurring_fee: tier.recurring_fee || 0, body: tier.body || '' }))
                  }} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                    <option value="">— Pick a template to pre-fill —</option>
                    {allSLATiers().map(t => (
                      <option key={t.id} value={t.id}>{t.name} {t._industry ? `(${t._industry})` : ''}</option>
                    ))}
                  </select>
                  <p className="text-[#8A9AB0] text-xs mt-1">All fields below remain editable after selecting a template.</p>
                </div>
              )}
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Agreement Name</label>
                <input type="text" value={editSLAForm.name || ''} onChange={e => setEditSLAForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Response Time (hours) <span className="text-[#8A9AB0] font-normal">— blank = N/A</span></label>
                  <input type="number" value={editSLAForm.response_time_hours ?? ''} placeholder="N/A" onChange={e => setEditSLAForm(p => ({ ...p, response_time_hours: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Billing Frequency</label>
                  <select value={editSLAForm.billing_frequency || 'Quarterly'} onChange={e => setEditSLAForm(p => ({ ...p, billing_frequency: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                    <option>Monthly</option><option>Quarterly</option><option>Annually</option>
                  </select>
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Labor Rate ($/hr)</label>
                  <input type="number" value={editSLAForm.labor_rate || ''} onChange={e => setEditSLAForm(p => ({ ...p, labor_rate: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Emergency Rate ($/hr) <span className="text-[#8A9AB0] font-normal">— blank = N/A</span></label>
                  <input type="number" value={editSLAForm.emergency_rate ?? ''} placeholder="N/A" onChange={e => setEditSLAForm(p => ({ ...p, emergency_rate: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Maintenance Visits/Year</label>
                  <input type="number" min="0" value={editSLAForm.maintenance_calls_per_year ?? 0} onChange={e => setEditSLAForm(p => ({ ...p, maintenance_calls_per_year: Number(e.target.value) }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Initial Fee ($) <span className="text-[#8A9AB0] font-normal">billed with job</span></label>
                  <input type="number" min="0" value={editSLAForm.initial_fee ?? 0} onChange={e => setEditSLAForm(p => ({ ...p, initial_fee: Number(e.target.value) }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div className="col-span-2">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Recurring Fee ($) <span className="text-[#8A9AB0] font-normal">per billing cycle</span></label>
                  <input type="number" min="0" value={editSLAForm.recurring_fee ?? 0} onChange={e => setEditSLAForm(p => ({ ...p, recurring_fee: Number(e.target.value) }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Start Date</label>
                  <input type="date" value={editSLAForm.start_date || ''} onChange={e => setEditSLAForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">End Date</label>
                  <input type="date" value={editSLAForm.end_date || ''} onChange={e => setEditSLAForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <input type="checkbox" id="sla-autorenew" checked={!!editSLAForm.auto_renew} onChange={e => setEditSLAForm(p => ({ ...p, auto_renew: e.target.checked }))} className="w-4 h-4 accent-[#C8622A]" />
                  <label htmlFor="sla-autorenew" className="text-[#8A9AB0] text-sm">Auto-renew when term ends</label>
                </div>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Contract Language</label>
                <textarea rows={10} value={editSLAForm.body || ''} onChange={e => setEditSLAForm(p => ({ ...p, body: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none font-mono" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSLAModal(false)} className="flex-1 bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">Cancel</button>
                <button onClick={saveSLAContract} disabled={savingContract} className="flex-1 bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingContract ? 'Saving...' : editingAgreementIdx !== null ? 'Save Changes' : 'Add Agreement'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monitoring Contract Modal */}
      {showMonitoringModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">📡 {editingAgreementIdx !== null ? 'Edit' : 'Add'} Monitoring Contract</h3>
              <button onClick={() => setShowMonitoringModal(false)} className="text-[#8A9AB0] hover:text-white text-2xl leading-none">×</button>
            </div>
            <div className="space-y-4">
              {/* Template picker */}
              {allMonitoringTemplates().length > 0 && (
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Start from a template</label>
                  <select onChange={e => {
                    const tmpl = allMonitoringTemplates().find(t => t._industry === e.target.value)
                    if (tmpl) setEditMonitoringForm(p => ({ ...p, name: tmpl.name || 'Monitoring Contract', monthly_fee: tmpl.monthly_fee || 49, monitored_systems: tmpl.monitored_systems || '', billing_frequency: tmpl.billing_frequency || 'Monthly', escalation_contacts: tmpl.escalation_contacts || 2, body: tmpl.body || '' }))
                  }} defaultValue="" className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                    <option value="">— Pick a template to pre-fill —</option>
                    {allMonitoringTemplates().map(t => (
                      <option key={t._industry} value={t._industry}>{t.name || 'Monitoring Contract'} ({t._industry})</option>
                    ))}
                  </select>
                  <p className="text-[#8A9AB0] text-xs mt-1">All fields remain editable after selecting.</p>
                </div>
              )}
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Contract Name</label>
                <input type="text" value={editMonitoringForm.name || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Monthly Fee ($)</label>
                  <input type="number" value={editMonitoringForm.monthly_fee || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, monthly_fee: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Escalation Contacts</label>
                  <input type="number" min="1" value={editMonitoringForm.escalation_contacts || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, escalation_contacts: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div className="col-span-2">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Billing Frequency</label>
                  <select value={editMonitoringForm.billing_frequency || 'Monthly'} onChange={e => setEditMonitoringForm(p => ({ ...p, billing_frequency: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]">
                    <option>Monthly</option><option>Quarterly</option><option>Annual</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Monitored Systems</label>
                  <input type="text" value={editMonitoringForm.monitored_systems || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, monitored_systems: e.target.value }))}
                    placeholder="e.g. Cameras, Access Control, Alarm" className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Start Date</label>
                  <input type="date" value={editMonitoringForm.start_date || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, start_date: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">End Date</label>
                  <input type="date" value={editMonitoringForm.end_date || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, end_date: e.target.value }))}
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                </div>
                <div className="col-span-2 flex items-center gap-3">
                  <input type="checkbox" id="mon-autorenew" checked={!!editMonitoringForm.auto_renew} onChange={e => setEditMonitoringForm(p => ({ ...p, auto_renew: e.target.checked }))} className="w-4 h-4 accent-[#C8622A]" />
                  <label htmlFor="mon-autorenew" className="text-[#8A9AB0] text-sm">Auto-renew when term ends</label>
                </div>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Contract Language</label>
                <textarea rows={12} value={editMonitoringForm.body || ''} onChange={e => setEditMonitoringForm(p => ({ ...p, body: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none font-mono" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowMonitoringModal(false)} className="flex-1 bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">Cancel</button>
                <button onClick={saveMonitoringContract} disabled={savingContract} className="flex-1 bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingContract ? 'Saving...' : editingAgreementIdx !== null ? 'Save Changes' : 'Add Contract'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contract Start Date Modal */}
      {showContractStartModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4"><span className="text-2xl">📋</span></div>
            <h3 className="text-white font-bold text-lg mb-1 text-center">Set Contract Start Dates</h3>
            <p className="text-[#8A9AB0] text-sm mb-5 text-center">Set a start date for each agreement. End date will be auto-set to 1 year later.</p>
            <div className="space-y-3 mb-5">
              {pendingContractItems.map(item => (
                <div key={`${item._type}_${item._idx}`} className="bg-[#0F1C2E] rounded-lg px-4 py-3">
                  <div className="flex justify-between items-center gap-3">
                    <div>
                      <p className="text-white text-sm font-medium">{item.name || (item._type === 'sla' ? 'Service Agreement' : 'Monitoring Contract')}</p>
                      <p className="text-[#8A9AB0] text-xs capitalize">{item._type}</p>
                    </div>
                    <input type="date" value={pendingContractDates[`${item._type}_${item._idx}`] || ''}
                      onChange={e => setPendingContractDates(prev => ({ ...prev, [`${item._type}_${item._idx}`]: e.target.value }))}
                      className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowContractStartModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Skip for now</button>
              <button onClick={saveContractStartDates} disabled={savingContractDates} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {savingContractDates ? 'Saving...' : 'Save Start Dates'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Date Modal */}
      {showRenewalModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4"><span className="text-2xl">🔄</span></div>
            <h3 className="text-white font-bold text-lg mb-1 text-center">Set Renewal Dates</h3>
            <p className="text-[#8A9AB0] text-sm mb-5 text-center">This deal has recurring items. Set a renewal date for each so ForgePt. can notify you and auto-generate renewal proposals.</p>
            <div className="space-y-3 mb-5">
              {pendingRenewalItems.map(item => (
                <div key={item.id} className="bg-[#0F1C2E] rounded-lg px-4 py-3">
                  <div className="flex justify-between items-center">
                    <div><p className="text-white text-sm font-medium">{item.item_name}</p><p className="text-[#8A9AB0] text-xs">${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} / renewal</p></div>
                    <input type="date" value={pendingRenewalDates[item.id] || ''} onChange={e => setPendingRenewalDates(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRenewalModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Skip for now</button>
              <button onClick={saveRenewalModalDates} disabled={savingRenewal} className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingRenewal ? 'Saving...' : 'Save Renewal Dates'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-1">Share Proposal</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Tag teammates on this deal — they'll be notified and gain visibility.</p>
            {orgProfiles.filter(p => p.id !== profile?.id).length === 0 ? (
              <p className="text-[#8A9AB0] text-sm">No other team members found.</p>
            ) : (
              <div className="space-y-2">
                {orgProfiles.filter(p => p.id !== profile?.id).map(p => {
                  const isCollab = collaborators.includes(p.id)
                  return (
                    <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg border cursor-pointer transition-colors ${isCollab ? 'border-[#C8622A] bg-[#C8622A]/10' : 'border-[#2a3d55] bg-[#0F1C2E] hover:border-[#3a4d65]'}`} onClick={() => shareProposal(p.id)}>
                      <div><p className="text-white text-sm font-medium">{p.full_name}</p><p className="text-[#8A9AB0] text-xs">{p.email}</p></div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${isCollab ? 'bg-[#C8622A] text-white' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>{isCollab ? '✓ Shared' : '+ Share'}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={() => setShowShareModal(false)} className="mt-5 w-full py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Done</button>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-sm">
            <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4"><span className="text-[#C8622A] text-xl">📋</span></div>
            <h3 className="text-white font-bold text-lg mb-2 text-center">Save as Template</h3>
            <p className="text-[#8A9AB0] text-sm mb-5 text-center">This will save all {lineItems.length} line items{laborItems.filter(l => l.role).length > 0 ? ` and ${laborItems.filter(l => l.role).length} labor item${laborItems.filter(l => l.role).length > 1 ? 's' : ''}` : ''} as a reusable template.</p>
            <div className="mb-4">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Template Name</label>
              <input type="text" value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="e.g. 8 Camera Install"
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" autoFocus />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowSaveTemplateModal(false); setTemplateName('') }} className="flex-1 py-2 bg-[#0F1C2E] text-[#8A9AB0] hover:text-white rounded-lg text-sm transition-colors">Cancel</button>
              <button onClick={saveAsTemplate} disabled={savingTemplate || !templateName.trim()} className="flex-1 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">{savingTemplate ? 'Saving...' : 'Save Template'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Proposal Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-white font-bold text-lg mb-1">Send Proposal</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Sending to <span className="text-white font-medium">{proposal?.client_email}</span> · PDF will be attached</p>
            <div className="space-y-4">
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Subject</label><input type="text" value={sendForm.subject} onChange={e => setSendForm(p => ({ ...p, subject: e.target.value }))} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" /></div>
              <div><label className="text-[#8A9AB0] text-xs mb-1 block">Message</label><textarea value={sendForm.message} onChange={e => setSendForm(p => ({ ...p, message: e.target.value }))} rows={6} className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" /></div>
              <div className="bg-[#0F1C2E] rounded-lg px-4 py-3 text-xs text-[#8A9AB0]">
                <p>✓ PDF proposal will be attached automatically</p><p>✓ Proposal will be marked as Sent</p><p>✓ Follow-up emails will begin on your cadence</p><p>✓ Reply-to will be set to your email</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSendModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={sendProposal} disabled={sendingProposal || !sendForm.subject || !sendForm.message} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">{sendingProposal ? 'Sending...' : 'Send Proposal →'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

{/* Pricing Options Modal */}
      {showPricingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-1">⚙ Pricing Options</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">Controls what clients see on PDF, DOCX, and the signing page. Internal view always shows full detail.</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-[#0F1C2E] rounded-xl px-4 py-3">
                <div>
                  <p className="text-white text-sm font-semibold">Hide Material Unit Prices</p>
                  <p className="text-[#8A9AB0] text-xs mt-0.5">Show item names and qty only — no unit price or line total</p>
                </div>
                <button onClick={toggleHideMaterialPrices}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.hide_material_prices ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.hide_material_prices ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between bg-[#0F1C2E] rounded-xl px-4 py-3">
                <div>
                  <p className="text-white text-sm font-semibold">Hide Labor Breakdown</p>
                  <p className="text-[#8A9AB0] text-xs mt-0.5">Show Role, Qty, Total only — no hourly rate</p>
                </div>
                <button onClick={toggleHideLaborBreakdown}
                  className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${proposal?.hide_labor_breakdown ? 'bg-[#C8622A]' : 'bg-[#2a3d55]'}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${proposal?.hide_labor_breakdown ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
              
            </div>
            <button onClick={() => setShowPricingModal(false)}
              className="mt-5 w-full py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
              Done
            </button>
          </div>
        </div>
      )}

{/* Move Line Modal */}
      {showMoveModal && moveLineIndex !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-bold text-lg mb-1">Move Item</h3>
            <p className="text-[#8A9AB0] text-sm mb-4">{editLines[moveLineIndex]?.item_name}</p>
            <div className="space-y-2 mb-5">
              {[{ id: 'general', name: 'General (no section)' }, ...editSections].map(s => (
                <button key={s.id} onClick={() => moveLineToSection(moveLineIndex, s.id, 'move')}
                  className="w-full text-left px-4 py-3 bg-[#0F1C2E] hover:bg-[#C8622A]/10 border border-[#2a3d55] hover:border-[#C8622A]/40 rounded-xl text-white text-sm transition-colors">
                  {s.name || 'Untitled Section'}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowMoveModal(false); setMoveLineIndex(null) }} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={() => { moveLineToSection(moveLineIndex, editLines[moveLineIndex]?.section_id || 'general', 'copy'); }}
                className="flex-1 bg-[#2a3d55] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">
                Copy Instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sent Prompt Modal */}
      {showSentPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4"><span className="text-[#C8622A] text-xl">✉</span></div>
            <h3 className="text-white font-bold text-lg mb-2">Did you send this proposal?</h3>
            <p className="text-[#8A9AB0] text-sm mb-6">Mark it as Sent so follow-up emails go out automatically on schedule.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSentPrompt(false)} className="flex-1 py-2 bg-[#0F1C2E] text-[#8A9AB0] hover:text-white rounded-lg text-sm transition-colors">Not yet</button>
              <button onClick={markAsSent} className="flex-1 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">Yes, mark as Sent</button>
            </div>
          </div>
        </div>
      )}

      {/* PO Modal */}
      {showPOModal && (() => {
        const selectedItems = lineItems.filter(l => selectedForPO.has(l.id))
        const vendorNames = [...new Set(selectedItems.map(i => i.vendor).filter(Boolean))]
        const poTotal = selectedItems.reduce((sum, i) => sum + ((i.your_cost_unit || 0) * (i.quantity || 0)), 0)
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
            <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
              <h3 className="text-white font-bold text-lg mb-4">Generate Purchase Order</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor Email <span className="font-normal text-[#8A9AB0]">(optional — for your records)</span></label>
                  {vendorNames.length > 0 && <p className="text-[#8A9AB0] text-xs mb-1">Vendors: {vendorNames.join(', ')}</p>}
                  <input type="email" value={poVendorEmail} onChange={e => setPOVendorEmail(e.target.value)} placeholder="vendor@company.com"
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
                        <span className="text-[#8A9AB0]">{item.vendor ? `${item.vendor} · ` : ''}Qty: {item.quantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowPOModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                  <button onClick={generatePO} disabled={generatingPO || selectedItems.length === 0 || (!poAutoNumber && !poNumber)}
                    className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                    {generatingPO ? 'Generating...' : `Generate PO (${selectedItems.length} items)`}
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