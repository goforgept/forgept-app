import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const appUrl = Deno.env.get('APP_URL') || 'https://app.goforgept.com'

  if (error || !code || !state) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&google_error=${error || 'missing_params'}`)
  }

  // Decode and validate state
  let org_id: string
  let user_id: string
  try {
    const decoded = JSON.parse(atob(state))
    org_id = decoded.org_id
    user_id = decoded.user_id
    // Reject if state is older than 10 minutes
    if (Date.now() - decoded.ts > 10 * 60 * 1000) {
      return Response.redirect(`${appUrl}/settings?tab=integrations&google_error=state_expired`)
    }
  } catch {
    return Response.redirect(`${appUrl}/settings?tab=integrations&google_error=invalid_state`)
  }

  if (!org_id || !user_id) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&google_error=invalid_state`)
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri!,
        grant_type: 'authorization_code',
      })
    })

    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      return Response.redirect(`${appUrl}/settings?tab=integrations&google_error=token_exchange_failed`)
    }

    // Get the user's primary calendar ID
    let calendarId = 'primary'
    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      })
      const calData = await calRes.json()
      calendarId = calData.id || 'primary'
    } catch {}

    // Get Google account email for display
    let googleEmail = null
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      })
      const userData = await userRes.json()
      googleEmail = userData.email || null
    } catch {}

    // Save tokens to profiles table (per user, not per org)
    // This way each user connects their own Google account
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey!,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        google_calendar_connected: true,
        google_access_token: tokenData.access_token,
        google_refresh_token: tokenData.refresh_token || null,
        google_calendar_id: calendarId,
        google_email: googleEmail,
      })
    })

    return Response.redirect(`${appUrl}/settings?tab=integrations&google_success=1`)
  } catch (err) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&google_error=${encodeURIComponent(err.message)}`)
  }
})