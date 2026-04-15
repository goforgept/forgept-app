import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''
    const SENDER_EMAIL = 'followups@goforgept.com'

    const {
      toEmail,
      toName,
      fromName,
      fromEmail,
      subject,
      proposalName,
      signingUrl,
      orgId,
      logoUrl,
      companyName,
    } = await req.json()

    if (!toEmail || !signingUrl) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const htmlContent = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        ${logoUrl
          ? `<div style="background:#0F1C2E;padding:16px 28px;"><img src="${logoUrl}" alt="${companyName || 'ForgePt.'}" style="max-height:44px;max-width:180px;object-fit:contain;display:block;" /></div>`
          : `<div style="background:#0F1C2E;padding:20px 28px;"><span style="color:#ffffff;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">${companyName || 'ForgePt'}<span style="color:#C8622A;">.</span></span></div>`
        }
        <div style="padding:28px;">
          <h2 style="color:#0F1C2E;margin-top:0;">Your Proposal is Ready to Sign</h2>
          <p>Hi ${toName || 'there'},</p>
          <p>Your proposal <strong>${proposalName || ''}</strong> is ready for your review and signature.</p>
          <p>Please click the button below to review the proposal and sign electronically:</p>
          <br/>
          <p style="text-align:center;">
            <a href="${signingUrl}" style="background:#C8622A;color:white;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:16px;display:inline-block;">
              Review &amp; Sign Proposal →
            </a>
          </p>
          <br/>
          <p style="color:#666;font-size:13px;">Or copy and paste this link into your browser:<br/>
            <a href="${signingUrl}" style="color:#C8622A;">${signingUrl}</a>
          </p>
          <p style="color:#666;font-size:13px;">If you have any questions, please reply to this email or contact us directly.</p>
          <br/>
          <p>Thank you,<br/><strong>${fromName || 'Your Contractor'}</strong></p>
          <br/>
          <p style="color:#aaa;font-size:11px;">This signature request was sent via ForgePt. · Secure electronic signing</p>
        </div>
      </div>
    `

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify({
        sender: { name: fromName || 'ForgePt.', email: SENDER_EMAIL },
        to: [{ email: toEmail, name: toName || '' }],
        replyTo: fromEmail ? { email: fromEmail } : undefined,
        subject: subject || `Please sign your proposal: ${proposalName}`,
        htmlContent
      })
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      console.error('Brevo error:', errText)
      return new Response(JSON.stringify({ error: 'Email send failed', detail: errText }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const result = await emailRes.json()

    return new Response(JSON.stringify({ success: true, messageId: result.messageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})