import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
const SENDER_EMAIL = 'followups@goforgept.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { profile, error } = await validateUser(req)
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const {
      proposalId, clientEmail, clientName, repName, repEmail,
      companyName, proposalName, subject, message, logoUrl, pdfBase64
    } = await req.json()

    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''
    

    const logoHeader = logoUrl
      ? `<div style="background:#0F1C2E;padding:20px 28px;text-align:left;"><img src="${logoUrl}" alt="${companyName}" style="max-height:48px;max-width:200px;object-fit:contain;" /></div>`
      : `<div style="background:#0F1C2E;padding:20px 28px;"><span style="color:#ffffff;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">${companyName}</span></div>`

    const emailFooter = `<br/><p>Best regards,<br/><strong>${repName}</strong><br/>${companyName}<br/>${repEmail}</p><br/><p style="color:#aaa;font-size:11px;">Sent via ForgePt.</p>`

    const bodyHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        ${logoHeader}
        <div style="padding:28px;">
          ${message.replace(/\n/g, '<br/>')}
          ${emailFooter}
        </div>
      </div>
    `

    const emailPayload: any = {
      sender: { name: repName, email: SENDER_EMAIL },
      to: [{ email: clientEmail, name: clientName }],
      replyTo: { email: repEmail },
      subject,
      htmlContent: bodyHtml,
    }

    // Attach PDF if provided
    if (pdfBase64) {
      emailPayload.attachment = [{
        name: `${proposalName}.pdf`,
        content: pdfBase64
      }]
    }

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
      body: JSON.stringify(emailPayload)
    })

    if (!emailRes.ok) {
      const err = await emailRes.text()
      throw new Error(`Brevo error: ${err}`)
    }

    // Mark proposal as Sent — scoped to caller's org
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    await adminSupabase
      .from('proposals')
      .update({ status: 'Sent' })
      .eq('id', proposalId)
      .eq('org_id', profile.org_id)

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