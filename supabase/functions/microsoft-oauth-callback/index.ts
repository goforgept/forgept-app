import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const appUrl = Deno.env.get('APP_URL') || 'https://app.goforgept.com'

  if (error || !code || !state) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&microsoft_error=${error || 'missing_params'}`)
  }

  // Decode and validate state
  let org_id: string
  let user_id: string
  try {
    const decoded = JSON.parse(atob(state))
    org_id = decoded.org_id
    user_id = decoded.user_id
    if (Date.now() - decoded.ts > 10 * 60 * 1000) {
      return Response.redirect(`${appUrl}/settings?tab=integrations&microsoft_error=state_expired`)
    }
  } catch {
    return Response.redirect(`${appUrl}/settings?tab=integrations&microsoft_error=invalid_state`)
  }

  if (!org_id || !user_id) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&microsoft_error=invalid_state`)
  }

  const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
  const clientSecret = Deno.env.get('MICROSOFT_CLIENT_SECRET')
  const redirectUri = Deno.env.get('MICROSOFT_REDIRECT_URI')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri!,
        grant_type: 'authorization_code',
        scope: 'Calendars.ReadWrite OnlineMeetings.ReadWrite offline_access User.Read',
      })
    })

    const tokenData = await tokenRes.json()

    if (!tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'token_exchange_failed'
      return Response.redirect(`${appUrl}/settings?tab=integrations&microsoft_error=${encodeURIComponent(errMsg)}`)
    }

    // Get user info (email) from Microsoft Graph
    let microsoftEmail = null
    let microsoftName = null
    try {
      const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      })
      const userData = await userRes.json()
      microsoftEmail = userData.mail || userData.userPrincipalName || null
      microsoftName = userData.displayName || null
    } catch {}

    // Save tokens to profiles table (per user)
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': serviceKey!,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        microsoft_calendar_connected: true,
        microsoft_access_token: tokenData.access_token,
        microsoft_refresh_token: tokenData.refresh_token || null,
        microsoft_email: microsoftEmail,
        microsoft_display_name: microsoftName,
      })
    })

    return Response.redirect(`${appUrl}/settings?tab=integrations&microsoft_success=1`)
  } catch (err) {
    return Response.redirect(`${appUrl}/settings?tab=integrations&microsoft_error=${encodeURIComponent(err.message)}`)
  }
})