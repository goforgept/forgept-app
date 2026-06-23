import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendEmail } from "../_shared/email.ts"

const SENDER_NAME = 'ForgePt.'

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
      proposalId, clientEmail, clientName: _clientName, repName, repEmail,
      companyName, proposalName, subject, message, logoUrl, pdfBase64
    } = await req.json()

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

    await sendEmail({
      to:       clientEmail,
      subject,
      html:     bodyHtml,
      replyTo:  repEmail,
      fromName: repName || SENDER_NAME,
      attachments: pdfBase64 ? [{
        content:  pdfBase64,
        filename: `${proposalName}.pdf`,
        mimeType: 'application/pdf',
      }] : undefined,
    })

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

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
