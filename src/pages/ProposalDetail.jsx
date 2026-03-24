import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import POList from '../components/POList'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, AlignmentType } from 'docx'

export default function ProposalDetail({ isAdmin, featureProposals = true, featureCRM = false }) {
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

    if (data?.labor_items && data.labor_items.length > 0) {
      setLaborItems(data.labor_items)
    }

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
      .select('*, organizations(org_type, feature_send_proposal)')
      .eq('id', user.id)
      .single()
    setProfile(data)
    setOrgType(data?.organizations?.org_type || 'integrator')
    setFeatureSendProposal(data?.organizations?.feature_send_proposal || false)
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

  const markAsSent = async () => {
    await supabase.from('proposals').update({ status: 'Sent' }).eq('id', id)
    setProposal(prev => ({ ...prev, status: 'Sent' }))
    setShowSentPrompt(false)
  }

  const downloadPDF = () => {
    if (proposal?.status === 'Draft') setShowSentPrompt(true)
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

    // Labor section in PDF
    const laborItems = proposal?.labor_items || []
    if (laborItems.length > 0 && laborItems.some(l => l.role)) {
      const tableEnd = doc.lastAutoTable ? doc.lastAutoTable.finalY + 12 : yPos + 12
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Labor', 14, tableEnd)

      const laborTotal = laborItems.reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
      const materialsTotal = lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0)
      const grandTotal = materialsTotal + laborTotal

      autoTable(doc, {
        startY: tableEnd + 6,
        head: [['Role', 'Qty', 'Unit', 'Total Labor']],
        body: laborItems.filter(l => l.role).map(l => [
          l.role,
          l.quantity,
          l.unit || 'hr',
          `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        ]),
        foot: [['', '', 'Total Labor', `$${laborTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 }
      })

      // Grand total row
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
    }

    // Signature block — directly after terms on same page
    {
      const termsLines = profile?.terms_and_conditions
        ? doc.splitTextToSize(profile.terms_and_conditions, pageWidth - 28).length
        : 0
      const afterTermsY = profile?.terms_and_conditions ? 32 + termsLines * 4.5 + 16 : (doc.lastAutoTable?.finalY || 180) + 20

      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Accepted and Agreed', 14, afterTermsY)

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      doc.setDrawColor(180, 180, 180)

      const s1 = afterTermsY + 18
      doc.text('Client Signature:', 14, s1)
      doc.line(50, s1, 140, s1)
      doc.text('Date:', 150, s1)
      doc.line(163, s1, pageWidth - 14, s1)

      const s2 = s1 + 20
      doc.text('Printed Name:', 14, s2)
      doc.line(50, s2, pageWidth - 14, s2)

      const s3 = s2 + 20
      doc.text('Title:', 14, s3)
      doc.line(30, s3, pageWidth - 14, s3)
    }

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

  const sendProposal = async () => {
    if (!proposal?.client_email) { alert('No client email on this proposal.'); return }
    setSendingProposal(true)

    try {
      // Generate PDF as base64
      const { default: jsPDFLib } = await import('jspdf')
      const { default: autoTableLib } = await import('jspdf-autotable')
      const pdfDoc = new jsPDFLib()
      const pageWidth = pdfDoc.internal.pageSize.getWidth()
      const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')

      pdfDoc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      pdfDoc.rect(0, 0, pageWidth, 40, 'F')
      if (profile?.logo_url) {
        const img = new Image(); img.src = profile.logo_url
        pdfDoc.addImage(img, 'PNG', 14, 8, 40, 24)
      } else {
        pdfDoc.setTextColor(255,255,255); pdfDoc.setFontSize(24); pdfDoc.setFont('helvetica','bold')
        pdfDoc.text(profile?.company_name || 'ForgePt.', 14, 20)
      }
      pdfDoc.setTextColor(0,0,0); pdfDoc.setFontSize(18); pdfDoc.setFont('helvetica','bold')
      pdfDoc.text(proposal?.proposal_name || 'Proposal', 14, 55)
      pdfDoc.setFontSize(10); pdfDoc.setFont('helvetica','normal'); pdfDoc.setTextColor(100,100,100)
      pdfDoc.text(`Prepared for: ${proposal?.company || ''} — ${proposal?.client_name || ''}`, 14, 65)
      pdfDoc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 72)

      if (proposal?.scope_of_work) {
        pdfDoc.setFontSize(13); pdfDoc.setFont('helvetica','bold')
        pdfDoc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
        pdfDoc.text('Scope of Work', 14, 85)
        pdfDoc.setFontSize(10); pdfDoc.setFont('helvetica','normal'); pdfDoc.setTextColor(60,60,60)
        const sowLines = pdfDoc.splitTextToSize(proposal.scope_of_work, pageWidth - 28)
        pdfDoc.text(sowLines, 14, 93)
      }

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
      setShowSendModal(false)
      setSendForm({ subject: '', message: '' })
    } catch (err) {
      console.error('Send proposal error:', err)
      alert('Error sending proposal: ' + err.message)
    }

    setSendingProposal(false)
  }

  const fmt = (num) => num?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'
  const categories = ['Electrical', 'Mechanical', 'Audio/Visual', 'Security', 'Networking', 'Material', 'Labor', 'Other']

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white">Loading...</p>
        </div>
      ) : (
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
              {featureSendProposal && (
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
                <button
                  onClick={() => { setTemplateName(proposal?.proposal_name || ''); setShowSaveTemplateModal(true) }}
                  className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors"
                >
                  Save as Template
                </button>
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
                      <th className="text-[#8A9AB0] text-left py-2 pr-4">Part #</th>
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
                        <td className="text-[#8A9AB0] py-3 pr-4">{item.part_number_sku || '—'}</td>
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
        <POList proposalId={id} />

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