import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'

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
  const [signedAt, setSignedAt] = useState(null)

  useEffect(() => { fetchProposal() }, [token])

  const fetchProposal = async () => {
    if (!token) { setError('Invalid signing link.'); setLoading(false); return }

    const { data, error: fetchError } = await supabase
      .from('proposals')
      .select('id, proposal_name, company, client_name, client_email, scope_of_work, proposal_value, total_gross_margin_percent, labor_items, signature_name, signature_at, signing_token, org_id, lump_sum_pricing, tax_rate, tax_exempt')
      .eq('signing_token', token)
      .single()

    if (fetchError || !data) {
      setError('This signing link is invalid or has expired.')
      setLoading(false)
      return
    }

    if (data.signature_name && data.signature_at) {
      setSigned(true)
      setSignedAt(data.signature_at)
      setSignerName(data.signature_name)
    }

    setProposal(data)

    const { data: items } = await supabase
      .from('bom_line_items')
      .select('item_name, part_number_sku, quantity, unit, customer_price_unit, customer_price_total')
      .eq('proposal_id', data.id)

    setLineItems(items || [])

    // Fetch terms and conditions from org profile
    if (data.org_id) {
      const { data: orgProfile } = await supabase
        .from('profiles')
        .select('terms_and_conditions, company_name')
        .eq('org_id', data.org_id)
        .limit(1)
        .single()
      if (orgProfile?.terms_and_conditions) setTerms(orgProfile.terms_and_conditions)
    }

    setLoading(false)
  }

  const submitSignature = async () => {
    if (!signerName.trim()) return
    setSigning(true)

    try {
      // Get client IP via public API
      let clientIp = 'unknown'
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json')
        const ipData = await ipRes.json()
        clientIp = ipData.ip || 'unknown'
      } catch (e) { /* ignore */ }

      const now = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('proposals')
        .update({
          signature_name: signerName.trim(),
          signature_at: now,
          signature_ip: clientIp,
          status: 'Won'
        })
        .eq('signing_token', token)

      if (updateError) throw updateError

      // Log activity
      await supabase.from('activities').insert({
        proposal_id: proposal.id,
        org_id: proposal.org_id,
        type: 'note',
        title: `Proposal signed by ${signerName.trim()} · IP: ${clientIp}`
      })

      setSigned(true)
      setSignedAt(now)
    } catch (e) {
      alert('Error submitting signature. Please try again.')
    }
    setSigning(false)
  }

  const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const materialsTotal = lineItems.reduce((sum, i) => sum + (i.customer_price_total || 0), 0)
  const laborTotal = (proposal?.labor_items || []).reduce((sum, l) => sum + (parseFloat(l.customer_price) || 0), 0)
  const taxRate = (!proposal?.tax_exempt && proposal?.tax_rate) ? parseFloat(proposal.tax_rate) : 0
  const taxAmount = materialsTotal * (taxRate / 100)
  const grandTotal = materialsTotal + laborTotal + taxAmount

  if (loading) return (
    <div className="min-h-screen bg-[#0F1C2E] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-white text-2xl font-bold mb-2">ForgePt<span className="text-[#C8622A]">.</span></h1>
        <p className="text-[#8A9AB0] text-sm">Loading proposal...</p>
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

  return (
    <div className="min-h-screen bg-[#0F1C2E]">
      {/* Header */}
      <div className="bg-[#1a2d45] border-b border-[#2a3d55] px-6 py-4">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-white text-xl font-bold">ForgePt<span className="text-[#C8622A]">.</span></h1>
          <span className="text-[#8A9AB0] text-sm">Proposal Review & Signature</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Proposal header */}
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

        {/* Scope of Work */}
        {proposal?.scope_of_work && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Scope of Work</h3>
            <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">
              {proposal.scope_of_work.replace(/^\*\*Scope of Work\*\*\s*/i, '').replace(/\*\*(.*?)\*\*/g, '$1').trim()}
            </p>
          </div>
        )}

        {/* Materials */}
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
                  <tr>
                    <td colSpan={proposal?.lump_sum_pricing ? 2 : 4} className="text-[#8A9AB0] pt-4 text-right font-semibold">Materials Total</td>
                    <td className="text-white pt-4 text-right font-bold">${fmt(materialsTotal)}</td>
                  </tr>
                  {laborTotal > 0 && (
                    <tr>
                      <td colSpan={proposal?.lump_sum_pricing ? 2 : 4} className="text-[#8A9AB0] pt-1 text-right font-semibold">Labor Total</td>
                      <td className="text-white pt-1 text-right font-bold">${fmt(laborTotal)}</td>
                    </tr>
                  )}
                  {taxRate > 0 && (
                    <tr>
                      <td colSpan={proposal?.lump_sum_pricing ? 2 : 4} className="text-[#8A9AB0] pt-1 text-right font-semibold">Tax ({taxRate}%)</td>
                      <td className="text-white pt-1 text-right font-bold">${fmt(taxAmount)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-[#2a3d55]">
                    <td colSpan={proposal?.lump_sum_pricing ? 2 : 4} className="text-white pt-3 text-right font-bold text-base">Grand Total</td>
                    <td className="text-[#C8622A] pt-3 text-right font-bold text-lg">${fmt(grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Terms and Conditions */}
        {terms && (
          <div className="bg-[#1a2d45] rounded-xl p-6">
            <h3 className="text-white font-bold text-lg mb-4">Terms and Conditions</h3>
            <p className="text-[#D6E4F0] text-sm leading-relaxed whitespace-pre-wrap">{terms}</p>
          </div>
        )}

        {/* Signature section */}
        <div className="bg-[#1a2d45] rounded-xl p-6">
          {signed ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-green-400 text-3xl">✓</span>
              </div>
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
                  <input
                    type="text"
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder="Type your full legal name"
                    className="w-full bg-[#0F1C2E] text-white border border-[#2a3d55] rounded-lg px-4 py-3 text-base focus:outline-none focus:border-[#C8622A] placeholder-[#2a3d55]"
                    onKeyDown={e => e.key === 'Enter' && signerName.trim() && submitSignature()}
                  />
                </div>

                {signerName.trim() && (
                  <div className="bg-[#0F1C2E] rounded-xl px-6 py-4 border border-[#2a3d55]">
                    <p className="text-[#8A9AB0] text-xs mb-2 uppercase tracking-wide font-semibold">Signature Preview</p>
                    <p className="text-white text-3xl" style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>
                      {signerName}
                    </p>
                    <p className="text-[#8A9AB0] text-xs mt-2">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                )}

                <div className="bg-[#0F1C2E] rounded-lg px-4 py-3 text-xs text-[#8A9AB0]">
                  <p>✓ Your signature will be timestamped and recorded</p>
                  <p>✓ Your contractor will be notified immediately</p>
                  <p>✓ This constitutes a legally binding acceptance</p>
                </div>

                <button
                  onClick={submitSignature}
                  disabled={signing || !signerName.trim()}
                  className="w-full bg-[#C8622A] text-white py-4 rounded-xl text-base font-bold hover:bg-[#b5571f] transition-colors disabled:opacity-50"
                >
                  {signing ? 'Submitting...' : `I Agree & Sign — ${proposal?.proposal_name}`}
                </button>

                <p className="text-[#8A9AB0] text-xs text-center">
                  By clicking "I Agree & Sign" you are electronically signing this document. This signature is legally equivalent to a handwritten signature.
                </p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-[#2a3d55] text-xs pb-4">
          Powered by ForgePt. · Secure electronic signature
        </p>
      </div>
    </div>
  )
}