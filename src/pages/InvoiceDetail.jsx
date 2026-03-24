import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import Sidebar from '../components/Sidebar'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE'

export default function InvoiceDetail({ isAdmin, featureProposals = true, featureCRM = false }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [payments, setPayments] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: new Date().toISOString().split('T')[0], method: 'Check', notes: '' })
  const [sendForm, setSendForm] = useState({ subject: '', message: '' })
  const [savingPayment, setSavingPayment] = useState(false)
  const [sendingInvoice, setSendingInvoice] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')

  useEffect(() => {
    fetchAll()
  }, [id])

  const fetchAll = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prof } = await supabase
      .from('profiles')
      .select('*, organizations(org_type)')
      .eq('id', user.id)
      .single()
    setProfile(prof)

    const { data: inv } = await supabase
      .from('invoices')
      .select('*, proposals(proposal_name, company, client_name, client_email, rep_name, rep_email)')
      .eq('id', id)
      .single()
    setInvoice(inv)
    setNotesValue(inv?.notes || '')

    const { data: items } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', id)
      .order('id')
    setLineItems(items || [])

    const { data: pays } = await supabase
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false })
    setPayments(pays || [])

    setLoading(false)
  }

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [15, 28, 46]
  }

  const generateInvoicePDF = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const primaryRgb = hexToRgb(profile?.primary_color || '#0F1C2E')
    const companyName = profile?.company_name || 'ForgePt.'

    // Header
    doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.rect(0, 0, pageWidth, 40, 'F')
    if (profile?.logo_url) {
      const img = new Image(); img.src = profile.logo_url
      doc.addImage(img, 'PNG', 14, 8, 40, 24)
    } else {
      doc.setTextColor(255, 255, 255); doc.setFontSize(24); doc.setFont('helvetica', 'bold')
      doc.text(companyName, 14, 20)
    }
    doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
    doc.text('INVOICE', pageWidth - 14, 18, { align: 'right' })
    doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(invoice?.invoice_number || '', pageWidth - 14, 28, { align: 'right' })

    // Invoice info
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
    doc.text(`Date: ${invoice?.issued_date ? new Date(invoice.issued_date).toLocaleDateString() : new Date().toLocaleDateString()}`, 14, 52)
    if (invoice?.due_date) doc.text(`Due Date: ${new Date(invoice.due_date).toLocaleDateString()}`, 14, 60)

    // Bill To
    doc.setFontSize(9); doc.setFont('helvetica', 'bold')
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('BILL TO', pageWidth / 2, 52)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40)
    doc.text(invoice?.proposals?.company || '', pageWidth / 2, 59)
    doc.text(invoice?.proposals?.client_name || '', pageWidth / 2, 65)

    // Line items table
    autoTable(doc, {
      startY: 78,
      head: [['Description', 'Qty', 'Unit Price', 'Total']],
      body: lineItems.map(item => [
        item.description,
        item.quantity,
        `$${(item.unit_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        `$${(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      ]),
      headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { fontSize: 9 }
    })

    let yPos = doc.lastAutoTable.finalY + 8

    // Subtotal / tax / total
    const col = pageWidth - 14
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
    doc.text('Subtotal:', col - 60, yPos, { align: 'right' })
    doc.text(`$${(invoice?.subtotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, col, yPos, { align: 'right' })
    yPos += 7

    if (invoice?.tax_percent > 0) {
      doc.text(`Tax (${invoice.tax_percent}%):`, col - 60, yPos, { align: 'right' })
      doc.text(`$${(invoice?.tax_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, col, yPos, { align: 'right' })
      yPos += 7
    }

    doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
    doc.text('Total Due:', col - 60, yPos, { align: 'right' })
    doc.text(`$${(invoice?.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, col, yPos, { align: 'right' })
    yPos += 7

    if (invoice?.amount_paid > 0) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 80, 80)
      doc.text('Amount Paid:', col - 60, yPos, { align: 'right' })
      doc.text(`$${(invoice.amount_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, col, yPos, { align: 'right' })
      yPos += 7
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.setTextColor(200, 98, 42)
      doc.text('Balance Due:', col - 60, yPos, { align: 'right' })
      doc.text(`$${(invoice.balance_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, col, yPos, { align: 'right' })
      yPos += 7
    }

    // Notes
    if (invoice?.notes) {
      yPos += 10
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Notes', 14, yPos)
      yPos += 6
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
      const noteLines = doc.splitTextToSize(invoice.notes, pageWidth - 28)
      doc.text(noteLines, 14, yPos)
      yPos += noteLines.length * 5 + 8
    }

    // Payment Instructions
    const hasPaymentInstructions = profile?.payment_instructions_payable_to ||
      profile?.payment_instructions_bank || profile?.payment_instructions_zelle ||
      profile?.payment_instructions_notes

    if (hasPaymentInstructions) {
      yPos += 6
      doc.setDrawColor(200, 200, 200); doc.line(14, yPos, pageWidth - 14, yPos)
      yPos += 8
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2])
      doc.text('Payment Instructions', 14, yPos)
      yPos += 7
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
      if (profile.payment_instructions_payable_to) { doc.text(`Make checks payable to: ${profile.payment_instructions_payable_to}`, 14, yPos); yPos += 6 }
      if (profile.payment_instructions_bank) { doc.text(`Bank: ${profile.payment_instructions_bank}`, 14, yPos); yPos += 6 }
      if (profile.payment_instructions_routing) { doc.text(`Routing #: ${profile.payment_instructions_routing}`, 14, yPos); yPos += 6 }
      if (profile.payment_instructions_account) { doc.text(`Account #: ${profile.payment_instructions_account}`, 14, yPos); yPos += 6 }
      if (profile.payment_instructions_zelle) { doc.text(`Zelle / Venmo: ${profile.payment_instructions_zelle}`, 14, yPos); yPos += 6 }
      if (profile.payment_instructions_notes) {
        const notes = doc.splitTextToSize(profile.payment_instructions_notes, pageWidth - 28)
        doc.text(notes, 14, yPos)
      }
    }

    // Footer
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setFontSize(8); doc.setTextColor(150, 150, 150); doc.setFont('helvetica', 'normal')
    doc.text(`${companyName} · Thank you for your business.`, pageWidth / 2, pageHeight - 10, { align: 'center' })

    return doc
  }

  const downloadPDF = () => {
    const doc = generateInvoicePDF()
    doc.save(`${invoice?.invoice_number || 'Invoice'}.pdf`)
  }

  const updateStatus = async (status) => {
    await supabase.from('invoices').update({ status }).eq('id', id)
    setInvoice(prev => ({ ...prev, status }))
  }

  const recordPayment = async () => {
    if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) return
    setSavingPayment(true)

    await supabase.from('invoice_payments').insert({
      invoice_id: id,
      amount: parseFloat(paymentForm.amount),
      payment_date: paymentForm.payment_date,
      method: paymentForm.method,
      notes: paymentForm.notes
    })

    // Recalculate balance
    const { data: allPayments } = await supabase.from('invoice_payments').select('amount').eq('invoice_id', id)
    const totalPaid = (allPayments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
    const balance = Math.max(0, (invoice?.total || 0) - totalPaid)
    const newStatus = balance <= 0 ? 'Paid' : totalPaid > 0 ? 'Partially Paid' : invoice?.status

    await supabase.from('invoices').update({
      amount_paid: totalPaid,
      balance_due: balance,
      status: newStatus
    }).eq('id', id)

    setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], method: 'Check', notes: '' })
    setShowPaymentModal(false)
    setSavingPayment(false)
    fetchAll()
  }

  const sendInvoice = async () => {
    if (!invoice?.proposals?.client_email) { alert('No client email on linked proposal.'); return }
    setSendingInvoice(true)
    try {
      const doc = generateInvoicePDF()
      const pdfBase64 = doc.output('datauristring').split(',')[1]

      await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/send-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({
          proposalId: invoice.proposal_id,
          clientEmail: invoice.proposals.client_email,
          clientName: invoice.proposals.client_name || 'there',
          repName: invoice.proposals.rep_name || profile?.full_name || '',
          repEmail: invoice.proposals.rep_email || profile?.email || '',
          companyName: profile?.company_name || '',
          proposalName: invoice.invoice_number,
          subject: sendForm.subject,
          message: sendForm.message,
          logoUrl: profile?.logo_url || null,
          pdfBase64
        })
      })

      await supabase.from('invoices').update({ status: 'Sent' }).eq('id', id)
      setInvoice(prev => ({ ...prev, status: 'Sent' }))
      setShowSendModal(false)
    } catch (err) {
      alert('Error sending invoice: ' + err.message)
    }
    setSendingInvoice(false)
  }

  const saveNotes = async () => {
    await supabase.from('invoices').update({ notes: notesValue }).eq('id', id)
    setInvoice(prev => ({ ...prev, notes: notesValue }))
    setEditingNotes(false)
  }

  const inputClass = "w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]"

  if (loading) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Loading...</p></div>
  if (!invoice) return <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center"><p className="text-white">Invoice not found.</p></div>

  const STATUS_COLORS = {
    'Draft': 'bg-[#2a3d55] text-[#8A9AB0]',
    'Sent': 'bg-blue-500/20 text-blue-400',
    'Partially Paid': 'bg-yellow-500/20 text-yellow-400',
    'Paid': 'bg-green-500/20 text-green-400',
    'Overdue': 'bg-red-500/20 text-red-400',
  }

  return (
    <div className="flex min-h-screen bg-[#0F1C2E]">
      <Sidebar isAdmin={isAdmin} featureProposals={featureProposals} featureCRM={featureCRM} />

      <div className="flex-1 p-6 space-y-6 max-w-4xl">
        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-white text-2xl font-bold">{invoice.invoice_number}</h2>
                <span className={`text-xs font-semibold px-2 py-1 rounded ${STATUS_COLORS[invoice.status] || 'bg-[#2a3d55] text-[#8A9AB0]'}`}>
                  {invoice.status}
                </span>
              </div>
              <p className="text-[#8A9AB0]">{invoice.proposals?.company} · {invoice.proposals?.client_name}</p>
              <p className="text-[#8A9AB0] text-xs mt-0.5">{invoice.proposals?.proposal_name}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => {
                setSendForm({ subject: `Invoice ${invoice.invoice_number}`, message: `Hi ${invoice.proposals?.client_name || 'there'},\n\nPlease find your invoice attached. Payment instructions are included on the invoice.\n\nThank you for your business.\n\n${invoice.proposals?.rep_name || profile?.full_name || ''}` })
                setShowSendModal(true)
              }} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
                ✉ Send Invoice
              </button>
              <button onClick={downloadPDF} className="bg-[#2a3d55] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3a4d65] transition-colors">
                ↓ Download PDF
              </button>
              <button onClick={() => setShowPaymentModal(true)} className="bg-[#C8622A] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors">
                + Record Payment
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-6">
            <div><p className="text-[#8A9AB0] text-xs">Invoice Date</p><p className="text-white text-sm font-medium">{invoice.issued_date ? new Date(invoice.issued_date).toLocaleDateString() : '—'}</p></div>
            <div><p className="text-[#8A9AB0] text-xs">Due Date</p><p className="text-white text-sm font-medium">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}</p></div>
            <div><p className="text-[#8A9AB0] text-xs">Total</p><p className="text-white text-sm font-bold">${(invoice.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
            <div><p className="text-[#8A9AB0] text-xs">Balance Due</p><p className={`text-sm font-bold ${invoice.balance_due > 0 ? 'text-[#C8622A]' : 'text-green-400'}`}>${(invoice.balance_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p></div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-4">Line Items</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a3d55]">
                <th className="text-[#8A9AB0] text-left py-2 pr-4 font-normal">Description</th>
                <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal">Qty</th>
                <th className="text-[#8A9AB0] text-right py-2 pr-4 font-normal">Unit Price</th>
                <th className="text-[#8A9AB0] text-right py-2 font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map(item => (
                <tr key={item.id} className="border-b border-[#2a3d55]/50">
                  <td className="text-white py-3 pr-4">{item.description}</td>
                  <td className="text-[#8A9AB0] py-3 pr-4 text-right">{item.quantity}</td>
                  <td className="text-[#8A9AB0] py-3 pr-4 text-right">${(item.unit_price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td className="text-white py-3 text-right">${(item.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan="3" className="text-[#8A9AB0] pt-3 text-right font-semibold pr-4">Subtotal</td><td className="text-white pt-3 text-right">${(invoice.subtotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
              {invoice.tax_percent > 0 && <tr><td colSpan="3" className="text-[#8A9AB0] pt-1 text-right font-semibold pr-4">Tax ({invoice.tax_percent}%)</td><td className="text-white pt-1 text-right">${(invoice.tax_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>}
              <tr className="border-t border-[#2a3d55]"><td colSpan="3" className="text-white pt-3 text-right font-bold pr-4">Total</td><td className="text-white pt-3 text-right font-bold">${(invoice.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
              {invoice.amount_paid > 0 && <>
                <tr><td colSpan="3" className="text-[#8A9AB0] pt-1 text-right pr-4">Amount Paid</td><td className="text-green-400 pt-1 text-right">${(invoice.amount_paid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
                <tr><td colSpan="3" className="text-[#C8622A] pt-1 text-right font-bold pr-4">Balance Due</td><td className="text-[#C8622A] pt-1 text-right font-bold">${(invoice.balance_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
              </>}
            </tfoot>
          </table>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Payment History</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a3d55]">
                  {['Date', 'Amount', 'Method', 'Notes'].map(h => (
                    <th key={h} className="text-[#8A9AB0] text-left py-2 pr-4 font-normal text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b border-[#2a3d55]/30">
                    <td className="text-white py-3 pr-4">{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td className="text-green-400 py-3 pr-4 font-semibold">${(p.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td className="text-[#8A9AB0] py-3 pr-4">{p.method}</td>
                    <td className="text-[#8A9AB0] py-3">{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Notes */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-white font-bold">Notes</h3>
            {!editingNotes
              ? <button onClick={() => setEditingNotes(true)} className="text-[#C8622A] text-sm hover:text-white transition-colors">Edit</button>
              : <div className="flex gap-2">
                  <button onClick={() => setEditingNotes(false)} className="text-[#8A9AB0] text-sm hover:text-white transition-colors">Cancel</button>
                  <button onClick={saveNotes} className="text-[#C8622A] text-sm font-semibold hover:text-white transition-colors">Save</button>
                </div>
            }
          </div>
          {editingNotes
            ? <textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} rows={4}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
            : <p className="text-[#8A9AB0] text-sm whitespace-pre-wrap">{invoice.notes || 'No notes.'}</p>
          }
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-white font-bold text-lg mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Amount</label>
                <input type="number" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00" className={inputClass} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Payment Date</label>
                <input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(p => ({ ...p, payment_date: e.target.value }))}
                  className={inputClass} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Method</label>
                <select value={paymentForm.method} onChange={e => setPaymentForm(p => ({ ...p, method: e.target.value }))}
                  className={inputClass}>
                  {['Check', 'ACH', 'Wire', 'Zelle', 'Venmo', 'Cash', 'Credit Card', 'Other'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Notes (optional)</label>
                <input type="text" value={paymentForm.notes} onChange={e => setPaymentForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Check #1234..." className={inputClass} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={recordPayment} disabled={savingPayment || !paymentForm.amount}
                  className="flex-1 bg-[#C8622A] text-white py-2 rounded-lg text-sm font-semibold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
                  {savingPayment ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Invoice Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1a2d45] rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-white font-bold text-lg mb-1">Send Invoice</h3>
            <p className="text-[#8A9AB0] text-sm mb-5">
              Sending to <span className="text-white font-medium">{invoice.proposals?.client_email}</span> · PDF will be attached
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Subject</label>
                <input type="text" value={sendForm.subject} onChange={e => setSendForm(p => ({ ...p, subject: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="text-[#8A9AB0] text-xs mb-1 block">Message</label>
                <textarea value={sendForm.message} onChange={e => setSendForm(p => ({ ...p, message: e.target.value }))} rows={5}
                  className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
              </div>
              <div className="bg-[#0F1C2E] rounded-lg px-4 py-3 text-xs text-[#8A9AB0]">
                <p>✓ Invoice PDF with payment instructions will be attached</p>
                <p>✓ Invoice will be marked as Sent</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowSendModal(false)} className="flex-1 py-2 text-[#8A9AB0] hover:text-white text-sm transition-colors">Cancel</button>
                <button onClick={sendInvoice} disabled={sendingInvoice || !sendForm.subject || !sendForm.message}
                  className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">
                  {sendingInvoice ? 'Sending...' : 'Send Invoice →'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}