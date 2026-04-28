import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'

export default function RFQResponse() {
  const { token } = useParams()
  const [rfq, setRfq] = useState(null)
  const [proposal, setProposal] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [quoteNumber, setQuoteNumber] = useState('')
  const [quoteExpiry, setQuoteExpiry] = useState('')
  const [vendorNotes, setVendorNotes] = useState('')
  const [prices, setPrices] = useState({})
  const [quoteFile, setQuoteFile] = useState(null)
  const [uploadingPDF, setUploadingPDF] = useState(false)
  const [parsingPDF, setParsingPDF] = useState(false)
  const [parsedItems, setParsedItems] = useState([])

  useEffect(() => { fetchRFQ() }, [token])

  const fetchRFQ = async () => {
    if (!token) { setError('Invalid link.'); setLoading(false); return }

    const { data, error: fetchError } = await supabase
      .from('rfq_requests')
      .select('*')
      .eq('token', token)
      .single()

    if (fetchError || !data) { setError('This RFQ link is invalid or has expired.'); setLoading(false); return }

    if (data.status === 'responded') {
      setSubmitted(true)
      setRfq(data)
      setLoading(false)
      return
    }

    setRfq(data)

    // Fetch proposal
    const { data: propData } = await supabase
      .from('proposals')
      .select('id, proposal_name, company, org_id')
      .eq('id', data.proposal_id)
      .single()
    setProposal(propData)

    // Fetch line items for this RFQ
    if (data.line_item_ids?.length > 0) {
      const { data: items } = await supabase
        .from('bom_line_items')
        .select('id, item_name, part_number_sku, manufacturer, quantity, unit')
        .in('id', data.line_item_ids)
      setLineItems(items || [])
      const initPrices = {}
      ;(items || []).forEach(i => { initPrices[i.id] = '' })
      setPrices(initPrices)
    }

    setLoading(false)
  }

  const parsePDFQuote = async (file) => {
    setParsingPDF(true)
    setParsedItems([])
    try {
      const reader = new FileReader()
      const fileBase64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/ai-parse-rfq-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileBase64,
          mediaType: file.type,
          lineItems: lineItems.map(i => ({
            id: i.id,
            itemName: i.item_name,
            partNumber: i.part_number_sku || '',
            quantity: i.quantity
          })),
          token
        })
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      // Auto-fill prices from parsed data
      if (data.prices) {
        setPrices(prev => ({ ...prev, ...data.prices }))
      }
      if (data.quoteNumber) setQuoteNumber(data.quoteNumber)
      if (data.quoteExpiry) setQuoteExpiry(data.quoteExpiry)
      if (data.notes) setVendorNotes(data.notes)
      setParsedItems(data.matchedItems || [])
    } catch (err) {
      alert('Error parsing PDF: ' + err.message)
    }
    setParsingPDF(false)
  }

  const submitQuote = async () => {
    setSubmitting(true)
    try {
      // Convert PDF to base64 if provided
      let pdfBase64 = null
      if (quoteFile) {
        setUploadingPDF(true)
        pdfBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(quoteFile)
        })
        setUploadingPDF(false)
      }

      // Submit via edge function — server-side token validation
      const res = await fetch('https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/submit-rfq-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          prices,
          quoteNumber: quoteNumber || null,
          quoteExpiry: quoteExpiry || null,
          vendorNotes: vendorNotes || null,
          pdfBase64,
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')

      setSubmitted(true)
    } catch (err) {
      alert('Error submitting quote: ' + err.message)
    }
    setSubmitting(false)
  }

  const fmt = (n) => (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const totalQuoted = Object.entries(prices).reduce((sum, [id, price]) => {
    const item = lineItems.find(i => i.id === id)
    return sum + ((parseFloat(price) || 0) * (parseFloat(item?.quantity) || 1))
  }, 0)

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-[#8A9AB0] text-sm">Loading RFQ...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <div className="bg-[#1a2d45] rounded-2xl p-8 mt-6">
          <p className="text-red-400 text-lg font-semibold mb-2">⚠ Link Error</p>
          <p className="text-[#8A9AB0] text-sm">{error}</p>
        </div>
      </div>
    </div>
  )

  if (submitted) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <div className="bg-[#1a2d45] rounded-2xl p-8 mt-6">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-green-400 text-3xl">✓</span>
          </div>
          <h3 className="text-white font-bold text-xl mb-2">Quote Submitted</h3>
          <p className="text-[#8A9AB0] text-sm">Thank you for your response. The team has been notified.</p>
          {rfq?.vendor_quote_number && (
            <p className="text-[#8A9AB0] text-xs mt-2">Quote # {rfq.vendor_quote_number}</p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
          <span className="text-[#8A9AB0] text-sm">Vendor Quote Submission</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h2 className="text-white text-2xl font-bold mb-1">Request for Quotation</h2>
          <p className="text-[#8A9AB0]">Project: {proposal?.proposal_name}</p>
          <p className="text-[#8A9AB0] text-sm">From: {proposal?.company}</p>
          {rfq?.expires_at && (
            <p className={`text-sm mt-2 font-semibold ${new Date(rfq.expires_at) < new Date() ? 'text-red-400' : 'text-[#C8622A]'}`}>
              {new Date(rfq.expires_at) < new Date() ? '⚠ This RFQ has expired' : `Response requested by ${new Date(rfq.expires_at).toLocaleDateString()}`}
            </p>
          )}
        </div>

        {/* Upload PDF Quote */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-1">Upload Your Quote (Optional)</h3>
          <p className="text-[#8A9AB0] text-sm mb-4">Upload a PDF quote and AI will automatically extract pricing for you.</p>
          <input type="file" accept=".pdf,image/jpeg,image/png"
            onChange={e => {
              const file = e.target.files[0]
              if (file) { setQuoteFile(file); parsePDFQuote(file) }
            }}
            className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
          {parsingPDF && <p className="text-[#C8622A] text-xs mt-2 animate-pulse">🤖 Reading your quote and filling in prices...</p>}
          {parsedItems.length > 0 && (
            <p className="text-green-400 text-xs mt-2">✓ {parsedItems.length} prices extracted — review below</p>
          )}
        </div>

        {/* Quote Details */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-4">Quote Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Your Quote Number</label>
              <input type="text" value={quoteNumber} onChange={e => setQuoteNumber(e.target.value)}
                placeholder="e.g. QT-2024-8812"
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
            <div>
              <label className="text-[#8A9AB0] text-xs mb-1 block">Quote Expiry Date</label>
              <input type="date" value={quoteExpiry} onChange={e => setQuoteExpiry(e.target.value)}
                className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-[#8A9AB0] text-xs mb-1 block">Notes (optional)</label>
            <textarea value={vendorNotes} onChange={e => setVendorNotes(e.target.value)} rows={2}
              placeholder="Lead times, substitutions, special conditions..."
              className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A] resize-none" />
          </div>
        </div>

        {/* Line Items Pricing */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <h3 className="text-white font-bold text-lg mb-4">Enter Your Pricing</h3>
          <div className="space-y-3">
            {lineItems.map(item => (
              <div key={item.id} className="bg-[#0F1C2E] rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-white text-sm font-semibold">{item.item_name}</p>
                    {item.part_number_sku && <p className="text-[#8A9AB0] text-xs">{item.part_number_sku}</p>}
                    {item.manufacturer && <p className="text-[#8A9AB0] text-xs">{item.manufacturer}</p>}
                  </div>
                  <span className="text-[#8A9AB0] text-xs">Qty: {item.quantity} {item.unit || 'ea'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[#8A9AB0] text-xs mb-1 block">Unit Price ($)</label>
                    <input type="number" step="0.01" value={prices[item.id] || ''}
                      onChange={e => setPrices(prev => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="0.00"
                      className="w-full bg-[#1a2d45] text-white border border-[#2a3d55] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C8622A]" />
                  </div>
                  {prices[item.id] && (
                    <div className="text-right">
                      <p className="text-[#8A9AB0] text-xs">Extended</p>
                      <p className="text-white text-sm font-semibold">${fmt((parseFloat(prices[item.id]) || 0) * (parseFloat(item.quantity) || 1))}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {totalQuoted > 0 && (
            <div className="mt-4 pt-4 border-t border-[#2a3d55] flex justify-between items-center">
              <p className="text-[#8A9AB0] text-sm font-semibold">Total Quote Value</p>
              <p className="text-[#C8622A] text-xl font-bold">${fmt(totalQuoted)}</p>
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          <button onClick={submitQuote}
            disabled={submitting || !Object.values(prices).some(p => p)}
            className="w-full bg-[#C8622A] text-white py-4 rounded-xl text-base font-bold hover:bg-[#b5571f] transition-colors disabled:opacity-50">
            {submitting ? 'Submitting Quote...' : 'Submit Quote →'}
          </button>
          <p className="text-[#8A9AB0] text-xs text-center mt-3">
            Your pricing will be sent directly to the project team.
          </p>
        </div>

        <p className="text-center text-[#2a3d55] text-xs pb-4">Powered by ForgePt. · Secure vendor portal</p>
      </div>
    </div>
  )
}