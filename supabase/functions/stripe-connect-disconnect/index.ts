import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const { profile, error: authError } = await validateUser(req)
  if (authError) return new Response(JSON.stringify({ error: authError }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!
  const connectClientId = Deno.env.get('STRIPE_CONNECT_CLIENT_ID') ?? ''

  const adminSupabase = createClient(supabaseUrl, serviceKey)

  try {
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('stripe_connect_account_id')
      .eq('id', profile.org_id)
      .single()

    // Deauthorize in Stripe so the platform no longer has access to the connected account
    if (org?.stripe_connect_account_id && connectClientId && stripeKey) {
      await fetch('https://connect.stripe.com/oauth/deauthorize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: connectClientId,
          stripe_user_id: org.stripe_connect_account_id,
        }),
      })
    }

    // Clear from DB regardless of whether deauthorize succeeded
    await adminSupabase
      .from('organizations')
      .update({ stripe_connect_connected: false, stripe_connect_account_id: null })
      .eq('id', profile.org_id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
