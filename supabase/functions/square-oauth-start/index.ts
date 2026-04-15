import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.goforgept.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { org_id } = await req.json()
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const appId = Deno.env.get('SQUARE_APP_ID')
    const redirectUri = Deno.env.get('SQUARE_REDIRECT_URI')

    if (!appId || !redirectUri) {
      return new Response(JSON.stringify({ error: 'Square not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // State param prevents CSRF — encode org_id + timestamp
    const state = btoa(JSON.stringify({ org_id, ts: Date.now() }))

    const params = new URLSearchParams({
      client_id: appId,
      scope: 'INVOICES_READ INVOICES_WRITE CUSTOMERS_READ CUSTOMERS_WRITE ORDERS_READ ORDERS_WRITE PAYMENTS_READ',
      session: 'false',
      state,
      redirect_uri: redirectUri,
    })

    const url = `https://connect.squareup.com/oauth2/authorize?${params}`

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})