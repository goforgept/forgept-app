import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Zoho sends notifications here when Accounts or Contacts change.
// URL: .../zoho-webhook?org_id={org_id}&token={zoho_webhook_token}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const orgId = url.searchParams.get('org_id')
  const token = url.searchParams.get('token')

  if (!orgId) return new Response('Bad Request', { status: 400 })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Verify token
  const { data: org } = await supabase
    .from('organizations')
    .select('id, zoho_access_token, zoho_refresh_token, zoho_token_expires, zoho_crm_connected, zoho_webhook_token')
    .eq('id', orgId)
    .single()

  if (!org?.zoho_crm_connected) return new Response('Not connected', { status: 403 })
  if (org.zoho_webhook_token && token !== org.zoho_webhook_token) return new Response('Forbidden', { status: 403 })

  let body: any
  try { body = await req.json() } catch { return new Response('Bad Request', { status: 400 }) }

  // Zoho notification payload shape: { module: "Accounts"|"Contacts", data: [{...}] }
  const module = body?.module as string
  const records: any[] = body?.data || []

  const now = new Date().toISOString()

  for (const record of records) {
    if (!record.id) continue

    if (module === 'Accounts') {
      const payload = {
        company: record.Account_Name || undefined,
        email: record.Email || undefined,
        phone: record.Phone || undefined,
        address: record.Billing_Street || undefined,
        city: record.Billing_City || undefined,
        state: record.Billing_State || undefined,
        zip: record.Billing_Code || undefined,
        website: record.Website || undefined,
        zoho_last_sync_at: now,
      }
      // Remove undefined keys
      Object.keys(payload).forEach(k => (payload as any)[k] === undefined && delete (payload as any)[k])

      const { data: existing } = await supabase
        .from('clients').select('id')
        .eq('org_id', orgId)
        .eq('zoho_account_id', String(record.id))
        .maybeSingle()

      if (existing) {
        await supabase.from('clients').update(payload).eq('id', existing.id)
      } else if (record.Account_Name) {
        // New account — create in ForgePt
        await supabase.from('clients').insert({
          org_id: orgId,
          company: record.Account_Name,
          email: record.Email || null,
          phone: record.Phone || null,
          zoho_account_id: String(record.id),
          zoho_last_sync_at: now,
        })
      }

    } else if (module === 'Contacts') {
      const fullName = [record.First_Name, record.Last_Name].filter(Boolean).join(' ')
      const zohoAccountId = record.Account_Name?.id ? String(record.Account_Name.id) : null

      let clientId: string | null = null
      if (zohoAccountId) {
        const { data: cl } = await supabase
          .from('clients').select('id')
          .eq('org_id', orgId)
          .eq('zoho_account_id', zohoAccountId)
          .maybeSingle()
        clientId = cl?.id || null
      }

      const payload = {
        full_name: fullName || record.Email || undefined,
        title: record.Title || undefined,
        email: record.Email || undefined,
        phone: record.Phone || undefined,
        client_id: clientId || undefined,
        zoho_last_sync_at: now,
      }
      Object.keys(payload).forEach(k => (payload as any)[k] === undefined && delete (payload as any)[k])

      const { data: existing } = await supabase
        .from('client_contacts').select('id')
        .eq('org_id', orgId)
        .eq('zoho_contact_id', String(record.id))
        .maybeSingle()

      if (existing) {
        await supabase.from('client_contacts').update(payload).eq('id', existing.id)
      } else if (fullName || record.Email) {
        await supabase.from('client_contacts').insert({
          org_id: orgId,
          client_id: clientId,
          full_name: fullName || record.Email || 'Unknown',
          title: record.Title || null,
          email: record.Email || null,
          phone: record.Phone || null,
          zoho_contact_id: String(record.id),
          zoho_last_sync_at: now,
        })
      }
    }
  }

  return new Response('ok', { status: 200 })
})
