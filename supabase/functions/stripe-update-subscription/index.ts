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
  const adminClient = createClient(supabaseUrl, supabaseKey)
  const { data: profile } = await adminClient.from('profiles').select('role, is_superadmin').eq('id', user.id).single()
  if (profile?.role !== 'superadmin' && !profile?.is_superadmin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })

  try {
    // orgId: the org to update
    // newAmountDollars: the new total price (e.g. 1500 for $1,500)
    // interval: 'year' | 'month'
    // planName: optional label to update in subscription metadata
    // proration: 'create_prorations' | 'none'
    const { orgId, newAmountDollars, interval, planName, proration } = await req.json()

    if (!orgId || !newAmountDollars || newAmountDollars <= 0) {
      return new Response(JSON.stringify({ error: 'orgId and newAmountDollars are required' }), { status: 400, headers: corsHeaders })
    }

    const dbHeaders = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    }
    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    // Get org's stripe_customer_id
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=stripe_customer_id,plan`,
      { headers: dbHeaders }
    )
    const orgs = await orgRes.json()
    const org = orgs[0]
    if (!org?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'No Stripe customer found for this org' }), { status: 400, headers: corsHeaders })
    }

    const customerId = org.stripe_customer_id

    // Get the active subscription from FDW
    const { data: subRows, error: subError } = await adminClient
      .rpc('get_stripe_subs_for_customer', { p_customer: customerId })

    if (subError || !subRows?.length) {
      return new Response(JSON.stringify({ error: 'No active subscription found' }), { status: 400, headers: corsHeaders })
    }

    const subRow = subRows.find((r: any) => r.attrs?.status === 'active')
      || subRows.find((r: any) => r.attrs?.status === 'incomplete')
      || subRows[0]

    const attrs = subRow.attrs || {}
    const subscriptionId = subRow.id
    const items: any[] = attrs.items?.data || []

    if (!items.length) {
      return new Response(JSON.stringify({ error: 'Subscription has no items' }), { status: 400, headers: corsHeaders })
    }

    // Find the base plan item (not the QBO add-on)
    const QBO_PRICE_ID = 'price_1TrQ6kLWULkmrAabf33JNWF9'
    const baseItem = items.find((i: any) => i.price?.id !== QBO_PRICE_ID) || items[0]
    const productId = baseItem.price?.product

    if (!productId) {
      return new Response(JSON.stringify({ error: 'Could not determine Stripe product ID from subscription' }), { status: 400, headers: corsHeaders })
    }

    const newAmountCents = Math.round(newAmountDollars * 100)
    const billingInterval = interval || 'year'
    const prorationBehavior = proration || 'none'

    console.log('stripe-update-subscription: orgId=', orgId, 'subId=', subscriptionId, 'itemId=', baseItem.id, 'product=', productId, 'amount=', newAmountCents, 'interval=', billingInterval)

    // Update the subscription item with new price_data (custom amount)
    const updateParams = new URLSearchParams({
      'price_data[currency]':                  'usd',
      'price_data[unit_amount]':               String(newAmountCents),
      'price_data[recurring][interval]':       billingInterval,
      'price_data[product]':                   productId,
      'proration_behavior':                    prorationBehavior,
    })

    const itemRes = await fetch(`https://api.stripe.com/v1/subscription_items/${baseItem.id}`, {
      method: 'POST',
      headers: stripeHeaders,
      body: updateParams,
    })
    const itemData = await itemRes.json()
    if (itemData.error) throw new Error(`Stripe error: ${itemData.error.message}`)

    // Update subscription metadata with new plan name if provided
    if (planName) {
      await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        method: 'POST',
        headers: stripeHeaders,
        body: new URLSearchParams({ 'metadata[plan]': planName }),
      })
    }

    // Sync new rate back to organizations
    const newMonthlyRate = billingInterval === 'year'
      ? Math.round(newAmountDollars / 12)
      : newAmountDollars

    const syncPayload: Record<string, unknown> = { monthly_rate: newMonthlyRate }
    if (planName) syncPayload.plan = planName

    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
      method: 'PATCH',
      headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify(syncPayload),
    })

    return new Response(JSON.stringify({
      success: true,
      subscriptionId,
      newAmountCents,
      interval: billingInterval,
      proration: prorationBehavior,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    console.error('stripe-update-subscription error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
