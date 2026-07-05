import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

Deno.serve(async (req) => {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const appUrl = 'https://app.goforgept.com'

  if (!code || !state) {
    return Response.redirect(`${appUrl}/settings?zoho=error&reason=missing_params`)
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { org_id, scope } = stateData

    const CLIENT_ID     = Deno.env.get('ZOHO_CLIENT_ID')!
    const CLIENT_SECRET = Deno.env.get('ZOHO_CLIENT_SECRET')!
    const REDIRECT_URI  = Deno.env.get('ZOHO_REDIRECT_URI')!

    // Exchange code for tokens
    const tokenRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        code,
      })
    })

    const tokens = await tokenRes.json()
    if (!tokens.access_token) {
      console.error('Token exchange failed:', tokens)
      return Response.redirect(`${appUrl}/settings?zoho=error&reason=token_failed`)
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Store tokens on organization
    const updateData: Record<string, any> = {
      zoho_access_token:  tokens.access_token,
      zoho_refresh_token: tokens.refresh_token,
      zoho_token_expires: expiresAt.toISOString(),
      zoho_connected:     true,
    }

    if (scope === 'crm') {
      updateData.zoho_crm_connected = true
      // Get Zoho CRM org info
      const userRes = await fetch('https://www.zohoapis.com/crm/v2/users?type=CurrentUser', {
        headers: { 'Authorization': `Zoho-oauthtoken ${tokens.access_token}` }
      })
      const userData = await userRes.json()
      updateData.zoho_crm_org_id = userData?.users?.[0]?.id || null
    } else if (scope === 'books') {
      updateData.zoho_books_connected = true
      // Get Zoho Books org info
      const orgsRes = await fetch('https://www.zohoapis.com/books/v3/organizations', {
        headers: { 'Authorization': `Zoho-oauthtoken ${tokens.access_token}` }
      })
      const orgsData = await orgsRes.json()
      updateData.zoho_books_org_id = orgsData?.organizations?.[0]?.organization_id || null
    }

    await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', org_id)

    return Response.redirect(`${appUrl}/settings?zoho=connected&scope=${scope}`)

  } catch (err) {
    console.error('Zoho OAuth error:', err)
    return Response.redirect(`${appUrl}/settings?zoho=error&reason=exception`)
  }
})
