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
    const { fullName, email, companyName, notes } = await req.json()
    const brevoKey = Deno.env.get('BREVO_API_KEY') ?? ''

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': brevoKey
      },
      body: JSON.stringify({
        sender: { name: 'ForgePt.', email: 'followups@goforgept.com' },
        to: [{ email: 'goforgept@gmail.com', name: 'Cody' }],
        subject: `New Access Request — ${companyName}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0F1C2E;">New Access Request</h2>
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Company:</strong> ${companyName}</p>
            <p><strong>Notes:</strong> ${notes || '—'}</p>
            <br/>
            <a href="https://app.goforgept.com/superadmin" style="background: #C8622A; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Review in Console
            </a>
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
