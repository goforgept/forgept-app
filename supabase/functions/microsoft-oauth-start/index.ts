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
    const { org_id, user_id } = await req.json()

    if (!org_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing org_id or user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const clientId = Deno.env.get('MICROSOFT_CLIENT_ID')
    const tenantId = Deno.env.get('MICROSOFT_TENANT_ID')
    const redirectUri = Deno.env.get('MICROSOFT_REDIRECT_URI')

    if (!clientId || !tenantId || !redirectUri) {
      return new Response(JSON.stringify({ error: 'Missing Microsoft credentials' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Encode state with org_id, user_id and timestamp for security
    const state = btoa(JSON.stringify({
      org_id,
      user_id,
      ts: Date.now()
    }))

    const scopes = [
      'Calendars.ReadWrite',
      'OnlineMeetings.ReadWrite',
      'offline_access',
      'User.Read',
    ].join(' ')

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      response_mode: 'query',
      prompt: 'consent', // always show consent so we always get refresh token
    })

    // Use common endpoint to support both personal and work accounts
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})