import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function SignProposal() {
  const { token } = useParams()
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [signerName, setSignerName] = useState('')
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [terms, setTerms] = useState('')
  const [orgProfile, setOrgProfile] = useState(null)
  const [signedAt, setSignedAt] = useState(null)

  useEffect(() => { fetchProposal() }, [token])

  const fetchProposal = async () => {
    if (!token) { setError('Invalid signing link.'); setLoading(false); return }

    const { data, error: fetchError } = await supabase
      .from('proposals')
      .select('id, proposal_name, company, client_name, client_email, scope_of_work, proposal_value, total_gross_margin_percent, labor_items, signature_name, signature_at, signing_token, org_id, lump_sum_pricing, tax_rate, tax_exempt, signed_pdf_url')
      .eq('signing_token', token)
      .single()

    if (fetchError || !data) { setError('This signing link is invalid or has expired.'); setLoading(false); return }

    if (data.signature_name && data.signature_at) {
      setSigned(true); setSignedAt(data.signature_at); setSignerName(data.signature_name)
    }

    setProposal(data)

    const { data: items } = await supabase
      .from('bom_line_items')
      .select('item_name, part_number_sku, quantity, unit, customer_price_unit, customer_price_total')
      .eq('proposal_id', data.id)
    setLineItems(items || [])

    if (data.org_id) {
      const { data: orgProf } = await supabase
        .from('profiles')
        .select('terms_and_conditions, company_name, logo_url, primary_color')
        .eq('org_id', data.org_id).limit(1).single()
      if (orgProf?.terms_and_conditions) setTerms(orgProf.terms_and_conditions)
      setOrgProfile(orgProf || null)
    }
    setLoading(false)
  }

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [15, 28, 46]
  }

  const generateSignedPDF = async (name, timestamp, items, prop, orgProf) => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const primaryRgb = hexToRgb(orgProf?.primary_color || '#0F1C2E')

    // Header
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 40, 'F')
    if (orgProf?.logo_url) {
      try {
        const img = new Image(); img.crossOrigin = 'anonymous'; img.src = orgProf.logo_url
        await new Promise(resolve => { img.onload = resolve; img.onerror = resolve })
        const maxW = 50, maxH = 26
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight)
        doc.addImage(img, 'PNG', 14, 8 + (maxH - img.naturalHeight * ratio) / 2, img.naturalWidth * ratio, img.naturalHeight * ratio)
      } catch (e) {
        doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold')
        doc.text(orgProf?.company_name || 'ForgePt.', 14, 22)
      }
    } else {
      doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.setFont('helvetica', 'bold')
      doc.text(orgProf?.company_name || 'ForgePt.', 14, 22)
    }
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
    doc.text('SIGNED PROPOSAL', pageWidth - 14, 18, { align: 'right' })
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text(`Signed ${new Date(timestamp).toLocaleString()}`, pageWidth - 14, 28, { align: 'right' })

    // Proposal info
    doc.setTextColor(0, 0, 0); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text(prop.proposal_name || 'Proposal', 14, 55)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
    doc.text(`Prepared for: ${prop.company || ''} — ${prop.client_name || ''}`, 14, 65)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 72)

    let yPos = 85

    // Scope of Work
    if (prop.scope_of_work) {
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Scope of Work', 14, yPos); yPos += 8
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
      const cleanSOW = prop.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim()
      const sowLines = doc.splitTextToSize(cleanSOW, pageWidth - 28)
      doc.text(sowLines, 14, yPos); yPos += sowLines.length * 4.5 + 10
    }

    // Materials
    const mTotal = items.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)
    const lTotal = (prop.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
    const taxRate = (!prop.tax_exempt && prop.tax_rate) ? parseFloat(prop.tax_rate) : 0
    const taxAmt = mTotal * (taxRate / 100)
    const grandTotal = mTotal + lTotal + taxAmt

    if (items.length > 0) {
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Materials & Pricing', 14, yPos); yPos += 5
      if (prop.lump_sum_pricing) {
        autoTable(doc, { startY: yPos, head: [['Item', 'Part #', 'Qty']], body: items.map(i => [i.item_name, i.part_number_sku || '—', i.quantity]), foot: [['', 'Materials Total', `$${mTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]], headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 9 }, showFoot: 'lastPage' })
      } else {
        autoTable(doc, { startY: yPos, head: [['Item', 'Part #', 'Qty', 'Unit Price', 'Total']], body: items.map(i => [i.item_name, i.part_number_sku || '—', i.quantity, `$${(i.customer_price_unit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, `$${(i.customer_price_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]), foot: [['', '', '', 'Total', `$${mTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]], headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 9 }, showFoot: 'lastPage' })
      }
    }

    // Labor
    const pdfLabor = (prop.labor_items || []).filter(l => l.role)
    if (pdfLabor.length > 0) {
      const afterY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : yPos + 10
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Labor', 14, afterY)
      autoTable(doc, { startY: afterY + 5, head: [['Role', 'Qty', 'Unit', 'Total Labor']], body: pdfLabor.map(l => [l.role, l.quantity, l.unit || 'hr', `$${(parseFloat(l.customer_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`]), foot: [['', '', 'Total Labor', `$${lTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]], headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] }, footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [245, 245, 245] }, styles: { fontSize: 9 }, showFoot: 'lastPage' })
    }

    // Grand total
    const afterTable = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : yPos + 40
    if (taxRate > 0) {
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
      doc.text(`Tax (${taxRate}%): $${taxAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, afterTable, { align: 'right' })
    }
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Grand Total:', pageWidth - 60, afterTable + (taxRate > 0 ? 10 : 0))
    doc.setTextColor(200, 98, 42)
    doc.text(`$${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, pageWidth - 14, afterTable + (taxRate > 0 ? 10 : 0), { align: 'right' })

    // Terms
    if (orgProf?.terms_and_conditions) {
      doc.addPage()
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Terms and Conditions', 14, 20)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
      const termsLines = doc.splitTextToSize(orgProf.terms_and_conditions, pageWidth - 28)
      doc.text(termsLines, 14, 32)
    }

    // Signature confirmation page
    doc.addPage()
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 8, 'F')
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Electronic Signature Confirmation', 14, 28)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
    doc.text(`Proposal: ${prop.proposal_name}`, 14, 42)
    doc.text(`Client: ${prop.client_name || ''} — ${prop.company || ''}`, 14, 50)
    doc.text(`Email: ${prop.client_email || ''}`, 14, 58)
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Signature Details', 14, 74)
    doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.line(14, 76, pageWidth - 14, 76)
    doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
    doc.text(`Signed by: ${name}`, 14, 86)
    doc.text(`Date & Time: ${new Date(timestamp).toLocaleString()}`, 14, 94)
    doc.text(`Proposal Total: $${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 14, 102)
    doc.setFillColor(248, 249, 250); doc.rect(14, 114, pageWidth - 28, 36, 'F')
    doc.setDrawColor(220, 220, 220); doc.rect(14, 114, pageWidth - 28, 36, 'S')
    doc.setFontSize(22); doc.setFont('helvetica', 'italic'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text(name, 24, 137)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 150)
    doc.text(`Electronic signature recorded ${new Date(timestamp).toLocaleString()}`, 14, 158)
    doc.text('This electronic signature is legally binding and equivalent to a handwritten signature.', 14, 165)
    const ph = doc.internal.pageSize.getHeight()
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, ph - 12, pageWidth, 12, 'F')
    doc.setFontSize(8); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'normal')
    doc.text(`${orgProf?.company_name || 'ForgePt.'} · Signed Proposal · Confidential`, pageWidth / 2, ph - 4, { align: 'center' })

    return doc
  }

  const submitSignature = async () => {
    if (!signerName.trim()) return
    setSigning(true)
    try {
      let clientIp = 'unknown'
      try { const r = await fetch('https://api.ipify.org?format=json'); const d = await r.json(); clientIp = d.ip || 'unknown' } catch (e) {}

      const now = new Date().toISOString()

      // Generate and upload signed PDF
      let signedPdfUrl = null
      try {
        const doc = await generateSignedPDF(signerName.trim(), now, lineItems, proposal, orgProfile)
        const pdfBlob = doc.output('blob')
        const fileName = `${proposal.id}/signed-${Date.now()}.pdf`
        const { error: uploadError } = await supabase.storage.from('signed-proposals').upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('signed-proposals').getPublicUrl(fileName)
          signedPdfUrl = urlData.publicUrl
        }
      } catch (pdfErr) { console.log('PDF generation error (non-fatal):', pdfErr) }

      const { error: updateError } = await supabase.from('proposals').update({
        signature_name: signerName.trim(), signature_at: now, signature_ip: clientIp, status: 'Won',
        ...(signedPdfUrl ? { signed_pdf_url: signedPdfUrl } : {})
      }).eq('signing_token', token)

      if (updateError) throw updateError

      await supabase.from('activities').insert({
        proposal_id: proposal.id, org_id: proposal.org_id, type: 'note',
        title: `Proposal signed by ${signerName.trim()} · IP: ${clientIp}${signedPdfUrl ? ' · Signed PDF stored' : ''}`
      })

      setSigned(true); setSignedAt(now)
    } catch (e) { alert('Error submitting signature. Please try again.') }
    setSigning(false)
  }

  const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const materialsTotal = lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)
  const laborTotal = (proposal?.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
  const taxRate = (!proposal?.tax_exempt && proposal?.tax_rate) ? parseFloat(proposal.tax_rate) : 0
  const taxAmount = materialsTotal * (taxRate / 100)
  const grandTotal = materialsTotal + laborTotal + taxAmount

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><div className="text-center"><h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1><p className="text-[#8A9AB0] text-sm">Loading proposal...</p></div></div>
  if (error) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center px-4"><div className="text-center max-w-md"><h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1><div className="bg-[#1a2d45] rounded-2xl p-8 mt-6"><p className="text-red-400 text-lg font-semibold mb-2">⚠ Link Error</p><p className="text-[#8A9AB0] text-sm">{error}</p></div></div></div>

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
          <span className="text-[#8A9AB0] text-sm">Proposal Review & Signature</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h2 className="text-white text-2xl font-bold mb-1">{proposal?.proposal_name}</h2>
          <p className="text-[#8A9AB0]">Prepared for: {proposal?.company} — {proposal?.client_name}</p>
          {signed && (
            <div className="mt-4 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="text-green-400 text-xl">✓</span>
              <div>
                <p className="text-green-400 font-semibold text-sm">Signed by {signerName}</p>
                <p className="text-[#8A9AB0] text-xs">{signedAt ? new Date(signedAt).toLocaleString() : ''}</p>
              </div>
            </div>
          )}
        </div>

        {proposal?.scope_of_work && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Scope of Work</h3>
            <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">
              {proposal.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim()}
            </p>
          </div>
        )}

        {lineItems.length > 0 && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Materials & Pricing</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3d55]">
                    <th className="text-[#8A9AB0] text-left py-2 pr-4 font-normal">Item</th>
                    <th className="text-[#8A9AB0] text-left py-2 pr-4 font-normal">Part #</th>
                    <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal">Qty</th>
                    {!proposal?.lump_sum_pricing && <>
                      <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal">Unit Price</th>
                      <th className="text-[#8A9AB0] text-right py-2 font-normal">Total</th>
                    </>}
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-[#2a3d55]/50">
                      <td className="text-white py-3 pr-4">{item.item_name}</td>
                      <td className="text-[#8A9AB0] py-3 pr-4">{item.part_number_sku || '—'}</td>
                      <td className="text-white py-3 pr-4 text-right">{item.quantity} {item.unit || 'ea'}</td>
                      {!proposal?.lump_sum_pricing && <>
                        <td className="text-white py-3 pr-4 text-right">${fmt(item.customer_price_unit)}</td>
                        <td className="text-white py-3 text-right">${fmt(item.customer_price_total)}</td>
                      </>}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={proposal?.lump_sum_pricing ? 2 : 4} className="text-[#8A9AB0] pt-4 text-right font-semibold">Materials Total</td><td className="text-white pt-4 text-right font-bold">${fmt(materialsTotal)}</td></tr>
                  {laborTotal > 0 && <tr><td colSpan={proposal?.lump_sum_pricing ? 2 : 4} className="text-[#8A9AB0] pt-1 text-right font-semibold">Labor Total</td><td className="text-white pt-1 text-right font-bold">${fmt(laborTotal)}</td></tr>}
                  {taxRate > 0 && <tr><td colSpan={proposal?.lump_sum_pricing ? 2 : 4} className="text-[#8A9AB0] pt-1 text-right font-semibold">Tax ({taxRate}%)</td><td className="text-white pt-1 text-right font-bold">${fmt(taxAmount)}</td></tr>}
                  <tr className="border-t border-[#2a3d55]"><td colSpan={proposal?.lump_sum_pricing ? 2 : 4} className="text-white pt-3 text-right font-bold text-base">Grand Total</td><td className="text-[#C8622A] pt-3 text-right font-bold text-lg">${fmt(grandTotal)}</td></tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {terms && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Terms and Conditions</h3>
            <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{terms}</p>
          </div>
        )}

        <div className="bg-[#1a2d45] rounded-xl p-6">
          {signed ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4"><span className="text-green-400 text-3xl">✓</span></div>
              <h3 className="text-white font-bold text-xl mb-2">Proposal Accepted</h3>
              <p className="text-[#8A9AB0] text-sm">Signed by <span className="text-white font-semibold">{signerName}</span></p>
              <p className="text-[#8A9AB0] text-xs mt-1">{signedAt ? new Date(signedAt).toLocaleString() : ''}</p>
              <p className="text-[#8A9AB0] text-xs mt-4">Your contractor has been notified. Thank you for your business.</p>
            </div>
          ) : (
            <div>
              <h3 className="text-white font-bold text-lg mb-1">Accept & Sign</h3>
              <p className="text-[#8A9AB0] text-sm mb-6">
                By signing below, you agree to the terms of this proposal and authorize the work described above for the total amount of <span className="text-white font-semibold">${fmt(grandTotal)}</span>.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-2 block font-semibold uppercase tracking-wide">Full Name <span className="text-[#C8622A]">*</span></label>
                  <input type="text" value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Type your full legal name"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#C8622A] placeholder-[#2a3d55]"
                    onKeyDown={e => e.key === 'Enter' && signerName.trim() && submitSignature()} />
                </div>
                {signerName.trim() && (
                  <div className="bg-[#0F1C2E] rounded-xl px-6 py-4 border border-[#2a3d55]">
                    <p className="text-[#8A9AB0] text-xs mb-2 uppercase tracking-wide font-semibold">Signature Preview</p>
                    <p className="text-white text-3xl" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{signerName}</p>
                    <p className="text-[#8A9AB0] text-xs mt-2">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                )}
                <div className="bg-[#0F1C2E] rounded-lg px-4 py-3 text-xs text-[#8A9AB0]">
                  <p>✓ Your signature will be timestamped and recorded</p>
                  <p>✓ A signed PDF copy will be generated and stored</p>
                  <p>✓ Your contractor will be notified immediately</p>
                  <p>✓ This constitutes a legally binding acceptance</p>
                </div>
                <button onClick={submitSignature} disabled={signing || !signerName.trim()}
                  className="w-full bg-[#C8622A] text-white py-4 rounded-xl text-base font-bold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {signing ? 'Signing & Generating Document...' : `I Agree & Sign — ${proposal?.proposal_name}`}
                </button>
                <p className="text-[#8A9AB0] text-xs text-center">
                  By clicking "I Agree & Sign" you are electronically signing this document. This signature is legally equivalent to a handwritten signature.
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[#2a3d55] text-xs pb-4">Powered by ForgePt. · Secure electronic signature</p>
      </div>
    </div>
  )
}