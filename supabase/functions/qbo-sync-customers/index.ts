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
    const qboHeaders = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }

    // Load existing clients for matching
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

    // Load existing contacts for matching
    const { data: existingContacts } = await supabase
      .from('client_contacts')
      .select('id, client_id, full_name, email, qbo_contact_id')
      .in('client_id', (existingClients || []).map((c: any) => c.id))

    const contactByQboId = new Map<string, any>()
    for (const c of (existingContacts || [])) {
      if (c.qbo_contact_id) contactByQboId.set(c.qbo_contact_id, c)
    }

    // Paginate QBO customers
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

    // Separate top-level and sub-customers; process top-level first so parent
    // client rows exist before we try to link sub-customers as contacts.
    const topLevel = allCustomers.filter(c => !c.ParentRef)
    const subCustomers = allCustomers.filter(c => !!c.ParentRef)

    const now = new Date().toISOString()
    let clientsCreated = 0, clientsUpdated = 0
    let contactsCreated = 0, contactsUpdated = 0, skipped = 0

    // ── 1. Top-level customers → clients table ────────────────────────────────
    for (const customer of topLevel) {
      const qboId = String(customer.Id)
      const contactName = [customer.GivenName, customer.FamilyName].filter(Boolean).join(' ').trim()
      const companyName = customer.CompanyName || customer.DisplayName || ''
      const clientName = contactName || null

      const clientFields = {
        company: companyName || null,
        client_name: clientName || null,
        email: customer.PrimaryEmailAddr?.Address || null,
        phone: customer.PrimaryPhone?.FreeFormNumber || null,
        address: customer.BillAddr?.Line1 || null,
        city: customer.BillAddr?.City || null,
        state: customer.BillAddr?.CountrySubDivisionCode || null,
        zip: customer.BillAddr?.PostalCode || null,
        qbo_customer_id: qboId,
        qbo_last_sync_at: now,
      }

      const existing = byQboId.get(qboId)
      if (existing) {
        await supabase.from('clients').update(clientFields).eq('id', existing.id)
        // Refresh local map with updated id so sub-customers can find it
        byQboId.set(qboId, { ...existing, ...clientFields })
        clientsUpdated++
        continue
      }

      const nameLower = companyName.toLowerCase().trim()
      const existingByName = nameLower ? byName.get(nameLower) : undefined
      if (existingByName) {
        await supabase.from('clients').update(clientFields).eq('id', existingByName.id)
        byQboId.set(qboId, { ...existingByName, ...clientFields })
        clientsUpdated++
        continue
      }

      if (!companyName && !clientName) { skipped++; continue }

      const { data: newClient } = await supabase
        .from('clients')
        .insert({ org_id: profile.org_id, ...clientFields })
        .select('id')
        .single()
      if (newClient) byQboId.set(qboId, { id: newClient.id, ...clientFields })
      clientsCreated++
    }

    // ── 2. Sub-customers → client_contacts table ──────────────────────────────
    for (const customer of subCustomers) {
      const qboId = String(customer.Id)
      const parentQboId = String(customer.ParentRef?.value)
      const parentClient = byQboId.get(parentQboId)

      if (!parentClient) {
        // Parent company doesn't exist in ForgePt — skip this contact
        skipped++
        continue
      }

      const fullName = [customer.GivenName, customer.FamilyName].filter(Boolean).join(' ').trim()
        || customer.DisplayName || ''
      const email = customer.PrimaryEmailAddr?.Address || null
      const phone = customer.PrimaryPhone?.FreeFormNumber || null
      const title = customer.JobDescription || null

      if (!fullName) { skipped++; continue }

      const contactFields = {
        client_id: parentClient.id,
        full_name: fullName,
        email,
        phone,
        title,
        qbo_contact_id: qboId,
      }

      // Match by qbo_contact_id first
      const existingContact = contactByQboId.get(qboId)
      if (existingContact) {
        await supabase.from('client_contacts').update(contactFields).eq('id', existingContact.id)
        contactsUpdated++
        continue
      }

      // Fall back: match by client_id + email
      if (email) {
        const byEmail = (existingContacts || []).find(
          (c: any) => c.client_id === parentClient.id && c.email === email && !c.qbo_contact_id
        )
        if (byEmail) {
          await supabase.from('client_contacts').update(contactFields).eq('id', byEmail.id)
          contactsUpdated++
          continue
        }
      }

      // Fall back: match by client_id + full_name
      const byNameMatch = (existingContacts || []).find(
        (c: any) => c.client_id === parentClient.id &&
          (c.full_name || '').toLowerCase() === fullName.toLowerCase() &&
          !c.qbo_contact_id
      )
      if (byNameMatch) {
        await supabase.from('client_contacts').update(contactFields).eq('id', byNameMatch.id)
        contactsUpdated++
        continue
      }

      await supabase.from('client_contacts').insert(contactFields)
      contactsCreated++
    }

    return new Response(JSON.stringify({
      success: true,
      total: allCustomers.length,
      clients: { created: clientsCreated, updated: clientsUpdated },
      contacts: { created: contactsCreated, updated: contactsUpdated },
      skipped,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
