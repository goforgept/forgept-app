import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const SENDER_EMAIL = 'followups@goforgept.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const {
      token, prices, quoteNumber, quoteExpiry,
      vendorNotes, pdfBase64, pdfFileName
    } = await req.json()

    if (!token) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Validate token server-side
    const { data: rfq, error: rfqError } = await adminSupabase
      .from('rfq_requests')
      .select('*, proposals(proposal_name, org_id, user_id, rep_name, rep_email)')
      .eq('token', token)
      .single()

    if (rfqError || !rfq) {
      return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (rfq.status === 'responded') {
      return new Response(JSON.stringify({ error: 'Already submitted' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (rfq.expires_at && new Date(rfq.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'RFQ has expired' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify line items belong to this RFQ
    const rfqLineItemIds = rfq.line_item_ids || []
    const submittedIds = Object.keys(prices || {})
    const validIds = submittedIds.filter(id => rfqLineItemIds.includes(id))

    // Upload PDF if provided
    let pdfUrl = null
    if (pdfBase64) {
      const fileName = `rfq-responses/${rfq.id}/${Date.now()}.pdf`
      const pdfBuffer = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))
      const { error: uploadError } = await adminSupabase.storage
        .from('signed-proposals')
        .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })

      if (!uploadError) {
        const { data: urlData } = await adminSupabase.storage
          .from('signed-proposals')
          .createSignedUrl(fileName, 60 * 60 * 24 * 365)
        pdfUrl = urlData?.signedUrl
      }
    }

    // Update rfq_request
    await adminSupabase.from('rfq_requests').update({
      status: 'responded',
      responded_at: new Date().toISOString(),
      vendor_quote_number: quoteNumber || null,
      vendor_quote_expiry: quoteExpiry || null,
      vendor_notes: vendorNotes || null,
      vendor_response_pdf_url: pdfUrl,
      parsed_items: validIds
        .filter(id => prices[id])
        .map(id => ({ id, price: parseFloat(prices[id]) || 0 }))
    }).eq('token', token)

    // Update bom_line_items — only valid IDs, vendor cost only
    for (const itemId of validIds) {
      const price = prices[itemId]
      if (!price) continue
      const unitPrice = parseFloat(price) || 0

      const { data: item } = await adminSupabase
        .from('bom_line_items')
        .select('quantity')
        .eq('id', itemId)
        .single()

      const qty = parseFloat(item?.quantity) || 1

      await adminSupabase.from('bom_line_items').update({
        your_cost_unit: unitPrice,
        your_cost_total: parseFloat((unitPrice * qty).toFixed(2)),
        rfq_quote_number: quoteNumber || null,
        pricing_status: 'Confirmed'
      }).eq('id', itemId)
    }

    // Notify rep via Brevo
    const proposal = rfq.proposals
    if (proposal?.rep_email) {
      const { data: repProfile } = await adminSupabase
        .from('profiles')
        .select('full_name, company_name, logo_url')
        .eq('id', proposal.user_id)
        .single()

      const logoHeader = repProfile?.logo_url
        ? `<div style="background:#0F1C2E;padding:20px 28px;"><img src="${repProfile.logo_url}" style="max-height:48px;max-width:200px;" /></div>`
        : `<div style="background:#0F1C2E;padding:20px 28px;"><span style="color:#fff;font-size:20px;font-weight:bold;">${repProfile?.company_name || 'ForgePt.'}</span></div>`

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
        body: JSON.stringify({
          sender: { name: 'ForgePt.', email: SENDER_EMAIL },
          to: [{ email: proposal.rep_email, name: proposal.rep_name || 'Rep' }],
          subject: `Vendor quote received — ${proposal.proposal_name}`,
          htmlContent: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
              ${logoHeader}
              <div style="padding:28px;">
                <h2 style="color:#0F1C2E;margin-top:0;">📦 Vendor Quote Received</h2>
                <p>Hi ${proposal.rep_name || 'there'},</p>
                <p><strong>${rfq.vendor_name}</strong> has submitted pricing on <strong>${proposal.proposal_name}</strong>.</p>
                ${quoteNumber ? `<p>Quote #: <strong>${quoteNumber}</strong></p>` : ''}
                ${quoteExpiry ? `<p>Quote expires: <strong>${new Date(quoteExpiry).toLocaleDateString()}</strong></p>` : ''}
                ${vendorNotes ? `<p>Vendor notes: ${vendorNotes}</p>` : ''}
                <p style="color:#C8622A;font-weight:bold;">⚠ Review pricing and apply your margin before sending to client.</p>
                <p><a href="https://app.goforgept.com/proposal/${rfq.proposal_id}" style="background:#C8622A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Review Proposal →</a></p>
                <br/>
                <p style="color:#888;font-size:12px;">Powered by ForgePt.</p>
              </div>
            </div>
          `
        })
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})