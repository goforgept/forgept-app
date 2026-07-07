import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error } = await validateUser(req)
  if (error) return new Response(JSON.stringify({ error }), { status: 401, headers: corsHeaders })

  if (profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
  }

  const body = await req.json()
  const scope = body.scope === 'books' ? 'books' : 'crm'

  const CLIENT_ID    = Deno.env.get('ZOHO_CLIENT_ID')!
  const REDIRECT_URI = Deno.env.get('ZOHO_REDIRECT_URI')!
  const STATE_SECRET = Deno.env.get('OAUTH_STATE_SECRET')!

  const scopes = scope === 'books'
    ? 'ZohoBooks.invoices.ALL,ZohoBooks.estimates.ALL,ZohoBooks.contacts.ALL,ZohoBooks.settings.read'
    : 'ZohoCRM.modules.contacts.ALL,ZohoCRM.modules.accounts.ALL,ZohoCRM.modules.deals.ALL,ZohoCRM.users.read'

  const payload = JSON.stringify({ org_id: profile.org_id, scope, ts: Date.now() })

  // Sign the state with HMAC-SHA256 so the callback can verify it wasn't tampered with
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(STATE_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')

  const state = btoa(JSON.stringify({ payload, sig: sigHex }))

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    scope:         scopes,
    redirect_uri:  REDIRECT_URI,
    access_type:   'offline',
    state,
  })

  const authUrl = `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`

  return new Response(JSON.stringify({ url: authUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
