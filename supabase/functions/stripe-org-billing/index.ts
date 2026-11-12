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

  // Verify authenticated org admin
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

  const adminClient = createClient(supabaseUrl, supabaseKey)
  const { data: profile } = await adminClient.from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile?.org_id) return new Response(JSON.stringify({ error: 'No organization' }), { status: 403, headers: corsHeaders })
  if (profile.role !== 'admin') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })

  try {
    const orgId = profile.org_id

    // Get org's Stripe customer ID and cached billing info
    const { data: org } = await adminClient
      .from('organizations')
      .select('stripe_customer_id, billing_status, plan, monthly_rate')
      .eq('id', orgId)
      .single()

    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const customerId = org.stripe_customer_id

    // Query subscription from Stripe FDW via RPC wrapper
    const { data: subRows, error: subError } = await adminClient
      .rpc('get_stripe_subs_for_customer', { p_customer: customerId })

    if (subError) {
      console.error('stripe FDW error:', subError)
      // Fall back to cached data from organizations table
      return new Response(JSON.stringify({
        connected: true,
        billing_status: org.billing_status,
        plan: org.plan,
        monthly_rate: org.monthly_rate,
        next_billing_date: null,
        amount: null,
        interval: null,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!subRows || subRows.length === 0) {
      return new Response(JSON.stringify({ connected: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const subRow = subRows.find((r: any) => r.attrs?.status === 'active')
      || subRows.find((r: any) => r.attrs?.status === 'incomplete')
      || subRows[0]

    const attrs = subRow.attrs || {}

    // Compute next billing date from billing_cycle_anchor + interval
    let periodEnd: number | null = attrs.current_period_end || null
    if (!periodEnd || periodEnd < Math.floor(Date.now() / 1000)) {
      const anchor = attrs.billing_cycle_anchor
      const interval: string = attrs.plan?.interval || attrs.items?.data?.[0]?.price?.recurring?.interval || 'year'
      const intervalCount: number = attrs.plan?.interval_count || attrs.items?.data?.[0]?.price?.recurring?.interval_count || 1
      if (anchor) {
        const nextDate = new Date(anchor * 1000)
        const now = new Date()
        if (interval === 'year') {
          while (nextDate <= now) nextDate.setFullYear(nextDate.getFullYear() + intervalCount)
        } else {
          while (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + intervalCount)
        }
        periodEnd = Math.floor(nextDate.getTime() / 1000)
      }
    }

    const amountCents = attrs.items?.data?.[0]?.price?.unit_amount || 0
    const interval    = attrs.items?.data?.[0]?.price?.recurring?.interval || 'year'
    const planName    = attrs.metadata?.plan || org.plan || ''

    return new Response(JSON.stringify({
      connected: true,
      billing_status: attrs.status,
      plan: planName,
      amount: amountCents,
      interval,
      next_billing_date: periodEnd,
      cancel_at_period_end: attrs.cancel_at_period_end || false,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
