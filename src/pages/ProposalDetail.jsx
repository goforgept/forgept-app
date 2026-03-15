import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

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
    await supabase
      .from('proposals')
      .update({ status: newStatus })
      .eq('id', id)
    setProposal(prev => ({ ...prev, status: newStatus }))
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

  const downloadPDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()

    doc.setFillColor(15, 28, 46)
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
      doc.setTextColor(15, 28, 46)
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
      doc.setTextColor(15, 28, 46)
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
        headStyles: { fillColor: [15, 28, 46], textColor: [255, 255, 255] },
        footStyles: { fillColor: [200, 98, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 }
      })
    }

    if (profile?.terms_and_conditions) {
      doc.addPage()
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(15, 28, 46)
      doc.text('Terms and Conditions', 14, 20)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      const termsLines = doc.splitTextToSize(profile.terms_and_conditions, pageWidth - 28)
      doc.text(termsLines, 14, 32)
    }

    doc.save(`${proposal?.proposal_name || 'Proposal'}.pdf`)
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

    if (deleteError) {
      alert('Error clearing old line items')
      setSaving(false)
      return
    }

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

      if (insertError) {
        alert('Error saving line items')
        setSaving(false)
        return
      }
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
              <p className="text-white text-sm font-medium">{proposal?.close_date}</p>
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
                onClick={generateSOW}
                disabled={generatingSOW}
                className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
              >
                {generatingSOW ? 'Generating...' : proposal?.scope_of_work ? 'Regenerate SOW' : 'Generate SOW'}
              </button>
            </div>
          </div>
          {proposal?.scope_of_work ? (
            <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{proposal.scope_of_work}</p>
          ) : (
            <p className="text-[#8A9AB0] text-sm">No Scope of Work yet. Click Generate SOW to create one.</p>
          )}
        </div>

        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-white font-bold text-lg">BOM Line Items ({lineItems.length})</h3>
            {!editingBOM ? (
              <button onClick={startEditing} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors">
                Edit BOM
              </button>
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
                      <th className="text-[#8A9AB0] text-right py-2">Total</th>
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
                        <td className="text-white py-3 text-right">${fmt(item.customer_price_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="5" className="text-[#8A9AB0] pt-4 text-right font-semibold">Total</td>
                      <td className="text-[#C8622A] pt-4 text-right font-bold text-lg">
                        ${lineItems.reduce((sum, item) => sum + (item.customer_price_total || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
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
      </div>
    </div>
  )
}