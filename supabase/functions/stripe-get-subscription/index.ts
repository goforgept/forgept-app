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

    // Fetch org — only need stripe_customer_id
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=stripe_customer_id`,
      { headers: dbHeaders }
    )
    const orgs = await orgRes.json()
    const org = orgs[0]

    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const customerId = org.stripe_customer_id

    // Fetch subscriptions for this customer directly from Stripe (no DB column needed)
    const subsRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&limit=5&expand[]=data.latest_invoice`,
      { headers: stripeHeaders }
    )
    const subsData = await subsRes.json()

    // Customer was deleted in Stripe — clear it from our DB
    if (subsData?.error?.code === 'resource_missing' || subsData?.error?.type === 'invalid_request_error') {
      await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
        method: 'PATCH',
        headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ stripe_customer_id: null, billing_status: 'trial' }),
      })
      return new Response(JSON.stringify({ connected: false, cleared: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    let subscription = null
    let invoiceUrl = null

    if (subsData?.data?.length > 0) {
      // Prefer active, then incomplete, then most recent
      const sub = subsData.data.find((s: any) => s.status === 'active')
        || subsData.data.find((s: any) => s.status === 'incomplete')
        || subsData.data[0]

      subscription = {
        id: sub.id,
        status: sub.status,
        current_period_end: sub.current_period_end,
        due_date: sub.latest_invoice?.due_date ?? null,
        cancel_at_period_end: sub.cancel_at_period_end,
        amount: sub.items?.data?.[0]?.price?.unit_amount,
        interval: sub.items?.data?.[0]?.price?.recurring?.interval,
        plan_name: sub.metadata?.plan || sub.items?.data?.[0]?.price?.nickname || '',
        collection_method: sub.collection_method,
      }

      if (sub.latest_invoice?.hosted_invoice_url) {
        invoiceUrl = sub.latest_invoice.hosted_invoice_url
      }

      // Sync billing_status, plan, monthly_rate back to Supabase
      const billingStatus =
        sub.status === 'active'    ? 'active'    :
        sub.status === 'past_due'  ? 'past_due'  :
        sub.status === 'canceled'  ? 'cancelled' : 'pending'

      const planName    = sub.metadata?.plan || null
      const amountCents = sub.items?.data?.[0]?.price?.unit_amount || 0
      const interval    = sub.items?.data?.[0]?.price?.recurring?.interval || 'month'
      const monthlyRate = interval === 'year'
        ? Math.round(amountCents / 12 / 100)
        : Math.round(amountCents / 100)

      const syncPayload: Record<string, unknown> = { billing_status: billingStatus, monthly_rate: monthlyRate }
      if (planName) syncPayload.plan = planName

      await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
        method: 'PATCH',
        headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify(syncPayload),
      })
    }

    return new Response(JSON.stringify({
      connected: true,
      customerId,
      subscription,
      invoiceUrl,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
