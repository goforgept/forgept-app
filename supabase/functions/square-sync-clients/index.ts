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
    const { data: org } = await supabase
      .from('organizations')
      .select('square_connected, square_access_token')
      .eq('id', profile.org_id)
      .single()

    if (!org?.square_connected || !org?.square_access_token) {
      return new Response(JSON.stringify({ error: 'Square not connected' }), { status: 400, headers: corsHeaders })
    }

    const sqHeaders = {
      'Authorization': `Bearer ${org.square_access_token}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    }

    // Load existing ForgePt clients for matching
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, company, client_name, email, square_customer_id')
      .eq('org_id', profile.org_id)

    const bySquareId = new Map<string, any>()
    const byEmail = new Map<string, any>()
    for (const c of (existingClients || [])) {
      if (c.square_customer_id) bySquareId.set(c.square_customer_id, c)
      if (c.email) byEmail.set(c.email.toLowerCase(), c)
    }

    // Paginate through all Square customers
    let allCustomers: any[] = []
    let cursor: string | null = null

    while (true) {
      const url = cursor
        ? `${sqBase}/v2/customers?limit=100&cursor=${encodeURIComponent(cursor)}`
        : `${sqBase}/v2/customers?limit=100`
      const listRes = await fetch(url, { headers: sqHeaders })
      const data = await listRes.json()
      if (data.errors?.length > 0) throw new Error(data.errors[0].detail || data.errors[0].code)

      allCustomers = allCustomers.concat(data.customers || [])
      cursor = data.cursor || null
      if (!cursor) break
    }

    const now = new Date().toISOString()
    let created = 0, updated = 0, skipped = 0

    for (const customer of allCustomers) {
      const name = customer.company_name || [customer.given_name, customer.family_name].filter(Boolean).join(' ')
      const email = customer.email_address || null

      if (!name && !email) { skipped++; continue }

      const clientFields = {
        company: customer.company_name || name || null,
        client_name: (!customer.company_name && name) ? name : null,
        email,
        phone: customer.phone_number || null,
        address: customer.address?.address_line_1 || null,
        city: customer.address?.locality || null,
        state: customer.address?.administrative_district_level_1 || null,
        zip: customer.address?.postal_code || null,
        square_customer_id: customer.id,
      }

      // Match by square_customer_id
      const existingById = bySquareId.get(customer.id)
      if (existingById) {
        await supabase.from('clients').update(clientFields).eq('id', existingById.id)
        updated++
        continue
      }

      // Match by email
      if (email) {
        const existingByEmail = byEmail.get(email.toLowerCase())
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
