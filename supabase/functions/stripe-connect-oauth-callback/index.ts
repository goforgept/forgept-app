import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const appUrl = Deno.env.get('APP_URL') || 'https://app.goforgept.com'

  if (error || !code || !state) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&stripe_connect_error=${error || 'missing_params'}`)
  }

  let org_id: string
  try {
    const decoded = JSON.parse(atob(state))
    org_id = decoded.org_id
    if (Date.now() - decoded.ts > 10 * 60 * 1000) {
      return Response.redirect(`${appUrl}/settings?tab=integrations&stripe_connect_error=state_expired`)
    }
  } catch {
    return Response.redirect(`${appUrl}/settings?tab=integrations&stripe_connect_error=invalid_state`)
  }

  if (!org_id) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&stripe_connect_error=invalid_state`)
  }

  const stripeSecretKey = (Deno.env.get('STRIPE_SECRET_KEY') ?? '').trim()
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()

  try {
    const tokenRes = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
      }),
    })

    const tokenData = await tokenRes.json()
    if (tokenData.error || !tokenData.stripe_user_id) {
      const detail = tokenData.error_description || tokenData.error || 'no stripe_user_id'
      return Response.redirect(`${appUrl}/settings?tab=integrations&stripe_connect_error=${encodeURIComponent(detail)}`)
    }

    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${org_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stripe_connect_connected: true,
        stripe_connect_account_id: tokenData.stripe_user_id,
      }),
    })

    return Response.redirect(`${appUrl}/settings?tab=integrations&stripe_connect_success=1`)
  } catch (err) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&stripe_connect_error=${encodeURIComponent(err.message)}`)
  }
})
