import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const SENDER_EMAIL = 'followups@goforgept.com'
const SENDER_NAME = 'ForgePt.'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const {
      lineItemIds, items, vendorEmail, vendorName,
      proposalName, repName, repEmail, company,
      excelBase64, expiresAt
    } = await req.json()

    // Update pricing_status to RFQ Sent on each line item
    if (lineItemIds?.length > 0) {
      await fetch(`${SUPABASE_URL}/rest/v1/bom_line_items?id=in.(${lineItemIds.join(',')})`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ pricing_status: 'RFQ Sent' })
      })
    }

    // Build clean HTML item table
    const itemRows = items.map((item: any) => `
      <tr style="border-bottom:1px solid #e0e0e0;">
        <td style="padding:8px 12px;font-size:13px;color:#111;">${item.itemName}</td>
        <td style="padding:8px 12px;font-size:13px;color:#555;">${item.manufacturer || '—'}</td>
        <td style="padding:8px 12px;font-size:13px;color:#555;">${item.partNumber || '—'}</td>
        <td style="padding:8px 12px;font-size:13px;color:#111;text-align:right;">${item.quantity}</td>
        <td style="padding:8px 12px;font-size:13px;color:#555;">${item.unit || 'ea'}</td>
        <td style="padding:8px 12px;font-size:13px;color:#111;font-weight:600;"></td>
      </tr>
    `).join('')

    const expiryNote = expiresAt
      ? `<p style="color:#888;font-size:12px;margin-top:8px;">Please provide pricing by <strong>${new Date(expiresAt).toLocaleDateString()}</strong>. Quotes received after this date may not be accepted.</p>`
      : ''

    const htmlContent = `
      <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:700px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <div style="background:#0f1c2e;padding:20px 28px;">
          <span style="color:#ffffff;font-size:20px;font-weight:800;">${company || 'ForgePt.'}</span>
        </div>
        <div style="padding:28px;">
          <h2 style="color:#0f1c2e;margin-top:0;font-size:18px;">Request for Quotation</h2>
          <p style="color:#444;font-size:14px;">Hi ${vendorName},</p>
          <p style="color:#444;font-size:14px;">We are requesting pricing on the following items for project: <strong>${proposalName}</strong>. Please provide your best pricing at your earliest convenience.</p>

          <table style="width:100%;border-collapse:collapse;margin:20px 0;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">
            <thead>
              <tr style="background:#0f1c2e;">
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Item</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Manufacturer</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Part #</th>
                <th style="padding:10px 12px;text-align:right;color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Unit</th>
                <th style="padding:10px 12px;text-align:left;color:#fff;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Your Price</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          ${expiryNote}
          ${excelBase64 ? '<p style="color:#444;font-size:13px;">An Excel spreadsheet is attached for your convenience. Please fill in your pricing and reply to this email.</p>' : ''}

          <p style="color:#444;font-size:14px;margin-top:20px;">Please reply to this email with your pricing. Thank you for your time.</p>
          <p style="color:#444;font-size:14px;">Best regards,<br/><strong>${repName}</strong><br/>${company}</p>
          <p style="color:#aaa;font-size:11px;margin-top:24px;">This RFQ was sent via ForgePt. — Scope it. Send it. Close it.</p>
        </div>
      </div>
    `

    const emailPayload: any = {
      sender: { name: repName || SENDER_NAME, email: SENDER_EMAIL },
      to: [{ email: vendorEmail, name: vendorName }],
      replyTo: { email: repEmail || SENDER_EMAIL },
      subject: `RFQ: ${proposalName} — ${items.length} item${items.length !== 1 ? 's' : ''}`,
      htmlContent
    }

    // Attach Excel if provided
    if (excelBase64) {
      emailPayload.attachment = [{
        name: `RFQ_${proposalName.replace(/[^a-z0-9]/gi, '_')}_${vendorName.replace(/[^a-z0-9]/gi, '_')}.xlsx`,
        content: excelBase64
      }]
    }

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
      body: JSON.stringify(emailPayload)
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      throw new Error(`Brevo error: ${errText}`)
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