import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { validateUser } from "../_shared/auth.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRICE_IDS: Record<string, string> = {
  'Early Adopter Annual': 'price_1TrULWLWULkmrAabcDTNonpU',
  'Early Adopter':        'price_1TrQ8DLWULkmrAabEB6qm1Kg',
  'Designer Only':     'price_1TrQ5rLWULkmrAabaDRGDK06',
  'Small Team':        'price_1TrQ4OLWULkmrAabCpzuU6wH',
  'Team':              'price_1TD58BLWULkmrAabCUiTtFPY',
  'Business':          'price_1TrQ5ILWULkmrAab8dAhQkKR',
  'QuickBooks Add-on': 'price_1TrQ6kLWULkmrAabf33JNWF9',
}

const PLAN_RATES: Record<string, number> = {
  'Early Adopter Annual': 100,  // stored as monthly equivalent for MRR
  'Early Adopter':        100,
  'Designer Only':     49,
  'Small Team':        99,
  'Team':              149,
  'Business':          199,
  'QuickBooks Add-on': 25,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error: authError } = await validateUser(req)
  if (authError) return new Response(JSON.stringify({ error: authError }), { status: 401, headers: corsHeaders })

  if (!profile.is_superadmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
  }

  try {
    const { orgId, orgName, adminEmail, plan, qboAddon } = await req.json()

    const stripeKey    = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const dbHeaders = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    }
    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    const basePriceId = PRICE_IDS[plan]
    if (!basePriceId) throw new Error(`Unknown plan: ${plan}`)
    const qboPriceId = PRICE_IDS['QuickBooks Add-on']

    // Fetch org's current Stripe IDs
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=stripe_customer_id,stripe_subscription_id`,
      { headers: dbHeaders }
    )
    const orgs = await orgRes.json()
    const org = orgs[0]

    let customerId = org?.stripe_customer_id

    // Create Stripe customer if one doesn't exist
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: stripeHeaders,
        body: new URLSearchParams({
          email: adminEmail,
          name: orgName,
          'metadata[org_id]': orgId,
        }),
      })
      const customer = await customerRes.json()
      if (customer.error) throw new Error(`Stripe customer error: ${customer.error.message}`)
      customerId = customer.id

      await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
        method: 'PATCH',
        headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ stripe_customer_id: customerId }),
      })
    }

    let subscriptionId = org?.stripe_subscription_id
    let subscriptionStatus = ''

    if (subscriptionId) {
      // ── Update existing subscription ────────────────────────────────────
      // Fetch current subscription items from Stripe
      const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        headers: stripeHeaders,
      })
      const sub = await subRes.json()

      if (sub.error || sub.status === 'canceled') {
        // Subscription gone — create a fresh one below
        subscriptionId = null
      } else {
        const items: any[] = sub.items?.data || []

        // Find existing base plan item and QBO item
        const baseItem = items.find((i: any) => i.price.id !== qboPriceId)
        const qboItem  = items.find((i: any) => i.price.id === qboPriceId)

        // Update base plan item if price changed
        if (baseItem && baseItem.price.id !== basePriceId) {
          await fetch(`https://api.stripe.com/v1/subscription_items/${baseItem.id}`, {
            method: 'POST',
            headers: stripeHeaders,
            body: new URLSearchParams({ price: basePriceId, 'proration_behavior': 'create_prorations' }),
          })
        }

        // Add QBO add-on if not present and requested
        if (qboAddon && !qboItem) {
          await fetch('https://api.stripe.com/v1/subscription_items', {
            method: 'POST',
            headers: stripeHeaders,
            body: new URLSearchParams({
              subscription: subscriptionId,
              price: qboPriceId,
              'proration_behavior': 'create_prorations',
            }),
          })
        }

        // Remove QBO add-on if present but not requested
        if (!qboAddon && qboItem) {
          await fetch(`https://api.stripe.com/v1/subscription_items/${qboItem.id}`, {
            method: 'DELETE',
            headers: stripeHeaders,
            body: new URLSearchParams({ 'proration_behavior': 'create_prorations' }),
          })
        }

        subscriptionStatus = sub.status
      }
    }

    if (!subscriptionId) {
      // ── Create new subscription ─────────────────────────────────────────
      const items: [string, string][] = [
        ['items[0][price]', basePriceId],
      ]
      if (qboAddon) items.push(['items[1][price]', qboPriceId])

      const subRes = await fetch('https://api.stripe.com/v1/subscriptions', {
        method: 'POST',
        headers: stripeHeaders,
        body: new URLSearchParams([
          ['customer', customerId],
          ...items,
          ['payment_behavior', 'default_incomplete'],
          ['payment_settings[save_default_payment_method]', 'on_subscription'],
          ['expand[]', 'latest_invoice.payment_intent'],
          ['metadata[org_id]', orgId],
          ['metadata[plan]', plan],
        ]),
      })

      const subscription = await subRes.json()
      if (subscription.error) throw new Error(`Stripe subscription error: ${subscription.error.message}`)
      subscriptionId  = subscription.id
      subscriptionStatus = subscription.status
    }

    // Update org in Supabase
    const monthlyRate = (PLAN_RATES[plan] ?? 0) + (qboAddon ? 25 : 0)
    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
      method: 'PATCH',
      headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        stripe_subscription_id: subscriptionId,
        plan,
        quickbooks_addon: qboAddon ?? false,
        billing_status: subscriptionStatus === 'active' ? 'active' : 'pending',
        monthly_rate: monthlyRate,
      }),
    })

    return new Response(JSON.stringify({
      success: true,
      customerId,
      subscriptionId,
      status: subscriptionStatus,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
