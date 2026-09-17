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
      companyName, proposalName, subject, message, logoUrl, primaryColor, pdfBase64
    } = await req.json()

    const bannerColor = primaryColor || '#0F1C2E'
    const logoHeader = logoUrl
      ? `<div style="background:${bannerColor};padding:20px 28px;text-align:left;"><img src="${logoUrl}" alt="${companyName}" style="max-height:48px;max-width:200px;object-fit:contain;" /></div>`
      : `<div style="background:${bannerColor};padding:20px 28px;"><span style="color:#ffffff;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">${companyName}</span></div>`

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

    const { messageId } = await sendEmail({
      to:       clientEmail,
      subject,
      html:     bodyHtml,
      replyTo:  repEmail,
      fromName: repName || SENDER_NAME,
      trackOpens: true,
      attachments: pdfBase64 ? [{
        content:  pdfBase64,
        filename: `${proposalName}.pdf`,
        mimeType: 'application/pdf',
      }] : undefined,
    })

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Look up client_id from proposal
    const { data: proposal } = await adminSupabase
      .from('proposals').select('client_id').eq('id', proposalId).maybeSingle()

    await Promise.all([
      // Mark proposal as Sent
      adminSupabase.from('proposals').update({ status: 'Sent' }).eq('id', proposalId).eq('org_id', profile.org_id),
      // Store email record for open tracking
      adminSupabase.from('client_emails').insert({
        org_id:               profile.org_id,
        client_id:            proposal?.client_id ?? null,
        proposal_id:          proposalId,
        sent_by:              (await adminSupabase.auth.getUser()).data.user?.id ?? null,
        subject,
        to_email:             clientEmail,
        postmark_message_id:  messageId,
        sent_at:              new Date().toISOString(),
        open_count:           0,
      }),
    ])

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
