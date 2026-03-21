import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRICE_IDS: Record<string, string> = {
  'Solo':     'price_1TD56GLWULkmrAab38fniIuB',
  'Team':     'price_1TD58BLWULkmrAabCUiTtFPY',
  'Business': 'price_1TD58bLWULkmrAaboF2E1pGR',
}

const ONBOARDING_PRICE_ID = 'price_1TD59bLWULkmrAabU0CW816a'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { orgId, orgName, adminEmail, plan, chargeOnboarding } = await req.json()

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const dbHeaders = {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }

    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }

    // Check if org already has a Stripe customer
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}&select=stripe_customer_id,stripe_subscription_id`,
      { headers: dbHeaders }
    )
    const orgs = await orgRes.json()
    const org = orgs[0]

    let customerId = org?.stripe_customer_id

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customerRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: stripeHeaders,
        body: new URLSearchParams({
          email: adminEmail,
          name: orgName,
          metadata: JSON.stringify({ org_id: orgId })
        })
      })
      const customer = await customerRes.json()
      if (customer.error) throw new Error(`Stripe customer error: ${customer.error.message}`)
      customerId = customer.id

      // Save customer ID to org
      await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
        method: 'PATCH',
        headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ stripe_customer_id: customerId })
      })
    }

    // Cancel existing subscription if upgrading/changing plan
    if (org?.stripe_subscription_id) {
      await fetch(`https://api.stripe.com/v1/subscriptions/${org.stripe_subscription_id}`, {
        method: 'DELETE',
        headers: stripeHeaders
      })
    }

    // Build subscription items
    const priceId = PRICE_IDS[plan]
    if (!priceId) throw new Error(`Unknown plan: ${plan}`)

    const items: string[] = [`items[0][price]=${priceId}`]
    if (chargeOnboarding) {
      items.push(`add_invoice_items[0][price]=${ONBOARDING_PRICE_ID}`)
    }

    // Create subscription
    const subRes = await fetch('https://api.stripe.com/v1/subscriptions', {
      method: 'POST',
      headers: stripeHeaders,
      body: new URLSearchParams([
        ['customer', customerId],
        ['items[0][price]', priceId],
        ...(chargeOnboarding ? [['add_invoice_items[0][price]', ONBOARDING_PRICE_ID]] : []),
        ['payment_behavior', 'default_incomplete'],
        ['payment_settings[save_default_payment_method]', 'on_subscription'],
        ['expand[]', 'latest_invoice.payment_intent'],
        [`metadata[org_id]`, orgId],
        [`metadata[plan]`, plan],
      ].map(([k, v]) => [k, v] as [string, string]))
    })

    const subscription = await subRes.json()
    if (subscription.error) throw new Error(`Stripe subscription error: ${subscription.error.message}`)

    // Update org in Supabase
    const monthlyRate = plan === 'Solo' ? 49 : plan === 'Team' ? 149 : 349
    await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
      method: 'PATCH',
      headers: { ...dbHeaders, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        stripe_subscription_id: subscription.id,
        plan,
        billing_status: subscription.status === 'active' ? 'active' : 'pending',
        monthly_rate: monthlyRate
      })
    })

    return new Response(
      JSON.stringify({
        success: true,
        customerId,
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret ?? null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})