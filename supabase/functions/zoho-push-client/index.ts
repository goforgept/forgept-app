import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateUser, corsHeaders } from '../_shared/auth.ts'
import { zohoAuthBase, zohoApiBase } from '../_shared/zoho.ts'

async function refreshToken(supabase: any, org: any) {
  const authBase = zohoAuthBase(org.zoho_dc)
  const res = await fetch(`${authBase}/oauth/v2/token`, {
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
  if (!tokens.access_token) throw new Error('Zoho token refresh failed')
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()
  await supabase.from('organizations').update({
    zoho_access_token: tokens.access_token,
    zoho_token_expires: expiresAt,
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
    const { clientId, contactId, proposalId } = await req.json()

    const { data: org } = await supabase
      .from('organizations')
      .select('id, zoho_access_token, zoho_refresh_token, zoho_token_expires, zoho_crm_connected, zoho_dc')
      .eq('id', profile.org_id)
      .single()

    if (!org?.zoho_crm_connected) return new Response(JSON.stringify({ skipped: true }), { headers: corsHeaders })

    let token = org.zoho_access_token
    if (!org.zoho_token_expires || new Date(org.zoho_token_expires) <= new Date(Date.now() + 60000)) {
      token = await refreshToken(supabase, org)
    }

    const apiBase = zohoApiBase(org.zoho_dc)
    const headers = {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    }

    // ── Push client → Zoho Account ────────────────────────────────────────
    if (clientId) {
      const { data: client } = await supabase
        .from('clients').select('*').eq('id', clientId).single()

      if (client) {
        const acctData = {
          Account_Name: client.company || client.client_name || '',
          Email: client.email || null,
          Phone: client.phone || null,
          Billing_Street: client.address || null,
          Billing_City: client.city || null,
          Billing_State: client.state || null,
          Billing_Code: client.zip || null,
          Website: client.website || null,
        }

        let zohoAccountId = client.zoho_account_id

        if (zohoAccountId) {
          // Update existing
          await fetch(`${apiBase}/crm/v2/Accounts/${zohoAccountId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ data: [acctData] }),
          })
        } else {
          // Create new
          const res = await fetch(`${apiBase}/crm/v2/Accounts`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ data: [acctData] }),
          })
          const body = await res.json()
          zohoAccountId = body?.data?.[0]?.details?.id
          if (zohoAccountId) {
            await supabase.from('clients').update({
              zoho_account_id: String(zohoAccountId),
              zoho_last_sync_at: new Date().toISOString(),
            }).eq('id', clientId)
          }
        }
      }
    }

    // ── Push contact → Zoho Contact ───────────────────────────────────────
    if (contactId) {
      const { data: contact } = await supabase
        .from('client_contacts').select('*, clients(zoho_account_id)').eq('id', contactId).single()

      if (contact) {
        const nameParts = (contact.full_name || '').trim().split(' ')
        const contactData: any = {
          First_Name: nameParts.slice(0, -1).join(' ') || nameParts[0] || '',
          Last_Name: nameParts.slice(-1)[0] || '',
          Email: contact.email || null,
          Phone: contact.phone || null,
          Title: contact.title || null,
        }

        const zohoAcctId = contact.clients?.zoho_account_id
        if (zohoAcctId) contactData.Account_Name = { id: zohoAcctId }

        if (contact.zoho_contact_id) {
          await fetch(`${apiBase}/crm/v2/Contacts/${contact.zoho_contact_id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ data: [contactData] }),
          })
        } else {
          const res = await fetch(`${apiBase}/crm/v2/Contacts`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ data: [contactData] }),
          })
          const body = await res.json()
          const zohoContactId = body?.data?.[0]?.details?.id
          if (zohoContactId) {
            await supabase.from('client_contacts').update({
              zoho_contact_id: String(zohoContactId),
              zoho_last_sync_at: new Date().toISOString(),
            }).eq('id', contactId)
          }
        }
      }
    }

    // ── Push proposal → Zoho Deal ─────────────────────────────────────────
    if (proposalId) {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('id, proposal_name, job_description, proposal_value, close_date, status, client_id, zoho_deal_id, clients(zoho_account_id)')
        .eq('id', proposalId)
        .single()

      if (proposal) {
        const stageMap: Record<string, string> = {
          Draft:  'Qualification',
          Sent:   'Proposal/Price Quote',
          Won:    'Closed Won',
          Lost:   'Closed Lost',
        }
        const dealData: any = {
          Deal_Name:    proposal.proposal_name || proposal.job_description || 'Untitled Deal',
          Amount:       proposal.proposal_value || 0,
          Stage:        stageMap[proposal.status] || 'Qualification',
          Closing_Date: proposal.close_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        }
        const zohoAccountId = (proposal.clients as any)?.zoho_account_id
        if (zohoAccountId) dealData.Account_Name = { id: zohoAccountId }

        if (proposal.zoho_deal_id) {
          await fetch(`${apiBase}/crm/v2/Deals/${proposal.zoho_deal_id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ data: [dealData] }),
          })
        } else {
          const res = await fetch(`${apiBase}/crm/v2/Deals`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ data: [dealData] }),
          })
          const body = await res.json()
          const zohoDealId = body?.data?.[0]?.details?.id
          if (zohoDealId) {
            await supabase.from('proposals').update({
              zoho_deal_id: String(zohoDealId),
            }).eq('id', proposalId)
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
