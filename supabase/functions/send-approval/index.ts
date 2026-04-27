import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

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

  // Only SuperAdmin can send approval emails
  const SUPERADMIN_ORG_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  if (profile.org_id !== SUPERADMIN_ORG_ID) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { email, name } = await req.json()
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify({
        sender: { name: 'ForgePt.', email: 'followups@goforgept.com' },
        to: [{ email, name }],
        subject: 'Your ForgePt. account has been approved!',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0F1C2E;">Welcome to ForgePt.</h2>
            <p>Hi ${name},</p>
            <p>Great news — your ForgePt. account has been approved and is ready to use.</p>
            <p>Log in now to set up your team, add your branding, and start building proposals.</p>
            <br/>
            <a href="https://app.goforgept.com" style="background: #C8622A; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Log In to ForgePt.
            </a>
            <br/><br/>
            <p>If you have any questions just reply to this email.</p>
            <p>— The ForgePt. Team</p>
          </div>
        `
      })
    })

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