import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { lineItemIds, items, vendorEmail, vendorName, proposalName, repName, repEmail, company } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

    const itemRows = items.map((item: any) => `
      <tr style="background: #f5f5f5;">
        <td style="padding: 10px;">${item.itemName}</td>
        <td style="padding: 10px;">${item.partNumber || '—'}</td>
        <td style="padding: 10px;">${item.quantity}</td>
        <td style="padding: 10px;">${item.unit}</td>
      </tr>
    `).join('')

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify({
        sender: { name: repName, email: 'followups@goforgept.com' },
        to: [{ email: vendorEmail, name: vendorName }],
        replyTo: { email: repEmail },
        subject: `RFQ: ${proposalName} — ${company}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0F1C2E;">Request for Quote</h2>
            <p>Hi ${vendorName},</p>
            <p>${repName} from ${company} is requesting pricing on the following items for project <strong>${proposalName}</strong>:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr style="background: #0F1C2E; color: white;">
                <th style="padding: 10px; text-align: left;">Item</th>
                <th style="padding: 10px; text-align: left;">Part #</th>
                <th style="padding: 10px; text-align: left;">Quantity</th>
                <th style="padding: 10px; text-align: left;">Unit</th>
              </tr>
              ${itemRows}
            </table>
            <p>Please reply to this email with your best pricing for each item.</p>
            <br/>
            <p>Thanks,<br/>${repName}<br/>${repEmail}</p>
          </div>
        `
      })
    })

    if (!emailResponse.ok) {
      const err = await emailResponse.text()
      throw new Error(`Brevo error: ${err}`)
    }

    for (const lineItemId of lineItemIds) {
      await fetch(`${supabaseUrl}/rest/v1/bom_line_items?id=eq.${lineItemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          pricing_status: 'RFQ Sent',
          rfq_sent_at: new Date().toISOString()
        })
      })
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})