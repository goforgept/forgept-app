import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import POList from '../components/POList'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType } from 'docx'

export default function ProposalDetail({ isAdmin }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
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

  useEffect(() => {
    fetchProposal()
    fetchLineItems()
    fetchProfile()
  }, [])

  const fetchProposal = async () => {
    const { data } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', id)
      .single()
    setProposal(data)
    setLoading(false)
  }

  const fetchLineItems = async () => {
    const { data } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('proposal_id', id)
    setLineItems(data || [])
  }

  const fetchProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    setProfile(data)
  }

  const updateStatus = async (newStatus) => {
    await supabase.from('proposals').update({ status: newStatus }).eq('id', id)
    setProposal(prev => ({ ...prev, status: newStatus }))
  }

  const updateCloseDate = async (newDate) => {
    await supabase.from('proposals').update({ close_date: newDate }).eq('id', id)
    setProposal(prev => ({ ...prev, close_date: newDate }))
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
          company: proposal.company,
          jobDesc: proposal.job_description,
          industry: proposal.industry,
          repName: proposal.rep_name,
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
    } catch (err) {
      console.log('SOW generation error:', err)
    }
    setGeneratingSOW(false)
  }

  const sendAllRFQs = async () => {
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

    const vendorCount = Object.keys(byVendor).length
    const confirmed = window.confirm(`Send RFQs to ${vendorCount} vendor(s): ${Object.keys(byVendor).join(', ')}?`)
    if (!confirmed) return

    for (const [vendorName, items] of Object.entries(byVendor)) {
      const vendorEmail = prompt(`Enter email for ${vendorName}:`)
      if (!vendorEmail) continue

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
              partNumber: i.part_number_sku,
              quantity: i.quantity,
              unit: i.unit
            })),
            vendorEmail,
            vendorName,
            proposalName: proposal.proposal_name,
            repName: proposal.rep_name,
            repEmail: proposal.rep_email,
            company: profile?.company_name || proposal.company
          })
        })
      } catch (err) {
        console.log(`RFQ error for ${vendorName}:`, err)
      }
    }

    await fetchLineItems()
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

  const downloadPDF = () => {
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
    doc.text(`Industry: ${proposal?.industry || ''}`, 14, 72)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 79)

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
      const sowLines = doc.splitTextToSize(proposal.scope_of_work, pageWidth - 28)
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
        head: [['Item', 'Category', 'Vendor', 'Qty', 'Unit Price', 'Total']],
        body: lineItems.map(item => [
          item.item_name,
          item.category || '',
          item.vendor || '',
          item.quantity,
          `$${(item.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `$${(item.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        ]),
        foot: [['', '', '', '', 'Total', `$${lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 }
      })
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
    }

    doc.save(`${proposal?.proposal_name || 'Proposal'}.pdf`)
  }

  const downloadDOCX = async () => {
    const primaryColor = (profile?.primary_color || '#0F1C2E').replace('#', '')

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
    const borders = { top: border, bottom: border, left: border, right: border }

    const colWidths = [2800, 1200, 1200, 600, 1000, 1000]

    const headerRow = new TableRow({
      children: ['Item', 'Category', 'Vendor', 'Qty', 'Unit Price', 'Total'].map((h, i) =>
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
          item.category || '—',
          item.vendor || '—',
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
          columnSpan: 5,
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
        children: [new TextRun({ text: `Industry: ${proposal?.industry || ''}`, size: 20, color: '666666' })]
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
        ...proposal.scope_of_work.split('\n').map(line =>
          new Paragraph({
            children: [new TextRun({ text: line, size: 20 })]
          })
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

    if (profile?.terms_and_conditions) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Terms and Conditions', bold: true, size: 28, color: primaryColor })]
        }),
        new Paragraph({ children: [new TextRun({ text: '' })] }),
        ...profile.terms_and_conditions.split('\n').map(line =>
          new Paragraph({
            children: [new TextRun({ text: line, size: 18, color: '444444' })]
          })
        )
      )
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

    let finalPONumber = poNumber

    if (poAutoNumber) {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profileData } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

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

    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 52)
    doc.text(`Project: ${proposal?.proposal_name || ''}`, 14, 60)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Vendor', 14, 76)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(10)
    doc.text(poVendor, 14, 84)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Bill To', pageWidth / 2, 76)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(10)
    doc.text(profile?.company_name || '', pageWidth / 2, 84)

    autoTable(doc, {
      startY: 96,
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

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profileData } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

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
    doc.save(`${finalPONumber} - ${poVendor}.pdf`)
    setShowPOModal(false)
    setGeneratingPO(false)
  }
const handleExcelUpload = async (e) => {
  const file = e.target.files[0]
  if (!file) return

  try {
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)

    const sheet = workbook.Sheets[workbook.SheetNames[0]]

    // Read rows as simple arrays (not column names)
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    const mapped = rows
      .slice(1) // skip first row (header)
      .filter(r => r[0]) // only keep rows with a first column
      .map(r => ({
        proposal_id: id,
        item_name: r[0] || '',
        part_number_sku: '',
        quantity: parseFloat(r[1]) || 1,
        unit: 'ea',
        category: '',
        vendor: '',
        your_cost_unit: '',
        markup_percent: '35',
        customer_price_unit: '',
        customer_price_total: '',
        pricing_status: 'Needs Pricing'
      }))

    setEditLines(mapped)

            // small delay ensures state is ready before switching UI
            setTimeout(() => {
            setEditingBOM(true)
        }, 0)

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
      if (field === 'your_cost_unit' || field === 'markup_percent') {
        const cost = parseFloat(updated[index].your_cost_unit) || 0
        const markup = parseFloat(updated[index].markup_percent) || 0
        updated[index].customer_price_unit = (cost * (1 + markup / 100)).toFixed(2)
      }
      if (field === 'customer_price_unit' || field === 'quantity') {
        const price = parseFloat(updated[index].customer_price_unit) || 0
        const qty = parseFloat(updated[index].quantity) || 0
        updated[index].customer_price_total = (price * qty).toFixed(2)
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
            part_number_sku: l.part_number_sku,
            quantity: parseFloat(l.quantity) || 0,
            unit: l.unit,
            category: l.category,
            vendor: l.vendor,
            your_cost_unit: parseFloat(l.your_cost_unit) || null,
            markup_percent: parseFloat(l.markup_percent) || null,
            customer_price_unit: parseFloat(l.customer_price_unit) || null,
            customer_price_total: (parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0),
            pricing_status: l.your_cost_unit ? 'Confirmed' : 'Needs Pricing'
          }))
        )

      if (insertError) { alert('Error saving line items'); setSaving(false); return }
    }

    const totalCustomer = validLines.reduce((sum, l) =>
      sum + ((parseFloat(l.customer_price_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const totalCost = validLines.reduce((sum, l) =>
      sum + ((parseFloat(l.your_cost_unit) || 0) * (parseFloat(l.quantity) || 0)), 0)
    const grossMarginDollars = totalCustomer - totalCost
    const grossMarginPercent = totalCustomer > 0 ? (grossMarginDollars / totalCustomer) * 100 : 0

    await supabase.from('proposals').update({
      proposal_value: totalCustomer,
      total_customer_value: totalCustomer,
      total_your_cost: totalCost,
      total_gross_margin_dollars: grossMarginDollars,
      total_gross_margin_percent: grossMarginPercent
    }).eq('id', id)

    await fetchLineItems()
    await fetchProposal()
    setEditingBOM(false)
    setSaving(false)
  }

  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'
  const categories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Labor', 'Other']

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} />

      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-white text-2xl font-bold">{proposal?.proposal_name}</h2>
              <p className="text-[#8A9AB0] mt-1">{proposal?.company} · {proposal?.client_name}</p>
              <p className="text-[#8A9AB0] text-sm">{proposal?.client_email}</p>
            </div>
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
                <button
                  onClick={() => setShowPOModal(true)}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors"
                >
                  Generate PO
                </button>
                <button
                  onClick={sendAllRFQs}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors"
                >
                  Send All RFQs
                </button>
                <button onClick={startEditing} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
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
                <button onClick={() => setEditingBOM(false)} className="px-4 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">
                  Cancel
                </button>
                <button onClick={saveBOM} disabled={saving} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save BOM'}
                </button>
              </div>
            )}
          </div>

          {!editingBOM ? (
            lineItems.length === 0 ? (
              <p className="text-[#8A9AB0]">No line items yet. Click Edit BOM to add items.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2a3d55]">
                      <th className="text-[#8A9AB0] text-left py-2 pr-4">Item</th>
                      <th className="text-[#8A9AB0] text-left py-2 pr-4">Category</th>
                      <th className="text-[#8A9AB0] text-left py-2 pr-4">Vendor</th>
                      <th className="text-[#8A9AB0] text-right py-2 pr-4">Qty</th>
                      <th className="text-[#8A9AB0] text-right py-2 pr-4">Unit Price</th>
                      <th className="text-[#8A9AB0] text-right py-2 pr-4">Total</th>
                      <th className="text-[#8A9AB0] text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item) => (
                      <tr key={item.id} className="border-b border-[#2a3d55]/50">
                        <td className="text-white py-3 pr-4">{item.item_name}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{item.category}</td>
                        <td className="text-[#8A9AB0] py-3 pr-4">{item.vendor}</td>
                        <td className="text-white py-3 pr-4 text-right">{item.quantity}</td>
                        <td className="text-white py-3 pr-4 text-right">${fmt(item.customer_price_unit)}</td>
                        <td className="text-white py-3 pr-4 text-right">${fmt(item.customer_price_total)}</td>
                        <td className="py-3">
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${
                            item.po_status === 'PO Sent' ? 'bg-blue-500/20 text-blue-400' :
                            item.pricing_status === 'RFQ Sent' ? 'bg-yellow-500/20 text-yellow-400' :
                            item.pricing_status === 'Confirmed' ? 'bg-green-500/20 text-green-400' :
                            'bg-[#2a3d55] text-[#8A9AB0]'
                          }`}>
                            {item.po_status || item.pricing_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="5" className="text-[#8A9AB0] pt-4 text-right font-semibold">Total</td>
                      <td className="text-[#C8622A] pt-4 text-right font-bold text-lg pr-4">
                        ${lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    {['Item Name', 'Part #', 'Qty', 'Unit', 'Category', 'Vendor', 'Your Cost', 'Markup %', 'Customer Price', ''].map(h => (
                      <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-normal text-xs">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editLines.map((line, i) => (
                    <tr key={i} className="border-b border-[#2a3d55]/30">
                      {[
                        ['item_name', 'text', 'Item name'],
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
                        <input type="text" placeholder="Vendor" value={line.vendor || ''}
                          onChange={e => updateEditLine(i, 'vendor', e.target.value)}
                          className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]" />
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
            </div>
          )}
        </div>

        <POList proposalId={id} />
      </div>

      {/* PO Modal */}
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
