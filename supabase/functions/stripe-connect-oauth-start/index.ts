import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://app.goforgept.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const { org_id } = await req.json()
    if (!org_id) {
      return new Response(JSON.stringify({ error: 'org_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const clientId = Deno.env.get('STRIPE_CONNECT_CLIENT_ID')
    const redirectUri = Deno.env.get('STRIPE_CONNECT_REDIRECT_URI')

    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: 'Stripe Connect not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const state = btoa(JSON.stringify({ org_id, ts: Date.now() }))

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'read_write',
      state,
      redirect_uri: redirectUri,
      'stripe_user[business_type]': 'company',
    })

    const url = `https://connect.stripe.com/oauth/authorize?${params}`

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
