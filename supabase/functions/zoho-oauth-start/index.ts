import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error } = await validateUser(req)
  if (error) return new Response(JSON.stringify({ error }), { status: 401, headers: corsHeaders })

  if (profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
  }

  const { scope } = await req.json()

  const CLIENT_ID    = Deno.env.get('ZOHO_CLIENT_ID')!
  const REDIRECT_URI = Deno.env.get('ZOHO_REDIRECT_URI')!

  // Scope determines which Zoho product to connect
  const scopes = scope === 'books'
    ? 'ZohoBooks.invoices.ALL,ZohoBooks.estimates.ALL,ZohoBooks.contacts.ALL,ZohoBooks.settings.read'
    : 'ZohoCRM.modules.contacts.ALL,ZohoCRM.modules.accounts.ALL,ZohoCRM.modules.deals.ALL,ZohoCRM.users.read'

  const state = JSON.stringify({ 
    org_id: profile.org_id, 
    scope,
    ts: Date.now() 
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     CLIENT_ID,
    scope:         scopes,
    redirect_uri:  REDIRECT_URI,
    access_type:   'offline',
    state:         Buffer.from(state).toString('base64'),
  })

  const authUrl = `https://accounts.zoho.com/oauth/v2/auth?${params.toString()}`

  return new Response(JSON.stringify({ url: authUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
