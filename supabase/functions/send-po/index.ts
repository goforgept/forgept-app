import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"
import { sendEmail } from "../_shared/email.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error } = await validateUser(req)
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { poNumber, vendorEmail, vendorName, projectLabel, companyName, pdfBase64 } = await req.json()

    if (!vendorEmail) throw new Error('Vendor email is required')
    if (!pdfBase64)   throw new Error('PDF data is required')

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(vendorEmail)) throw new Error('Invalid vendor email address')

    const subject = `Purchase Order ${poNumber}${projectLabel ? ` — ${projectLabel}` : ''}`
    const html = `
      <p>Dear ${vendorName || 'Vendor'},</p>
      <p>Please find attached Purchase Order <strong>${poNumber}</strong>${projectLabel ? ` for <strong>${projectLabel}</strong>` : ''}.</p>
      <p>Please confirm receipt and advise of expected delivery date.</p>
      <p>Thank you,<br/>${companyName || 'ForgePt.'}</p>
    `

    await sendEmail({
      to: vendorEmail,
      subject,
      html,
      fromName: companyName || 'ForgePt.',
      attachments: [{
        content: pdfBase64,
        filename: `${poNumber}.pdf`,
        mimeType: 'application/pdf',
      }],
    })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
