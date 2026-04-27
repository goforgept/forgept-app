import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateUser, corsHeaders } from "../_shared/auth.ts"

async function refreshQBOToken(supabase: any, org: any) {
  const clientId = Deno.env.get('QBO_CLIENT_ID')!
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET')!
  const credentials = btoa(`${clientId}:${clientSecret}`)

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: org.qbo_refresh_token
    })
  })

  const tokens = await res.json()
  if (!tokens.access_token) throw new Error('Token refresh failed')

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  await supabase.from('organizations').update({
    qbo_access_token: tokens.access_token,
    qbo_refresh_token: tokens.refresh_token || org.qbo_refresh_token,
    qbo_token_expires_at: expiresAt
  }).eq('id', org.id)

  return tokens.access_token
}

async function findOrCreateCustomer(accessToken: string, realmId: string, proposal: any) {
  const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }

  // Search for existing customer
  const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${(proposal.company || proposal.client_name || '').replace(/'/g, "\\'")}'`)
  const searchRes = await fetch(`${baseUrl}/query?query=${query}&minorversion=65`, { headers })
  const searchData = await searchRes.json()
  const existing = searchData?.QueryResponse?.Customer?.[0]
  if (existing) return existing.Id

  // Create new customer
  const createRes = await fetch(`${baseUrl}/customer?minorversion=65`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      DisplayName: proposal.company || proposal.client_name || 'ForgePt Client',
      PrimaryEmailAddr: proposal.client_email ? { Address: proposal.client_email } : undefined,
      CompanyName: proposal.company || '',
      GivenName: (proposal.client_name || '').split(' ')[0] || '',
      FamilyName: (proposal.client_name || '').split(' ').slice(1).join(' ') || '',
    })
  })
  const createData = await createRes.json()
  return createData?.Customer?.Id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error: authError } = await validateUser(req)
  if (authError) return new Response(JSON.stringify({ error: authError }), { status: 401, headers: corsHeaders })

  try {
    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { proposalId } = await req.json()

    // Fetch proposal — scoped to caller's org
    const { data: proposal } = await adminSupabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('org_id', profile.org_id)
      .single()
    if (!proposal) return new Response(JSON.stringify({ error: 'Proposal not found' }), { status: 404, headers: corsHeaders })

    // Fetch org with QBO tokens — scoped to caller's org
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('id, qbo_access_token, qbo_refresh_token, qbo_realm_id, qbo_token_expires_at, qbo_connected')
      .eq('id', profile.org_id)
      .single()

    if (!org?.qbo_connected) return new Response(JSON.stringify({ error: 'QuickBooks not connected' }), { status: 400, headers: corsHeaders })

    // Refresh token if expired
    let accessToken = org.qbo_access_token
    const expiresAt = new Date(org.qbo_token_expires_at)
    if (expiresAt <= new Date(Date.now() + 60000)) {
      accessToken = await refreshQBOToken(supabase, org)
    }

    const realmId = org.qbo_realm_id
    const baseUrl = `https://quickbooks.api.intuit.com/v3/company/${realmId}`
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }

    // Find or create customer
    const customerId = await findOrCreateCustomer(accessToken, realmId, proposal)
    if (!customerId) return new Response(JSON.stringify({ error: 'Could not find or create customer' }), { status: 500, headers: corsHeaders })

    // Fetch line items
    const { data: lineItems } = await supabase
      .from('bom_line_items')
      .select('*')
      .eq('proposal_id', proposalId)

    const laborItems = proposal.labor_items || []

    // Build QBO line items
    const qboLines = []

    // Materials
    for (const item of (lineItems || [])) {
      if (!item.customer_price_unit || !item.quantity) continue
      qboLines.push({
        Amount: (item.customer_price_unit || 0) * (item.quantity || 0),
        DetailType: 'SalesItemLineDetail',
        Description: `${item.item_name}${item.part_number_sku ? ` (${item.part_number_sku})` : ''}`,
        SalesItemLineDetail: {
          Qty: item.quantity,
          UnitPrice: item.customer_price_unit,
          ItemRef: { value: '1', name: 'Services' } // Default item
        }
      })
    }

    // Labor
    for (const labor of laborItems) {
      if (!labor.role || !labor.customer_price) continue
      qboLines.push({
        Amount: parseFloat(labor.customer_price) || 0,
        DetailType: 'SalesItemLineDetail',
        Description: `${labor.role} (${labor.quantity} ${labor.unit || 'hr'})`,
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: parseFloat(labor.customer_price) || 0,
          ItemRef: { value: '1', name: 'Services' }
        }
      })
    }

    // Tax line if applicable
    const taxRate = parseFloat(proposal.tax_rate) || 0
    const taxExempt = proposal.tax_exempt || false
    const matTotal = (lineItems || []).reduce((sum: number, i: any) => sum + (i.customer_price_total || 0), 0)
    if (!taxExempt && taxRate > 0) {
      const taxAmount = matTotal * taxRate / 100
      qboLines.push({
        Amount: taxAmount,
        DetailType: 'SalesItemLineDetail',
        Description: `Sales Tax (${taxRate}%)`,
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: taxAmount,
          ItemRef: { value: '1', name: 'Services' }
        }
      })
    }

    if (qboLines.length === 0) {
      return new Response(JSON.stringify({ error: 'No billable line items found' }), { status: 400, headers: corsHeaders })
    }

    // Create invoice in QBO
    const invoiceBody = {
      Line: qboLines,
      CustomerRef: { value: customerId },
      DocNumber: proposal.quote_number || undefined,
      PrivateNote: `ForgePt proposal: ${proposal.proposal_name}`,
      DueDate: proposal.close_date || undefined,
    }

    const invoiceRes = await fetch(`${baseUrl}/invoice?minorversion=65`, {
      method: 'POST',
      headers,
      body: JSON.stringify(invoiceBody)
    })

    const invoiceData = await invoiceRes.json()
    const invoice = invoiceData?.Invoice

    if (!invoice?.Id) {
      return new Response(JSON.stringify({ error: 'QBO invoice creation failed', detail: invoiceData }), { status: 500, headers: corsHeaders })
    }

    // Store QBO invoice ID on proposal
    await supabase.from('proposals').update({
      qbo_invoice_id: invoice.Id,
      qbo_invoice_number: invoice.DocNumber || ''
    }).eq('id', proposalId)

    // Log activity
    await adminSupabase.from('activities').insert({
      proposal_id: proposalId,
      org_id: profile.org_id,
      user_id: profile.id,
      type: 'note',
      title: `Invoice created in QuickBooks${invoice.DocNumber ? ` — #${invoice.DocNumber}` : ''}`
    })

    return new Response(JSON.stringify({
      success: true,
      invoiceId: invoice.Id,
      invoiceNumber: invoice.DocNumber,
      totalAmt: invoice.TotalAmt
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})