import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const realmId = url.searchParams.get('realmId')
  const error = url.searchParams.get('error')

  const appUrl = 'https://app.goforgept.com/settings?tab=integrations'

  if (error) {
    return new Response(null, { status: 302, headers: { Location: `${appUrl}&qbo_error=${error}` } })
  }

  if (!code || !state || !realmId) {
    return new Response(null, { status: 302, headers: { Location: `${appUrl}&qbo_error=missing_params` } })
  }

  try {
    const stateData = JSON.parse(atob(decodeURIComponent(state)))
    const { org_id } = stateData

    const clientId = Deno.env.get('QBO_CLIENT_ID')!
    const clientSecret = Deno.env.get('QBO_CLIENT_SECRET')!
    const redirectUri = Deno.env.get('QBO_REDIRECT_URI')!

    // Exchange code for tokens
    const credentials = btoa(`${clientId}:${clientSecret}`)
    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    })

    const tokens = await tokenRes.json()
    if (!tokens.access_token) {
      return new Response(null, { status: 302, headers: { Location: `${appUrl}&qbo_error=token_exchange_failed` } })
    }

    // Fetch company name from QBO
    let companyName = ''
    try {
      const companyRes = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Accept': 'application/json'
          }
        }
      )
      const companyData = await companyRes.json()
      companyName = companyData?.CompanyInfo?.CompanyName || ''
    } catch (e) { /* non-fatal */ }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase.from('organizations').update({
      qbo_access_token: tokens.access_token,
      qbo_refresh_token: tokens.refresh_token,
      qbo_realm_id: realmId,
      qbo_token_expires_at: expiresAt,
      qbo_connected: true,
      qbo_company_name: companyName
    }).eq('id', org_id)

    return new Response(null, { status: 302, headers: { Location: `${appUrl}&qbo_success=1` } })
  } catch (err) {
    return new Response(null, { status: 302, headers: { Location: `${appUrl}&qbo_error=${encodeURIComponent(err.message)}` } })
  }
})