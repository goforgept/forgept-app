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
    const { clientId } = await req.json()

    const { data: org } = await supabase
      .from('organizations')
      .select('stripe_connect_connected, stripe_connect_account_id')
      .eq('id', profile.org_id)
      .single()

    if (!org?.stripe_connect_connected || !org?.stripe_connect_account_id) {
      return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders })
    }

    const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
    if (!client) return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: corsHeaders })

    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': org.stripe_connect_account_id,
    }

    const name = client.company || client.client_name || ''
    const email = client.email || ''

    // Update existing customer
    if (client.stripe_customer_id) {
      const params = new URLSearchParams({ name })
      if (email) params.set('email', email)
      if (client.phone) params.set('phone', client.phone)
      if (client.address) params.set('address[line1]', client.address)
      if (client.city) params.set('address[city]', client.city)
      if (client.state) params.set('address[state]', client.state)
      if (client.zip) params.set('address[postal_code]', client.zip)

      await fetch(`https://api.stripe.com/v1/customers/${client.stripe_customer_id}`, {
        method: 'POST', headers: stripeHeaders, body: params,
      })
      return new Response(JSON.stringify({ success: true, updated: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Search by email
    let stripeCustomerId = ''
    if (email) {
      const searchRes = await fetch(
        `https://api.stripe.com/v1/customers?email=${encodeURIComponent(email)}&limit=1`,
        { headers: stripeHeaders }
      )
      const searchData = await searchRes.json()
      if (searchData.data?.length > 0) stripeCustomerId = searchData.data[0].id
    }

    // Create if not found
    if (!stripeCustomerId) {
      const params = new URLSearchParams({ name: name || 'Client' })
      if (email) params.set('email', email)
      if (client.phone) params.set('phone', client.phone)
      if (client.address) params.set('address[line1]', client.address)
      if (client.city) params.set('address[city]', client.city)
      if (client.state) params.set('address[state]', client.state)
      if (client.zip) params.set('address[postal_code]', client.zip)
      params.set('metadata[forgept_client_id]', clientId)
      params.set('metadata[forgept_org_id]', profile.org_id)

      const createRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST', headers: stripeHeaders, body: params,
      })
      const created = await createRes.json()
      if (created.error) throw new Error(`Stripe: ${created.error.message}`)
      stripeCustomerId = created.id
    }

    await supabase.from('clients').update({ stripe_customer_id: stripeCustomerId }).eq('id', clientId)

    return new Response(JSON.stringify({ success: true, stripeCustomerId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
