import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateUser, corsHeaders } from '../_shared/auth.ts'

async function refreshToken(supabase: any, org: any) {
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('ZOHO_CLIENT_ID')!,
      client_secret: Deno.env.get('ZOHO_CLIENT_SECRET')!,
      refresh_token: org.zoho_refresh_token,
    }),
  })
  const tokens = await res.json()
  if (!tokens.access_token) throw new Error(`Zoho token refresh failed: ${tokens.error || tokens.message || JSON.stringify(tokens)}`)
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
  await supabase.from('organizations').update({
    zoho_access_token: tokens.access_token,
    zoho_token_expires: expiresAt,
  }).eq('id', org.id)
  return tokens.access_token
}

async function fetchAll(token: string, module: string) {
  const records: any[] = []
  let page = 1
  while (true) {
    const res = await fetch(
      `https://www.zohoapis.com/crm/v2/${module}?page=${page}&per_page=200`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    )
    if (res.status === 204) break // no records
    const body = await res.json()
    // Surface Zoho API errors instead of silently returning 0 records
    if (body.status === 'error' || body.code) {
      throw new Error(`Zoho ${module} API error: ${body.message || body.code || JSON.stringify(body)}`)
    }
    if (!body.data?.length) break
    records.push(...body.data)
    if (!body.info?.more_records) break
    page++
  }
  return records
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
      .select('id, zoho_access_token, zoho_refresh_token, zoho_token_expires, zoho_crm_connected')
      .eq('id', profile.org_id)
      .single()

    if (!org?.zoho_crm_connected) {
      return new Response(JSON.stringify({ error: 'Zoho CRM not connected' }), { status: 400, headers: corsHeaders })
    }

    if (!org.zoho_refresh_token) {
      return new Response(JSON.stringify({ error: 'No Zoho refresh token — please disconnect and reconnect Zoho CRM.' }), { status: 400, headers: corsHeaders })
    }

    // Always refresh — Zoho tokens expire in 1 hour, safer to always get a fresh one
    let token: string
    try {
      token = await refreshToken(supabase, org)
    } catch (err: any) {
      return new Response(JSON.stringify({ error: `Token refresh failed: ${err.message} — try disconnecting and reconnecting Zoho CRM.` }), { status: 401, headers: corsHeaders })
    }

    // ── Accounts → clients ───────────────────────────────────────────────
    const accounts = await fetchAll(token, 'Accounts')
    let accountsAdded = 0, accountsUpdated = 0

    for (const acct of accounts) {
      const now = new Date().toISOString()
      const payload = {
        org_id: profile.org_id,
        company: acct.Account_Name || '',
        email: acct.Email || null,
        phone: acct.Phone || null,
        address: acct.Billing_Street || null,
        city: acct.Billing_City || null,
        state: acct.Billing_State || null,
        zip: acct.Billing_Code || null,
        website: acct.Website || null,
        zoho_account_id: String(acct.id),
        zoho_last_sync_at: now,
      }

      // Match by zoho_account_id first
      const { data: byZoho } = await supabase
        .from('clients').select('id')
        .eq('org_id', profile.org_id)
        .eq('zoho_account_id', String(acct.id))
        .maybeSingle()

      if (byZoho) {
        await supabase.from('clients').update(payload).eq('id', byZoho.id)
        accountsUpdated++
      } else {
        // Fall back: match by company name (no zoho_account_id yet)
        const { data: byName } = await supabase
          .from('clients').select('id')
          .eq('org_id', profile.org_id)
          .ilike('company', acct.Account_Name || '')
          .is('zoho_account_id', null)
          .maybeSingle()

        if (byName) {
          await supabase.from('clients').update(payload).eq('id', byName.id)
          accountsUpdated++
        } else {
          await supabase.from('clients').insert(payload)
          accountsAdded++
        }
      }
    }

    // Build zoho_account_id → ForgePt client id map for contact linking
    const { data: clientRows } = await supabase
      .from('clients').select('id, zoho_account_id')
      .eq('org_id', profile.org_id)
      .not('zoho_account_id', 'is', null)

    const accountMap: Record<string, string> = {}
    ;(clientRows || []).forEach((c: any) => { accountMap[c.zoho_account_id] = c.id })

    // ── Contacts → client_contacts ────────────────────────────────────────
    const contacts = await fetchAll(token, 'Contacts')
    let contactsAdded = 0, contactsUpdated = 0

    for (const c of contacts) {
      const fullName = [c.First_Name, c.Last_Name].filter(Boolean).join(' ')
      const zohoAccountId = c.Account_Name?.id ? String(c.Account_Name.id) : null
      const clientId = zohoAccountId ? accountMap[zohoAccountId] : null
      const now = new Date().toISOString()

      const payload = {
        org_id: profile.org_id,
        client_id: clientId || null,
        full_name: fullName || c.Email || 'Unknown',
        title: c.Title || null,
        email: c.Email || null,
        phone: c.Phone || null,
        zoho_contact_id: String(c.id),
        zoho_last_sync_at: now,
      }

      const { data: byZoho } = await supabase
        .from('client_contacts').select('id')
        .eq('org_id', profile.org_id)
        .eq('zoho_contact_id', String(c.id))
        .maybeSingle()

      if (byZoho) {
        await supabase.from('client_contacts').update(payload).eq('id', byZoho.id)
        contactsUpdated++
      } else {
        // Fall back: match by email
        const { data: byEmail } = c.Email ? await supabase
          .from('client_contacts').select('id')
          .eq('org_id', profile.org_id)
          .eq('email', c.Email)
          .is('zoho_contact_id', null)
          .maybeSingle() : { data: null }

        if (byEmail) {
          await supabase.from('client_contacts').update(payload).eq('id', byEmail.id)
          contactsUpdated++
        } else {
          await supabase.from('client_contacts').insert(payload)
          contactsAdded++
        }
      }
    }

    // Record last sync time
    await supabase.from('organizations').update({ zoho_last_sync_at: new Date().toISOString() }).eq('id', profile.org_id)

    return new Response(JSON.stringify({
      success: true,
      accounts: { added: accountsAdded, updated: accountsUpdated },
      contacts: { added: contactsAdded, updated: contactsUpdated },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
