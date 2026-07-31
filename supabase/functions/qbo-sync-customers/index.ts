import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateUser, corsHeaders } from '../_shared/auth.ts'

function qboBase(realmId: string) {
  const sandbox = Deno.env.get('QBO_SANDBOX') === 'true'
  return sandbox
    ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
    : `https://quickbooks.api.intuit.com/v3/company/${realmId}`
}

async function refreshQBOToken(supabase: any, org: any) {
  const clientId = Deno.env.get('QBO_CLIENT_ID')!
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET')!
  const credentials = btoa(`${clientId}:${clientSecret}`)
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: org.qbo_refresh_token }),
  })
  const tokens = await res.json()
  if (!tokens.access_token) throw new Error('QBO token refresh failed')
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await supabase.from('organizations').update({
    qbo_access_token: tokens.access_token,
    qbo_refresh_token: tokens.refresh_token || org.qbo_refresh_token,
    qbo_token_expires_at: expiresAt,
  }).eq('id', org.id)
  return tokens.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error: authError } = await validateUser(req)
  if (authError) return new Response(JSON.stringify({ error: authError }), { status: 401, headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, qbo_access_token, qbo_refresh_token, qbo_realm_id, qbo_token_expires_at, qbo_connected')
      .eq('id', profile.org_id)
      .single()

    if (!org?.qbo_connected) {
      return new Response(JSON.stringify({ error: 'QuickBooks not connected' }), { status: 400, headers: corsHeaders })
    }

    let token = org.qbo_access_token
    if (!org.qbo_token_expires_at || new Date(org.qbo_token_expires_at) <= new Date(Date.now() + 60000)) {
      token = await refreshQBOToken(supabase, org)
    }

    const baseUrl = qboBase(org.qbo_realm_id)
    const qboHeaders = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    }

    // Fetch all existing ForgePt clients for this org to do matching in memory
    const { data: existingClients } = await supabase
      .from('clients')
      .select('id, company, client_name, qbo_customer_id')
      .eq('org_id', profile.org_id)

    const byQboId = new Map<string, any>()
    const byName = new Map<string, any>()
    for (const c of (existingClients || [])) {
      if (c.qbo_customer_id) byQboId.set(c.qbo_customer_id, c)
      const name = (c.company || c.client_name || '').toLowerCase().trim()
      if (name) byName.set(name, c)
    }

    // Paginate through all active QBO customers
    const pageSize = 1000
    let startPosition = 1
    let allCustomers: any[] = []

    while (true) {
      const query = encodeURIComponent(
        `SELECT * FROM Customer WHERE Active = true MAXRESULTS ${pageSize} STARTPOSITION ${startPosition}`
      )
      const res = await fetch(`${baseUrl}/query?query=${query}&minorversion=65`, { headers: qboHeaders })
      const data = await res.json()
      const page: any[] = data?.QueryResponse?.Customer || []
      allCustomers = allCustomers.concat(page)
      if (page.length < pageSize) break
      startPosition += pageSize
    }

    const now = new Date().toISOString()
    let created = 0, updated = 0, skipped = 0

    for (const customer of allCustomers) {
      const qboId = String(customer.Id)
      const displayName = (customer.CompanyName || customer.DisplayName || '').trim()
      const contactName = [customer.GivenName, customer.FamilyName].filter(Boolean).join(' ').trim()

      const clientFields = {
        company: customer.CompanyName || customer.DisplayName || null,
        client_name: contactName || null,
        email: customer.PrimaryEmailAddr?.Address || null,
        phone: customer.PrimaryPhone?.FreeFormNumber || null,
        address: customer.BillAddr?.Line1 || null,
        city: customer.BillAddr?.City || null,
        state: customer.BillAddr?.CountrySubDivisionCode || null,
        zip: customer.BillAddr?.PostalCode || null,
        qbo_customer_id: qboId,
        qbo_last_sync_at: now,
      }

      // Match by qbo_customer_id first
      const existingById = byQboId.get(qboId)
      if (existingById) {
        await supabase.from('clients').update(clientFields).eq('id', existingById.id)
        updated++
        continue
      }

      // Match by display name (company name)
      const nameLower = displayName.toLowerCase().trim()
      const existingByName = nameLower ? byName.get(nameLower) : undefined
      if (existingByName) {
        await supabase.from('clients').update(clientFields).eq('id', existingByName.id)
        updated++
        continue
      }

      // Skip if no usable name
      if (!displayName && !contactName) { skipped++; continue }

      // Create new ForgePt client
      await supabase.from('clients').insert({
        org_id: profile.org_id,
        ...clientFields,
      })
      created++
    }

    return new Response(JSON.stringify({ success: true, total: allCustomers.length, created, updated, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
