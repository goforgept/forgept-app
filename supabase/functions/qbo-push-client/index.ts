import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateUser, corsHeaders } from '../_shared/auth.ts'

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
    const { clientId } = await req.json()

    const { data: org } = await supabase
      .from('organizations')
      .select('id, qbo_access_token, qbo_refresh_token, qbo_realm_id, qbo_token_expires_at, qbo_connected')
      .eq('id', profile.org_id)
      .single()

    if (!org?.qbo_connected) return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders })

    let token = org.qbo_access_token
    if (!org.qbo_token_expires_at || new Date(org.qbo_token_expires_at) <= new Date(Date.now() + 60000)) {
      token = await refreshQBOToken(supabase, org)
    }

    const { data: client } = await supabase.from('clients').select('*').eq('id', clientId).single()
    if (!client) return new Response(JSON.stringify({ error: 'Client not found' }), { status: 404, headers: corsHeaders })

    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${org.qbo_realm_id}`
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    // If we already have a QBO customer ID, update them
    if (client.qbo_customer_id) {
      const fetchRes = await fetch(`${baseUrl}/customer/${client.qbo_customer_id}?minorversion=65`, { headers })
      const fetchData = await fetchRes.json()
      const existing = fetchData?.Customer
      if (existing) {
        await fetch(`${baseUrl}/customer?minorversion=65`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            Id: existing.Id,
            SyncToken: existing.SyncToken,
            DisplayName: client.company || client.client_name || existing.DisplayName,
            PrimaryEmailAddr: client.email ? { Address: client.email } : existing.PrimaryEmailAddr,
            PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : existing.PrimaryPhone,
            CompanyName: client.company || '',
            BillAddr: (client.address || client.city) ? {
              Line1: client.address || '',
              City: client.city || '',
              CountrySubDivisionCode: client.state || '',
              PostalCode: client.zip || '',
            } : existing.BillAddr,
          }),
        })
        await supabase.from('clients').update({ qbo_last_sync_at: new Date().toISOString() }).eq('id', clientId)
        return new Response(JSON.stringify({ success: true, updated: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    // Search QBO for existing customer by company name
    const displayName = client.company || client.client_name || ''
    const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`)
    const searchRes = await fetch(`${baseUrl}/query?query=${query}&minorversion=65`, { headers })
    const searchData = await searchRes.json()
    const existing = searchData?.QueryResponse?.Customer?.[0]

    let qboCustomerId: string

    if (existing) {
      qboCustomerId = String(existing.Id)
    } else {
      // Create new QBO customer
      const createRes = await fetch(`${baseUrl}/customer?minorversion=65`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          DisplayName: displayName || `ForgePt Client ${clientId.slice(0, 8)}`,
          PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
          PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
          CompanyName: client.company || '',
          GivenName: (client.client_name || '').split(' ')[0] || '',
          FamilyName: (client.client_name || '').split(' ').slice(1).join(' ') || '',
          BillAddr: (client.address || client.city) ? {
            Line1: client.address || '',
            City: client.city || '',
            CountrySubDivisionCode: client.state || '',
            PostalCode: client.zip || '',
          } : undefined,
          WebAddr: client.website ? { URI: client.website } : undefined,
        }),
      })
      const createData = await createRes.json()
      qboCustomerId = String(createData?.Customer?.Id || '')
      if (!qboCustomerId) throw new Error(`QBO customer creation failed: ${JSON.stringify(createData)}`)
    }

    await supabase.from('clients').update({
      qbo_customer_id: qboCustomerId,
      qbo_last_sync_at: new Date().toISOString(),
    }).eq('id', clientId)

    return new Response(JSON.stringify({ success: true, qboCustomerId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
