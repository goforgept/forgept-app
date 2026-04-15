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
    const { requestId, fullName, email, companyName } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

    // Create auth user with a temporary password
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!'

    const authRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      })
    })

    const authData = await authRes.json()
    if (!authData.id) throw new Error('Failed to create auth user: ' + JSON.stringify(authData))

    const userId = authData.id

    // Create organization
    const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ name: companyName, status: 'active' })
    })

    const orgData = await orgRes.json()
    const org = orgData[0]
    if (!org?.id) throw new Error('Failed to create organization')

    // Create profile
    await fetch(`${supabaseUrl}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        id: userId,
        email,
        full_name: fullName,
        company_name: companyName,
        org_id: org.id,
        org_role: 'admin',
        role: 'admin'
      })
    })

    // Update request status to approved
    await fetch(`${supabaseUrl}/rest/v1/access_requests?id=eq.${requestId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: 'approved' })
    })

    // Send approval email with password setup link
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify({
        sender: { name: 'ForgePt.', email: 'followups@goforgept.com' },
        to: [{ email, name: fullName }],
        subject: 'Your ForgePt. account is ready!',
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0F1C2E;">Welcome to ForgePt.</h2>
            <p>Hi ${fullName},</p>
            <p>Your account has been approved and is ready to use!</p>
            <p>Here are your login details:</p>
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
