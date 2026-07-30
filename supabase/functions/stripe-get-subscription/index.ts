import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader  = req.headers.get('Authorization') ?? ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY') ?? ''

  // Verify superadmin
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  const { data: profile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })

  try {
    const { orgId } = await req.json()

    const dbHeaders = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    }
    const stripeHeaders = { 'Authorization': `Bearer ${stripeKey}` }

    // Fetch org Stripe IDs
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=stripe_customer_id,stripe_subscription_id`,
      { headers: dbHeaders }
    )
    const orgs = await orgRes.json()
    const org = orgs[0]

    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Fetch customer from Stripe
    const customerRes = await fetch(`https://api.stripe.com/v1/customers/${org.stripe_customer_id}`, { headers: stripeHeaders })
    const customer = await customerRes.json()

    let subscription = null
    let invoiceUrl = null

    if (org.stripe_subscription_id) {
      const subRes = await fetch(
        `https://api.stripe.com/v1/subscriptions/${org.stripe_subscription_id}?expand[]=latest_invoice`,
        { headers: stripeHeaders }
      )
      const sub = await subRes.json()
      if (!sub.error) {
        subscription = {
          id: sub.id,
          status: sub.status,
          current_period_end: sub.current_period_end,
          cancel_at_period_end: sub.cancel_at_period_end,
          amount: sub.items?.data?.[0]?.price?.unit_amount,
          interval: sub.items?.data?.[0]?.price?.recurring?.interval,
          plan_name: sub.metadata?.plan || '',
        }
        // Get hosted invoice URL if incomplete
        if (sub.latest_invoice && sub.status === 'incomplete') {
          invoiceUrl = sub.latest_invoice?.hosted_invoice_url || null
        }

        // Sync billing_status back to Supabase
        const billingStatus =
          sub.status === 'active'    ? 'active'    :
          sub.status === 'past_due'  ? 'past_due'  :
          sub.status === 'canceled'  ? 'cancelled' : 'pending'

        await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
          method: 'PATCH',
          headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ billing_status: billingStatus }),
        })
      }
    }

    return new Response(JSON.stringify({
      connected: true,
      customerId: org.stripe_customer_id,
      customer: { email: customer.email, name: customer.name },
      subscription,
      invoiceUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
