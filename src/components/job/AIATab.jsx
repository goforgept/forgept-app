import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabase'

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const EMPTY_LINE = { item_no: '', description: '', scheduled_value: '', work_prev_completed: '', work_this_period: '', stored_materials: '' }

const buildScheduleOfValues = (lineItems, proposal, changeOrders) => {
  const rows = []
  let i = 1

  ;(lineItems || []).forEach(item => {
    rows.push({
      ...EMPTY_LINE,
      item_no: String(i++),
      description: item.item_name || '',
      scheduled_value: String(item.customer_price_total || item.customer_price_unit * item.quantity || ''),
    })
  })

  ;(proposal?.labor_items || []).forEach(l => {
    rows.push({
      ...EMPTY_LINE,
      item_no: String(i++),
      description: l.role ? `Labor — ${l.role}` : 'Labor',
      scheduled_value: String(parseFloat(l.customer_price) || ''),
    })
  })

  ;(changeOrders || []).filter(co => co.status === 'Approved').forEach(co => {
    rows.push({
      ...EMPTY_LINE,
      item_no: String(i++),
      description: `CO — ${co.name}`,
      scheduled_value: String(co.amount || ''),
    })
  })

  return rows.length > 0 ? rows : [{ ...EMPTY_LINE, item_no: '1' }]
}

export default function AIATab({ job, profile, lineItems: jobLineItems = [], proposal, changeOrders = [] }) {
  const navigate = useNavigate()
  const [applications, setApplications] = useState([])
  const [view, setView] = useState('list')
  const [selectedApp, setSelectedApp] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [appForm, setAppForm] = useState({
    application_number: '', period_to: '', architect: '', contract_for: '',
    contract_date: '', original_contract_sum: '', net_change_by_co: '0', retainage_percent: '10',
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exportingPDF, setExportingPDF] = useState(false)

  useEffect(() => { if (job?.id) fetchApplications() }, [job?.id])

  const fetchApplications = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('aia_applications')
      .select('*')
      .eq('job_id', job.id)
      .order('application_number', { ascending: true })
    setApplications(data || [])
    setLoading(false)
  }

  const fetchLineItems = async (appId) => {
    const { data } = await supabase
      .from('aia_line_items')
      .select('*')
      .eq('aia_application_id', appId)
      .order('sort_order', { ascending: true })
    setLineItems(data || [])
  }

  const openApp = async (app) => {
    setSelectedApp(app)
    setAppForm({
      application_number: String(app.application_number || ''),
      period_to: app.period_to || '',
      architect: app.architect || '',
      contract_for: app.contract_for || '',
      contract_date: app.contract_date || '',
      original_contract_sum: String(app.original_contract_sum || ''),
      net_change_by_co: String(app.net_change_by_co || '0'),
      retainage_percent: String(app.retainage_percent || '10'),
    })
    await fetchLineItems(app.id)
    setView('detail')
  }

  const startNew = () => {
    setSelectedApp(null)
    const approvedCOTotal = changeOrders.filter(co => co.status === 'Approved').reduce((s, co) => s + (co.amount || 0), 0)
    setAppForm({
      application_number: String(applications.length + 1),
      period_to: '', architect: '', contract_for: '', contract_date: '',
      original_contract_sum: String(proposal?.proposal_value || ''),
      net_change_by_co: String(approvedCOTotal || '0'),
      retainage_percent: '10',
    })
    setLineItems(buildScheduleOfValues(jobLineItems, proposal, changeOrders))
    setView('detail')
  }

  const reimportSchedule = () => {
    if (!window.confirm('Replace current G703 lines with materials, labor, and change orders from this job?')) return
    setLineItems(buildScheduleOfValues(jobLineItems, proposal, changeOrders))
  }

  const approveApplication = async () => {
    if (currentPaymentDue <= 0) {
      alert('Current Payment Due is $0.00 — nothing to invoice.')
      return
    }
    if (!window.confirm(`Approve Application #${appForm.application_number} and create an invoice for $${fmt(currentPaymentDue)}?`)) return
    setSaving(true)
    try {
      await persistApp()

      const { data: invoiceNumber } = await supabase.rpc('get_next_invoice_number', { org_id_input: profile.org_id })

      const periodLabel = appForm.period_to
        ? ` — Period to ${new Date(appForm.period_to + 'T12:00:00').toLocaleDateString()}`
        : ''
      const description = `AIA Application #${appForm.application_number}${periodLabel}`

      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        org_id: profile.org_id,
        proposal_id: job?.proposal_id || null,
        invoice_number: invoiceNumber,
        status: 'Draft',
        issued_date: new Date().toISOString().split('T')[0],
        subtotal: currentPaymentDue,
        tax_percent: 0,
        tax_amount: 0,
        total: currentPaymentDue,
        amount_paid: 0,
        balance_due: currentPaymentDue,
        description,
        notes: `AIA G702 Application #${appForm.application_number}. Contract Sum to Date: $${fmt(contractSumToDate)}. Total Completed & Stored: $${fmt(totalCompletedStored)}. Retainage (${appForm.retainage_percent}%): $${fmt(totalRetainage)}.`,
      }).select().single()

      if (invErr) throw new Error(invErr.message)

      // Line items: gross this-period work per G703 line + a retainage deduction
      const grossThisPeriod = totalThisPeriod + totalStoredMaterials
      const retainageThisPeriod = grossThisPeriod * (retainagePct / 100)

      const invoiceLines = lineItems
        .filter(l => parseFloat(l.work_this_period) > 0 || parseFloat(l.stored_materials) > 0)
        .map(l => {
          const amt = (parseFloat(l.work_this_period) || 0) + (parseFloat(l.stored_materials) || 0)
          return { invoice_id: inv.id, description: l.description || `Item ${l.item_no}`, quantity: 1, unit_price: amt, total: amt }
        })

      if (retainageThisPeriod > 0) {
        invoiceLines.push({
          invoice_id: inv.id,
          description: `Less Retainage (${appForm.retainage_percent}%)`,
          quantity: 1,
          unit_price: -retainageThisPeriod,
          total: -retainageThisPeriod,
        })
      }

      if (invoiceLines.length > 0) {
        await supabase.from('invoice_line_items').insert(invoiceLines)
      }

      // Mark application approved and link the invoice
      await supabase.from('aia_applications').update({ status: 'Approved', invoice_id: inv.id }).eq('id', selectedApp.id)
      await fetchApplications()

      navigate(`/invoices/${inv.id}`)
    } catch (err) {
      alert('Error creating invoice: ' + err.message)
      setSaving(false)
    }
  }

  const persistApp = async () => {
    const payload = {
      job_id: job.id,
      org_id: profile?.org_id,
      application_number: parseInt(appForm.application_number) || 1,
      period_to: appForm.period_to || null,
      architect: appForm.architect || null,
      contract_for: appForm.contract_for || null,
      contract_date: appForm.contract_date || null,
      original_contract_sum: parseFloat(appForm.original_contract_sum) || 0,
      net_change_by_co: parseFloat(appForm.net_change_by_co) || 0,
      retainage_percent: parseFloat(appForm.retainage_percent) || 10,
      status: selectedApp?.status || 'Draft',
    }

    let appId
    if (selectedApp) {
      const { error: updateErr } = await supabase.from('aia_applications').update(payload).eq('id', selectedApp.id)
      if (updateErr) { alert('Save error: ' + updateErr.message); return null }
      appId = selectedApp.id
      await supabase.from('aia_line_items').delete().eq('aia_application_id', appId)
    } else {
      const { data: newApp, error: insertErr } = await supabase.from('aia_applications').insert(payload).select().single()
      if (insertErr) { alert('Save error: ' + insertErr.message); return null }
      appId = newApp?.id
      setSelectedApp(newApp)
    }

    const validLines = lineItems.filter(l => l.description || parseFloat(l.scheduled_value))
    if (appId && validLines.length > 0) {
      const { error: lineErr } = await supabase.from('aia_line_items').insert(
        validLines.map((l, i) => ({
          aia_application_id: appId,
          sort_order: i,
          item_no: l.item_no || String(i + 1),
          description: l.description || '',
          scheduled_value: parseFloat(l.scheduled_value) || 0,
          work_prev_completed: parseFloat(l.work_prev_completed) || 0,
          work_this_period: parseFloat(l.work_this_period) || 0,
          stored_materials: parseFloat(l.stored_materials) || 0,
        }))
      )
      if (lineErr) { alert('Line item save error: ' + lineErr.message); return null }
    }

    await fetchApplications()
    return appId
  }

  const saveApp = async () => {
    setSaving(true)
    await persistApp()
    setSaving(false)
  }

  const deleteApp = async (appId) => {
    if (!window.confirm('Delete this application and all its line items?')) return
    await supabase.from('aia_line_items').delete().eq('aia_application_id', appId)
    await supabase.from('aia_applications').delete().eq('id', appId)
    await fetchApplications()
    setView('list')
    setSelectedApp(null)
  }

  const addLineItem = () => {
    setLineItems(prev => [...prev, { ...EMPTY_LINE, item_no: String(prev.length + 1) }])
  }

  const updateLine = (index, field, value) => {
    setLineItems(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const removeLine = (index) => {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  // G702 computed financials
  const retainagePct = parseFloat(appForm.retainage_percent) || 10
  const originalContractSum = parseFloat(appForm.original_contract_sum) || 0
  const netChangeByCO = parseFloat(appForm.net_change_by_co) || 0
  const contractSumToDate = originalContractSum + netChangeByCO
  const totalPrevCompleted = lineItems.reduce((s, l) => s + (parseFloat(l.work_prev_completed) || 0), 0)
  const totalThisPeriod = lineItems.reduce((s, l) => s + (parseFloat(l.work_this_period) || 0), 0)
  const totalStoredMaterials = lineItems.reduce((s, l) => s + (parseFloat(l.stored_materials) || 0), 0)
  const totalScheduledValue = lineItems.reduce((s, l) => s + (parseFloat(l.scheduled_value) || 0), 0)
  const totalCompletedStored = totalPrevCompleted + totalThisPeriod + totalStoredMaterials
  const totalRetainage = totalCompletedStored * (retainagePct / 100)
  const totalEarnedLessRetainage = totalCompletedStored - totalRetainage
  const previousCertificates = totalPrevCompleted * (1 - retainagePct / 100)
  const currentPaymentDue = totalEarnedLessRetainage - previousCertificates
  const balanceToFinish = contractSumToDate - totalEarnedLessRetainage

  const exportPDF = async () => {
    setExportingPDF(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const { data: profileData } = await supabase.from('profiles').select('company_name, logo_url, primary_color').eq('id', profile.id).single()
      const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [15, 28, 46]
      }
      const primaryRgb = hexToRgb(profileData?.primary_color || '#0F1C2E')

      const doc = new jsPDF({ orientation: 'landscape' })
      const pageWidth = doc.internal.pageSize.getWidth()

      // Header band
      doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.rect(0, 0, pageWidth, 34, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(15); doc.setFont('helvetica', 'bold')
      doc.text('AIA G702 — Application and Certificate for Payment', 14, 14)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      doc.text(`Application No. ${appForm.application_number}   ·   Period To: ${appForm.period_to || '—'}`, 14, 24)
      doc.text(profileData?.company_name || '', pageWidth - 14, 14, { align: 'right' })
      doc.text(new Date().toLocaleDateString(), pageWidth - 14, 24, { align: 'right' })

      // G702 two-column info
      let y = 42
      const col2 = pageWidth / 2 + 10
      const leftInfo = [
        ['Project / Job', job?.name || '—'],
        ['Client / Owner', job?.clients?.company || '—'],
        ['Architect', appForm.architect || '—'],
        ['Contract For', appForm.contract_for || '—'],
        ['Contract Date', appForm.contract_date || '—'],
      ]
      const rightInfo = [
        ['Original Contract Sum', `$${fmt(originalContractSum)}`],
        ['Net Change by Change Orders', `$${fmt(netChangeByCO)}`],
        ['Contract Sum to Date', `$${fmt(contractSumToDate)}`],
        ['Total Completed & Stored to Date', `$${fmt(totalCompletedStored)}`],
        [`Retainage (${appForm.retainage_percent}%)`, `- $${fmt(totalRetainage)}`],
        ['Total Earned Less Retainage', `$${fmt(totalEarnedLessRetainage)}`],
        ['Less Previous Certificates for Payment', `- $${fmt(previousCertificates)}`],
        ['Current Payment Due', `$${fmt(currentPaymentDue)}`],
        ['Balance to Finish, Including Retainage', `$${fmt(balanceToFinish)}`],
      ]
      doc.setFontSize(8)
      leftInfo.forEach(([label, val], i) => {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120)
        doc.text(label.toUpperCase(), 14, y + i * 9)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20)
        doc.text(val, 14, y + i * 9 + 5)
      })
      rightInfo.forEach(([label, val], i) => {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(120, 120, 120)
        doc.text(label.toUpperCase(), col2, y + i * 9)
        doc.setFont('helvetica', 'normal'); doc.setTextColor(20, 20, 20)
        doc.text(val, col2, y + i * 9 + 5)
      })
      y += Math.max(leftInfo.length, rightInfo.length) * 9 + 10

      // Divider
      doc.setDrawColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.setLineWidth(0.5)
      doc.line(14, y, pageWidth - 14, y)
      y += 6

      // G703 section
      doc.setFontSize(12); doc.setFont('helvetica', 'bold')
      doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('G703 — Continuation Sheet', 14, y)
      y += 4

      const validLines = lineItems.filter(l => l.description || parseFloat(l.scheduled_value))
      autoTable(doc, {
        startY: y,
        head: [['#', 'Description of Work', 'Scheduled\nValue', 'Work Completed\nPrev Applications', 'Work Completed\nThis Period', 'Materials\nPresently Stored', 'Total Completed\n& Stored (G)', '% (G/C)', 'Balance\nto Finish']],
        body: validLines.map((l, i) => {
          const prev = parseFloat(l.work_prev_completed) || 0
          const curr = parseFloat(l.work_this_period) || 0
          const stored = parseFloat(l.stored_materials) || 0
          const sched = parseFloat(l.scheduled_value) || 0
          const total = prev + curr + stored
          const pct = sched > 0 ? ((total / sched) * 100).toFixed(1) + '%' : '—'
          const bal = sched - total
          return [l.item_no || String(i + 1), l.description || '', `$${fmt(sched)}`, `$${fmt(prev)}`, `$${fmt(curr)}`, `$${fmt(stored)}`, `$${fmt(total)}`, pct, `$${fmt(bal)}`]
        }),
        foot: [['', 'G', `$${fmt(totalScheduledValue)}`, `$${fmt(totalPrevCompleted)}`, `$${fmt(totalThisPeriod)}`, `$${fmt(totalStoredMaterials)}`, `$${fmt(totalCompletedStored)}`, totalScheduledValue > 0 ? ((totalCompletedStored / totalScheduledValue) * 100).toFixed(1) + '%' : '—', `$${fmt(contractSumToDate - totalCompletedStored)}`]],
        headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontSize: 7, halign: 'center' },
        footStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 60 },
          2: { cellWidth: 24, halign: 'right' },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 24, halign: 'right' },
          5: { cellWidth: 24, halign: 'right' },
          6: { cellWidth: 28, halign: 'right' },
          7: { cellWidth: 14, halign: 'center' },
          8: { cellWidth: 24, halign: 'right' },
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        styles: { fontSize: 8 },
        showFoot: 'lastPage',
      })

      const pageHeight = doc.internal.pageSize.getHeight()
      doc.setFontSize(7); doc.setTextColor(160, 160, 160); doc.setFont('helvetica', 'normal')
      doc.text(`${profileData?.company_name || 'ForgePt.'} · AIA Application No. ${appForm.application_number} · Confidential`, pageWidth / 2, pageHeight - 8, { align: 'center' })
      doc.save(`AIA-App-${appForm.application_number}-${(job?.name || 'Job').replace(/[^a-z0-9]/gi, '-')}.pdf`)
    } catch (err) { alert('Error exporting PDF: ' + err.message) }
    setExportingPDF(false)
  }

  const inputClass = 'bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] w-full'
  const labelClass = 'block text-[#8A9AB0] text-xs font-semibold uppercase tracking-wide mb-1'

  // LIST VIEW
  if (view === 'list') {
    return (
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-white font-bold text-lg">AIA Pay Applications</h3>
            <p className="text-[#8A9AB0] text-xs mt-0.5">G702 Application & Certificate for Payment · G703 Continuation Sheet</p>
          </div>
          <button onClick={startNew} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
            + New Application
          </button>
        </div>

        {loading ? (
          <p className="text-[#8A9AB0] text-sm text-center py-8">Loading...</p>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-[#2a3d55] rounded-xl">
            <p className="text-[#8A9AB0] text-sm mb-1">No AIA applications yet.</p>
            <p className="text-[#8A9AB0] text-xs">Create your first application to generate G702/G703 payment forms.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map(app => (
              <div key={app.id} onClick={() => openApp(app)}
                className="bg-[#0F1C2E] rounded-xl p-4 border border-[#2a3d55] hover:border-[#C8622A]/50 cursor-pointer transition-colors group">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-white font-semibold">Application #{app.application_number}</p>
                    <p className="text-[#8A9AB0] text-xs mt-0.5">
                      {app.period_to ? `Period to: ${new Date(app.period_to + 'T12:00:00').toLocaleDateString()}` : 'No period date set'}
                      {app.architect ? ` · Architect: ${app.architect}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-[#8A9AB0] text-xs">Contract Sum</p>
                      <p className="text-white font-semibold text-sm">${fmt((app.original_contract_sum || 0) + (app.net_change_by_co || 0))}</p>
                    </div>
                    <div>
                      <p className="text-[#8A9AB0] text-xs">Retainage</p>
                      <p className="text-[#C8622A] font-semibold text-sm">{app.retainage_percent || 10}%</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-semibold ${
                      app.status === 'Approved' ? 'bg-green-500/20 text-green-400' :
                      app.status === 'Submitted' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-[#2a3d55] text-[#8A9AB0]'
                    }`}>{app.status || 'Draft'}</span>
                    <span className="text-[#8A9AB0] group-hover:text-white text-xs transition-colors">Open →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // DETAIL / EDIT VIEW
  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="bg-[#1a2d45] rounded-xl p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => { setView('list'); setSelectedApp(null) }}
            className="text-[#8A9AB0] hover:text-white text-xs transition-colors">
            ← Applications
          </button>
          <span className="text-[#2a3d55]">|</span>
          <span className="text-white font-semibold text-sm">
            {selectedApp ? `Application #${appForm.application_number}` : 'New Application'}
          </span>
          {selectedApp && (
            <span className={`text-xs px-2 py-1 rounded font-semibold ${
              selectedApp.status === 'Approved' ? 'bg-green-500/20 text-green-400' :
              selectedApp.status === 'Submitted' ? 'bg-blue-500/20 text-blue-400' :
              'bg-[#2a3d55] text-[#8A9AB0]'
            }`}>{selectedApp.status || 'Draft'}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedApp && selectedApp.status === 'Approved' && selectedApp.invoice_id && (
            <button onClick={() => navigate(`/invoices/${selectedApp.invoice_id}`)}
              className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-500/30 transition-colors">
              View Invoice →
            </button>
          )}
          {selectedApp && selectedApp.status !== 'Approved' && (
            <button onClick={approveApplication} disabled={saving}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">
              {saving ? 'Processing...' : `✓ Approve & Invoice ($${fmt(currentPaymentDue)})`}
            </button>
          )}
          {selectedApp && (
            <button onClick={() => deleteApp(selectedApp.id)}
              className="text-red-400 hover:text-red-300 text-xs px-3 py-2 transition-colors">
              Delete
            </button>
          )}
          <button onClick={exportPDF} disabled={exportingPDF}
            className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#3a4d65] transition-colors disabled:opacity-50">
            {exportingPDF ? 'Exporting...' : '↓ Export PDF'}
          </button>
          <button onClick={saveApp} disabled={saving || selectedApp?.status === 'Approved'}
            className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* G702 — Application fields */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <h4 className="text-white font-bold mb-4">G702 — Application Details</h4>
        <div className="grid grid-cols-2 gap-6">
          {/* Left: project info */}
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Application No.</label>
              <input type="number" value={appForm.application_number}
                onChange={e => setAppForm(f => ({ ...f, application_number: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Period To</label>
              <input type="date" value={appForm.period_to}
                onChange={e => setAppForm(f => ({ ...f, period_to: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Architect</label>
              <input type="text" placeholder="Architect / Engineer name" value={appForm.architect}
                onChange={e => setAppForm(f => ({ ...f, architect: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Contract For</label>
              <input type="text" placeholder="e.g. General Construction, Electrical…" value={appForm.contract_for}
                onChange={e => setAppForm(f => ({ ...f, contract_for: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Contract Date</label>
              <input type="date" value={appForm.contract_date}
                onChange={e => setAppForm(f => ({ ...f, contract_date: e.target.value }))}
                className={inputClass} />
            </div>
          </div>

          {/* Right: financials + computed summary */}
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Original Contract Sum ($)</label>
              <input type="number" step="0.01" placeholder="0.00" value={appForm.original_contract_sum}
                onChange={e => setAppForm(f => ({ ...f, original_contract_sum: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Net Change by Change Orders ($)</label>
              <input type="number" step="0.01" placeholder="0.00" value={appForm.net_change_by_co}
                onChange={e => setAppForm(f => ({ ...f, net_change_by_co: e.target.value }))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Retainage (%)</label>
              <input type="number" step="0.1" placeholder="10" value={appForm.retainage_percent}
                onChange={e => setAppForm(f => ({ ...f, retainage_percent: e.target.value }))}
                className={inputClass} />
            </div>

            {/* Live computed G702 summary */}
            <div className="bg-[#0F1C2E] rounded-xl p-4 space-y-2">
              {[
                ['Contract Sum to Date', `$${fmt(contractSumToDate)}`],
                ['Total Completed & Stored', `$${fmt(totalCompletedStored)}`],
                [`Retainage (${appForm.retainage_percent}%)`, `- $${fmt(totalRetainage)}`],
                ['Total Earned Less Retainage', `$${fmt(totalEarnedLessRetainage)}`],
                ['Less Previous Certificates', `- $${fmt(previousCertificates)}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-[#8A9AB0]">{label}</span>
                  <span className="text-white font-mono">{value}</span>
                </div>
              ))}
              <div className="border-t border-[#2a3d55] pt-2 flex justify-between items-baseline">
                <span className="text-white font-bold text-sm">Current Payment Due</span>
                <span className="text-[#C8622A] font-bold text-xl font-mono">${fmt(currentPaymentDue)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#8A9AB0]">Balance to Finish (incl. Retainage)</span>
                <span className="text-white font-mono">${fmt(balanceToFinish)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* G703 — Continuation sheet / line items */}
      <div className="bg-[#1a2d45] rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-white font-bold">G703 — Continuation Sheet</h4>
          <div className="flex gap-2">
            {(jobLineItems.length > 0 || (proposal?.labor_items || []).length > 0) && (
              <button onClick={reimportSchedule}
                className="bg-[#0F1C2E] text-[#8A9AB0] px-3 py-1.5 rounded-lg text-xs hover:text-white transition-colors border border-[#2a3d55]">
                ↺ Reimport from Job
              </button>
            )}
            <button onClick={addLineItem}
              className="bg-[#2a3d55] text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-[#3a4d65] transition-colors">
              + Add Line
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2a3d55]">
                {['#', 'Description of Work', 'Scheduled Value', 'Prev Completed', 'This Period', 'Stored Materials', 'Total Completed', '% Complete', 'Balance to Finish', ''].map(h => (
                  <th key={h} className="text-[#8A9AB0] text-left py-2 pr-2 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line, i) => {
                const prev = parseFloat(line.work_prev_completed) || 0
                const curr = parseFloat(line.work_this_period) || 0
                const stored = parseFloat(line.stored_materials) || 0
                const sched = parseFloat(line.scheduled_value) || 0
                const total = prev + curr + stored
                const pct = sched > 0 ? ((total / sched) * 100).toFixed(1) : '—'
                const bal = sched - total
                return (
                  <tr key={i} className="border-b border-[#2a3d55]/40 hover:bg-[#0F1C2E]/30">
                    <td className="py-1.5 pr-2">
                      <input value={line.item_no} onChange={e => updateLine(i, 'item_no', e.target.value)}
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 w-10 text-center focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input value={line.description} onChange={e => updateLine(i, 'description', e.target.value)}
                        placeholder="Description of work…"
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 w-full min-w-[200px] focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" step="0.01" value={line.scheduled_value} onChange={e => updateLine(i, 'scheduled_value', e.target.value)}
                        placeholder="0.00"
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 w-28 text-right focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" step="0.01" value={line.work_prev_completed} onChange={e => updateLine(i, 'work_prev_completed', e.target.value)}
                        placeholder="0.00"
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 w-28 text-right focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" step="0.01" value={line.work_this_period} onChange={e => updateLine(i, 'work_this_period', e.target.value)}
                        placeholder="0.00"
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 w-28 text-right focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" step="0.01" value={line.stored_materials} onChange={e => updateLine(i, 'stored_materials', e.target.value)}
                        placeholder="0.00"
                        className="bg-[#0F1C2E] text-white border border-[#2a3d55] rounded px-2 py-1 w-24 text-right focus:outline-none focus:border-[#C8622A]" />
                    </td>
                    <td className="py-1.5 pr-2 text-white text-right font-semibold px-3 whitespace-nowrap">${fmt(total)}</td>
                    <td className={`py-1.5 pr-2 text-right font-semibold px-3 ${pct !== '—' && parseFloat(pct) >= 100 ? 'text-green-400' : 'text-white'}`}>
                      {pct}{pct !== '—' ? '%' : ''}
                    </td>
                    <td className="py-1.5 pr-2 text-[#8A9AB0] text-right px-3 whitespace-nowrap">${fmt(bal)}</td>
                    <td className="py-1.5">
                      <button onClick={() => removeLine(i)} className="text-[#2a3d55] hover:text-red-400 transition-colors text-lg leading-none">×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#2a3d55]">
                <td colSpan="2" className="text-[#8A9AB0] pt-3 pb-1 font-bold text-xs uppercase tracking-wide">Totals</td>
                <td className="text-white pt-3 pb-1 text-right font-bold pr-2 whitespace-nowrap">${fmt(totalScheduledValue)}</td>
                <td className="text-white pt-3 pb-1 text-right font-bold pr-2 whitespace-nowrap">${fmt(totalPrevCompleted)}</td>
                <td className="text-white pt-3 pb-1 text-right font-bold pr-2 whitespace-nowrap">${fmt(totalThisPeriod)}</td>
                <td className="text-white pt-3 pb-1 text-right font-bold pr-2 whitespace-nowrap">${fmt(totalStoredMaterials)}</td>
                <td className="text-[#C8622A] pt-3 pb-1 text-right font-bold px-3 whitespace-nowrap">${fmt(totalCompletedStored)}</td>
                <td className="text-white pt-3 pb-1 text-right font-bold px-3">
                  {totalScheduledValue > 0 ? ((totalCompletedStored / totalScheduledValue) * 100).toFixed(1) + '%' : '—'}
                </td>
                <td className="text-[#8A9AB0] pt-3 pb-1 text-right px-3 whitespace-nowrap">${fmt(contractSumToDate - totalCompletedStored)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {lineItems.length === 0 && (
          <div className="text-center py-8 border-t border-[#2a3d55] mt-4">
            <p className="text-[#8A9AB0] text-xs">No line items yet. Click "+ Add Line" to begin the G703 continuation sheet.</p>
          </div>
        )}
      </div>
    </div>
  )
}
