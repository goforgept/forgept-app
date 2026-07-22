import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useProfile } from '../context/ProfileContext'
import Sidebar from '../components/Sidebar'
import POList from '../components/POList'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType } from 'docx'
import DrawingToolSummary from '../components/drawing/DrawingToolSummary'
import ActivityFeed from '../components/proposal/ActivityFeed'
import DeleteProposalModal from '../components/proposal/DeleteProposalModal'
import ShareModal from '../components/proposal/ShareModal'
import SaveTemplateModal from '../components/proposal/SaveTemplateModal'
import SendProposalModal from '../components/proposal/SendProposalModal'
import PricingOptionsModal from '../components/proposal/PricingOptionsModal'
import SentPromptModal from '../components/proposal/SentPromptModal'
import EditClientModal from '../components/proposal/EditClientModal'
import ContractStartDateModal from '../components/proposal/ContractStartDateModal'
import RenewalDateModal from '../components/proposal/RenewalDateModal'
import MoveLineModal from '../components/proposal/MoveLineModal'
import AIBOMModal from '../components/proposal/AIBOMModal'
import DealSummaryModal from '../components/proposal/DealSummaryModal'
import PhotosModal from '../components/proposal/PhotosModal'
import ConvertToOrderModal from '../components/proposal/ConvertToOrderModal'
import RFQModal from '../components/proposal/RFQModal'
import POModal from '../components/proposal/POModal'
import SpecReaderModal from '../components/proposal/SpecReaderModal'
import DrawingReaderModal from '../components/proposal/DrawingReaderModal'
import SLAModal from '../components/proposal/SLAModal'
import MonitoringModal from '../components/proposal/MonitoringModal'
import ProposalHeader from '../components/proposal/ProposalHeader'
import ScopeSection from '../components/proposal/ScopeSection'
import RecurringSection from '../components/proposal/RecurringSection'
import ServiceAgreementSection from '../components/proposal/ServiceAgreementSection'
import MonitoringSection from '../components/proposal/MonitoringSection'
import BomSection from '../components/proposal/BomSection'
import CatalogSearch from '../components/CatalogSearch'

export default function ProposalDetail({ isAdmin }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, features } = useProfile()
  const pdfFont = profile?.organizations?.doc_font || 'helvetica'
  const pdfStriped = (profile?.organizations?.pdf_table_style || 'striped') === 'striped'
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [laborItems, setLaborItems] = useState([
    { role: '', quantity: '', unit: 'hr', your_cost: '', markup: 35, customer_price: 0 }
  ])
  const [orgLaborRates, setOrgLaborRates] = useState([])
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(null)
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
  const orgType = profile?.organizations?.org_type || 'integrator'
  const [canEdit, setCanEdit] = useState(true) // computed after proposal loads
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
  const [renewalDates, setRenewalDates] = useState({})
  const [savingRenewal, setSavingRenewal] = useState(false)
  const [showRenewalModal, setShowRenewalModal] = useState(false)
  const [pendingRenewalItems, setPendingRenewalItems] = useState([])
  const [pendingRenewalDates, setPendingRenewalDates] = useState({})
  const [showRFQModal, setShowRFQModal] = useState(false)
  const [showCatalogSearch, setShowCatalogSearch] = useState(false)
  const [showLibrarySearch, setShowLibrarySearch] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [libraryResults, setLibraryResults] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [librarySelectedVendor, setLibrarySelectedVendor] = useState({})
  const [librarySelectedItems, setLibrarySelectedItems] = useState(new Set())
  const [enabledCatalogSlugs, setEnabledCatalogSlugs] = useState([])
  const [rfqVendorData, setRfqVendorData] = useState({})
  const [rfqItems, setRfqItems] = useState([])
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
  const [specPageFrom, setSpecPageFrom] = useState('')
  const [specPageTo, setSpecPageTo] = useState('')
  const [analyzingSpec, setAnalyzingSpec] = useState(false)
  const [specSummary, setSpecSummary] = useState(null)
  const [showDealSummaryModal, setShowDealSummaryModal] = useState(false)
  const [dealSummary, setDealSummary] = useState(null)
  const [generatingDealSummary, setGeneratingDealSummary] = useState(false)
  const [photos, setPhotos] = useState([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [showPhotosModal, setShowPhotosModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [revisions, setRevisions] = useState([])
  const [showEditClientModal, setShowEditClientModal] = useState(false)
  const [editClientForm, setEditClientForm] = useState({ client_name: '', company: '', client_email: '' })
  const [savingClient, setSavingClient] = useState(false)
  const [allClients, setAllClients] = useState([])
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingProposal, setDeletingProposal] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [templatePickerSearch, setTemplatePickerSearch] = useState('')
  const [templatePickerList, setTemplatePickerList] = useState([])
  const [templatePickerLoading, setTemplatePickerLoading] = useState(false)
  const [templatePickerSelected, setTemplatePickerSelected] = useState(null)
  const [qboConnected, setQboConnected] = useState(false)
  const [sendingToQBO, setSendingToQBO] = useState(false)
  const [qboInvoiceId, setQboInvoiceId] = useState(null)
  const [vendors, setVendors] = useState([])
  const [poVendorEmail, setPOVendorEmail] = useState('')
  const [bulkField, setBulkField] = useState('')
  const [bulkValue, setBulkValue] = useState('')
  const [bulkSelectedLines, setBulkSelectedLines] = useState(new Set())
  const [rfqRequests, setRfqRequests] = useState([])
  // E-signing
  const [requestingSignature, setRequestingSignature] = useState(false)
  const [editingProposalName, setEditingProposalName] = useState(false)
  const [proposalNameDraft, setProposalNameDraft] = useState('')
  const [editingQuoteNumber, setEditingQuoteNumber] = useState(false)
  const [quoteNumberDraft, setQuoteNumberDraft] = useState('')
  const [quoteNumberError, setQuoteNumberError] = useState('')
  const [editingContractNumber, setEditingContractNumber] = useState(false)
  const [contractNumberDraft, setContractNumberDraft] = useState('')
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
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const [pipelineStages, setPipelineStages] = useState([])

  useEffect(() => {
    fetchProposal()
    fetchLineItems()
    fetchSections()
    fetchRFQRequests()
    fetchPhotos()
    fetchVendors()
  }, [id])

  useEffect(() => {
    if (!profile?.org_id) return
    supabase.from('organizations').select('qbo_connected').eq('id', profile.org_id).single()
      .then(({ data }) => setQboConnected(data?.qbo_connected || false))
    supabase.from('profiles').select('id, full_name, email').eq('org_id', profile.org_id)
      .then(({ data }) => setOrgProfiles(data || []))
    supabase.from('pipeline_stages').select('id, name, color, position').eq('org_id', profile.org_id).order('position')
      .then(({ data }) => setPipelineStages(data || []))
  }, [profile?.org_id])

  useEffect(() => {
    if (!profile?.logo_url) return
    if (profile.logo_url.startsWith('http')) { setResolvedLogoUrl(profile.logo_url); return }
    import('../r2').then(({ getR2Url, BUCKETS }) =>
      getR2Url(profile.logo_url, 60 * 60 * 24, BUCKETS.ASSETS).then(setResolvedLogoUrl)
    )
  }, [profile?.logo_url])

  const fetchProposal = async () => {
    const { data } = await supabase
      .from('proposals')
      .select('id,proposal_name,company,client_name,client_email,client_id,rep_name,rep_email,rep_phone,rep_title,industry,status,pipeline_stage_id,close_date,proposal_value,total_customer_value,total_your_cost,total_gross_margin_dollars,total_gross_margin_percent,labor_items,created_at,org_id,user_id,collaborator_ids,has_recurring,scope_of_work,job_description,submission_type,quote_number,contract_number,lump_sum_pricing,hide_material_prices,hide_labor_breakdown,show_msrp,tax_rate,tax_exempt,qbo_invoice_id,location_id,signing_token,signature_name,signature_at,signed_pdf_url,sla_contracts,monitoring_contracts,sla_contract,monitoring_contract,revision_number,original_proposal_id,is_current_revision,archived_at')
      .eq('id', id)
      .single()

    setProposal(data)

    // Load revision history — always check so rev 1 can see newer revisions
    const originalId = data.original_proposal_id || data.id
    const { data: allRevisions } = await supabase
      .from('proposals')
      .select('id, proposal_name, revision_number, status, created_at, is_current_revision')
      .or(`id.eq.${originalId},original_proposal_id.eq.${originalId}`)
      .order('revision_number', { ascending: true })
    setRevisions(allRevisions?.length > 1 ? allRevisions : [])
    setCollaborators(data?.collaborator_ids || [])
    setQboInvoiceId(data?.qbo_invoice_id || null)

    // Compute edit permission
    // Admins always can edit. Owner can edit. Collaborators can edit.
    // Regional managers can edit all quotes owned by someone in their region.
    const currentUserId  = profile?.id
    const isOwner        = data?.user_id === currentUserId
    const isCollaborator = (data?.collaborator_ids || []).includes(currentUserId)
    const isAdminUser    = profile?.role === 'admin' || profile?.org_role === 'admin'
    const regionsFeature = profile?.organizations?.feature_regions

    let isRegionalManagerOfDeal = false
    if (regionsFeature && profile?.is_regional_vp && profile?.region_id && data?.user_id) {
      const { data: ownerProfile } = await supabase
        .from('profiles').select('region_id').eq('id', data.user_id).single()
      isRegionalManagerOfDeal = ownerProfile?.region_id === profile.region_id
    }

    setCanEdit(isAdminUser || isOwner || isCollaborator || isRegionalManagerOfDeal)

    // Backward-compat: fall back to old singular columns if new arrays are empty
    let slaArr = (data?.sla_contracts?.length > 0) ? data.sla_contracts : (data?.sla_contract ? [data.sla_contract] : [])
    let monArr = (data?.monitoring_contracts?.length > 0) ? data.monitoring_contracts : (data?.monitoring_contract ? [data.monitoring_contract] : [])
    setSlaContracts(slaArr)
    setMonitoringContracts(monArr)

    // Load org SLA settings and auto-attach if applicable
    if (data?.org_id) {
      const [{ data: orgSLA }, { data: ratesData }] = await Promise.all([
        supabase.from('organizations').select('feature_sla, sla_auto_attach, sla_templates, feature_monitoring, monitoring_auto_attach, monitoring_templates, enabled_catalogs').eq('id', data.org_id).single(),
        supabase.from('labor_rates').select('role, cost_per_hour, bill_rate_per_hour, unit').eq('org_id', data.org_id).order('sort_order'),
      ])
      setOrgLaborRates(ratesData || [])
      setOrgSLASettings(orgSLA)
      setEnabledCatalogSlugs(orgSLA?.enabled_catalogs || [])
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

    // Auto-apply margin to confirmed lines missing customer price
    const confirmedNeedingMargin = (data || []).filter(l =>
      l.pricing_status === 'Confirmed' &&
      parseFloat(l.your_cost_unit) > 0 &&
      (!l.customer_price_unit || parseFloat(l.customer_price_unit) === 0)
    )

    if (confirmedNeedingMargin.length > 0) {
      for (const line of confirmedNeedingMargin) {
        const cost = parseFloat(line.your_cost_unit) || 0
        const markup = parseFloat(line.markup_percent) || 35
        const customerPriceUnit = parseFloat((cost * (1 + markup / 100)).toFixed(2))
        const customerPriceTotal = parseFloat((customerPriceUnit * (parseFloat(line.quantity) || 1)).toFixed(2))
        await supabase.from('bom_line_items').update({
          customer_price_unit: customerPriceUnit,
          customer_price_total: customerPriceTotal,
        }).eq('id', line.id)
        // Update local data too
        line.customer_price_unit = customerPriceUnit
        line.customer_price_total = customerPriceTotal
      }
    }

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

  const fetchVendors = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    if (!prof?.org_id) return
    const { data } = await supabase.from('vendors').select('id, vendor_name, contact_name, contact_email').eq('org_id', prof.org_id).eq('active', true).order('vendor_name')
    setVendors(data || [])
  }

  const logActivity = async (event, type = 'note') => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('activities').insert({
      proposal_id: id,
      client_id: proposal?.client_id || null,
      org_id: proposal?.org_id,
      user_id: user.id,
      type,
      title: event,
      source: 'system',
    })
    setActivityRefreshKey(k => k + 1)
  }

  const updateStatus = async (newStatus, stageId = null) => {
    const stageUpdate = stageId !== null ? { pipeline_stage_id: stageId } : {}
    const stageStateUpdate = stageId !== null ? { pipeline_stage_id: stageId } : {}
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
      } catch (e) { console.error('Job creation error:', e) }
    }
    if (newStatus === 'Won') {
      const recurringMissingDate = lineItems.filter(l => l.recurring && !l.renewal_date && !(renewalDates[l.id]))
      if (recurringMissingDate.length > 0) {
        const initialDates = {}
        recurringMissingDate.forEach(l => { initialDates[l.id] = '' })
        setPendingRenewalItems(recurringMissingDate)
        setPendingRenewalDates(initialDates)
        setShowRenewalModal(true)
        await supabase.from('proposals').update({ status: newStatus, ...stageUpdate }).eq('id', id)
        setProposal(prev => ({ ...prev, status: newStatus, ...stageStateUpdate }))
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
        await supabase.from('proposals').update({ status: newStatus, ...stageUpdate }).eq('id', id)
        setProposal(prev => ({ ...prev, status: newStatus, ...stageStateUpdate }))
        setShowContractStartModal(true)
        return
      }
      // All agreements have dates — create contract rows now
      await createContractRows(slaContracts, monitoringContracts)
    }
    await supabase.from('proposals').update({ status: newStatus, ...stageUpdate }).eq('id', id)
    setProposal(prev => ({ ...prev, status: newStatus, ...stageStateUpdate }))
    logActivity(`Status changed to ${newStatus}`)

    // Sync stage change to Zoho Deal (fire-and-forget)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) return
      fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/zoho-push-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ proposalId: id }),
      }).catch(() => {})
    })
  }

  const updateStage = async (stageId) => {
    const stage = pipelineStages.find(s => s.id === stageId)
    if (!stage) return
    let newStatus = 'Draft'
    if (stage.name === 'Won') newStatus = 'Won'
    else if (stage.name === 'Lost') newStatus = 'Lost'
    else if (stage.name === 'Proposal Sent') newStatus = 'Sent'
    await updateStatus(newStatus, stageId)
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

  const updateRep = async (repProfile) => {
    await supabase.from('proposals').update({
      user_id:   repProfile.id,
      rep_name:  repProfile.full_name,
      rep_email: repProfile.email,
      rep_phone: repProfile.phone || null,
      rep_title: repProfile.job_title || null,
    }).eq('id', id)
    setProposal(prev => ({ ...prev, user_id: repProfile.id, rep_name: repProfile.full_name, rep_email: repProfile.email, rep_phone: repProfile.phone || null, rep_title: repProfile.job_title || null }))
    logActivity(`Rep changed to ${repProfile.full_name}`)
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

  const toggleShowMsrp = async () => {
    const newVal = !proposal?.show_msrp
    await supabase.from('proposals').update({ show_msrp: newVal }).eq('id', id)
    setProposal(prev => ({ ...prev, show_msrp: newVal }))
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

  const saveQuoteNumber = async (valueOverride) => {
    const trimmed = (valueOverride !== undefined ? valueOverride : quoteNumberDraft).trim()
    if (!trimmed) { setQuoteNumberError('Quote number cannot be empty'); return }
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

  const saveContractNumber = async (valueOverride) => {
    const trimmed = (valueOverride !== undefined ? valueOverride : contractNumberDraft).trim()
    await supabase.from('proposals').update({ contract_number: trimmed || null }).eq('id', id)
    setProposal(prev => ({ ...prev, contract_number: trimmed || null }))
    setEditingContractNumber(false)
    if (trimmed) logActivity(`Contract number set to ${trimmed}`)
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
          logoUrl: resolvedLogoUrl || null,
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
      const { uploadToR2, BUCKETS } = await import('../r2')
      await uploadToR2(fileName, file, 'application/pdf', BUCKETS.DOCUMENTS)
      await supabase.from('proposals').update({ signed_pdf_url: fileName }).eq('id', id)
      setProposal(prev => ({ ...prev, signed_pdf_url: fileName }))
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
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.functions.invoke('generate-sow', {
      body: {
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
      }
    })

    if (error) throw error

    await fetchProposal()
    logActivity('Scope of Work generated')
  } catch (err) {
    console.error('SOW generation error:', err)
    alert(err.message)
  }
  setGeneratingSOW(false)
}

  const searchLibrary = async (q) => {
    setLibrarySearch(q)
    if (!q.trim()) { setLibraryResults([]); return }
    setLibraryLoading(true)

    const [{ data: prods }, catalogRes] = await Promise.all([
      supabase
        .from('product_library')
        .select('*, product_library_pricing(*)')
        .eq('org_id', proposal?.org_id)
        .eq('active', true)
        .or(`item_name.ilike.%${q}%,part_number.ilike.%${q}%,manufacturer.ilike.%${q}%,category.ilike.%${q}%`)
        .limit(30),
      enabledCatalogSlugs.length > 0
        ? supabase
            .from('catalog_products')
            .select('*')
            .in('catalog_slug', enabledCatalogSlugs)
            .eq('active', true)
            .or(`model_name.ilike.%${q}%,part_number.ilike.%${q}%,manufacturer.ilike.%${q}%,category.ilike.%${q}%`)
            .limit(30)
        : Promise.resolve({ data: [] }),
    ])

    // Catalog items already copied to this org's library — don't show them twice
    const copiedPartNumbers = new Set((prods || []).map(p => p.part_number).filter(Boolean))
    const catalogItems = (catalogRes.data || [])
      .filter(c => !copiedPartNumbers.has(c.part_number))
      .map(c => ({
        id: `cat_${c.id}`,
        _catalogProductId: c.id,
        _fromCatalog: true,
        _catalogLabel: c.catalog_label,
        item_name: c.model_name || c.part_number,
        manufacturer: c.manufacturer,
        part_number: c.part_number,
        category: c.category,
        unit: c.unit,
        msrp: c.msrp,
        product_library_pricing: [],
      }))

    setLibraryResults([...(prods || []), ...catalogItems])
    setLibraryLoading(false)
  }

  const addLibraryItemsToBOM = async () => {
    const STALE_DAYS = 120
    const newLines = []

    for (const prod of libraryResults) {
      if (!librarySelectedItems.has(prod.id)) continue

      // Catalog item not yet in library — copy it now
      if (prod._fromCatalog) {
        await supabase.from('product_library').insert({
          org_id: proposal?.org_id,
          item_name: prod.item_name,
          manufacturer: prod.manufacturer || null,
          part_number: prod.part_number || null,
          category: prod.category || null,
          unit: prod.unit || 'ea',
          msrp: prod.msrp || null,
          catalog_product_id: prod._catalogProductId,
          active: true,
        })
        newLines.push({
          proposal_id: id,
          item_name: prod.item_name,
          manufacturer: prod.manufacturer || '',
          part_number_sku: prod.part_number || '',
          quantity: '1',
          unit: prod.unit || 'ea',
          category: prod.category || '',
          vendor: '',
          your_cost_unit: '',
          markup_percent: '35',
          customer_price_unit: '',
          customer_price_total: '',
          pricing_status: 'Needs Pricing',
          msrp_unit: prod.msrp ? String(prod.msrp) : '',
        })
        continue
      }

      const selectedPricing = librarySelectedVendor[prod.id] || prod.product_library_pricing?.[0]
      const days = selectedPricing?.pricing_date
        ? Math.floor((new Date() - new Date(selectedPricing.pricing_date)) / (1000 * 60 * 60 * 24))
        : null
      const isStale = !selectedPricing || days === null || days > STALE_DAYS
      const cost = parseFloat(selectedPricing?.your_cost) || 0
      newLines.push({
        proposal_id: id,
        item_name: prod.item_name,
        manufacturer: prod.manufacturer || '',
        part_number_sku: prod.part_number || '',
        quantity: '1',
        unit: prod.unit || 'ea',
        category: prod.category || '',
        vendor: selectedPricing?.vendor || '',
        your_cost_unit: isStale ? '' : String(cost),
        markup_percent: '35',
        customer_price_unit: isStale ? '' : (cost * 1.35).toFixed(2),
        customer_price_total: '',
        pricing_status: isStale ? 'Needs Pricing' : 'Confirmed',
        msrp_unit: prod.msrp ? String(prod.msrp) : '',
      })
    }
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

  const addFromCatalog = (item) => {
    const newLine = {
      proposal_id: id,
      item_name: item.item_name,
      manufacturer: '',
      part_number_sku: item.part_number_sku || '',
      quantity: '1',
      unit: item.unit || 'ea',
      category: item.category || '',
      vendor: item.vendor || '',
      your_cost_unit: item.your_cost_unit || '',
      markup_percent: item.markup_percent || '35',
      customer_price_unit: item.customer_price_unit || '',
      customer_price_total: '',
      pricing_status: item.pricing_status || 'Needs Pricing',
    }
    if (!editingBOM) {
      setEditLines([...lineItems.map(l => ({ ...l })), newLine])
      setEditingBOM(true)
    } else {
      setEditLines(prev => [...prev, newLine])
    }
  }

  const openRFQModal = () => {
    const candidates = selectedForPO.size > 0
      ? lineItems.filter(l => selectedForPO.has(l.id) && l.vendor)
      : lineItems.filter(l => l.pricing_status === 'Needs Pricing' && l.vendor)
    if (candidates.length === 0) {
      alert(selectedForPO.size > 0 ? 'Checked items have no vendor assigned.' : 'No items need pricing or no vendors assigned.')
      return
    }
    const byVendor = candidates.reduce((acc, item) => {
      const vendor = item.vendor || 'Unknown Vendor'
      if (!acc[vendor]) acc[vendor] = []
      acc[vendor].push(item)
      return acc
    }, {})
    const initData = {}
    Object.keys(byVendor).forEach(v => {
      const found = vendors.find(vr => vr.vendor_name === v)
      initData[v] = { email: found?.contact_email || '', contactName: found?.contact_name || '', attachExcel: false }
    })
    setRfqItems(candidates)
    setRfqVendorData(initData)
    setShowRFQModal(true)
  }

  const sendAllRFQs = async () => {
    setSendingRFQs(true)
    const candidates = selectedForPO.size > 0
      ? lineItems.filter(l => selectedForPO.has(l.id) && l.vendor)
      : lineItems.filter(l => l.pricing_status === 'Needs Pricing' && l.vendor)
    const byVendor = candidates.reduce((acc, item) => {
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

      // Create rfq_requests row and get token
      const { data: rfqRequest } = await supabase
        .from('rfq_requests')
        .insert({
          proposal_id: proposal.id,
          org_id: proposal.org_id,
          vendor_name: vendorName,
          vendor_email: vendorInfo.email,
          line_item_ids: items.map(i => i.id),
          expires_at: expiresAt.toISOString(),
          status: 'pending'
        })
        .select('id, token')
        .single()

      const responseLink = rfqRequest?.token
        ? `https://app.goforgept.com/rfq-response/${rfqRequest.token}`
        : null

      // Update bom_line_items with rfq_request_id
      if (rfqRequest?.id) {
        for (const item of items) {
          await supabase.from('bom_line_items').update({
            rfq_expires_at: expiresAtStr,
            rfq_request_id: rfqRequest.id
          }).eq('id', item.id)
        }
      }

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
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData?.session?.access_token
        if (!token) throw new Error('No auth session — please refresh and try again.')

        const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-rfq', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
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
            vendorContactName: vendorInfo.contactName || '',
            proposalName: proposal.proposal_name,
            repName: proposal.rep_name,
            repEmail: proposal.rep_email,
            company: profile?.company_name || proposal.company,
            excelBase64,
            expiresAt: expiresAtStr,
            responseLink
          })
        })
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Send failed (${res.status}): ${body}`)
        }

        // Send to competing vendors (same items, separate rfq_requests rows)
        for (const cv of (vendorInfo.competing || [])) {
          if (!cv.email) continue
          const { data: cvRequest } = await supabase
            .from('rfq_requests')
            .insert({
              proposal_id: proposal.id,
              org_id: proposal.org_id,
              vendor_name: cv.name || cv.email,
              vendor_email: cv.email,
              line_item_ids: items.map(i => i.id),
              expires_at: expiresAt.toISOString(),
              status: 'pending'
            })
            .select('id, token')
            .single()

          const cvLink = cvRequest?.token
            ? `https://app.goforgept.com/rfq-response/${cvRequest.token}`
            : null

          const cvRes = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-rfq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              lineItemIds: [],
              items: items.map(i => ({
                itemName: i.item_name,
                manufacturer: i.manufacturer || '',
                partNumber: i.part_number_sku || '',
                quantity: i.quantity,
                unit: i.unit || 'ea'
              })),
              vendorEmail: cv.email,
              vendorName: cv.name || cv.email,
              proposalName: proposal.proposal_name,
              repName: proposal.rep_name,
              repEmail: proposal.rep_email,
              company: profile?.company_name || proposal.company,
              excelBase64,
              expiresAt: expiresAtStr,
              responseLink: cvLink,
              skipVendorCheck: true,
            })
          })
          if (!cvRes.ok) {
            const body = await cvRes.text()
            console.warn(`Competing vendor send failed for ${cv.email}:`, body)
          }
        }
      } catch (err) {
        console.error(`RFQ error for ${vendorName}:`, err)
        await fetchLineItems()
        await fetchRFQRequests()
        setSendingRFQs(false)
        alert(`Failed to send RFQ to ${vendorName}: ${err.message}`)
        return
      }
    }

    await fetchLineItems()
    await fetchRFQRequests()
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

  const downloadSignedCopy = async () => {
    const doc = await generatePDFDoc()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')
    const name = proposal?.signature_name || ''
    const timestamp = proposal?.signature_at || new Date().toISOString()

    doc.addPage()
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 8, 'F')
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Electronic Signature Confirmation', 14, 28)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
    doc.text(`Proposal: ${proposal?.proposal_name || ''}`, 14, 42)
    doc.text(`Client: ${proposal?.client_name || ''} — ${proposal?.company || ''}`, 14, 50)
    doc.text(`Email: ${proposal?.client_email || ''}`, 14, 58)
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Signature Details', 14, 74)
    doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.line(14, 76, pageWidth - 14, 76)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
    doc.text(`Signed by: ${name}`, 14, 86)
    doc.text(`Date & Time: ${new Date(timestamp).toLocaleString()}`, 14, 94)
    doc.setFillColor(248, 249, 250); doc.rect(14, 114, pageWidth - 28, 36, 'F')
    doc.setDrawColor(220, 220, 220); doc.rect(14, 114, pageWidth - 28, 36, 'S')
    doc.setFontSize(22); doc.setFont('helvetica', 'italic'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text(name, 24, 137)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150)
    doc.text(`Electronic signature recorded ${new Date(timestamp).toLocaleString()}`, 14, 158)
    doc.text('This electronic signature is legally binding and equivalent to a handwritten signature.', 14, 165)
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, pageHeight - 12, pageWidth, 12, 'F')
    doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal')
    doc.text(`${profile?.company_name || 'ForgePt.'} · Signed Proposal · Confidential`, pageWidth / 2, pageHeight - 4, { align: 'center' })

    doc.save(`Signed-${proposal?.proposal_name || 'Proposal'}.pdf`)
  }

  const downloadDOCX = async () => {
    if (proposal?.status === 'Draft') setShowSentPrompt(true)

    const { data: freshProposal } = await supabase
      .from('proposals')
      .select('hide_material_prices, hide_labor_breakdown, lump_sum_pricing, tax_rate, tax_exempt, scope_of_work, labor_items, proposal_name')
      .eq('id', id)
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

    const docxCsl = [profile?.bill_to_city, profile?.bill_to_state, profile?.bill_to_zip].filter(Boolean).join(', ')
    const children = [
      new Paragraph({ children: [new TextRun({ text: profile?.company_name || proposal?.company || 'ForgePt.', bold: true, size: 36, color: primaryColor })] }),
      ...(profile?.bill_to_address ? [new Paragraph({ children: [new TextRun({ text: profile.bill_to_address, size: 18, color: '888888' })] })] : []),
      ...(docxCsl ? [new Paragraph({ children: [new TextRun({ text: docxCsl, size: 18, color: '888888' })] })] : []),
      ...(profile?.license_number ? [new Paragraph({ children: [new TextRun({ text: `Lic #: ${profile.license_number}`, size: 18, color: '888888' })] })] : []),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
      new Paragraph({ children: [new TextRun({ text: proposal?.proposal_name || 'Proposal', bold: true, size: 48 })] }),
      new Paragraph({ children: [new TextRun({ text: `Prepared for: ${proposal?.company || ''} — ${proposal?.client_name || ''}`, size: 20, color: '666666' })] }),
      ...(clientAddress ? [new Paragraph({ children: [new TextRun({ text: `Address: ${clientAddress}`, size: 20, color: '666666' })] })] : []),
      new Paragraph({ children: [new TextRun({ text: `Email: ${proposal?.client_email || ''}`, size: 20, color: '666666' })] }),
      new Paragraph({ children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString()}`, size: 20, color: '666666' })] }),
      ...(proposal?.quote_number ? [new Paragraph({ children: [new TextRun({ text: `Quote #: ${proposal.quote_number}`, size: 20, color: '666666' })] })] : []),
      ...(proposal?.contract_number ? [new Paragraph({ children: [new TextRun({ text: `Contract #: ${proposal.contract_number}`, size: 20, color: '666666' })] })] : []),
      ...(proposal?.rep_name ? [new Paragraph({ children: [new TextRun({ text: `Rep: ${proposal.rep_name}`, size: 18, color: '888888' })] })] : []),
      ...(proposal?.rep_title ? [new Paragraph({ children: [new TextRun({ text: proposal.rep_title, size: 18, color: '888888' })] })] : []),
      ...(proposal?.rep_email ? [new Paragraph({ children: [new TextRun({ text: proposal.rep_email, size: 18, color: '888888' })] })] : []),
      ...(proposal?.rep_phone ? [new Paragraph({ children: [new TextRun({ text: proposal.rep_phone, size: 18, color: '888888' })] })] : []),
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
          const response = await fetch(photo.displayUrl || photo.url)
          const arrayBuffer = await response.arrayBuffer()
          children.push(
            new Paragraph({ children: [new ImageRun({ data: arrayBuffer, transformation: { width: 400, height: 250 }, type: 'jpg' })] })
          )
          if (photo.caption) {
            children.push(new Paragraph({ children: [new TextRun({ text: photo.caption, size: 16, color: '888888', italics: true })] }))
          }
          children.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
        } catch (e) { console.error('DOCX photo error:', e) }
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
      let finalPONumber = poNumber
      if (poAutoNumber) {
        const { data: org } = await supabase.from('organizations').select('po_counter').eq('id', profile.org_id).single()
        finalPONumber = `PO-${org.po_counter}`
        await supabase.from('organizations').update({ po_counter: org.po_counter + 1 }).eq('id', profile.org_id)
      }

      const selectedItems = lineItems.filter(l => selectedForPO.has(l.id))
      const vendorNames = [...new Set(selectedItems.map(i => i.vendor).filter(Boolean))].join(', ')
      const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()

      doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.rect(0, 0, pageWidth, 40, 'F')

      if (resolvedLogoUrl) {
        const img = new Image()
        img.src = resolvedLogoUrl
        await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
        const maxW = 50, maxH = 26
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
        const logoW = img.naturalWidth * ratio
        const logoH = img.naturalHeight * ratio
        const logoY = 8 + (maxH - logoH) / 2
        doc.addImage(img, 'PNG', 14, logoY, logoW, logoH)
      } else {
        doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont(pdfFont, 'bold')
        doc.text(profile?.company_name || 'ForgePt.', 14, 22)
      }

      doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont(pdfFont, 'bold')
      doc.text('PURCHASE ORDER', pageWidth - 14, 18, { align: 'right' })
      doc.setFontSize(10); doc.setFont(pdfFont, 'normal')
      doc.text(finalPONumber, pageWidth - 14, 28, { align: 'right' })

      const billToLines = [profile?.company_name || '', profile?.bill_to_address || '', [profile?.bill_to_city, profile?.bill_to_state, profile?.bill_to_zip].filter(Boolean).join(', ')].filter(Boolean)
      const shipToLines = [profile?.company_name || '', profile?.ship_to_address || '', [profile?.ship_to_city, profile?.ship_to_state, profile?.ship_to_zip].filter(Boolean).join(', ')].filter(Boolean)

      doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont(pdfFont, 'normal')
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 52)
      doc.text(`Project: ${proposal?.proposal_name || ''}`, 14, 60)

      const col1 = 14, col2 = pageWidth / 2 - 10, col3 = pageWidth / 2 + 30
      doc.setFontSize(9); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('VENDOR', col1, 74); doc.text('BILL TO', col2, 74); doc.text('SHIP TO', col3, 74)
      doc.setFont(pdfFont, 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(9)
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
      await supabase.from('purchase_orders').insert({ po_number: finalPONumber, proposal_id: id, org_id: profile.org_id, vendor_name: vendorNames || null, status: 'Sent', total_amount: totalAmount })
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
      console.error('Excel upload error:', err)
      alert('Could not read Excel file')
    }
  }

  const startEditing = () => {
    setEditLines(lineItems.map(l => ({ ...l })))
    setEditSections(sections.map(s => ({ ...s, labor_items: s.labor_items || [] })))
    setEditingBOM(true)
  }

  const openTemplatePicker = async () => {
    if (!editingBOM) startEditing()
    setShowTemplatePicker(true)
    setTemplatePickerSearch('')
    setTemplatePickerSelected(null)
    setTemplatePickerLoading(true)
    const { data } = await supabase.from('templates')
      .select('id, name, description, industry, labor_items, scope_of_work')
      .eq('org_id', profile.org_id)
      .order('name')
    setTemplatePickerList(data || [])
    setTemplatePickerLoading(false)
  }

  const applyTemplate = async (template, mode) => {
    const [{ data: tmplLines }, { data: tmplSects }] = await Promise.all([
      supabase.from('template_line_items').select('*').eq('template_id', template.id).order('id'),
      supabase.from('template_sections').select('*').eq('template_id', template.id).order('sort_order'),
    ])

    const sectionIdMap = {}
    const baseOrder = mode === 'replace' ? 0 : editSections.length
    const newSections = (tmplSects || []).map((s, si) => {
      const tempId = `new_${Date.now()}_${si}`
      sectionIdMap[s.id] = tempId
      return {
        id: tempId,
        proposal_id: id,
        org_id: profile?.org_id,
        name: s.name,
        sort_order: baseOrder + (s.sort_order ?? si),
        include_labor: s.include_labor,
        labor_items: s.labor_items || [],
        isNew: true,
      }
    })

    const newLines = (tmplLines || []).map(l => ({
      item_name: l.item_name,
      part_number_sku: l.part_number_sku || '',
      quantity: String(l.quantity || 1),
      unit: l.unit || 'ea',
      category: l.category || '',
      vendor: l.vendor || '',
      your_cost_unit: l.your_cost_unit != null ? String(l.your_cost_unit) : '',
      markup_percent: l.markup_percent != null ? String(l.markup_percent) : String(parseFloat(profile?.default_markup_percent) || 35),
      customer_price_unit: l.customer_price_unit != null ? String(l.customer_price_unit) : '',
      section_id: l.section_id ? (sectionIdMap[l.section_id] || null) : null,
    }))

    const newLabor = template.labor_items || []

    if (mode === 'replace') {
      setEditSections(newSections)
      setEditLines(newLines)
      setLaborItems(newLabor.length ? newLabor : [])
    } else {
      setEditSections(prev => [...prev, ...newSections])
      setEditLines(prev => [...prev, ...newLines])
      if (newLabor.length) setLaborItems(prev => [...prev, ...newLabor])
    }

    // Apply template SOW to the proposal if present
    if (template.scope_of_work) {
      const applySOW = mode === 'replace' || !proposal?.scope_of_work
      if (applySOW) {
        await supabase.from('proposals').update({ scope_of_work: template.scope_of_work }).eq('id', id)
        setProposal(prev => ({ ...prev, scope_of_work: template.scope_of_work }))
      }
    }

    setShowTemplatePicker(false)
    setTemplatePickerSelected(null)
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

      if (field === 'role') {
        const matched = orgLaborRates.find(r => r.role === value)
        if (matched) {
          updated[index].your_cost = String(matched.cost_per_hour || '')
          updated[index].unit      = matched.unit || 'hr'
          const cost = parseFloat(matched.cost_per_hour) || 0
          const bill = parseFloat(matched.bill_rate_per_hour) || 0
          if (cost > 0 && bill > 0) {
            updated[index].markup = (((bill - cost) / cost) * 100).toFixed(1)
          }
          const qty = parseFloat(updated[index].quantity) || 0
          if (cost > 0 && qty > 0) {
            const mkp = parseFloat(updated[index].markup) || 0
            updated[index].customer_price = (cost * (1 + mkp / 100) * qty).toFixed(2)
          }
        }
      }

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
    const defaultMarkup = parseFloat(profile?.default_markup_percent) || 35
    setEditSections(prev => prev.map(s => s.id === sectionId
      ? { ...s, labor_items: [...(s.labor_items || []), { role: '', quantity: '', unit: 'hr', your_cost: '', markup: defaultMarkup, customer_price: 0 }] }
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

      // Auto-fill from rate card when a matching role is selected
      if (field === 'role') {
        const matched = orgLaborRates.find(r => r.role === value)
        if (matched) {
          updated[index].your_cost = String(matched.cost_per_hour || '')
          updated[index].unit      = matched.unit || 'hr'
          const cost = parseFloat(matched.cost_per_hour) || 0
          const bill = parseFloat(matched.bill_rate_per_hour) || 0
          if (cost > 0 && bill > 0) {
            updated[index].markup = (((bill - cost) / cost) * 100).toFixed(1)
          }
          const qty = parseFloat(updated[index].quantity) || 0
          if (cost > 0 && qty > 0) {
            const mkp = parseFloat(updated[index].markup) || 0
            updated[index].customer_price = (cost * (1 + mkp / 100) * qty).toFixed(2)
          }
        }
      }

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
            msrp_unit: parseFloat(l.msrp_unit) || null,
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
    const { data: template, error } = await supabase.from('templates').insert({
      org_id: profile.org_id, name: templateName.trim(), industry: proposal?.industry || '',
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
        } catch (e) { console.error('Share notification error:', e) }
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
      let finalOrderNumber = orderNumber
      if (orderAutoNumber) {
        const { data: org } = await supabase.from('organizations').select('po_counter').eq('id', profile.org_id).single()
        finalOrderNumber = `ORD-${org.po_counter}`
        await supabase.from('organizations').update({ po_counter: org.po_counter + 1 }).eq('id', profile.org_id)
      }
      const totalValue = lineItems.reduce((sum, l) => sum + (l.customer_price_total || 0), 0)
      const { data: order, error } = await supabase.from('manufacturer_orders').insert({
        org_id: profile.org_id, proposal_id: id, order_number: finalOrderNumber, vendor_name: proposal?.company || '',
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
    const { data: clientsData } = await supabase.from('clients').select('id, company, client_name, email').eq('org_id', profile.org_id).order('company', { ascending: true })
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

  const archiveProposal = async () => {
    await supabase.from('proposals').update({ archived_at: new Date().toISOString() }).eq('id', id)
    setProposal(prev => ({ ...prev, archived_at: new Date().toISOString() }))
  }

  const restoreProposal = async () => {
    await supabase.from('proposals').update({ archived_at: null }).eq('id', id)
    setProposal(prev => ({ ...prev, archived_at: null }))
  }

  const createRevision = async () => {
    if (!proposal) return
    const originalId = proposal.original_proposal_id || id

    const { data: siblings } = await supabase
      .from('proposals')
      .select('revision_number')
      .or(`id.eq.${originalId},original_proposal_id.eq.${originalId}`)
      .order('revision_number', { ascending: false })
      .limit(1)
    const nextRevNum = (siblings?.[0]?.revision_number || 1) + 1

    const { id: _id, created_at, archived_at, ...fields } = proposal
    const { data: newProposal, error } = await supabase
      .from('proposals')
      .insert({ ...fields, status: 'Draft', revision_number: nextRevNum, original_proposal_id: originalId, is_current_revision: true })
      .select().single()
    if (error || !newProposal) return

    const [{ data: lineItems }, { data: sects }, { data: dSheets }] = await Promise.all([
      supabase.from('bom_line_items').select('*').eq('proposal_id', id),
      supabase.from('proposal_sections').select('*').eq('proposal_id', id),
      supabase.from('drawing_sheets').select('*').eq('proposal_id', id),
    ])

    await Promise.all([
      lineItems?.length && supabase.from('bom_line_items').insert(
        lineItems.map(({ id: _, created_at: __, ...li }) => ({ ...li, proposal_id: newProposal.id }))
      ),
      sects?.length && supabase.from('proposal_sections').insert(
        sects.map(({ id: _, ...s }) => ({ ...s, proposal_id: newProposal.id }))
      ),
      dSheets?.length && supabase.from('drawing_sheets').insert(
        dSheets.map(({ id: _, created_at: __, ...ds }) => ({ ...ds, proposal_id: newProposal.id, status: 'draft' }))
      ),
      supabase.from('proposals').update({ is_current_revision: false }).eq('id', id),
    ])

    navigate(`/proposal/${newProposal.id}`)
  }

  const deleteProposal = async () => {
    if (deleteConfirmText !== proposal?.proposal_name) return
    setDeletingProposal(true)
    try {
      const photoData = await supabase.from('proposal_photos').select('url').eq('proposal_id', id)
      for (const photo of (photoData.data || [])) {
        const path = photo.url.split('/proposal-photos/')[1]
        // R2 cleanup handled via maintenance queue
      }
      const r1 = await supabase.from('proposal_photos').delete().eq('proposal_id', id)
      if (r1.error) { console.error('proposal_photos delete error:', r1.error); alert('Error: ' + r1.error.message); setDeletingProposal(false); return }
      const r2 = await supabase.from('activities').delete().eq('proposal_id', id)
      if (r2.error) { console.error('activities delete error:', r2.error); alert('Error: ' + r2.error.message); setDeletingProposal(false); return }
      const r3 = await supabase.from('bom_line_items').delete().eq('proposal_id', id)
      if (r3.error) { console.error('bom_line_items delete error:', r3.error); alert('Error: ' + r3.error.message); setDeletingProposal(false); return }
      const r4 = await supabase.from('purchase_orders').delete().eq('proposal_id', id)
      if (r4.error) { console.error('purchase_orders delete error:', r4.error); alert('Error: ' + r4.error.message); setDeletingProposal(false); return }
      // Delete or unlink all related records before deleting proposal
      await supabase.from('rfq_requests').delete().eq('proposal_id', id)
      await supabase.from('proposal_sections').delete().eq('proposal_id', id)
      await supabase.from('change_orders').delete().eq('proposal_id', id)
      await supabase.from('contracts').delete().eq('proposal_id', id)
      await supabase.from('invoices').update({ proposal_id: null }).eq('proposal_id', id)
      await supabase.from('jobs').update({ proposal_id: null }).eq('proposal_id', id)
      const r5 = await supabase.from('proposals').delete().eq('id', id)
      if (r5.error) { console.error('proposals delete error:', r5.error); alert('Error: ' + r5.error.message); setDeletingProposal(false); return }
      navigate('/proposals')
    } catch (err) {
      alert('Delete error: ' + err.message)
      setDeletingProposal(false)
    }
  }

  const fetchPhotos = async () => {
    const { data } = await supabase.from('proposal_photos').select('*').eq('proposal_id', id).order('created_at', { ascending: true })
    if (!data) { setPhotos([]); return }

    const { getR2Url, BUCKETS } = await import('../r2')
      const photosWithUrls = await Promise.all(data.map(async (photo) => {
        if (photo.url.startsWith('http')) {
          return photo // old Supabase URL — use directly until migrated
        }
        const signedUrl = await getR2Url(photo.url, 60 * 60 * 24, BUCKETS.PHOTOS)
        return { ...photo, displayUrl: signedUrl || photo.url }
      }))

    setPhotos(photosWithUrls)
  }
const fetchRFQRequests = async () => {
    const { data } = await supabase
      .from('rfq_requests')
      .select('*')
      .eq('proposal_id', id)
      .order('created_at', { ascending: false })
    setRfqRequests(data || [])
  }

  const deleteRFQ = async (rfq) => {
    if (!window.confirm(`Delete RFQ for ${rfq.vendor_name}? This cannot be undone.`)) return
    await supabase.from('rfq_requests').delete().eq('id', rfq.id)
    if (rfq.line_item_ids?.length > 0) {
      await supabase.from('bom_line_items')
        .update({ pricing_status: 'Needs Pricing', rfq_request_id: null, rfq_expires_at: null })
        .in('id', rfq.line_item_ids)
    }
    await fetchRFQRequests()
    await fetchLineItems()
  }

const generateDealSummary = async () => {
    setGeneratingDealSummary(true)
    setDealSummary(null)
    try {
      const { data: { session: refreshed } } = await supabase.auth.refreshSession()
      const { data: { session: fallback } } = refreshed ? { data: { session: refreshed } } : await supabase.auth.getSession()
      const currentSession = refreshed || fallback
      if (!currentSession?.access_token) throw new Error('Not authenticated — please refresh the page and try again.')
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
      let fileBase64
      let mediaType = specFile.type

      const isPDF = specFile.type === 'application/pdf'
      const fromPage = parseInt(specPageFrom) || null
      const toPage = parseInt(specPageTo) || null

      if (isPDF && (fromPage || toPage)) {
        const { PDFDocument } = await import('pdf-lib')
        const arrayBuffer = await specFile.arrayBuffer()
        const srcDoc = await PDFDocument.load(arrayBuffer)
        const total = srcDoc.getPageCount()
        const start = Math.max(0, (fromPage || 1) - 1)
        const end = Math.min(total - 1, (toPage || total) - 1)
        if (start > end) throw new Error(`Invalid page range: ${fromPage}–${toPage} (document has ${total} pages)`)
        const newDoc = await PDFDocument.create()
        const indices = Array.from({ length: end - start + 1 }, (_, i) => start + i)
        const copied = await newDoc.copyPagesFrom(srcDoc, indices)
        copied.forEach(p => newDoc.addPage(p))
        const bytes = await newDoc.save()
        fileBase64 = btoa(String.fromCharCode(...new Uint8Array(bytes)))
      } else {
        const reader = new FileReader()
        fileBase64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(specFile)
        })
      }

      const { data: { session: currentSession } } = await supabase.auth.refreshSession()
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-read-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({
          fileBase64,
          mediaType,
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
      const { data, error } = await supabase.functions.invoke('ai-build-bom', {
        body: { description: aiBOMPrompt, industry: proposal?.industry || '' }
      })
      if (error) throw error
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
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a JPEG, PNG, or WEBP image.')
      return
    }
    setUploadingPhoto(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${proposal?.org_id}/${id}/${Date.now()}.${fileExt}`
      const { uploadToR2, getR2Url, BUCKETS } = await import('../r2')
      await uploadToR2(fileName, file, file.type, BUCKETS.PHOTOS)
      const signedUrl = await getR2Url(fileName, 60 * 60 * 24 * 365)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('proposal_photos').insert({ proposal_id: id, org_id: proposal?.org_id, user_id: user.id, url: fileName, caption: '' })
      await fetchPhotos()
      logActivity(`Site photo added`)
    } catch (err) { alert('Error uploading photo: ' + err.message) }
    setUploadingPhoto(false)
  }

  const deletePhoto = async (photoId, url) => {
    if (!window.confirm('Delete this photo?')) return
    // Delete from DB — R2 cleanup handled separately
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
      .select('hide_material_prices, hide_labor_breakdown, lump_sum_pricing, show_msrp, tax_rate, tax_exempt, scope_of_work, labor_items, proposal_name')
      .eq('id', id)
      .single()
    const p = freshProposal ? { ...proposal, ...freshProposal } : proposal
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')

    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 40, 'F')

    if (resolvedLogoUrl) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = resolvedLogoUrl
      await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
      if (img.naturalWidth > 0) {
        try {
          const maxW = 50, maxH = 26
          const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
          const logoW = img.naturalWidth * ratio
          const logoH = img.naturalHeight * ratio
          const logoY = 8 + (maxH - logoH) / 2
          doc.addImage(img, 'PNG', 14, logoY, logoW, logoH)
        } catch {
          doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont(pdfFont, 'bold')
          doc.text(profile?.company_name || proposal?.company || 'ForgePt.', 14, 20)
        }
      } else {
        doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont(pdfFont, 'bold')
        doc.text(profile?.company_name || proposal?.company || 'ForgePt.', 14, 20)
      }
    } else {
      doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont(pdfFont, 'bold')
      doc.text(profile?.company_name || proposal?.company || 'ForgePt.', 14, 20)
      doc.setFontSize(10); doc.setFont(pdfFont, 'normal'); doc.setTextColor(200, 98, 42)
      doc.text('Scope it. Send it. Close it.', 14, 30)
    }

    // Company address + license on right side of banner
    {
      const bannerLines = []
      if (profile?.bill_to_address) bannerLines.push(profile.bill_to_address)
      const csl = [profile?.bill_to_city, profile?.bill_to_state, profile?.bill_to_zip].filter(Boolean).join(', ')
      if (csl) bannerLines.push(csl)
      if (profile?.license_number) bannerLines.push(`Lic #: ${profile.license_number}`)
      if (bannerLines.length > 0) {
        doc.setFontSize(8); doc.setFont(pdfFont, 'normal'); doc.setTextColor(255, 255, 255)
        const bStartY = 22 - (bannerLines.length - 1) * 2.5
        bannerLines.forEach((ln, i) => doc.text(ln, pageWidth - 14, bStartY + i * 5, { align: 'right' }))
      }
    }

    doc.setTextColor(0, 0, 0); doc.setFontSize(18); doc.setFont(pdfFont, 'bold')
    doc.text(proposal?.proposal_name || 'Proposal', 14, 55)
    doc.setFontSize(10); doc.setFont(pdfFont, 'normal'); doc.setTextColor(100, 100, 100)
    doc.text(`Prepared for: ${proposal?.company || ''} — ${proposal?.client_name || ''}`, 14, 65)
    if (clientAddress) doc.text(`Address: ${clientAddress}`, 14, 72)
    let pdfRefY = clientAddress ? 79 : 72
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, pdfRefY)
    pdfRefY += 7
    if (proposal?.quote_number) { doc.text(`Quote #: ${proposal.quote_number}`, 14, pdfRefY); pdfRefY += 7 }
    if (proposal?.contract_number) { doc.text(`Contract #: ${proposal.contract_number}`, 14, pdfRefY); pdfRefY += 7 }

    // Rep contact info, right-aligned in the same area
    {
      const repLines = []
      if (proposal?.rep_name) repLines.push(`Rep: ${proposal.rep_name}`)
      if (proposal?.rep_title) repLines.push(proposal.rep_title)
      if (proposal?.rep_email) repLines.push(proposal.rep_email)
      if (proposal?.rep_phone) repLines.push(proposal.rep_phone)
      if (repLines.length > 0) {
        doc.setFontSize(9); doc.setFont(pdfFont, 'normal'); doc.setTextColor(100, 100, 100)
        repLines.forEach((ln, i) => doc.text(ln, pageWidth - 14, 65 + i * 7, { align: 'right' }))
      }
    }

    let yPos = Math.max(92, pdfRefY + 5)

    if (p?.scope_of_work) {
      doc.setFontSize(13); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Scope of Work', 14, yPos)
      yPos += 8
      doc.setFontSize(10); doc.setFont(pdfFont, 'normal'); doc.setTextColor(60, 60, 60)
      const cleanSOW = p.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim()
      const sowLines = doc.splitTextToSize(cleanSOW, pageWidth - 28)
      doc.text(sowLines, 14, yPos)
      yPos += sowLines.length * 5 + 12
    }

    if (lineItems.length > 0) {
      doc.setFontSize(13); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Materials & Pricing', 14, yPos)
      yPos += 6
      const materialsTotal = lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
      const isLumpSum = p?.hide_material_prices || p?.lump_sum_pricing
      const showMsrpCol = p?.show_msrp && features.msrp
      const fmtMoney = (v) => `$${(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      const pdfHead = isLumpSum
        ? [['Item', 'Part #', 'Qty']]
        : showMsrpCol
          ? [['Item', 'Part #', 'Qty', 'MSRP', 'Unit Price', 'Total']]
          : [['Item', 'Part #', 'Qty', 'Unit Price', 'Total']]
      const pdfRow = (item) => isLumpSum
        ? [item.item_name, item.part_number_sku || '—', item.quantity]
        : showMsrpCol
          ? [item.item_name, item.part_number_sku || '—', item.quantity, item.msrp_unit ? fmtMoney(item.msrp_unit) : '—', fmtMoney(item.customer_price_unit), fmtMoney(item.customer_price_total)]
          : [item.item_name, item.part_number_sku || '—', item.quantity, fmtMoney(item.customer_price_unit), fmtMoney(item.customer_price_total)]
      const emptyFiller = isLumpSum ? 1 : showMsrpCol ? 4 : 3
      const pdfFoot = (total) => [['', ...Array(emptyFiller - 1).fill(''), 'Section Total', fmtMoney(total)]]
      const pdfMatFoot = (total) => [['', ...Array(emptyFiller - 1).fill(''), 'Materials Total', fmtMoney(total)]]
      const tableStyles = { headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' }, ...(pdfStriped ? { alternateRowStyles: { fillColor: [245, 245, 245] } } : {}), styles: { fontSize: 9 }, showFoot: 'lastPage' }

      if (sections.length > 0) {
        // Unsectioned items first
        const unsectioned = lineItems.filter(l => !l.section_id)
        if (unsectioned.length > 0) {
          doc.setFontSize(10); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
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
          doc.setFontSize(10); doc.setFont(pdfFont, 'bold'); doc.setTextColor(255, 255, 255)
          doc.text(section.name || 'Untitled Section', 17, yPos + 5.5)
          yPos += 10
          if (secItems.length > 0) {
            autoTable(doc, { startY: yPos, head: pdfHead, body: secItems.map(pdfRow), ...tableStyles, showFoot: false })
            yPos = doc.lastAutoTable.finalY + 4
          }
          if (secLabor.length > 0) {
            doc.setFontSize(8); doc.setFont(pdfFont, 'bold'); doc.setTextColor(100, 100, 100)
            doc.text('Section Labor', 14, yPos + 4); yPos += 6
            const lHead = p?.hide_labor_breakdown ? [['Role', 'Qty', 'Unit']] : [['Role', 'Qty', 'Unit', 'Total Labor']]
            const lRow = (l) => p?.hide_labor_breakdown
              ? [l.role, l.quantity, l.unit || 'hr']
              : [l.role, l.quantity, l.unit || 'hr', `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
            autoTable(doc, { startY: yPos, head: lHead, body: secLabor.map(lRow), ...tableStyles, showFoot: false })
            yPos = doc.lastAutoTable.finalY + 4
          }
          // Section subtotal line
          doc.setFontSize(9); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
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
      doc.setFontSize(13); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
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
          ...(pdfStriped ? { alternateRowStyles: { fillColor: [245, 245, 245] } } : {}), styles: { fontSize: 9 }, showFoot: 'lastPage'
        })
      } else {
        autoTable(doc, {
          startY: tableEnd + 6,
          head: [['Role', 'Qty', 'Unit', 'Total Labor']],
          body: namedLaborItems.map(l => [l.role, l.quantity, l.unit || 'hr', `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]),
          foot: [['', '', 'Total Labor', `$${namedLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
          headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
          footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
          ...(pdfStriped ? { alternateRowStyles: { fillColor: [245, 245, 245] } } : {}), styles: { fontSize: 9 }, showFoot: 'lastPage'
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
    doc.setFontSize(10); doc.setFont(pdfFont, 'normal'); doc.setTextColor(60, 60, 60)
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
    doc.setFontSize(11); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Grand Total:', summaryX, yPos + 4)
    doc.setTextColor(200, 98, 42)
    doc.text(`$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos + 4, { align: 'right' })

    const renderSignatureBlock = (doc, startY) => {
      doc.setFontSize(13); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Accepted and Agreed', 14, startY)
      doc.setFontSize(10); doc.setFont(pdfFont, 'normal'); doc.setTextColor(60, 60, 60); doc.setDrawColor(180, 180, 180)
      const s1 = startY + 18
      doc.text('Client Signature:', 14, s1); doc.line(50, s1, 140, s1)
      doc.text('Date:', 150, s1); doc.line(163, s1, pageWidth - 14, s1)
      const s2 = s1 + 20; doc.text('Printed Name:', 14, s2); doc.line(50, s2, pageWidth - 14, s2)
      const s3 = s2 + 20; doc.text('Title:', 14, s3); doc.line(30, s3, pageWidth - 14, s3)
    }

    if (profile?.terms_and_conditions) {
      doc.addPage()
      doc.setFontSize(13); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Terms and Conditions', 14, 20)
      doc.setFontSize(9); doc.setFont(pdfFont, 'normal'); doc.setTextColor(60, 60, 60)
      const termsLines = doc.splitTextToSize(profile.terms_and_conditions, pageWidth - 28)
      const lineH = 4.5
      const pageH = doc.internal.pageSize.getHeight()
      let ty = 32
      for (const line of termsLines) {
        if (ty + lineH > pageH - 20) { doc.addPage(); ty = 20 }
        doc.text(line, 14, ty)
        ty += lineH
      }
      ty += 16
      if (ty + 70 > pageH) { doc.addPage(); ty = 20 }
      renderSignatureBlock(doc, ty)
    } else {
      let afterY = yPos + 20
      if (afterY + 70 > pageHeight) { doc.addPage(); afterY = 20 }
      renderSignatureBlock(doc, afterY)
    }

    for (const slaC of slaContracts) {
      doc.addPage()
      doc.setFontSize(13); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text(slaC.name || 'Service Level Agreement', 14, 20)
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, 24, pageWidth - 14, 24)
      let slaY = 34
      doc.setFontSize(9); doc.setFont(pdfFont, 'bold'); doc.setTextColor(60, 60, 60)
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
        doc.setFont(pdfFont, 'bold'); doc.text(`${label}:`, 14, slaY)
        doc.setFont(pdfFont, 'normal'); doc.text(value, 70, slaY)
        slaY += 7
      })
      if (slaC.body) {
        slaY += 4
        doc.setFont(pdfFont, 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
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
      doc.setFontSize(11); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Service Agreement Acceptance', 14, slaY)
      doc.setFontSize(9); doc.setFont(pdfFont, 'normal'); doc.setTextColor(60, 60, 60); doc.setDrawColor(180, 180, 180)
      const ss1 = slaY + 14
      doc.text('Client Signature:', 14, ss1); doc.line(50, ss1, 140, ss1)
      doc.text('Date:', 150, ss1); doc.line(163, ss1, pageWidth - 14, ss1)
      const ss2 = ss1 + 16; doc.text('Printed Name:', 14, ss2); doc.line(50, ss2, pageWidth - 14, ss2)
    }

    for (const monC of monitoringContracts) {
      doc.addPage()
      doc.setFontSize(13); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text(monC.name || 'Monitoring Contract', 14, 20)
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, 24, pageWidth - 14, 24)
      let monY = 34
      doc.setFontSize(9); doc.setFont(pdfFont, 'bold'); doc.setTextColor(60, 60, 60)
      const monDetails = [
        ['Monthly Fee', `$${monC.monthly_fee || 49}/mo`],
        ['Monitored Systems', monC.monitored_systems || '—'],
        ['Billing Frequency', monC.billing_frequency || 'Monthly'],
        ['Escalation Contacts', monC.escalation_contacts || '2'],
        monC.start_date ? ['Term', `${new Date(monC.start_date).toLocaleDateString()} – ${monC.end_date ? new Date(monC.end_date).toLocaleDateString() : 'TBD'}`] : null,
        monC.auto_renew ? ['Auto-Renew', 'Yes'] : null,
      ].filter(Boolean)
      monDetails.forEach(([label, value]) => {
        doc.setFont(pdfFont, 'bold'); doc.text(`${label}:`, 14, monY)
        doc.setFont(pdfFont, 'normal'); doc.text(String(value), 70, monY)
        monY += 7
      })
      if (monC.body) {
        monY += 4
        doc.setFont(pdfFont, 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
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
      doc.setFontSize(11); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Monitoring Contract Acceptance', 14, monY)
      doc.setFontSize(9); doc.setFont(pdfFont, 'normal'); doc.setTextColor(60, 60, 60); doc.setDrawColor(180, 180, 180)
      const ms1 = monY + 14
      doc.text('Client Signature:', 14, ms1); doc.line(50, ms1, 140, ms1)
      doc.text('Date:', 150, ms1); doc.line(163, ms1, pageWidth - 14, ms1)
      const ms2 = ms1 + 16; doc.text('Printed Name:', 14, ms2); doc.line(50, ms2, pageWidth - 14, ms2)
    }

    if (photos && photos.length > 0) {
      doc.addPage()
      doc.setFontSize(13); doc.setFont(pdfFont, 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
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
          // Use canvas to normalize EXIF orientation
          const base64 = await new Promise(resolve => {
            const img = new Image()
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const ctx = canvas.getContext('2d')
              ctx.drawImage(img, 0, 0)
              resolve(canvas.toDataURL('image/jpeg', 0.85))
            }
            img.src = URL.createObjectURL(blob)
          })
          doc.addImage(base64, 'JPEG', photoX, photoY, photoWidth, photoHeight)
          if (photos[i].caption) { doc.setFontSize(8); doc.setFont(pdfFont, 'normal'); doc.setTextColor(100, 100, 100); doc.text(photos[i].caption, photoX, photoY + photoHeight + 4, { maxWidth: photoWidth }) }
          if (i % 2 === 0) { photoX = photoX + photoWidth + 14 } else { photoX = 14; photoY = photoY + photoHeight + 16; if (photoY > 250) { doc.addPage(); photoY = 20 } }
        } catch (e) { console.error('Photo load error:', e) }
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
          subject: sendForm.subject, message: sendForm.message, logoUrl: resolvedLogoUrl || null, pdfBase64
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

  if (loading) return <div className="min-h-screen bg-fp-inset flex items-center justify-center"><p className="text-fp-text">Loading...</p></div>

  return (
    <div className="flex min-h-screen bg-fp-inset">
      <Sidebar isAdmin={isAdmin} featureProposals={features.proposals} featureCRM={features.crm} />
      <div className="flex-1 p-6 space-y-6">
        {/* Read-only banner */}
        {!canEdit && (
          <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
              <p className="text-yellow-300 text-sm font-medium">
                You have view-only access to this quote. Ask the owner to add you as a collaborator to make changes.
              </p>
            </div>
          </div>
        )}

        {contractNotification && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-blue-400 text-lg">ℹ</span>
              <p className="text-blue-300 text-sm font-medium">{contractNotification}</p>
            </div>
            <button onClick={() => setContractNotification(null)} className="text-fp-muted hover:text-fp-text text-xl leading-none">×</button>
          </div>
        )}

        <ProposalHeader
          proposal={proposal} profile={profile} features={features} isAdmin={isAdmin}
          editingProposalName={editingProposalName} proposalNameDraft={proposalNameDraft}
          setProposalNameDraft={setProposalNameDraft} setEditingProposalName={setEditingProposalName}
          saveProposalName={saveProposalName}
          openEditClientModal={openEditClientModal} clientAddress={clientAddress} locationName={locationName}
          collaborators={collaborators} orgProfiles={orgProfiles}
          updateStatus={updateStatus} updateStage={updateStage} pipelineStages={pipelineStages} onUpdateRep={updateRep}
          editingQuoteNumber={editingQuoteNumber} quoteNumberDraft={quoteNumberDraft}
          setQuoteNumberDraft={setQuoteNumberDraft} quoteNumberError={quoteNumberError}
          setQuoteNumberError={setQuoteNumberError} saveQuoteNumber={saveQuoteNumber}
          setEditingQuoteNumber={setEditingQuoteNumber}
          editingContractNumber={editingContractNumber} contractNumberDraft={contractNumberDraft}
          setContractNumberDraft={setContractNumberDraft} saveContractNumber={saveContractNumber}
          setEditingContractNumber={setEditingContractNumber}
          updateCloseDate={updateCloseDate} updateTaxExempt={updateTaxExempt} updateTaxRate={updateTaxRate}
          setShowDealSummaryModal={setShowDealSummaryModal} setDealSummary={setDealSummary}
          setShowShareModal={setShowShareModal}
          setDeleteConfirmText={setDeleteConfirmText} setShowDeleteModal={setShowDeleteModal}
          onArchive={archiveProposal} onRestore={restoreProposal}
          onCreateRevision={createRevision}
          canEdit={canEdit}
        />

        <ScopeSection
          proposal={proposal} features={features} photos={photos}
          aiNotes={aiNotes} setAiNotes={setAiNotes}
          editingSOW={editingSOW} sowDraft={sowDraft} setSowDraft={setSowDraft}
          setEditingSOW={setEditingSOW} saveSOW={saveSOW}
          generatingSOW={generatingSOW} generateSOW={generateSOW}
          sendForm={sendForm} setSendForm={setSendForm} setShowSendModal={setShowSendModal}
          sendTemplateSubject={profile?.email_template_send_subject} sendTemplateBody={profile?.email_template_send_body}
          requestingSignature={requestingSignature} requestSignature={requestSignature}
          uploadingSignedPDF={uploadingSignedPDF} uploadSignedPDF={uploadSignedPDF}
          qboConnected={qboConnected} qboInvoiceId={qboInvoiceId} sendingToQBO={sendingToQBO} sendToQBO={sendToQBO}
          setShowPricingModal={setShowPricingModal} downloadPDF={downloadPDF} downloadDOCX={downloadDOCX} downloadSignedCopy={downloadSignedCopy}
          setShowPhotosModal={setShowPhotosModal}
          canEdit={canEdit}
        />

        <BomSection
          proposalId={id}
          proposal={proposal}
          orgType={orgType}
          features={features}
          lineItems={lineItems}
          sections={sections}
          rfqRequests={rfqRequests}
          onDeleteRFQ={deleteRFQ}
          renewalDates={renewalDates}
          categories={categories}
          vendors={vendors}
          saving={saving}
          editingBOM={editingBOM}
          editLines={editLines}
          setEditLines={setEditLines}
          editSections={editSections}
          setEditSections={setEditSections}
          laborItems={laborItems}
          setLaborItems={setLaborItems}
          bulkSelectedLines={bulkSelectedLines}
          setBulkSelectedLines={setBulkSelectedLines}
          bulkField={bulkField}
          setBulkField={setBulkField}
          bulkValue={bulkValue}
          setBulkValue={setBulkValue}
          librarySearch={librarySearch}
          setLibrarySearch={setLibrarySearch}
          showLibrarySearch={showLibrarySearch}
          setShowLibrarySearch={setShowLibrarySearch}
          libraryLoading={libraryLoading}
          libraryResults={libraryResults}
          setLibraryResults={setLibraryResults}
          librarySelectedVendor={librarySelectedVendor}
          setLibrarySelectedVendor={setLibrarySelectedVendor}
          librarySelectedItems={librarySelectedItems}
          setLibrarySelectedItems={setLibrarySelectedItems}
          selectedForPO={selectedForPO}
          setSelectedForPO={setSelectedForPO}
          onStartEditing={startEditing}
          onCancelEditing={() => setEditingBOM(false)}
          onSaveBOM={saveBOM}
          onAddLibraryItems={addLibraryItemsToBOM}
          onSearchLibrary={searchLibrary}
          onToggleRecurring={toggleRecurring}
          onSaveRenewalDate={saveRenewalDate}
          onOpenRFQModal={openRFQModal}
          onAddSection={addSection}
          onUpdateSection={updateSection}
          onDeleteSection={deleteSection}
          onUpdateEditLine={updateEditLine}
          onApplyBulkEdit={applyBulkEdit}
          onUpdateLabor={updateLabor}
          onUpdateSectionLabor={updateSectionLabor}
          onAddSectionLaborLine={addSectionLaborLine}
          laborRates={orgLaborRates}
          defaultMarkup={parseFloat(profile?.default_markup_percent) || 35}
          onRemoveSectionLaborLine={removeSectionLaborLine}
          onExcelUpload={handleExcelUpload}
          onOpenCatalogSearch={() => setShowCatalogSearch(true)}
          onOpenOrderModal={() => setShowOrderModal(true)}
          onOpenPOModal={() => setShowPOModal(true)}
          onOpenAIBOMModal={() => setShowAIBOMModal(true)}
          onOpenDrawingModal={() => { setShowDrawingModal(true); setDrawingInstructions(proposal?.industry === 'Security' ? 'Focus on cameras, access control readers, door contacts, and NVR/DVR equipment.' : proposal?.industry === 'Audio/Visual' ? 'Focus on displays, speakers, amplifiers, source equipment, and cable runs.' : '') }}
          onOpenSpecModal={() => { setShowSpecModal(true); setSpecSummary(proposal?.spec_summary || null) }}
          onOpenSaveTemplateModal={() => { setTemplateName(proposal?.proposal_name || ''); setShowSaveTemplateModal(true) }}
          onLoadTemplate={openTemplatePicker}
          onMoveLineToSection={(i) => { setMoveLineIndex(i); setMoveType('move'); setShowMoveModal(true) }}
          fmt={fmt}
          featureMsrp={features.msrp}
          canEdit={canEdit}
        />

        <RecurringSection proposal={proposal} lineItems={lineItems} renewalDates={renewalDates} saveRenewalDate={saveRenewalDate} />

        <ServiceAgreementSection orgSLASettings={orgSLASettings} slaContracts={slaContracts} profile={profile} proposal={proposal} openSLAModal={openSLAModal} removeSLAContract={removeSLAContract} />

        <MonitoringSection orgSLASettings={orgSLASettings} monitoringContracts={monitoringContracts} profile={profile} proposal={proposal} openMonitoringModal={openMonitoringModal} removeMonitoringContract={removeMonitoringContract} />

        <DrawingToolSummary proposalId={id} featureEnabled={features.drawingTool} />

        {revisions.length > 1 && (
          <>
            {/* Superseded banner — show when viewing an old revision */}
            {!proposal?.is_current_revision && (() => {
              const current = revisions.find(r => r.is_current_revision)
              return current ? (
                <div className="mt-6 flex items-center justify-between bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 text-sm">⚠</span>
                    <span className="text-yellow-400 text-sm font-semibold">You're viewing an older revision</span>
                    <span className="text-yellow-400/70 text-xs">— Rev {proposal?.revision_number} of {revisions.length}</span>
                  </div>
                  <button
                    onClick={() => navigate(`/proposal/${current.id}`)}
                    className="text-yellow-400 hover:text-fp-text text-xs font-semibold bg-yellow-500/20 hover:bg-yellow-500/30 px-3 py-1.5 rounded-lg transition-colors">
                    Go to Current (Rev {current.revision_number}) →
                  </button>
                </div>
              ) : null
            })()}

            <div className="mt-6 bg-fp-card border border-fp-border rounded-xl p-5">
              <p className="text-fp-muted text-xs font-semibold uppercase tracking-wide mb-3">Revision History</p>
              <div className="space-y-2">
                {revisions.map(rev => {
                  const isViewing = rev.id === id
                  return (
                    <div key={rev.id} onClick={() => !isViewing && navigate(`/proposal/${rev.id}`)}
                      className={`flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors ${
                        isViewing
                          ? 'bg-fp-inset border-[#C8622A]/30'
                          : 'border-fp-border hover:border-fp-brand/30 cursor-pointer hover:bg-fp-inset'
                      }`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          isViewing ? 'bg-[#C8622A]/20 text-[#C8622A]' : 'bg-blue-500/10 text-blue-400'
                        }`}>Rev {rev.revision_number}</span>
                        <span className="text-fp-text text-sm">{rev.proposal_name}</span>
                        {rev.is_current_revision && (
                          <span className="text-green-400 text-xs font-medium">current</span>
                        )}
                        {!rev.is_current_revision && !isViewing && (
                          <span className="text-fp-muted text-xs">superseded</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          rev.status === 'Won' ? 'bg-green-500/20 text-green-400' :
                          rev.status === 'Sent' ? 'bg-blue-500/20 text-blue-400' :
                          rev.status === 'Lost' ? 'bg-red-500/20 text-red-400' :
                          'bg-fp-muted/20 text-fp-muted'
                        }`}>{rev.status}</span>
                        <span className="text-fp-muted text-xs">{new Date(rev.created_at).toLocaleDateString()}</span>
                        {!isViewing && <span className="text-fp-muted text-xs">→</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <ActivityFeed proposalId={id} clientId={proposal?.client_id} orgId={proposal?.org_id} refreshKey={activityRefreshKey} />

        <POList proposalId={id} />

      </div>

      {showCatalogSearch && <CatalogSearch orgId={proposal?.org_id} onAdd={addFromCatalog} onClose={() => setShowCatalogSearch(false)} />}

      {showRFQModal && <RFQModal lineItems={rfqItems} rfqVendorData={rfqVendorData} setRfqVendorData={setRfqVendorData} sendingRFQs={sendingRFQs} onSend={sendAllRFQs} onClose={() => setShowRFQModal(false)} />}

      {showEditClientModal && <EditClientModal allClients={allClients} editClientForm={editClientForm} setEditClientForm={setEditClientForm} savingClient={savingClient} onSave={saveClientInfo} onClose={() => setShowEditClientModal(false)} />}

      {showDeleteModal && <DeleteProposalModal proposal={proposal} deleteConfirmText={deleteConfirmText} setDeleteConfirmText={setDeleteConfirmText} deletingProposal={deletingProposal} onDelete={deleteProposal} onClose={() => setShowDeleteModal(false)} />}

      {showAIBOMModal && <AIBOMModal aiBOMPrompt={aiBOMPrompt} setAIBOMPrompt={setAIBOMPrompt} generatingBOM={generatingBOM} aiBOMPreview={aiBOMPreview} setAIBOMPreview={setAIBOMPreview} onGenerate={generateAIBOM} onApply={applyAIBOM} onClose={() => { setShowAIBOMModal(false); setAIBOMPreview([]); setAIBOMPrompt('') }} />}
      {showDealSummaryModal && <DealSummaryModal dealSummary={dealSummary} setDealSummary={setDealSummary} generatingDealSummary={generatingDealSummary} onGenerate={generateDealSummary} onClose={() => { setShowDealSummaryModal(false); setDealSummary(null) }} />}

      {showSpecModal && <SpecReaderModal specFile={specFile} setSpecFile={setSpecFile} specPageFrom={specPageFrom} setSpecPageFrom={setSpecPageFrom} specPageTo={specPageTo} setSpecPageTo={setSpecPageTo} analyzingSpec={analyzingSpec} specSummary={specSummary} onAnalyze={analyzeSpec} onClose={() => { setShowSpecModal(false); setSpecFile(null); setSpecPageFrom(''); setSpecPageTo('') }} />}

      {showDrawingModal && <DrawingReaderModal drawingFile={drawingFile} setDrawingFile={setDrawingFile} drawingInstructions={drawingInstructions} setDrawingInstructions={setDrawingInstructions} drawingPreview={drawingPreview} setDrawingPreview={setDrawingPreview} analyzingDrawing={analyzingDrawing} onAnalyze={analyzeDrawing} onApply={applyDrawingBOM} onClose={() => { setShowDrawingModal(false); setDrawingFile(null); setDrawingInstructions(''); setDrawingPreview([]) }} />}

      {showPhotosModal && <PhotosModal photos={photos} uploadingPhoto={uploadingPhoto} onUpload={uploadPhoto} onUpdateCaption={updatePhotoCaption} onDelete={deletePhoto} onClose={() => setShowPhotosModal(false)} />}

      {showOrderModal && <ConvertToOrderModal lineItems={lineItems} orderAutoNumber={orderAutoNumber} setOrderAutoNumber={setOrderAutoNumber} orderNumber={orderNumber} setOrderNumber={setOrderNumber} orderExpectedShip={orderExpectedShip} setOrderExpectedShip={setOrderExpectedShip} clientAddress={clientAddress} creatingOrder={creatingOrder} onCreate={createOrder} onClose={() => setShowOrderModal(false)} />}

      {showSLAModal && <SLAModal editSLAForm={editSLAForm} setEditSLAForm={setEditSLAForm} editingAgreementIdx={editingAgreementIdx} orgSLASettings={orgSLASettings} savingContract={savingContract} onSave={saveSLAContract} onClose={() => setShowSLAModal(false)} />}

      {showMonitoringModal && <MonitoringModal editMonitoringForm={editMonitoringForm} setEditMonitoringForm={setEditMonitoringForm} editingAgreementIdx={editingAgreementIdx} orgSLASettings={orgSLASettings} savingContract={savingContract} onSave={saveMonitoringContract} onClose={() => setShowMonitoringModal(false)} />}

      {showContractStartModal && <ContractStartDateModal pendingContractItems={pendingContractItems} pendingContractDates={pendingContractDates} setPendingContractDates={setPendingContractDates} savingContractDates={savingContractDates} onSave={saveContractStartDates} onClose={() => setShowContractStartModal(false)} />}

      {showRenewalModal && <RenewalDateModal pendingRenewalItems={pendingRenewalItems} pendingRenewalDates={pendingRenewalDates} setPendingRenewalDates={setPendingRenewalDates} savingRenewal={savingRenewal} onSave={saveRenewalModalDates} onClose={() => setShowRenewalModal(false)} />}

      {showShareModal && <ShareModal orgProfiles={orgProfiles} profile={profile} collaborators={collaborators} onShare={shareProposal} onClose={() => setShowShareModal(false)} />}

      {showSaveTemplateModal && <SaveTemplateModal lineItems={lineItems} laborItems={laborItems} templateName={templateName} setTemplateName={setTemplateName} savingTemplate={savingTemplate} onSave={saveAsTemplate} onClose={() => { setShowSaveTemplateModal(false); setTemplateName('') }} />}

      {showSendModal && <SendProposalModal proposal={proposal} sendForm={sendForm} setSendForm={setSendForm} sendingProposal={sendingProposal} onSend={sendProposal} onClose={() => setShowSendModal(false)} />}

      {showPricingModal && <PricingOptionsModal proposal={proposal} onToggleHideMaterialPrices={toggleHideMaterialPrices} onToggleLaborBreakdown={toggleHideLaborBreakdown} onToggleShowMsrp={toggleShowMsrp} featureMsrp={features.msrp} onClose={() => setShowPricingModal(false)} />}

      {showMoveModal && moveLineIndex !== null && <MoveLineModal editLines={editLines} moveLineIndex={moveLineIndex} editSections={editSections} onMove={moveLineToSection} onClose={() => { setShowMoveModal(false); setMoveLineIndex(null) }} />}

      {showTemplatePicker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-fp-card rounded-2xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-fp-text font-bold text-lg">Load Template</h3>
              <button onClick={() => { setShowTemplatePicker(false); setTemplatePickerSelected(null) }} className="text-fp-muted hover:text-fp-text text-xl leading-none">✕</button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Search templates…"
              value={templatePickerSearch}
              onChange={e => setTemplatePickerSearch(e.target.value)}
              className="w-full bg-fp-inset text-fp-text border border-fp-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-fp-brand"
            />
            {templatePickerLoading ? (
              <p className="text-fp-muted text-sm">Loading templates…</p>
            ) : templatePickerList.length === 0 ? (
              <p className="text-fp-muted text-sm">No templates found. Create one in the Templates section.</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {templatePickerList
                  .filter(t => {
                    const q = templatePickerSearch.toLowerCase()
                    return !q || t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.industry || '').toLowerCase().includes(q)
                  })
                  .map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTemplatePickerSelected(t)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${templatePickerSelected?.id === t.id ? 'bg-[#C8622A]/20 border border-[#C8622A]' : 'bg-fp-inset hover:bg-fp-inset border border-transparent'}`}
                    >
                      <p className="text-fp-text text-sm font-semibold">{t.name}</p>
                      {(t.industry || t.description) && (
                        <p className="text-fp-muted text-xs mt-0.5">{[t.industry, t.description].filter(Boolean).join(' · ')}</p>
                      )}
                    </button>
                  ))}
              </div>
            )}
            {templatePickerSelected && (
              <div className="border-t border-fp-border pt-4">
                <p className="text-fp-muted text-xs mb-3">How should <span className="text-fp-text font-semibold">{templatePickerSelected.name}</span> be loaded?</p>
                <div className="flex gap-3">
                  {(editLines.length > 0 || editSections.length > 0) && (
                    <button onClick={() => applyTemplate(templatePickerSelected, 'replace')}
                      className="flex-1 px-4 py-2 bg-red-600/20 text-red-400 border border-red-600/30 rounded-lg text-sm font-semibold hover:bg-red-600/30 transition-colors">
                      Replace BOM
                    </button>
                  )}
                  <button onClick={() => applyTemplate(templatePickerSelected, 'append')}
                    className="flex-1 px-4 py-2 bg-fp-brand text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                    {editLines.length > 0 || editSections.length > 0 ? 'Append to BOM' : 'Load Template'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showSentPrompt && <SentPromptModal onConfirm={markAsSent} onClose={() => setShowSentPrompt(false)} />}

      {showPOModal && <POModal lineItems={lineItems} selectedForPO={selectedForPO} poVendorEmail={poVendorEmail} setPOVendorEmail={setPOVendorEmail} poAutoNumber={poAutoNumber} setPOAutoNumber={setPOAutoNumber} poNumber={poNumber} setPONumber={setPONumber} generatingPO={generatingPO} onGenerate={generatePO} onClose={() => setShowPOModal(false)} />}
    </div>
  )
}