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
  const squareAppId = (Deno.env.get('SQUARE_APP_ID') ?? '').trim()
  const sqBase = squareAppId.startsWith('sandbox-')
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

  try {
    const { clientId } = await req.json()

    const { data: org } = await supabase
      .from('organizations')
      .select('square_connected, square_access_token')
      .eq('id', profile.org_id)
      .single()

    if (!org?.square_connected || !org?.square_access_token) {
      return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders })
    }

    const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
    if (!client) return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: corsHeaders })

    const sqHeaders = {
      'Authorization': `Bearer ${org.square_access_token}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    }

    const name = client.company || client.client_name || 'Client'
    const email = client.email || ''

    // Update existing Square customer
    if (client.square_customer_id) {
      await fetch(`${sqBase}/v2/customers/${client.square_customer_id}`, {
        method: 'PUT',
        headers: sqHeaders,
        body: JSON.stringify({
          company_name: name,
          email_address: email || undefined,
          phone_number: client.phone || undefined,
          address: client.address ? {
            address_line_1: client.address,
            locality: client.city || '',
            administrative_district_level_1: client.state || '',
            postal_code: client.zip || '',
            country: 'US',
          } : undefined,
        }),
      })
      return new Response(JSON.stringify({ success: true, updated: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Search by email
    let squareCustomerId = ''
    if (email) {
      const searchRes = await fetch(`${sqBase}/v2/customers/search`, {
        method: 'POST',
        headers: sqHeaders,
        body: JSON.stringify({ query: { filter: { email_address: { exact: email } } } }),
      })
      const searchData = await searchRes.json()
      if (searchData.customers?.length > 0) squareCustomerId = searchData.customers[0].id
    }

    // Create if not found
    if (!squareCustomerId) {
      const createRes = await fetch(`${sqBase}/v2/customers`, {
        method: 'POST',
        headers: sqHeaders,
        body: JSON.stringify({
          company_name: name,
          email_address: email || undefined,
          phone_number: client.phone || undefined,
          reference_id: clientId,
          address: client.address ? {
            address_line_1: client.address,
            locality: client.city || '',
            administrative_district_level_1: client.state || '',
            postal_code: client.zip || '',
            country: 'US',
          } : undefined,
        }),
      })
      const created = await createRes.json()
      if (created.errors?.length > 0) throw new Error(`Square: ${created.errors[0].detail || created.errors[0].code}`)
      squareCustomerId = created.customer?.id
    }

    if (squareCustomerId) {
      await supabase.from('clients').update({ square_customer_id: squareCustomerId }).eq('id', clientId)
    }

    return new Response(JSON.stringify({ success: true, squareCustomerId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
