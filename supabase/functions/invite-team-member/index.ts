import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error } = await validateUser(req)
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { email, fullName, orgId, orgRole } = await req.json()

    if (orgId !== profile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!'

    // Create auth user with temp password — email_confirm skips Supabase's email
    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      })
    })

    const authData = await authRes.json()
    if (!authData.id) {
      throw new Error(authData.message || authData.msg || 'Failed to create user')
    }

    const adminSupabase = createClient(supabaseUrl, serviceKey)

    const { error: upsertError } = await adminSupabase
      .from('profiles')
      .upsert({
        id: authData.id,
        email,
        full_name: fullName,
        org_id: profile.org_id,
        org_role: orgRole,
        role: orgRole,
      }, { onConflict: 'id' })

    if (upsertError) {
      console.error('Profile upsert failed:', upsertError)
      throw new Error(`Profile setup failed: ${upsertError.message}`)
    }

    // Send invite email via Brevo
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify({
        sender: { name: 'ForgePt.', email: 'followups@goforgept.com' },
        to: [{ email, name: fullName }],
        subject: "You've been invited to ForgePt.",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0F1C2E;">You're invited to ForgePt.</h2>
            <p>Hi ${fullName},</p>
            <p>You've been added to your team's ForgePt. account. Here are your login details:</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
            <p>Please log in and change your password in Settings right away.</p>
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

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
