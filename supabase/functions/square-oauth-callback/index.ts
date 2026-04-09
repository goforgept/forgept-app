import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const appUrl = Deno.env.get('APP_URL') || 'https://app.goforgept.com'

  if (error || !code || !state) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&square_error=${error || 'missing_params'}`)
  }

  // Decode and validate state
  let org_id: string
  try {
    const decoded = JSON.parse(atob(state))
    org_id = decoded.org_id
    // Reject if state is older than 10 minutes
    if (Date.now() - decoded.ts > 10 * 60 * 1000) {
      return Response.redirect(`${appUrl}/settings?tab=integrations&square_error=state_expired`)
    }
  } catch {
    return Response.redirect(`${appUrl}/settings?tab=integrations&square_error=invalid_state`)
  }

  if (!org_id) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&square_error=invalid_state`)
  }

  const appId = Deno.env.get('SQUARE_APP_ID')
  const appSecret = Deno.env.get('SQUARE_APP_SECRET')
  const redirectUri = Deno.env.get('SQUARE_REDIRECT_URI')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  try {
    // Exchange code for token — server to server, secret never exposed to client
    const tokenRes = await fetch('https://connect.squareup.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
      body: JSON.stringify({
        client_id: appId,
        client_secret: appSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      })
    })

    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      return Response.redirect(`${appUrl}/settings?tab=integrations&square_error=token_exchange_failed`)
    }

    // Get merchant's default location
    let locationId = null
    try {
      const locRes = await fetch('https://connect.squareup.com/v2/locations', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Square-Version': '2024-01-18' }
      })
      const locData = await locRes.json()
      locationId = locData.locations?.[0]?.id || null
    } catch {}

    // Save to org — service role bypasses RLS, safe server-side only
    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${org_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey!,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        square_connected: true,
        square_access_token: tokenData.access_token,
        square_refresh_token: tokenData.refresh_token || null,
        square_merchant_id: tokenData.merchant_id || null,
        square_location_id: locationId,
      })
    })

    return Response.redirect(`${appUrl}/settings?tab=integrations&square_success=1`)
  } catch (err) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&square_error=${encodeURIComponent(err.message)}`)
  }
})