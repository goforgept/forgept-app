import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const brevoApiKey = Deno.env.get('BREVO_API_KEY')
  const appUrl = Deno.env.get('APP_URL') || 'https://app.goforgept.com'

  try {
    const { org_id, domain } = await req.json()

    if (!org_id || !domain) {
      return new Response(JSON.stringify({ error: 'Missing org_id or domain' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get org admin email
    const profileRes = await fetch(
      `${supabaseUrl}/rest/v1/profiles?org_id=eq.${org_id}&org_role=eq.admin&select=email,full_name&limit=1`,
      {
        headers: {
          'apikey': serviceKey!,
          'Authorization': `Bearer ${serviceKey}`,
        }
      }
    )
    const profiles = await profileRes.json()
    const admin = profiles?.[0]

    if (!admin?.email) {
      return new Response(JSON.stringify({ error: 'Could not find org admin email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Generate a secure verification token
    const token = btoa(JSON.stringify({
      org_id,
      domain: domain.toLowerCase(),
      ts: Date.now(),
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    }))

    // Store token on org
    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${org_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey!,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inbound_email_domain: domain.toLowerCase(),
        inbound_email_verified: false,
        inbound_verification_token: token,
      })
    })

    const verifyUrl = `${appUrl}/settings?tab=integrations&verify_inbound=${encodeURIComponent(token)}`

    // Send verification email via Brevo
    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'ForgePt.', email: 'hello@goforgept.com' },
        to: [{ email: admin.email, name: admin.full_name || 'Admin' }],
        subject: `Verify inbound email domain — ${domain}`,
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #0F1C2E; color: #ffffff; border-radius: 12px;">
            <h1 style="color: #ffffff; font-size: 24px; margin-bottom: 4px;">ForgePt<span style="color: #C8622A;">.</span></h1>
            <h2 style="color: #ffffff; font-size: 18px; margin-bottom: 8px;">Verify your inbound email domain</h2>
            <p style="color: #8A9AB0; margin-bottom: 24px;">
              You requested to enable inbound email-to-ticket routing for <strong style="color: #ffffff;">@${domain}</strong>.
              Click the button below to verify and activate this domain.
            </p>
            <a href="${verifyUrl}"
              style="display: inline-block; background: #C8622A; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Verify Domain →
            </a>
            <p style="color: #8A9AB0; font-size: 12px; margin-top: 24px;">
              This link expires in 24 hours. If you didn't request this, you can ignore this email.
            </p>
          </div>
        `
      })
    })

    if (!emailRes.ok) {
      const emailErr = await emailRes.json()
      throw new Error(emailErr.message || 'Failed to send verification email')
    }

    return new Response(JSON.stringify({ success: true, sent_to: admin.email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})