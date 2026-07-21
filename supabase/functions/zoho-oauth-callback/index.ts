import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { zohoAuthBase, zohoApiBase } from "../_shared/zoho.ts"

const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

Deno.serve(async (req) => {
  const url    = new URL(req.url)
  const code   = url.searchParams.get('code')
  const state  = url.searchParams.get('state')
  const appUrl = 'https://app.goforgept.com'

  if (!code || !state) {
    return Response.redirect(`${appUrl}/settings?zoho=error&reason=missing_params`)
  }

  try {
    const STATE_SECRET = Deno.env.get('OAUTH_STATE_SECRET')!

    // Decode and verify HMAC signature
    let stateData: { org_id: string; scope: string; ts: number }
    try {
      const { payload, sig } = JSON.parse(atob(state))

      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(STATE_SECRET),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
      )
      const sigBytes = Uint8Array.from(sig.match(/.{2}/g).map((h: string) => parseInt(h, 16)))
      const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload))

      if (!valid) {
        console.error('Zoho OAuth: invalid state signature')
        return Response.redirect(`${appUrl}/settings?zoho=error&reason=invalid_state`)
      }

      stateData = JSON.parse(payload)
    } catch {
      return Response.redirect(`${appUrl}/settings?zoho=error&reason=bad_state`)
    }

    // Reject stale states
    if (Date.now() - stateData.ts > STATE_MAX_AGE_MS) {
      return Response.redirect(`${appUrl}/settings?zoho=error&reason=state_expired`)
    }

    const { org_id, scope } = stateData
    if (!org_id || (scope !== 'crm' && scope !== 'books')) {
      return Response.redirect(`${appUrl}/settings?zoho=error&reason=bad_state`)
    }

    const CLIENT_ID     = Deno.env.get('ZOHO_CLIENT_ID')!
    const CLIENT_SECRET = Deno.env.get('ZOHO_CLIENT_SECRET')!
    const REDIRECT_URI  = Deno.env.get('ZOHO_REDIRECT_URI')!

    // Exchange code for tokens (use global accounts.zoho.com for initial exchange —
    // the api_domain in the response tells us the actual DC for all subsequent calls)
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
      console.error('Zoho token exchange failed:', tokens)
      return Response.redirect(`${appUrl}/settings?zoho=error&reason=token_failed`)
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000)
    // api_domain tells us the regional DC (e.g. https://www.zohoapis.eu for EU accounts).
    // zohoApiBase() validates it against an allowlist to prevent SSRF.
    const apiBase   = zohoApiBase(tokens.api_domain)
    const apiDomain = apiBase

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const updateData: Record<string, unknown> = {
      zoho_access_token:  tokens.access_token,
      zoho_refresh_token: tokens.refresh_token,
      zoho_token_expires: expiresAt.toISOString(),
      zoho_connected:     true,
      zoho_dc:            apiDomain,
    }

    if (scope === 'crm') {
      updateData.zoho_crm_connected = true
      const userRes = await fetch(`${apiBase}/crm/v2/users?type=CurrentUser`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${tokens.access_token}` }
      })
      const userData = await userRes.json()
      updateData.zoho_crm_org_id = userData?.users?.[0]?.id || null

      // Generate a webhook token and register Zoho notifications for Accounts + Contacts
      const webhookToken = crypto.randomUUID()
      updateData.zoho_webhook_token = webhookToken
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const webhookUrl = `${supabaseUrl}/functions/v1/zoho-webhook?org_id=${org_id}&token=${webhookToken}`
      const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().replace('T', 'T').split('.')[0] + '+00:00'
      try {
        await fetch(`${apiBase}/crm/v2/actions/watch`, {
          method: 'POST',
          headers: {
            Authorization: `Zoho-oauthtoken ${tokens.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            watch: [{
              channel_id: org_id.replace(/-/g, '').slice(0, 18),
              events: ['Accounts.create', 'Accounts.edit', 'Contacts.create', 'Contacts.edit'],
              token: webhookToken,
              notify_url: webhookUrl,
              channel_expiry: expiry,
            }],
          }),
        })
      } catch { /* non-fatal — webhook can be set up manually */ }
    } else {
      updateData.zoho_books_connected = true
      const orgsRes = await fetch(`${apiBase}/books/v3/organizations`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${tokens.access_token}` }
      })
      const orgsData = await orgsRes.json()
      updateData.zoho_books_org_id = orgsData?.organizations?.[0]?.organization_id || null
    }

    await supabase.from('organizations').update(updateData).eq('id', org_id)

    return Response.redirect(`${appUrl}/settings?zoho=connected&scope=${scope}`)

  } catch (err) {
    console.error('Zoho OAuth error:', err)
    return Response.redirect(`${appUrl}/settings?zoho=error&reason=exception`)
  }
})
