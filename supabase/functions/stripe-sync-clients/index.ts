import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error: authError } = await validateUser(req)
  if (authError) return new Response(JSON.stringify({ error: authError }), { status: 401, headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!

  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_connect_connected, stripe_connect_account_id')
      .eq('id', profile.org_id)
      .single()

    if (!org?.stripe_connect_connected || !org?.stripe_connect_account_id) {
      return new Response(JSON.stringify({ error: 'Stripe not connected' }), { status: 400, headers: corsHeaders })
    }

    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Stripe-Account': org.stripe_connect_account_id,
    }

    // Load existing ForgePt clients for matching
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, company, client_name, email, stripe_customer_id')
      .eq('org_id', profile.org_id)

    const byStripeId = new Map<string, any>()
    const byEmail = new Map<string, any>()
    for (const c of (existingClients || [])) {
      if (c.stripe_customer_id) byStripeId.set(c.stripe_customer_id, c)
      if (c.email) byEmail.set(c.email.toLowerCase(), c)
    }

    // Paginate through all Stripe customers on the connected account
    let allCustomers: any[] = []
    let startingAfter: string | null = null

    while (true) {
      const params = new URLSearchParams({ limit: '100' })
      if (startingAfter) params.set('starting_after', startingAfter)

      const res = await fetch(`https://api.stripe.com/v1/customers?${params}`, { headers: stripeHeaders })
      const data = await res.json()
      if (data.error) throw new Error(data.error.message)

      allCustomers = allCustomers.concat(data.data || [])
      if (!data.has_more) break
      startingAfter = data.data[data.data.length - 1]?.id
    }

    const now = new Date().toISOString()
    let created = 0, updated = 0, skipped = 0

    for (const customer of allCustomers) {
      if (!customer.email && !customer.name) { skipped++; continue }

      const clientFields = {
        company: customer.name || null,
        email: customer.email || null,
        phone: customer.phone || null,
        address: customer.address?.line1 || null,
        city: customer.address?.city || null,
        state: customer.address?.state || null,
        zip: customer.address?.postal_code || null,
        stripe_customer_id: customer.id,
      }

      // Match by stripe_customer_id
      const existingById = byStripeId.get(customer.id)
      if (existingById) {
        await supabase.from('clients').update(clientFields).eq('id', existingById.id)
        updated++
        continue
      }

      // Match by email
      if (customer.email) {
        const existingByEmail = byEmail.get(customer.email.toLowerCase())
        if (existingByEmail) {
          await supabase.from('clients').update(clientFields).eq('id', existingByEmail.id)
          updated++
          continue
        }
      }

      // Create new client
      await supabase.from('clients').insert({ org_id: profile.org_id, ...clientFields })
      created++
    }

    return new Response(JSON.stringify({ success: true, total: allCustomers.length, created, updated, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
