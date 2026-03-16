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
    const { userId, email, fullName, companyName } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

    // Create organization
    const orgRes = await fetch(`${supabaseUrl}/rest/v1/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ name: companyName, status: 'pending' })
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

    // Notify you of new signup
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify({
        sender: { name: 'ForgePt.', email: 'followups@goforgept.com' },
        to: [{ email: 'goforgept@gmail.com', name: 'Cody' }],
        subject: `New ForgePt. signup — ${companyName}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0F1C2E;">New Account Signup</h2>
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><a href="https://app.goforgept.com/superadmin" style="background: #C8622A; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">Review in Console</a></p>
          </div>
        `
      })
    })

    return new Response(
      JSON.stringify({ success: true, orgId: org.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
