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
  const [rfqVendorData, setRfqVendorData] = useState({}) // { vendorName: { email, attachExcel } }
  const [sendingRFQs, setSendingRFQs] = useState(false)
  const [showAIBOMModal, setShowAIBOMModal] = useState(false)
  const [aiBOMPrompt, setAIBOMPrompt] = useState('')
  const [generatingBOM, setGeneratingBOM] = useState(false)
  const [aiBOMPreview, setAIBOMPreview] = useState([])
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

  useEffect(() => {
    fetchProposal()
    fetchLineItems()
    fetchProfile()
    fetchActivity()
    fetchPhotos()
  }, [])

  const fetchProposal = async () => {
    const { data } = await supabase
      .from('proposals')
      .select('id,proposal_name,company,client_name,client_email,client_id,rep_name,rep_email,industry,status,close_date,proposal_value,total_customer_value,total_your_cost,total_gross_margin_dollars,total_gross_margin_percent,labor_items,created_at,org_id,user_id,collaborator_ids,has_recurring,scope_of_work,job_description,submission_type')
      .eq('id', id)
      .single()

    setProposal(data)
    setCollaborators(data?.collaborator_ids || [])

    if (data?.labor_items && data.labor_items.length > 0) {
      setLaborItems(data.labor_items)
    }

    // Fetch client address if client_id exists
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

    setLoading(false)
  }

  const fetchLineItems = async () => {
    const { data } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('proposal_id', id)
    setLineItems(data || [])
    // Load existing renewal dates
    const dates = {}
    ;(data || []).forEach(l => { if (l.renewal_date) dates[l.id] = l.renewal_date })
    setRenewalDates(dates)
  }

  const fetchProfile = async () => {
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
      const { data: teamData } = await supabase.from('profiles').select('id, full_name, email').eq('org_id', data.org_id)
      setOrgProfiles(teamData || [])
    }
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
    // If marking as Won and there are recurring items without renewal dates, prompt first
    if (newStatus === 'Won') {
      const recurringMissingDate = lineItems.filter(l => l.recurring && !l.renewal_date && !(renewalDates[l.id]))
      if (recurringMissingDate.length > 0) {
        const initialDates = {}
        recurringMissingDate.forEach(l => { initialDates[l.id] = '' })
        setPendingRenewalItems(recurringMissingDate)
        setPendingRenewalDates(initialDates)
        setShowRenewalModal(true)
        // Still mark as Won immediately — modal is for setting dates
        await supabase.from('proposals').update({ status: newStatus }).eq('id', id)
        setProposal(prev => ({ ...prev, status: newStatus }))
        return
      }
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

  const generateSOW = async () => {
    setGeneratingSOW(true)
    try {
      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/generate-sow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE`
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
    // Init vendor data with empty emails and Excel unchecked
    const initData = {}
    Object.keys(byVendor).forEach(v => { initData[v] = { email: '', attachExcel: false } })
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

    // Fetch vendor pricing_valid_days for expiry calculation
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

      // Generate Excel if requested
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
        await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-rfq', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE`
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

        // Update rfq_expires_at on each line item
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
    const primaryColor = (profile?.primary_color || '#0F1C2E').replace('#', '')

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
    const borders = { top: border, bottom: border, left: border, right: border }
    const colWidths = [2800, 1400, 800, 1000, 1000]

    const headerRow = new TableRow({
      children: ['Item', 'Part #', 'Qty', 'Unit Price', 'Total'].map((h, i) =>
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
        children: [
          item.item_name,
          item.part_number_sku || '—',
          String(item.quantity || 0),
          `$${(item.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `$${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        ].map((val, i) =>
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

    const totalRow = new TableRow({
      children: [
        new TableCell({
          borders,
          columnSpan: 4,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: primaryColor, type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Total', bold: true, color: 'FFFFFF', size: 18 })]
          })]
        }),
        new TableCell({
          borders,
          width: { size: 1000, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: primaryColor, type: ShadingType.CLEAR },
          children: [new Paragraph({
            children: [new TextRun({
              text: `$${lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
              bold: true, color: 'FFFFFF', size: 18
            })]
          })]
        })
      ]
    })

    const children = [
      new Paragraph({
        children: [new TextRun({ text: profile?.company_name || proposal?.company || 'ForgePt.', bold: true, size: 36, color: primaryColor })]
      }),
      new Paragraph({
        children: [new TextRun({ text: proposal?.proposal_name || 'Proposal', bold: true, size: 48 })]
      }),
      new Paragraph({
        children: [new TextRun({ text: `Prepared for: ${proposal?.company || ''} — ${proposal?.client_name || ''}`, size: 20, color: '666666' })]
      }),
      new Paragraph({
        children: [new TextRun({ text: clientAddress ? `Address: ${clientAddress}` : `Email: ${proposal?.client_email || ''}`, size: 20, color: '666666' })]
      }),
      new Paragraph({
        children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString()}`, size: 20, color: '666666' })]
      }),
      new Paragraph({ children: [new TextRun({ text: '' })] }),
    ]

    if (proposal?.scope_of_work) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Scope of Work', bold: true, size: 28, color: primaryColor })]
        }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...proposal.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim().split('\n').map(line =>
          new Paragraph({ children: [new TextRun({ text: line, size: 20 })] })
        ),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
      )
    }

    if (lineItems.length > 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Materials & Pricing', bold: true, size: 28, color: primaryColor })]
        }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        new Table({
          width: { size: 9800, type: WidthType.DXA },
          columnWidths: colWidths,
          rows: [headerRow, ...itemRows, totalRow]
        }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
      )
    }

    // Labor section in DOCX
    const docxLaborItems = proposal?.labor_items || []
    if (docxLaborItems.length > 0 && docxLaborItems.some(l => l.role)) {
      const lb = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
      const lbs = { top: lb, bottom: lb, left: lb, right: lb }
      const lcw = [3000, 1200, 1200, 2400]

      const lHeaderRow = new TableRow({
        children: ['Role', 'Qty', 'Unit', 'Total Labor'].map((h, i) =>
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
          children: [l.role, String(l.quantity || ''), l.unit || 'hr',
            `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
          ].map((val, i) =>
            new TableCell({
              borders: lbs, width: { size: lcw[i], type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: val, size: 18 })] })]
            })
          )
        })
      )

      const laborTotal = docxLaborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
      const materialsTotal = lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)
      const grandTotal = materialsTotal + laborTotal

      const lTotalRow = new TableRow({
        children: [
          new TableCell({
            borders: lbs, columnSpan: 3,
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
        new Paragraph({ children: [new TextRun({ text: `Grand Total: $${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, bold: true, size: 24, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
      )
    }

    if (profile?.terms_and_conditions) {
      children.push(
        new Paragraph({ children: [new TextRun({ text: 'Terms and Conditions', bold: true, size: 28, color: primaryColor })] }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...profile.terms_and_conditions.split('\n').map(line =>
          new Paragraph({ children: [new TextRun({ text: line, size: 18, color: '444444' })] })
        )
      )
    }

    // Signature block
    const sigBorder = { style: BorderStyle.SINGLE, size: 6, color: 'AAAAAA' }
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

    // Site Photos for DOCX
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
            new Paragraph({
              children: [new ImageRun({ data: arrayBuffer, transformation: { width: 400, height: 250 }, type: 'jpg' })]
            })
          )
          if (photo.caption) {
            children.push(
              new Paragraph({ children: [new TextRun({ text: photo.caption, size: 16, color: '888888', italics: true })] })
            )
          }
          children.push(new Paragraph({ children: [new TextRun({ text: '' })] }))
        } catch (e) {
          console.log('DOCX photo error:', e)
        }
      }
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
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
    setGeneratingPO(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase
      .from('profiles')
      .select('org_id, company_name, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, ship_to_address, ship_to_city, ship_to_state, ship_to_zip')
      .eq('id', user.id)
      .single()

    let finalPONumber = poNumber

    if (poAutoNumber) {
      const { data: org } = await supabase
        .from('organizations')
        .select('po_counter, name')
        .eq('id', profileData.org_id)
        .single()

      finalPONumber = `PO-${org.po_counter}`

      await supabase
        .from('organizations')
        .update({ po_counter: org.po_counter + 1 })
        .eq('id', profileData.org_id)
    }

    const vendorItems = lineItems.filter(l => l.vendor === poVendor)
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')

    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 40, 'F')

    if (profile?.logo_url) {
      const img = new Image()
      img.src = profile.logo_url
      doc.addImage(img, 'PNG', 14, 8, 40, 24)
    } else {
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text(profile?.company_name || 'ForgePt.', 14, 22)
    }

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('PURCHASE ORDER', pageWidth - 14, 18, { align: 'right' })
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(finalPONumber, pageWidth - 14, 28, { align: 'right' })

    // Address helpers
    const billToLines = [
      profileData?.company_name || profile?.company_name || '',
      profileData?.bill_to_address || '',
      [profileData?.bill_to_city, profileData?.bill_to_state, profileData?.bill_to_zip].filter(Boolean).join(', ')
    ].filter(Boolean)

    const shipToLines = [
      profileData?.company_name || profile?.company_name || '',
      profileData?.ship_to_address || '',
      [profileData?.ship_to_city, profileData?.ship_to_state, profileData?.ship_to_zip].filter(Boolean).join(', ')
    ].filter(Boolean)

    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 52)
    doc.text(`Project: ${proposal?.proposal_name || ''}`, 14, 60)

    const col1 = 14
    const col2 = pageWidth / 2 - 10
    const col3 = pageWidth / 2 + 30

    // Row 1: Vendor | Bill To
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('VENDOR', col1, 74)
    doc.text('BILL TO', col2, 74)
    doc.text('SHIP TO', col3, 74)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 40)
    doc.setFontSize(9)
    doc.text(poVendor, col1, 81)

    billToLines.forEach((line, i) => doc.text(line, col2, 81 + i * 6))
    shipToLines.forEach((line, i) => doc.text(line, col3, 81 + i * 6))

    // Divider line
    const tableStart = 81 + Math.max(billToLines.length, shipToLines.length) * 6 + 6
    doc.setDrawColor(220, 220, 220)
    doc.line(14, tableStart - 2, pageWidth - 14, tableStart - 2)

    autoTable(doc, {
      startY: tableStart,
      head: [['Item', 'Part #', 'Qty', 'Unit', 'Unit Cost', 'Total']],
      body: vendorItems.map(item => [
        item.item_name,
        item.part_number_sku || '—',
        item.quantity,
        item.unit || 'ea',
        `$${(item.your_cost_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `$${((item.your_cost_unit || 0) * (item.quantity || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      ]),
      foot: [['', '', '', '', 'Total', `$${vendorItems.reduce((sum, item) => sum + ((item.your_cost_unit || 0) * (item.quantity || 0)), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
      headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
      footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { fontSize: 9 }
    })

    const totalAmount = vendorItems.reduce((sum, item) =>
      sum + ((item.your_cost_unit || 0) * (item.quantity || 0)), 0)

    // FIX: Reuse already-fetched profileData instead of calling supabase again
    await supabase.from('purchase_orders').insert({
      po_number: finalPONumber,
      proposal_id: id,
      org_id: profileData.org_id,
      vendor_name: poVendor,
      status: 'Sent',
      total_amount: totalAmount
    })

    for (const item of vendorItems) {
      await supabase
        .from('bom_line_items')
        .update({ po_number: finalPONumber, po_status: 'PO Sent' })
        .eq('id', item.id)
    }

    await fetchLineItems()
    logActivity(`Purchase Order ${finalPONumber} generated for ${poVendor}`)
    doc.save(`${finalPONumber} - ${poVendor}.pdf`)
    setShowPOModal(false)
    setGeneratingPO(false)
  }

  const handleExcelUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    try {
      const data = await file.arrayBuffer()
      // cellFormula: false forces XLSX to use cached values instead of formula strings
      const workbook = XLSX.read(data, { cellText: false, cellDates: true, cellFormula: false })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false })

      // Strip $, commas, %, spaces from any value
      const clean = (val) => {
        if (val === null || val === undefined || val === '') return ''
        // If it's a formula string that slipped through, return empty
        if (String(val).startsWith('=')) return ''
        return String(val).replace(/[$,%]/g, '').replace(/,/g, '').trim()
      }

      const mapped = rows.filter(r => r['Item Name'] || r['item_name'] || r['Part #'] || r['part_number_sku']).map(r => {
        // Handle swapped columns — if Item Name looks like a part number (no spaces, has numbers)
        // and Part # looks like a description, swap them
        let itemName = r['Item Name'] || r['item_name'] || ''
        let partNum = clean(r['Part Number'] || r['Part #'] || r['part_number_sku'] || '')

        const looksLikePartNumber = (s) => /^[A-Z0-9\-]{3,}$/i.test(String(s).trim()) && !String(s).includes(' ')
        if (looksLikePartNumber(itemName) && !looksLikePartNumber(partNum) && partNum) {
          // Swap them
          const temp = itemName
          itemName = partNum
          partNum = temp
        }

        const yourCost = clean(r['Your Cost'] || r['Your Cost (Unit)'] || r['your_cost_unit'] || '')
        const markup = clean(r['Markup %'] || r['markup_percent'] || '35')
        const rawCustomerPrice = clean(r['Customer Price'] || r['Customer Price (Unit)'] || r['customer_price_unit'] || '')
        const qty = clean(r['Quantity'] || r['Qty'] || r['quantity'] || '1')
        const unit = String(r['Unit'] || r['unit'] || 'ea').trim().toLowerCase()

        // Recalculate customer price from cost + markup if formula came through as empty
        let finalCustomerPrice = rawCustomerPrice
        if ((!finalCustomerPrice || parseFloat(finalCustomerPrice) === 0) && yourCost && markup) {
          finalCustomerPrice = (parseFloat(yourCost) * (1 + parseFloat(markup) / 100)).toFixed(2)
        }

        return {
          proposal_id: id,
          item_name: itemName,
          part_number_sku: partNum,
          quantity: qty || '1',
          unit: unit || 'ea',
          category: r['Category'] || r['category'] || '',
          vendor: r['Vendor'] || r['vendor'] || '',
          your_cost_unit: yourCost,
          markup_percent: markup || '35',
          customer_price_unit: finalCustomerPrice,
          customer_price_total: finalCustomerPrice && qty
            ? (parseFloat(finalCustomerPrice) * parseFloat(qty)).toFixed(2)
            : '',
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
    setEditingBOM(true)
  }

  const updateEditLine = (index, field, value) => {
    setEditLines(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      // Recalculate customer_price_unit from cost + markup
      if (field === 'your_cost_unit' || field === 'markup_percent') {
        const cost = parseFloat(updated[index].your_cost_unit) || 0
        const markup = parseFloat(updated[index].markup_percent) || 0
        updated[index].customer_price_unit = (cost * (1 + markup / 100)).toFixed(2)
      }
      // Always recalculate total from unit price * qty
      // (covers direct edits to customer_price_unit, quantity, AND cascaded
      //  changes from your_cost_unit / markup_percent above)
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

      const qty    = parseFloat(updated[index].quantity) || 0
      const cost   = parseFloat(updated[index].your_cost) || 0
      const markup = parseFloat(updated[index].markup) || 0
      const cp     = parseFloat(updated[index].customer_price) || 0

      if (field === 'your_cost' || field === 'markup' || field === 'quantity') {
        // Forward: cost + markup + qty -> customer price
        if (cost > 0 && qty > 0) {
          updated[index].customer_price = (cost * (1 + markup / 100) * qty).toFixed(2)
        }
      } else if (field === 'customer_price') {
        if (cp > 0 && qty > 0) {
          if (cost > 0) {
            // Customer price + cost known -> back-fill markup %
            updated[index].markup = (((cp / qty) / cost - 1) * 100).toFixed(1)
          } else if (markup >= 0) {
            // Customer price + markup known -> back-fill your cost
            updated[index].your_cost = (cp / (1 + markup / 100) / qty).toFixed(2)
          }
        }
      }

      return updated
    })
  }

  const addEditLine = () => {
    setEditLines(prev => [...prev, {
      proposal_id: id, item_name: '', part_number_sku: '', quantity: '',
      unit: 'ea', category: '', vendor: '', your_cost_unit: '',
      markup_percent: '35', customer_price_unit: '', customer_price_total: '',
      pricing_status: 'Needs Pricing'
    }])
  }

  const removeEditLine = (index) => {
    setEditLines(prev => prev.filter((_, i) => i !== index))
  }

  const saveBOM = async () => {
    setSaving(true)

    const { error: deleteError } = await supabase
      .from('bom_line_items')
      .delete()
      .eq('proposal_id', id)

    if (deleteError) { alert('Error clearing old line items'); setSaving(false); return }

    const validLines = editLines.filter(l => l.item_name.trim() !== '')

    if (validLines.length > 0) {
      const { error: insertError } = await supabase
        .from('bom_line_items')
        .insert(
          validLines.map(l => ({
            proposal_id: id,
            item_name: l.item_name,
            manufacturer: l.manufacturer || null,
            part_number_sku: l.part_number_sku,
            quantity: parseFloat(l.quantity) || 0,
            unit: l.unit,
            category: l.category,
            vendor: l.vendor,
            your_cost_unit: parseFloat(l.your_cost_unit) || null,
            markup_percent: parseFloat(l.markup_percent) || null,
            customer_price_unit: parseFloat(l.customer_price_unit) || null,
            customer_price_total: (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0),
            pricing_status: l.your_cost_unit ? 'Confirmed' : 'Needs Pricing',
            recurring: l.recurring || false
          }))
        )

      if (insertError) { alert('Error saving line items'); setSaving(false); return }
    }

    const bomCustomer = validLines.reduce((sum, l) =>
      sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const bomCost = validLines.reduce((sum, l) =>
      sum + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)

    const laborCustomer = laborItems.reduce((sum, l) =>
      sum + (parseFloat(l.customer_price) || 0), 0)
    const laborCost = laborItems.reduce((sum, l) =>
      sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)

    const totalCustomer = bomCustomer + laborCustomer
    const totalCost = bomCost + laborCost
    const grossMarginDollars = totalCustomer - totalCost
    const grossMarginPercent = totalCustomer > 0 ? (grossMarginDollars / totalCustomer) * 100 : 0

    await supabase.from('proposals').update({
      proposal_value: totalCustomer,
      total_customer_value: totalCustomer,
      total_your_cost: totalCost,
      total_gross_margin_dollars: grossMarginDollars,
      total_gross_margin_percent: grossMarginPercent,
      labor_items: laborItems,
    }).eq('id', id)

    await fetchLineItems()
    await fetchProposal()
    logActivity(`BOM updated — ${validLines.length} line items`)
    setEditingBOM(false)
    setSaving(false)
  }

  const saveAsTemplate = async () => {
    if (!templateName.trim()) return
    setSavingTemplate(true)

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase
      .from('profiles').select('org_id').eq('id', user.id).single()

    const { data: template, error } = await supabase
      .from('templates')
      .insert({
        org_id: profileData.org_id,
        name: templateName.trim(),
        industry: proposal?.industry || '',
        description: proposal?.job_description || '',
        labor_items: laborItems.filter(l => l.role) || []
      })
      .select().single()

    if (!error && lineItems.length > 0) {
      await supabase.from('template_line_items').insert(
        lineItems.map(l => ({
          template_id: template.id,
          item_name: l.item_name,
          part_number_sku: l.part_number_sku,
          quantity: l.quantity,
          unit: l.unit,
          category: l.category,
          vendor: l.vendor,
          your_cost_unit: l.your_cost_unit,
          markup_percent: l.markup_percent,
          customer_price_unit: l.customer_price_unit,
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
    const newCollabs = collaborators.includes(profileId)
      ? collaborators.filter(id => id !== profileId)
      : [...collaborators, profileId]
    await supabase.from('proposals').update({ collaborator_ids: newCollabs }).eq('id', id)
    setCollaborators(newCollabs)
    setProposal(prev => ({ ...prev, collaborator_ids: newCollabs }))

    // Log share activity
    const sharedWithProfile = orgProfiles.find(p => p.id === profileId)
    if (!collaborators.includes(profileId) && sharedWithProfile) {
      logActivity(`Deal shared with ${sharedWithProfile.full_name}`)
    }

    // Notify new collaborator
    if (!collaborators.includes(profileId)) {
      const sharedWith = orgProfiles.find(p => p.id === profileId)
      if (sharedWith?.email) {
        try {
          await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-followup-emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE` },
            body: JSON.stringify({
              type: 'share_notification',
              toEmail: sharedWith.email,
              toName: sharedWith.full_name,
              fromName: profile?.full_name || 'A teammate',
              proposalName: proposal?.proposal_name,
              proposalId: id
            })
          })
        } catch (e) { console.log('Share notification error', e) }
      }
    }
    setSharingProposal(false)
  }

  const toggleRecurring = async (itemId, currentValue) => {
    await supabase.from('bom_line_items').update({ recurring: !currentValue }).eq('id', itemId)
    setLineItems(prev => prev.map(l => l.id === itemId ? { ...l, recurring: !currentValue } : l))
    // Update has_recurring on proposal
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
        org_id: profileData.org_id,
        proposal_id: id,
        order_number: finalOrderNumber,
        vendor_name: proposal?.company || '',
        status: 'Draft',
        expected_ship_date: orderExpectedShip || null,
        ship_to_address: clientAddress || null,
        total_cost: totalValue
      }).select().single()

      if (error) throw error

      await supabase.from('manufacturer_order_items').insert(
        lineItems.map(l => ({
          order_id: order.id,
          item_name: l.item_name,
          part_number_sku: l.part_number_sku,
          quantity: l.quantity,
          unit: l.unit,
          your_cost_unit: l.customer_price_unit,
          total_cost: l.customer_price_total || 0,
          received_qty: 0,
          status: 'Pending'
        }))
      )

      logActivity(`Fulfillment order ${finalOrderNumber} created — ${lineItems.length} items`)
      setShowOrderModal(false)
      setOrderNumber('')
      setOrderExpectedShip('')
      alert(`Order ${finalOrderNumber} created — ${lineItems.length} items ready to fulfill.`)
    } catch (err) {
      alert('Error creating order: ' + err.message)
    }
    setCreatingOrder(false)
  }

  const openEditClientModal = async () => {
    setEditClientForm({
      client_name: proposal?.client_name || '',
      company: proposal?.company || '',
      client_email: proposal?.client_email || '',
      client_id: proposal?.client_id || '',
    })
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    const { data: clientsData } = await supabase.from('clients').select('id, company, client_name, email').eq('org_id', profileData.org_id).order('company', { ascending: true })
    setAllClients(clientsData || [])
    setShowEditClientModal(true)
  }

  const saveClientInfo = async () => {
    setSavingClient(true)

    const selectedClientId = editClientForm.client_id || null

    // If linking to a client, pre-fill fields from that client record
    let finalForm = { ...editClientForm }
    if (selectedClientId && selectedClientId !== proposal?.client_id) {
      const found = allClients.find(c => c.id === selectedClientId)
      if (found) {
        finalForm = {
          ...finalForm,
          client_name: found.client_name || finalForm.client_name,
          company: found.company || finalForm.company,
          client_email: found.email || finalForm.client_email,
        }
      }
    }

    // Update proposal
    await supabase.from('proposals').update({
      client_id: selectedClientId,
      client_name: finalForm.client_name,
      company: finalForm.company,
      client_email: finalForm.client_email,
    }).eq('id', id)

    // If linked to a client, update the client record too
    if (selectedClientId) {
      await supabase.from('clients').update({
        client_name: finalForm.client_name,
        company: finalForm.company,
        email: finalForm.client_email,
      }).eq('id', selectedClientId)
    }

    setProposal(prev => ({
      ...prev,
      client_id: selectedClientId,
      client_name: finalForm.client_name,
      company: finalForm.company,
      client_email: finalForm.client_email,
    }))
    logActivity('Client info updated')
    setShowEditClientModal(false)
    setSavingClient(false)
  }

  const deleteProposal = async () => {
    if (deleteConfirmText !== proposal?.proposal_name) return
    setDeletingProposal(true)
    // Delete related data — each step independent
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

  const generateAIBOM = async () => {
    if (!aiBOMPrompt.trim()) return
    setGeneratingBOM(true)
    setAIBOMPreview([])
    try {
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-build-bom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE`
        },
        body: JSON.stringify({
          description: aiBOMPrompt,
          industry: proposal?.industry || '',
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAIBOMPreview(data.items || [])
    } catch (err) {
      alert('Error generating BOM: ' + err.message)
    }
    setGeneratingBOM(false)
  }

  const applyAIBOM = async () => {
    if (aiBOMPreview.length === 0) return

    // Split labor vs materials
    const laborAI = aiBOMPreview.filter(i => i.category === 'Labor')
    const materialsAI = aiBOMPreview.filter(i => i.category !== 'Labor')

    // Materials go into BOM edit mode
    const newLines = materialsAI.map(item => ({
      proposal_id: id,
      item_name: item.item_name,
      part_number_sku: '',
      quantity: item.quantity,
      unit: item.unit || 'ea',
      category: item.category || '',
      vendor: '',
      your_cost_unit: '',
      markup_percent: '35',
      customer_price_unit: '',
      customer_price_total: '',
      pricing_status: 'Needs Pricing',
      recurring: false
    }))
    setEditLines([...lineItems.map(l => ({ ...l })), ...newLines])

    // Labor items go into labor table
    if (laborAI.length > 0) {
      const newLaborItems = laborAI.map(item => ({
        role: item.item_name,
        quantity: String(item.quantity),
        unit: item.unit === 'hr' ? 'hr' : item.unit === 'day' ? 'day' : 'lot',
        your_cost: '',
        markup: 35,
        customer_price: 0
      }))
      setLaborItems(prev => {
        const existing = prev.filter(l => l.role)
        return [...existing, ...newLaborItems]
      })
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
      const { error: uploadError } = await supabase.storage
        .from('proposal-photos')
        .upload(fileName, file, { upsert: false })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('proposal-photos').getPublicUrl(fileName)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('proposal_photos').insert({
        proposal_id: id,
        org_id: proposal?.org_id,
        user_id: user.id,
        url: urlData.publicUrl,
        caption: ''
      })
      await fetchPhotos()
      logActivity(`Site photo added`)
    } catch (err) {
      alert('Error uploading photo: ' + err.message)
    }
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
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')

    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 40, 'F')

    if (profile?.logo_url) {
      const img = new Image()
      img.src = profile.logo_url
      doc.addImage(img, 'PNG', 14, 8, 40, 24)
    } else {
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text(profile?.company_name || proposal?.company || 'ForgePt.', 14, 20)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(200, 98, 42)
      doc.text('Scope it. Send it. Close it.', 14, 30)
    }

    doc.setTextColor(0, 0, 0)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(proposal?.proposal_name || 'Proposal', 14, 55)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Prepared for: ${proposal?.company || ''} — ${proposal?.client_name || ''}`, 14, 65)
    if (clientAddress) doc.text(`Address: ${clientAddress}`, 14, 72)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, clientAddress ? 79 : 72)

    let yPos = 92

    if (proposal?.scope_of_work) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Scope of Work', 14, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const cleanSOW = proposal.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim()
      const sowLines = doc.splitTextToSize(cleanSOW, pageWidth - 28)
      doc.text(sowLines, 14, yPos)
      yPos += sowLines.length * 5 + 12
    }

    if (lineItems.length > 0) {
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Materials & Pricing', 14, yPos)
      yPos += 6
      autoTable(doc, {
        startY: yPos,
        head: [['Item', 'Part #', 'Qty', 'Unit Price', 'Total']],
        body: lineItems.map(item => [
          item.item_name,
          item.part_number_sku || '—',
          item.quantity,
          `$${(item.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `$${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        ]),
        foot: [['', '', '', 'Total', `$${lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 }
      })
    }

    const pdfLaborItems = proposal?.labor_items || []
    if (pdfLaborItems.length > 0 && pdfLaborItems.some(l => l.role)) {
      const tableEnd = doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : yPos + 12
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Labor', 14, tableEnd)
      const laborTotal = pdfLaborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
      const materialsTotal = lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
      const grandTotal = materialsTotal + laborTotal
      autoTable(doc, {
        startY: tableEnd + 6,
        head: [['Role', 'Qty', 'Unit', 'Total Labor']],
        body: pdfLaborItems.filter(l => l.role).map(l => [l.role, l.quantity, l.unit || 'hr', `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]),
        foot: [['', '', 'Total Labor', `$${laborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 }
      })
      const afterLabor = doc.lastAutoTable.finalY + 6
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Grand Total:', pageWidth - 60, afterLabor)
      doc.setTextColor(200, 98, 42)
      doc.text(`$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, afterLabor, { align: 'right' })
    }

    if (profile?.terms_and_conditions) {
      doc.addPage()
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Terms and Conditions', 14, 20)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const termsLines = doc.splitTextToSize(profile.terms_and_conditions, pageWidth - 28)
      doc.text(termsLines, 14, 32)

      const tLen = termsLines.length
      const afterTermsY = 32 + tLen * 4.5 + 16
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Accepted and Agreed', 14, afterTermsY)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      doc.setDrawColor(180, 180, 180)
      const s1 = afterTermsY + 18
      doc.text('Client Signature:', 14, s1); doc.line(50, s1, 140, s1)
      doc.text('Date:', 150, s1); doc.line(163, s1, pageWidth - 14, s1)
      const s2 = s1 + 20
      doc.text('Printed Name:', 14, s2); doc.line(50, s2, pageWidth - 14, s2)
      const s3 = s2 + 20
      doc.text('Title:', 14, s3); doc.line(30, s3, pageWidth - 14, s3)
    } else {
      const afterY = (doc.lastAutoTable?.finalY || 180) + 20
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Accepted and Agreed', 14, afterY)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      doc.setDrawColor(180, 180, 180)
      const s1 = afterY + 18
      doc.text('Client Signature:', 14, s1); doc.line(50, s1, 140, s1)
      doc.text('Date:', 150, s1); doc.line(163, s1, pageWidth - 14, s1)
      const s2 = s1 + 20
      doc.text('Printed Name:', 14, s2); doc.line(50, s2, pageWidth - 14, s2)
      const s3 = s2 + 20
      doc.text('Title:', 14, s3); doc.line(30, s3, pageWidth - 14, s3)
    }

    // Site Photos section
    if (photos && photos.length > 0) {
      doc.addPage()
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Site Photos', 14, 20)
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.line(14, 23, pageWidth - 14, 23)

      let photoX = 14
      let photoY = 30
      const photoWidth = (pageWidth - 42) / 2
      const photoHeight = 60

      for (let i = 0; i < photos.length; i++) {
        try {
          const response = await fetch(photos[i].url)
          const blob = await response.blob()
          const base64 = await new Promise(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.readAsDataURL(blob)
          })
          const ext = photos[i].url.split('.').pop()?.split('?')[0]?.toUpperCase() || 'JPEG'
          const imgFormat = ['PNG', 'JPG', 'JPEG', 'WEBP'].includes(ext) ? ext : 'JPEG'
          doc.addImage(base64, imgFormat === 'JPG' ? 'JPEG' : imgFormat, photoX, photoY, photoWidth, photoHeight)
          if (photos[i].caption) {
            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(100, 100, 100)
            doc.text(photos[i].caption, photoX, photoY + photoHeight + 4, { maxWidth: photoWidth })
          }
          if (i % 2 === 0) {
            photoX = photoX + photoWidth + 14
          } else {
            photoX = 14
            photoY = photoY + photoHeight + 16
            if (photoY > 250) {
              doc.addPage()
              photoY = 20
            }
          }
        } catch (e) {
          console.log('Photo load error:', e)
        }
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

      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE`
        },
        body: JSON.stringify({
          proposalId: id,
          clientEmail: proposal.client_email,
          clientName: proposal.client_name || 'there',
          repName: proposal.rep_name || profile?.full_name || '',
          repEmail: proposal.rep_email || profile?.email || '',
          companyName: profile?.company_name || proposal.company || '',
          proposalName: proposal.proposal_name || 'Proposal',
          subject: sendForm.subject,
          message: sendForm.message,
          logoUrl: profile?.logo_url || null,
          pdfBase64
        })
      })

      setProposal(prev => ({ ...prev, status: 'Sent' }))
      logActivity(`Proposal sent to ${proposal.client_email}`)
      setShowSendModal(false)
      setSendForm({ subject: '', message: '' })
    } catch (err) {
      console.error('Send proposal error:', err)
      alert('Error sending proposal: ' + err.message)
    }

    setSendingProposal(false)
  }

  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'
  const categories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Labor', 'Roofing Materials', 'Insulation', 'Windows & Doors', 'Flooring', 'Painting & Finishing', 'Plumbing', 'HVAC', 'Solar', 'Hardware', 'Other']

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-white text-2xl font-bold">{proposal?.proposal_name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-[#8A9AB0]">{proposal?.company} · {proposal?.client_name}</p>
                <button onClick={openEditClientModal} className="text-[#8A9AB0] hover:text-[#C8622A] text-xs transition-colors" title="Edit client info">✏️</button>
              </div>
              <p className="text-[#8A9AB0] text-sm">{proposal?.client_email}</p>
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
              {isAdmin && proposal?.status !== 'Won' && (
                <button
                  onClick={() => { setDeleteConfirmText(''); setShowDeleteModal(true) }}
                  className="bg-red-900/30 text-red-400 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-red-900/50 transition-colors"
                >
                  Delete
                </button>
              )}
              <select
                value={proposal?.status}
                onChange={e => updateStatus(e.target.value)}
                className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
              >
                {['Draft', 'Sent', 'Won', 'Lost'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div>
              <p className="text-[#8A9AB0] text-xs">Rep</p>
              <p className="text-white text-sm font-medium">{proposal?.rep_name}</p>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs">Close Date</p>
              <input
                type="date"
                value={proposal?.close_date || ''}
                onChange={e => updateCloseDate(e.target.value)}
                className="bg-transparent text-white text-sm font-medium focus:outline-none focus:border-b focus:border-[#C8622A] cursor-pointer"
              />
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs">Industry</p>
              <p className="text-white text-sm font-medium">{proposal?.industry}</p>
            </div>
            <div>
              <p className="text-[#8A9AB0] text-xs">Margin</p>
              <p className="text-[#C8622A] text-sm font-medium">
                {proposal?.total_gross_margin_percent ? `${proposal.total_gross_margin_percent.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Scope of Work */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-lg">Scope of Work</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowShareModal(true)}
                className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors flex items-center gap-2"
              >
                👥 Share{collaborators.length > 0 ? ` (${collaborators.length})` : ''}
              </button>
            {featureSendProposal && proposal?.client_email && (
                <button
                  onClick={() => {
                    setSendForm({
                      subject: `Proposal: ${proposal.proposal_name}`,
                      message: `Hi ${proposal.client_name || 'there'},\n\nPlease find your proposal attached. Don't hesitate to reach out with any questions.\n\nLooking forward to working with you.`
                    })
                    setShowSendModal(true)
                  }}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                >
                  ✉ Send Proposal
                </button>
              )}
              <button
                onClick={downloadPDF}
                className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors"
              >
                ↓ Download PDF
              </button>
              <button
                onClick={downloadDOCX}
                className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors"
              >
                ↓ Download DOCX
              </button>
              {featureSitePhotos && (
                <button
                  onClick={() => setShowPhotosModal(true)}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors flex items-center gap-2"
                >
                  📷 Photos{photos.length > 0 ? ` (${photos.length})` : ''}
                </button>
              )}
              <button
                onClick={generateSOW}
                disabled={generatingSOW}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {generatingSOW ? 'Generating...' : proposal?.scope_of_work ? 'Regenerate SOW' : 'Generate SOW'}
              </button>
            </div>
          </div>

          {/* AI Notes */}
          <div className="mb-4">
            <label className="text-white text-sm font-semibold block mb-1">
              AI Notes (Optional)
            </label>
            <p className="text-[#8A9AB0] text-xs mb-2">
              Describe what you want the Scope of Work to include, how it should sound, or anything important.
            </p>
            <textarea
              value={aiNotes}
              onChange={(e) => setAiNotes(e.target.value)}
              placeholder="Example: This is for a commercial install. Keep it professional, emphasize safety, and make it easy for a non-technical client to understand."
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] min-h-[100px]"
            />
          </div>

          {proposal?.scope_of_work ? (
            <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{proposal.scope_of_work}</p>
          ) : (
            <p className="text-[#8A9AB0] text-sm">No Scope of Work yet. Click Generate SOW to create one.</p>
          )}
        </div>

        {/* BOM */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-lg">BOM Line Items ({lineItems.length})</h3>
            {!editingBOM ? (
              <div className="flex gap-2">
                {proposal?.status === 'Won' && lineItems.length > 0 && orgType === 'manufacturer' && (
                  <button
                    onClick={() => setShowOrderModal(true)}
                    className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
                  >
                    🏭 Convert to Order
                  </button>
                )}
                {orgType !== 'manufacturer' && (
                  <button
                    onClick={() => setShowPOModal(true)}
                    className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors"
                  >
                    Generate PO
                  </button>
                )}
                {orgType !== 'manufacturer' && (
                  <button
                    onClick={openRFQModal}
                    className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors"
                  >
                    Send All RFQs
                  </button>
                )}
                <button
                  onClick={() => { setTemplateName(proposal?.proposal_name || ''); setShowSaveTemplateModal(true) }}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors"
                >
                  Save as Template
                </button>
                {featureAiBom && (
                  <button
                    onClick={() => setShowAIBOMModal(true)}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors"
                  >
                    ✨ AI Build BOM
                  </button>
                )}
                <button
                  onClick={startEditing}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors"
                >
                  Edit BOM
                </button>
                <label className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors cursor-pointer">
                  Upload Excel
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingBOM(false)}
                  className="px-4 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveBOM}
                  disabled={saving}
                  className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save BOM'}
                </button>
              </div>
            )}
          </div>

          {/* BOM View Mode */}
          {!editingBOM ? (
            lineItems.length === 0 ? (
              <p className="text-[#8A9AB0]">No line items yet. Click Edit BOM to add items.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
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
                    {lineItems.map((item) => (
                      <tr key={item.id} className="border-b border-[#2a3d55]/50">
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
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                              item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' :
                              item.pricing_status === 'RFQ Sent' ? 'bg-yellow-500/20 text-yellow-400' :
                              item.pricing_status === 'Confirmed' ? 'bg-green-500/20 text-green-400' :
                              'bg-[#2a3d55] text-[#8A9AB0]'
                            }`}>
                              {item.po_status || item.pricing_status}
                            </span>
                            {item.rfq_expires_at && item.pricing_status === 'RFQ Sent' && (() => {
                              const expired = new Date(item.rfq_expires_at) < new Date()
                              return expired ? (
                                <span className="text-xs font-semibold px-2 py-1 rounded bg-red-500/20 text-red-400">⚠ Pricing Expired</span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded bg-[#2a3d55] text-[#8A9AB0]">Exp {new Date(item.rfq_expires_at).toLocaleDateString()}</span>
                              )
                            })()}
                          </div>
                        </td>
                        <td className="py-3 pr-2 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <input type="checkbox" checked={!!item.recurring} onChange={() => toggleRecurring(item.id, !!item.recurring)}
                              className="accent-[#C8622A] cursor-pointer" title="Mark as recurring" />
                            {item.recurring && proposal?.status === 'Won' && (
                              <input type="date" value={renewalDates[item.id] || item.renewal_date || ''}
                                onChange={e => saveRenewalDate(item.id, e.target.value)}
                                className="bg-[#0F1C2E] text-[#C8622A] border border-[#C8622A]/40 rounded px-1 py-0.5 text-xs focus:outline-none focus:border-[#C8622A] w-28"
                                placeholder="Renewal date" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="6" className="text-[#8A9AB0] pt-4 text-right font-semibold">Materials Total</td>
                      <td className="text-white pt-4 text-right font-bold pr-4">
                        ${lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                    {proposal?.labor_items?.length > 0 && (
                      <tr>
                        <td colSpan="6" className="text-[#8A9AB0] pt-1 text-right font-semibold">Total Labor</td>
                        <td className="text-white pt-1 text-right font-bold pr-4">
                          ${(proposal.labor_items.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    )}
                    <tr className="border-t border-[#2a3d55]">
                      <td colSpan="6" className="text-[#8A9AB0] pt-3 text-right font-semibold">Grand Total</td>
                      <td className="text-[#C8622A] pt-3 text-right font-bold text-lg pr-4">
                        ${(
                          lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0) +
                          (proposal?.labor_items?.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0) || 0)
                        ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : (
            /* BOM Edit Mode */
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    {['Item Name', 'Manufacturer', 'Part #', 'Qty', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price', '🔄', ''].map(h => (
                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editLines.map((line, i) => (
                    <tr key={i} className="border-b border-[#2a3d55]/30">
                      {[
                        ['item_name', 'text', 'Item name'],
                        ['manufacturer', 'text', 'Manufacturer'],
                        ['part_number_sku', 'text', 'Part #'],
                        ['quantity', 'number', 'Qty'],
                      ].map(([field, type, placeholder]) => (
                        <td key={field} className="pr-2 py-1">
                          <input
                            type={type}
                            placeholder={placeholder}
                            value={line[field] || ''}
                            onChange={e => updateEditLine(i, field, e.target.value)}
                            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                          />
                        </td>
                      ))}
                      <td className="pr-2 py-1">
                        <select
                          value={line.unit || 'ea'}
                          onChange={e => updateEditLine(i, 'unit', e.target.value)}
                          className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        >
                          {['ea', 'ft', 'lot', 'hr', 'box', 'roll'].map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="pr-2 py-1">
                        <select
                          value={line.category || ''}
                          onChange={e => updateEditLine(i, 'category', e.target.value)}
                          className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        >
                          <option value="">Category</option>
                          {categories.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="pr-2 py-1">
                        <input
                          type="text"
                          placeholder="Vendor"
                          value={line.vendor || ''}
                          onChange={e => updateEditLine(i, 'vendor', e.target.value)}
                          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        />
                      </td>
                      <td className="pr-2 py-1">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={line.your_cost_unit || ''}
                          onChange={e => updateEditLine(i, 'your_cost_unit', e.target.value)}
                          className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        />
                      </td>
                      <td className="pr-2 py-1">
                        <input
                          type="number"
                          placeholder="35"
                          value={line.markup_percent || ''}
                          onChange={e => updateEditLine(i, 'markup_percent', e.target.value)}
                          className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        />
                      </td>
                      <td className="pr-2 py-1">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={line.customer_price_unit || ''}
                          onChange={e => updateEditLine(i, 'customer_price_unit', e.target.value)}
                          className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                        />
                      </td>
                      <td className="py-1 text-center">
                        <input type="checkbox" checked={!!line.recurring} onChange={e => updateEditLine(i, 'recurring', e.target.checked)}
                          className="accent-[#C8622A] cursor-pointer" title="Recurring" />
                      </td>
                      <td className="py-1">
                        <button onClick={() => removeEditLine(i)} className="text-[#8A9AB0] hover:text-red-400 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button onClick={addEditLine} className="mt-4 text-[#C8622A] hover:text-white text-sm transition-colors">
                + Add Line Item
              </button>

              {/* Labor Section — mirrors materials BOM table */}
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
                        <td className="pr-2 py-1">
                          <input
                            type="text"
                            placeholder="e.g. Electrician"
                            value={item.role}
                            onChange={(e) => updateLabor(index, 'role', e.target.value)}
                            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                          />
                        </td>
                        <td className="pr-2 py-1">
                          <input
                            type="number"
                            placeholder="0"
                            value={item.quantity || ''}
                            onChange={(e) => updateLabor(index, 'quantity', e.target.value)}
                            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                          />
                        </td>
                        <td className="pr-2 py-1">
                          <select
                            value={item.unit || 'hr'}
                            onChange={(e) => updateLabor(index, 'unit', e.target.value)}
                            className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                          >
                            {['hr', 'day', 'lot'].map(u => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="pr-2 py-1">
                          <input
                            type="number"
                            placeholder="0.00"
                            value={item.your_cost || ''}
                            onChange={(e) => updateLabor(index, 'your_cost', e.target.value)}
                            className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                          />
                        </td>
                        <td className="pr-2 py-1">
                          <input
                            type="number"
                            placeholder="35"
                            value={item.markup || ''}
                            onChange={(e) => updateLabor(index, 'markup', e.target.value)}
                            className="w-16 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
                          />
                        </td>
                        <td className="pr-2 py-1">
                          <input
                            type="number"
                            placeholder="0.00"
                            value={item.customer_price || ''}
                            onChange={(e) => updateLabor(index, 'customer_price', e.target.value)}
                            className="w-20 bg-[#0F1C2E] text-[#C8622A] border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] font-semibold"
                          />
                        </td>
                        <td className="py-1">
                          <button
                            onClick={() => setLaborItems(prev => prev.filter((_, i) => i !== index))}
                            className="text-[#8A9AB0] hover:text-red-400 text-xs"
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="5" className="text-[#8A9AB0] pt-3 text-right font-semibold text-xs">Total Labor</td>
                      <td className="text-[#C8622A] pt-3 font-bold pr-2">
                        ${laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
                          .toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                <button
                  onClick={() => setLaborItems(prev => [...prev, { role: '', quantity: '', unit: 'hr', your_cost: '', markup: 35, customer_price: 0 }])}
                  className="mt-4 text-[#C8622A] hover:text-white text-sm transition-colors"
                >
                  + Add Labor
                </button>
              </div>

              {/* Live running total — updates as you type */}
              <div className="mt-6 border-t border-[#2a3d55] pt-4 space-y-2">
                {(() => {
                  const liveBOMTotal = editLines.reduce((sum, l) =>
                    sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
                  const liveLaborTotal = laborItems.reduce((sum, l) =>
                    sum + (parseFloat(l.customer_price) || 0), 0)
                  const liveGrandTotal = liveBOMTotal + liveLaborTotal
                  const liveBOMCost = editLines.reduce((sum, l) =>
                    sum + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
                  const liveLaborCost = laborItems.reduce((sum, l) =>
                    sum + ((parseFloat(l.your_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
                  const liveTotalCost = liveBOMCost + liveLaborCost
                  const liveMargin = liveGrandTotal > 0 ? ((liveGrandTotal - liveTotalCost) / liveGrandTotal * 100).toFixed(1) : '0.0'
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8A9AB0]">Materials</span>
                        <span className="text-white">${liveBOMTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8A9AB0]">Labor</span>
                        <span className="text-white">${liveLaborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold border-t border-[#2a3d55] pt-2">
                        <span className="text-white">Grand Total</span>
                        <span className="text-[#C8622A]">${liveGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-[#8A9AB0]">Gross Margin</span>
                        <span className="text-[#C8622A] font-semibold">{liveMargin}%</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </div>
        {/* FIX: POList is now correctly outside the BOM card */}
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
                    {item.renewal_date ? (
                      <span className="text-[#C8622A] text-xs font-semibold">Renews {new Date(item.renewal_date).toLocaleDateString()}</span>
                    ) : (
                      <span className="text-yellow-400 text-xs">⚠ Set renewal date</span>
                    )}
                    <input type="date" value={renewalDates[item.id] || item.renewal_date || ''}
                      onChange={e => saveRenewalDate(item.id, e.target.value)}
                      className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activity Feed */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-4">Activity</h3>

          {/* Manual entry */}
          <div className="bg-[#0F1C2E] rounded-xl p-4 mb-5 space-y-3">
            <div className="flex gap-2">
              {[{value:'note',label:'Note',icon:'📝'},{value:'call',label:'Call',icon:'📞'},{value:'email',label:'Email',icon:'✉️'},{value:'meeting',label:'Meeting',icon:'🤝'}].map(t => (
                <button key={t.value}
                  onClick={() => setNewActivityNote(prev => ({ ...prev, type: t.value }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${(newActivityNote?.type || 'note') === t.value ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={typeof newActivityNote === 'string' ? newActivityNote : (newActivityNote?.title || '')}
                onChange={e => setNewActivityNote(prev => typeof prev === 'string' ? { type: 'note', title: e.target.value } : { ...prev, title: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && addManualActivity()}
                placeholder="Log a note, call, follow-up..."
                className="flex-1 bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] placeholder-[#8A9AB0]"
              />
              <button
                onClick={addManualActivity}
                disabled={savingActivity || !(typeof newActivityNote === 'string' ? newActivityNote.trim() : newActivityNote?.title?.trim())}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                Log
              </button>
            </div>
          </div>

          {/* Feed */}
          {activity.length === 0 ? (
            <p className="text-[#8A9AB0] text-sm">No activity yet. Changes and notes will appear here.</p>
          ) : (
            <div className="space-y-0">
              {activity.map((item, i) => {
                const icons = { call: '📞', email: '✉️', meeting: '🤝', note: '📝' }
                const icon = icons[item.type] || '📝'
                return (
                  <div key={item.id} className="flex gap-3 relative">
                    {i < activity.length - 1 && (
                      <div className="absolute left-4 top-8 bottom-0 w-px bg-[#2a3d55]" />
                    )}
                    <div className="w-8 h-8 rounded-full bg-[#0F1C2E] border border-[#2a3d55] flex items-center justify-center text-sm shrink-0 z-10">
                      {icon}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex justify-between items-start">
                        <p className="text-white text-sm font-medium">{item.title}</p>
                        <span className="text-[#8A9AB0] text-xs shrink-0 ml-2">
                          {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
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
        const byVendor = needsPricing.reduce((acc, item) => {
          const vendor = item.vendor || 'Unknown Vendor'
          if (!acc[vendor]) acc[vendor] = []
          acc[vendor].push(item)
          return acc
        }, {})
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
            <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
              <h3 className="text-white font-bold text-lg mb-1">Send RFQs</h3>
              <p className="text-[#8A9AB0] text-sm mb-5">Verify vendor emails and choose delivery options for each vendor.</p>
              <div className="space-y-4">
                {Object.entries(byVendor).map(([vendorName, items]) => (
                  <div key={vendorName} className="bg-[#0F1C2E] rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="text-white font-semibold text-sm">{vendorName}</p>
                        <p className="text-[#8A9AB0] text-xs">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    {/* Item list */}
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
                    {/* Email field */}
                    <div className="mb-2">
                      <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor Email</label>
                      <input type="email"
                        value={rfqVendorData[vendorName]?.email || ''}
                        onChange={e => setRfqVendorData(prev => ({ ...prev, [vendorName]: { ...prev[vendorName], email: e.target.value } }))}
                        placeholder="vendor@company.com"
                        className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                    </div>
                    {/* Excel checkbox */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={rfqVendorData[vendorName]?.attachExcel || false}
                        onChange={e => setRfqVendorData(prev => ({ ...prev, [vendorName]: { ...prev[vendorName], attachExcel: e.target.checked } }))}
                        className="accent-[#C8622A]" />
                      <span className="text-[#8A9AB0] text-xs">Attach Excel spreadsheet for pricing</span>
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowRFQModal(false)}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={sendAllRFQs}
                  disabled={sendingRFQs || !Object.values(rfqVendorData).some(v => v.email)}
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
                <select
                  value={editClientForm.client_id || ''}
                  onChange={e => {
                    const cid = e.target.value
                    const found = allClients.find(c => c.id === cid)
                    setEditClientForm(p => ({
                      ...p,
                      client_id: cid,
                      // Auto-fill fields when selecting a client
                      ...(found ? {
                        company: found.company || p.company,
                        client_name: found.client_name || p.client_name,
                        client_email: found.email || p.client_email,
                      } : {})
                    }))
                  }}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                >
                  <option value="">— No client linked —</option>
                  {allClients.map(c => (
                    <option key={c.id} value={c.id}>{c.company}{c.client_name ? ` — ${c.client_name}` : ''}</option>
                  ))}
                </select>
                {editClientForm.client_id && (
                  <p className="text-green-400 text-xs mt-1">✓ Linked — changes below will also update the client record</p>
                )}
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Company</label>
                <input type="text" value={editClientForm.company}
                  onChange={e => setEditClientForm(p => ({ ...p, company: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Client Name</label>
                <input type="text" value={editClientForm.client_name}
                  onChange={e => setEditClientForm(p => ({ ...p, client_name: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Email</label>
                <input type="email" value={editClientForm.client_email}
                  onChange={e => setEditClientForm(p => ({ ...p, client_email: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowEditClientModal(false)}
                className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={saveClientInfo} disabled={savingClient}
                className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {savingClient ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Proposal Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-red-400 text-xl">⚠</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-1 text-center">Delete Proposal</h3>
            <p className="text-[#8A9AB0] text-sm mb-4 text-center">This will permanently delete this proposal and all associated data including BOM, photos, and activity. This cannot be undone.</p>
            <div className="mb-4">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Type <span className="text-white font-mono">{proposal?.proposal_name}</span> to confirm</label>
              <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder={proposal?.proposal_name}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={deleteProposal}
                disabled={deletingProposal || deleteConfirmText !== proposal?.proposal_name}
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
                <textarea value={aiBOMPrompt} onChange={e => setAIBOMPrompt(e.target.value)}
                  rows={3} placeholder="e.g. 8 camera outdoor commercial security system with NVR, remote access, and PoE switch. No specific brands."
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>
              <button onClick={generateAIBOM} disabled={generatingBOM || !aiBOMPrompt.trim()}
                className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50">
                {generatingBOM ? '✨ Building BOM...' : '✨ Generate BOM'}
              </button>

              {aiBOMPreview.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-white text-sm font-semibold">{aiBOMPreview.length} items generated — review before adding</p>
                  </div>
                  <div className="bg-[#0F1C2E] rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#2a3d55]">
                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Item</th>
                          <th className="text-[#8A9AB0] text-right py-2 px-3 font-normal">Qty</th>
                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Unit</th>
                          <th className="text-[#8A9AB0] text-left py-2 px-3 font-normal">Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiBOMPreview.map((item, i) => (
                          <tr key={i} className="border-b border-[#2a3d55]/30">
                            <td className="text-white py-2 px-3">{item.item_name}</td>
                            <td className="text-[#8A9AB0] py-2 px-3 text-right">{item.quantity}</td>
                            <td className="text-[#8A9AB0] py-2 px-3">{item.unit}</td>
                            <td className="text-[#8A9AB0] py-2 px-3">{item.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[#8A9AB0] text-xs mt-2">Items will be added to your BOM in Edit mode. Add your costs and markup after.</p>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowAIBOMModal(false); setAIBOMPreview([]); setAIBOMPrompt('') }}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                {aiBOMPreview.length > 0 && (
                  <button onClick={applyAIBOM}
                    className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                    Add {aiBOMPreview.length} Items to BOM →
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
              <div>
                <h3 className="text-white font-bold text-lg">📷 Site Photos</h3>
                <p className="text-[#8A9AB0] text-sm mt-0.5">Attach job site photos to this proposal</p>
              </div>
              <label className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors cursor-pointer">
                {uploadingPhoto ? 'Uploading...' : '+ Upload Photo'}
                <input type="file" accept="image/*" onChange={uploadPhoto} className="hidden" disabled={uploadingPhoto} />
              </label>
            </div>

            {photos.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-[#2a3d55] rounded-xl">
                <p className="text-[#8A9AB0] text-lg mb-2">📷</p>
                <p className="text-[#8A9AB0] text-sm">No photos yet. Upload site photos to attach to this proposal.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {photos.map(photo => (
                  <div key={photo.id} className="bg-[#0F1C2E] rounded-xl overflow-hidden">
                    <img src={photo.url} alt={photo.caption || 'Site photo'} className="w-full h-48 object-cover" />
                    <div className="p-3 flex items-center gap-2">
                      <input type="text" value={photo.caption || ''} placeholder="Add caption..."
                        onChange={e => updatePhotoCaption(photo.id, e.target.value)}
                        onBlur={e => updatePhotoCaption(photo.id, e.target.value)}
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
              {/* Item summary */}
              <div className="bg-[#0F1C2E] rounded-lg p-3 max-h-48 overflow-y-auto">
                <p className="text-[#8A9AB0] text-xs mb-2">{lineItems.length} item{lineItems.length !== 1 ? 's' : ''} to fulfill</p>
                {lineItems.map(item => (
                  <div key={item.id} className="flex justify-between text-xs py-1 border-b border-[#2a3d55]/30">
                    <span className="text-white">{item.item_name}</span>
                    <span className="text-[#8A9AB0]">Qty: {item.quantity}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs pt-2 font-semibold">
                  <span className="text-[#8A9AB0]">Order Value</span>
                  <span className="text-[#C8622A]">${lineItems.reduce((sum, l) => sum + (l.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Order Number</label>
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setOrderAutoNumber(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${orderAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
                    Auto-Generate
                  </button>
                  <button onClick={() => setOrderAutoNumber(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${!orderAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
                    Enter Manually
                  </button>
                </div>
                {!orderAutoNumber && (
                  <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)}
                    placeholder="e.g. ORD-2026-001"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                )}
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Expected Ship Date (optional)</label>
                <input type="date" value={orderExpectedShip} onChange={e => setOrderExpectedShip(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
              </div>
              {clientAddress && (
                <div className="bg-[#0F1C2E] rounded-lg px-4 py-3 text-xs text-[#8A9AB0]">
                  <p className="text-white font-medium mb-0.5">Ship to:</p>
                  <p>{clientAddress}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowOrderModal(false)}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={createOrder}
                  disabled={creatingOrder || (!orderAutoNumber && !orderNumber)}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {creatingOrder ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Renewal Date Modal — shown when closing Won with recurring items */}
      {showRenewalModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔄</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-1 text-center">Set Renewal Dates</h3>
            <p className="text-[#8A9AB0] text-sm mb-5 text-center">
              This deal has recurring items. Set a renewal date for each so ForgePt. can notify you and auto-generate renewal proposals.
            </p>
            <div className="space-y-3 mb-5">
              {pendingRenewalItems.map(item => (
                <div key={item.id} className="bg-[#0F1C2E] rounded-lg px-4 py-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-white text-sm font-medium">{item.item_name}</p>
                      <p className="text-[#8A9AB0] text-xs">${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} / renewal</p>
                    </div>
                    <input
                      type="date"
                      value={pendingRenewalDates[item.id] || ''}
                      onChange={e => setPendingRenewalDates(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-[#C8622A]"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowRenewalModal(false)}
                className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">
                Skip for now
              </button>
              <button onClick={saveRenewalModalDates} disabled={savingRenewal}
                className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                {savingRenewal ? 'Saving...' : 'Save Renewal Dates'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share / Collaborate Modal */}
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
                    <div key={p.id} className={`flex justify-between items-center p-3 rounded-lg border cursor-pointer transition-colors ${isCollab ? 'border-[#C8622A] bg-[#C8622A]/10' : 'border-[#2a3d55] bg-[#0F1C2E] hover:border-[#3a4d65]'}`}
                      onClick={() => shareProposal(p.id)}>
                      <div>
                        <p className="text-white text-sm font-medium">{p.full_name}</p>
                        <p className="text-[#8A9AB0] text-xs">{p.email}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${isCollab ? 'bg-[#C8622A] text-white' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                        {isCollab ? '✓ Shared' : '+ Share'}
                      </span>
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
            <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-[#C8622A] text-xl">📋</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-2 text-center">Save as Template</h3>
            <p className="text-[#8A9AB0] text-sm mb-5 text-center">This will save all {lineItems.length} line items{laborItems.filter(l => l.role).length > 0 ? ` and ${laborItems.filter(l => l.role).length} labor item${laborItems.filter(l => l.role).length > 1 ? 's' : ''}` : ''} as a reusable template.</p>
            <div className="mb-4">
              <label className="text-[#8A9AB0] text-xs mb-1 block">Template Name</label>
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="e.g. 8 Camera Install"
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowSaveTemplateModal(false); setTemplateName('') }}
                className="flex-1 py-2 bg-[#0F1C2E] text-[#8A9AB0] hover:text-white rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={savingTemplate || !templateName.trim()}
                className="flex-1 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Proposal Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-white font-bold text-lg mb-1">Send Proposal</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">
              Sending to <span className="text-white font-medium">{proposal?.client_email}</span> · PDF will be attached
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Subject</label>
                <input
                  type="text"
                  value={sendForm.subject}
                  onChange={e => setSendForm(p => ({ ...p, subject: e.target.value }))}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Message</label>
                <textarea
                  value={sendForm.message}
                  onChange={e => setSendForm(p => ({ ...p, message: e.target.value }))}
                  rows={6}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none"
                />
              </div>
              <div className="bg-[#0F1C2E] rounded-lg px-4 py-3 text-xs text-[#8A9AB0]">
                <p>✓ PDF proposal will be attached automatically</p>
                <p>✓ Proposal will be marked as Sent</p>
                <p>✓ Follow-up emails will begin on your cadence</p>
                <p>✓ Reply-to will be set to your email</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowSendModal(false)}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendProposal}
                  disabled={sendingProposal || !sendForm.subject || !sendForm.message}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {sendingProposal ? 'Sending...' : 'Send Proposal →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sent Prompt Modal */}
      {showSentPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-sm text-center">
            <div className="w-12 h-12 rounded-full bg-[#C8622A]/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-[#C8622A] text-xl">✉</span>
            </div>
            <h3 className="text-white font-bold text-lg mb-2">Did you send this proposal?</h3>
            <p className="text-[#8A9AB0] text-sm mb-6">Mark it as Sent so follow-up emails go out automatically on schedule.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSentPrompt(false)}
                className="flex-1 py-2 bg-[#0F1C2E] text-[#8A9AB0] hover:text-white rounded-lg text-sm transition-colors"
              >
                Not yet
              </button>
              <button
                onClick={markAsSent}
                className="flex-1 py-2 bg-[#C8622A] text-white rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors"
              >
                Yes, mark as Sent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FIX: PO Modal is now correctly outside all cards, inside the page root */}
      {showPOModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-4">Generate Purchase Order</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Select Vendor</label>
                <select
                  value={poVendor || ''}
                  onChange={e => setPOVendor(e.target.value)}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                >
                  <option value="">— Select vendor —</option>
                  {[...new Set(lineItems.filter(l => l.vendor).map(l => l.vendor))].map(v => (
                    <option key={v} value={v}>{v} ({lineItems.filter(l => l.vendor === v).length} items)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-2 block">PO Number</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setPOAutoNumber(true)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${poAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}
                  >
                    Auto-Generate
                  </button>
                  <button
                    onClick={() => setPOAutoNumber(false)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${!poAutoNumber ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}
                  >
                    Enter Manually
                  </button>
                </div>
                {!poAutoNumber && (
                  <input
                    type="text"
                    value={poNumber}
                    onChange={e => setPONumber(e.target.value)}
                    placeholder="e.g. PO-2026-001"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
                  />
                )}
              </div>
              {poVendor && (
                <div className="bg-[#0F1C2E] rounded-lg p-3">
                  <p className="text-[#8A9AB0] text-xs mb-2">Items for {poVendor}:</p>
                  {lineItems.filter(l => l.vendor === poVendor).map(item => (
                    <div key={item.id} className="flex justify-between text-xs py-1">
                      <span className="text-white">{item.item_name}</span>
                      <span className="text-[#8A9AB0]">Qty: {item.quantity}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowPOModal(false)}
                  className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={generatePO}
                  disabled={!poVendor || generatingPO || (!poAutoNumber && !poNumber)}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
                >
                  {generatingPO ? 'Generating...' : 'Generate PO'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}