import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'

export default function PurchaseOrders({ isAdmin, featureProposals = true, featureCRM = false, featurePurchaseOrders = true, featureInvoices = true, role = 'admin', isPM = false, isTechnician = false }) {
  const [pos, setPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [expandedPO, setExpandedPO] = useState(null)
  const [lineItems, setLineItems] = useState({})
  const [savingReceiving, setSavingReceiving] = useState({})
  const [profile, setProfile] = useState(null)
  const navigate = useNavigate()

  // New PO modal
  const [showNewPO, setShowNewPO] = useState(false)
  const [vendors, setVendors] = useState([])
  const [jobs, setJobs] = useState([])
  const [serviceTickets, setServiceTickets] = useState([])
  const [generatingPO, setGeneratingPO] = useState(false)
  const [poForm, setPOForm] = useState({
    vendor_id: '',
    vendor_name: '',
    vendor_email: '',
    link_type: 'none', // 'none' | 'job' | 'ticket'
    job_id: '',
    ticket_id: '',
    po_number_mode: 'auto',
    po_number_manual: '',
    notes: '',
  })
  const [poLines, setPOLines] = useState([
    { id: crypto.randomUUID(), item_name: '', part_number: '', quantity: 1, unit: 'ea', unit_cost: '' }
  ])

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', user.id).single()
    setProfile(prof)
    if (!prof?.org_id) { setLoading(false); return }

    const { data } = await supabase
      .from('purchase_orders')
      .select('*, proposals(proposal_name, company)')
      .eq('org_id', prof.org_id)
      .order('created_at', { ascending: false })
    setPOs(data || [])

    const { data: vendorData } = await supabase
      .from('vendors').select('id, vendor_name, contact_email, default_markup_percent')
      .eq('org_id', prof.org_id).eq('active', true).order('vendor_name')
    setVendors(vendorData || [])

    const { data: jobData } = await supabase
      .from('jobs').select('id, name, job_number')
      .eq('org_id', prof.org_id).in('status', ['Active', 'On Hold']).order('created_at', { ascending: false })
    setJobs(jobData || [])

    const { data: ticketData } = await supabase
      .from('service_tickets').select('id, title, clients(company)')
      .eq('org_id', prof.org_id).not('status', 'in', '("Resolved","Cancelled")').order('created_at', { ascending: false })
    setServiceTickets(ticketData || [])

    setLoading(false)
  }

  const fetchLineItemsForPO = async (po) => {
    const { data } = await supabase.from('bom_line_items').select('*').eq('po_number', po.po_number)
    setLineItems(prev => ({ ...prev, [po.id]: data || [] }))
  }

  const toggleExpand = async (po) => {
    if (expandedPO === po.id) { setExpandedPO(null); return }
    setExpandedPO(po.id)
    if (!lineItems[po.id]) await fetchLineItemsForPO(po)
  }

  const updateStatus = async (poId, status) => {
    await supabase.from('purchase_orders').update({ status }).eq('id', poId)
    fetchAll()
  }

  const updateReceivedQty = async (poId, itemId, receivedQty, orderedQty) => {
    setSavingReceiving(prev => ({ ...prev, [itemId]: true }))
    const qty = parseFloat(receivedQty) || 0
    const now = qty > 0 ? new Date().toISOString() : null
    await supabase.from('bom_line_items').update({ received_qty: qty, received_at: now }).eq('id', itemId)
    const po = pos.find(p => p.id === poId)
    const { data: items } = await supabase.from('bom_line_items').select('*').eq('po_number', po?.po_number)
    setLineItems(prev => ({ ...prev, [poId]: items || [] }))
    if (items) {
      const total = items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)
      const received = items.reduce((sum, i) => sum + (parseFloat(i.received_qty) || 0), 0)
      const newStatus = received === 0 ? 'Sent' : received >= total ? 'Received' : 'Partial'
      await supabase.from('purchase_orders').update({ receiving_status: newStatus, status: newStatus }).eq('id', poId)
      fetchAll()
    }
    setSavingReceiving(prev => ({ ...prev, [itemId]: false }))
  }

  const getReceivingProgress = (poId) => {
    const items = lineItems[poId]
    if (!items) return null
    const total = items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)
    const received = items.reduce((sum, i) => sum + (parseFloat(i.received_qty) || 0), 0)
    return { total, received }
  }

  const handleVendorChange = (vendorId) => {
    const v = vendors.find(v => v.id === vendorId)
    setPOForm(p => ({
      ...p,
      vendor_id: vendorId,
      vendor_name: v?.vendor_name || '',
      vendor_email: v?.contact_email || '',
    }))
  }

  const addPOLine = () => {
    setPOLines(prev => [...prev, { id: crypto.randomUUID(), item_name: '', part_number: '', quantity: 1, unit: 'ea', unit_cost: '' }])
  }

  const removePOLine = (id) => {
    setPOLines(prev => prev.filter(l => l.id !== id))
  }

  const updatePOLine = (id, field, value) => {
    setPOLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [15, 28, 46]
  }

  const generateNewPO = async () => {
    const validLines = poLines.filter(l => l.item_name.trim())
    if (validLines.length === 0) { alert('Add at least one line item.'); return }
    setGeneratingPO(true)

    try {
      // Get PO number
      let finalPONumber = poForm.po_number_manual.trim()
      if (poForm.po_number_mode === 'auto' || !finalPONumber) {
        const { data: org } = await supabase.from('organizations').select('po_counter').eq('id', profile.org_id).single()
        finalPONumber = `PO-${org.po_counter}`
        await supabase.from('organizations').update({ po_counter: org.po_counter + 1 }).eq('id', profile.org_id)
      }

      const poTotal = validLines.reduce((sum, l) => sum + ((parseFloat(l.unit_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)

      // Get profile for branding
      const { data: profileData } = await supabase
        .from('profiles')
        .select('company_name, logo_url, primary_color, bill_to_address, bill_to_city, bill_to_state, bill_to_zip, ship_to_address, ship_to_city, ship_to_state, ship_to_zip')
        .eq('id', profile.id).single()

      // Get linked job name if applicable
      const linkedJob = poForm.link_type === 'job' ? jobs.find(j => j.id === poForm.job_id) : null
      const linkedTicket = poForm.link_type === 'ticket' ? serviceTickets.find(t => t.id === poForm.ticket_id) : null
      const projectLabel = linkedJob ? `${linkedJob.job_number ? linkedJob.job_number + ' — ' : ''}${linkedJob.name}` : linkedTicket ? linkedTicket.title : ''

      // Generate PDF
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const primaryRgb = hexToRgb(profileData?.primary_color || '#0F1C2E')
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()

      doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.rect(0, 0, pageWidth, 40, 'F')
      if (profileData?.logo_url) {
        const img = new Image(); img.src = profileData.logo_url
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
      if (projectLabel) doc.text(`Project: ${projectLabel}`, 14, 60)

      const billLines = [profileData?.company_name || '', profileData?.bill_to_address || '', [profileData?.bill_to_city, profileData?.bill_to_state, profileData?.bill_to_zip].filter(Boolean).join(', ')].filter(Boolean)
      const shipLines = [profileData?.company_name || '', profileData?.ship_to_address || '', [profileData?.ship_to_city, profileData?.ship_to_state, profileData?.ship_to_zip].filter(Boolean).join(', ')].filter(Boolean)
      const col2 = pageWidth / 2 - 10, col3 = pageWidth / 2 + 30

      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('VENDOR', 14, 74); doc.text('BILL TO', col2, 74); doc.text('SHIP TO', col3, 74)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.setFontSize(9)
      doc.text(poForm.vendor_name || '—', 14, 81)
      if (poForm.vendor_email) doc.text(poForm.vendor_email, 14, 87)
      billLines.forEach((line, i) => doc.text(line, col2, 81 + i * 6))
      shipLines.forEach((line, i) => doc.text(line, col3, 81 + i * 6))

      const tableStart = 81 + Math.max(billLines.length, shipLines.length) * 6 + 10
      doc.setDrawColor(220, 220, 220)
      doc.line(14, tableStart - 2, pageWidth - 14, tableStart - 2)

      autoTable(doc, {
        startY: tableStart,
        head: [['Item', 'Part #', 'Qty', 'Unit', 'Unit Cost', 'Total']],
        body: validLines.map(l => [
          l.item_name,
          l.part_number || '—',
          l.quantity,
          l.unit || 'ea',
          `$${(parseFloat(l.unit_cost) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          `$${((parseFloat(l.unit_cost) || 0) * (parseFloat(l.quantity) || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
        ]),
        foot: [['', '', '', '', 'Total', `$${poTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 9 }, showFoot: 'lastPage'
      })

      if (poForm.notes) {
        const y = doc.lastAutoTable.finalY + 10
        doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
        doc.text('Notes', 14, y)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(60, 60, 60)
        doc.text(poForm.notes, 14, y + 6)
      }

      const pageHeight = doc.internal.pageSize.getHeight()
      doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal')
      doc.text(`${profileData?.company_name || 'ForgePt.'} · Thank you for your business.`, pageWidth / 2, pageHeight - 10, { align: 'center' })

      // Save PO to DB
      await supabase.from('purchase_orders').insert({
        po_number: finalPONumber,
        org_id: profile.org_id,
        proposal_id: linkedJob?.proposal_id || null,
        vendor_name: poForm.vendor_name || null,
        status: 'Sent',
        total_amount: poTotal,
        notes: poForm.notes || null,
      })

      // Download PDF
      doc.save(`${finalPONumber}.pdf`)

      // Reset and close
      setShowNewPO(false)
      setPOForm({ vendor_id: '', vendor_name: '', vendor_email: '', link_type: 'none', job_id: '', ticket_id: '', po_number_mode: 'auto', po_number_manual: '', notes: '' })
      setPOLines([{ id: crypto.randomUUID(), item_name: '', part_number: '', quantity: 1, unit: 'ea', unit_cost: '' }])
      fetchAll()
    } catch (err) {
      alert('Error generating PO: ' + err.message)
    }
    setGeneratingPO(false)
  }

  const filtered = pos.filter(p => statusFilter === 'All' || p.status === statusFilter)
  const totalSent = pos.reduce((sum, p) => sum + (p.total_amount || 0), 0)
  const totalReceived = pos.filter(p => p.status === 'Received').reduce((sum, p) => sum + (p.total_amount || 0), 0)
  const pendingCount = pos.filter(p => p.status === 'Sent' || p.status === 'Partial').length
  const poTotal = poLines.reduce((sum, l) => sum + ((parseFloat(l.unit_cost) || 0) * (parseFloat(l.quantity) || 0)), 0)
  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"
  const lineInputClass = "bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]"
  const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} featurePurchaseOrders={featurePurchaseOrders} featureInvoices={featureInvoices} role={role} isPM={isPM} isTechnician={isTechnician} />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-2xl font-bold">Purchase Orders</h2>
          <button onClick={() => setShowNewPO(true)}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
            + New PO
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Total PO Value</p>
            <p className="text-white text-2xl font-bold">${totalSent.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Received</p>
            <p className="text-green-400 text-2xl font-bold">${totalReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#1a2d45] rounded-xl p-5">
            <p className="text-[#8A9AB0] text-sm mb-1">Pending</p>
            <p className="text-yellow-400 text-2xl font-bold">{pendingCount}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {['All', 'Sent', 'Partial', 'Received', 'Cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${statusFilter === s ? 'bg-[#C8622A] text-white' : 'bg-[#1a2d45] text-[#8A9AB0] hover:text-white'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* PO List */}
        {loading ? <p className="text-[#8A9AB0]">Loading...</p> : filtered.length === 0 ? (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <p className="text-[#8A9AB0]">No purchase orders yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(po => {
              const isExpanded = expandedPO === po.id
              const progress = getReceivingProgress(po.id)
              return (
                <div key={po.id} className="border border-[#2a3d55] rounded-xl overflow-hidden bg-[#1a2d45]">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#1f3550] transition-colors" onClick={() => toggleExpand(po)}>
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-white font-semibold text-sm">{po.po_number}</p>
                        <p className="text-[#8A9AB0] text-xs">
                          {po.vendor_name || '—'}
                          {po.proposals?.proposal_name && (
                            <span> · <span className="hover:text-[#C8622A] transition-colors cursor-pointer" onClick={e => { e.stopPropagation(); navigate(`/proposal/${po.proposal_id}`) }}>{po.proposals.proposal_name}</span></span>
                          )}
                          {' '}· {new Date(po.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${po.status === 'Received' ? 'bg-green-500/20 text-green-400' : po.status === 'Partial' ? 'bg-yellow-500/20 text-yellow-400' : po.status === 'Cancelled' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {po.status}
                      </span>
                      {progress && <span className="text-[#8A9AB0] text-xs">{progress.received} of {progress.total} received</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-white text-sm font-semibold">${(po.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                      <select value={po.status} onChange={e => { e.stopPropagation(); updateStatus(po.id, e.target.value) }} onClick={e => e.stopPropagation()}
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A]">
                        {['Sent', 'Partial', 'Received', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <span className="text-[#8A9AB0] text-sm">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-[#2a3d55] p-4">
                      {po.notes && <p className="text-[#8A9AB0] text-xs mb-3 italic">{po.notes}</p>}
                      {!lineItems[po.id] ? (
                        <p className="text-[#8A9AB0] text-sm">Loading items...</p>
                      ) : lineItems[po.id].length === 0 ? (
                        <p className="text-[#8A9AB0] text-sm">No BOM line items linked to this PO.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[#2a3d55]">
                              <th className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">Item</th>
                              <th className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">Part #</th>
                              <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal text-xs">Ordered</th>
                              <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal text-xs">Received Qty</th>
                              <th className="text-[#8A9AB0] text-left py-2 font-normal text-xs">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lineItems[po.id].map(item => {
                              const ordered = parseFloat(item.quantity) || 0
                              const received = parseFloat(item.received_qty) || 0
                              const itemStatus = received === 0 ? 'Pending' : received >= ordered ? 'Received' : 'Partial'
                              return (
                                <tr key={item.id} className="border-b border-[#2a3d55]/30">
                                  <td className="text-white py-3 pr-4">{item.item_name}</td>
                                  <td className="text-[#8A9AB0] py-3 pr-4">{item.part_number_sku || '—'}</td>
                                  <td className="text-white py-3 pr-4 text-right">{ordered} {item.unit || 'ea'}</td>
                                  <td className="py-3 pr-4 text-right">
                                    <input type="number" min="0" max={ordered} value={received || ''} onChange={e => updateReceivedQty(po.id, item.id, e.target.value, ordered)} placeholder="0"
                                      className="w-20 bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#C8622A] text-right" />
                                    {savingReceiving[item.id] && <span className="text-[#8A9AB0] text-xs ml-1">✓</span>}
                                  </td>
                                  <td className="py-3">
                                    <span className={`text-xs font-semibold px-2 py-1 rounded ${itemStatus === 'Received' ? 'bg-green-500/20 text-green-400' : itemStatus === 'Partial' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                                      {itemStatus}
                                    </span>
                                    {item.received_at && <span className="text-[#8A9AB0] text-xs ml-2">{new Date(item.received_at).toLocaleDateString()}</span>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New PO Modal */}
      {showNewPO && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-white font-bold text-lg mb-5">New Purchase Order</h3>
            <div className="space-y-5">

              {/* Vendor + PO number */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor <span className="text-[#C8622A]">*</span></label>
                  <select value={poForm.vendor_id} onChange={e => handleVendorChange(e.target.value)} className={inputClass}>
                    <option value="">— Select vendor —</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                    <option value="__custom__">Enter manually</option>
                  </select>
                  {poForm.vendor_id === '__custom__' && (
                    <input type="text" value={poForm.vendor_name} onChange={e => setPOForm(p => ({ ...p, vendor_name: e.target.value }))}
                      placeholder="Vendor name" className={`${inputClass} mt-2`} />
                  )}
                </div>
                <div>
                  <label className="text-[#8A9AB0] text-xs mb-1 block">Vendor Email <span className="text-[#8A9AB0] font-normal">(optional)</span></label>
                  <input type="email" value={poForm.vendor_email} onChange={e => setPOForm(p => ({ ...p, vendor_email: e.target.value }))}
                    placeholder="vendor@company.com" className={inputClass} />
                </div>
              </div>

              {/* PO number */}
              <div>
                <label className="text-[#8A9AB0] text-xs mb-2 block">PO Number</label>
                <div className="flex gap-2 mb-2">
                  <button onClick={() => setPOForm(p => ({ ...p, po_number_mode: 'auto' }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${poForm.po_number_mode === 'auto' ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
                    Auto-Generate
                  </button>
                  <button onClick={() => setPOForm(p => ({ ...p, po_number_mode: 'manual' }))}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${poForm.po_number_mode === 'manual' ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
                    Enter Manually
                  </button>
                </div>
                {poForm.po_number_mode === 'manual' && (
                  <input type="text" value={poForm.po_number_manual} onChange={e => setPOForm(p => ({ ...p, po_number_manual: e.target.value }))}
                    placeholder="e.g. PO-2026-001" className={inputClass} />
                )}
              </div>

              {/* Link to job or ticket */}
              <div>
                <label className="text-[#8A9AB0] text-xs mb-2 block">Link To <span className="text-[#8A9AB0] font-normal">(optional)</span></label>
                <div className="flex gap-2 mb-2">
                  {['none', 'job', 'ticket'].map(t => (
                    <button key={t} onClick={() => setPOForm(p => ({ ...p, link_type: t }))}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${poForm.link_type === t ? 'bg-[#C8622A] text-white' : 'bg-[#0F1C2E] text-[#8A9AB0] hover:text-white'}`}>
                      {t === 'none' ? 'None' : t === 'job' ? '🔨 Job' : '🎫 Service Ticket'}
                    </button>
                  ))}
                </div>
                {poForm.link_type === 'job' && (
                  <select value={poForm.job_id} onChange={e => setPOForm(p => ({ ...p, job_id: e.target.value }))} className={inputClass}>
                    <option value="">— Select job —</option>
                    {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number ? `${j.job_number} — ` : ''}{j.name}</option>)}
                  </select>
                )}
                {poForm.link_type === 'ticket' && (
                  <select value={poForm.ticket_id} onChange={e => setPOForm(p => ({ ...p, ticket_id: e.target.value }))} className={inputClass}>
                    <option value="">— Select ticket —</option>
                    {serviceTickets.map(t => <option key={t.id} value={t.id}>{t.title}{t.clients?.company ? ` — ${t.clients.company}` : ''}</option>)}
                  </select>
                )}
              </div>

              {/* Line items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide">Line Items</label>
                  <button onClick={addPOLine} className="text-[#C8622A] text-xs hover:text-white transition-colors">+ Add Line</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[#2a3d55]">
                        {['Item Name', 'Part #', 'Qty', 'Unit', 'Unit Cost', 'Total', ''].map(h => (
                          <th key={h} className="text-[#8A9AB0] text-left py-1.5 pr-2 font-normal">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {poLines.map(line => {
                        const lineTotal = (parseFloat(line.unit_cost) || 0) * (parseFloat(line.quantity) || 0)
                        return (
                          <tr key={line.id} className="border-b border-[#2a3d55]/30">
                            <td className="pr-2 py-1.5">
                              <input type="text" value={line.item_name} onChange={e => updatePOLine(line.id, 'item_name', e.target.value)}
                                placeholder="Item name" className={`w-40 ${lineInputClass}`} />
                            </td>
                            <td className="pr-2 py-1.5">
                              <input type="text" value={line.part_number} onChange={e => updatePOLine(line.id, 'part_number', e.target.value)}
                                placeholder="Part #" className={`w-24 ${lineInputClass}`} />
                            </td>
                            <td className="pr-2 py-1.5">
                              <input type="number" min="0" value={line.quantity} onChange={e => updatePOLine(line.id, 'quantity', e.target.value)}
                                className={`w-14 ${lineInputClass}`} />
                            </td>
                            <td className="pr-2 py-1.5">
                              <select value={line.unit} onChange={e => updatePOLine(line.id, 'unit', e.target.value)} className={lineInputClass}>
                                {['ea', 'ft', 'lot', 'hr', 'box', 'roll'].map(u => <option key={u}>{u}</option>)}
                              </select>
                            </td>
                            <td className="pr-2 py-1.5">
                              <input type="number" min="0" step="0.01" placeholder="0.00" value={line.unit_cost} onChange={e => updatePOLine(line.id, 'unit_cost', e.target.value)}
                                className={`w-24 ${lineInputClass}`} />
                            </td>
                            <td className="pr-2 py-1.5 text-white font-medium">
                              ${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-1.5">
                              {poLines.length > 1 && (
                                <button onClick={() => removePOLine(line.id)} className="text-[#8A9AB0] hover:text-red-400 transition-colors">✕</button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="5" className="text-[#8A9AB0] text-right pt-3 pr-2 font-semibold">Total</td>
                        <td className="text-[#C8622A] font-bold pt-3">${poTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Notes <span className="text-[#8A9AB0] font-normal">(optional)</span></label>
                <textarea value={poForm.notes} onChange={e => setPOForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  placeholder="Delivery instructions, special requirements..."
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowNewPO(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={generateNewPO} disabled={generatingPO || (!poForm.vendor_name && !poForm.vendor_id) || poLines.filter(l => l.item_name.trim()).length === 0}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {generatingPO ? 'Generating...' : `Generate PO — $${poTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}