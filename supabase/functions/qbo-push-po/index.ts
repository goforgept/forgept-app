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

async function findOrCreateVendor(
  accessToken: string, realmId: string, vendorName: string, vendorEmail?: string
): Promise<string> {
  const baseUrl = qboBase(realmId)
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  const query = encodeURIComponent(`SELECT * FROM Vendor WHERE DisplayName = '${vendorName.replace(/'/g, "\\'")}'`)
  const searchRes = await fetch(`${baseUrl}/query?query=${query}&minorversion=65`, { headers })
  const searchData = await searchRes.json()
  const existing = searchData?.QueryResponse?.Vendor?.[0]
  if (existing?.Id) return existing.Id

  const createRes = await fetch(`${baseUrl}/vendor?minorversion=65`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      DisplayName: vendorName,
      PrimaryEmailAddr: vendorEmail ? { Address: vendorEmail } : undefined,
    }),
  })
  const createData = await createRes.json()
  const vendorId = createData?.Vendor?.Id
  if (!vendorId) throw new Error(`Could not find or create QBO vendor: ${vendorName}`)
  return vendorId
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { user, profile, error: authError } = await validateUser(req)
    if (authError || !user || !profile) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const adminSupabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { poId } = await req.json()
    if (!poId) return new Response(JSON.stringify({ error: 'poId required' }), { status: 400, headers: corsHeaders })

    // Load the PO
    const { data: po } = await adminSupabase
      .from('purchase_orders')
      .select('*, proposals(proposal_name), jobs(name, job_number)')
      .eq('id', poId)
      .eq('org_id', profile.org_id)
      .single()

    if (!po) return new Response(JSON.stringify({ error: 'PO not found' }), { status: 404, headers: corsHeaders })

    // Load org for QBO credentials
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('id, qbo_access_token, qbo_refresh_token, qbo_realm_id, qbo_token_expires_at, qbo_connected')
      .eq('id', profile.org_id)
      .single()

    if (!org?.qbo_connected) {
      return new Response(JSON.stringify({ error: 'QuickBooks not connected' }), { status: 400, headers: corsHeaders })
    }

    // Refresh token if needed
    let accessToken = org.qbo_access_token
    if (!org.qbo_token_expires_at || new Date(org.qbo_token_expires_at) <= new Date(Date.now() + 60000)) {
      accessToken = await refreshQBOToken(adminSupabase, org)
    }

    const realmId = org.qbo_realm_id
    const baseUrl = qboBase(realmId)
    const qboHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    // Find or create vendor in QBO
    const vendorId = await findOrCreateVendor(accessToken, realmId, po.vendor_name, po.vendor_email || undefined)

    // Load line items — prefer purchase_order_line_items, fall back to bom_line_items
    let lines: any[] = []
    const { data: poItems } = await adminSupabase
      .from('purchase_order_line_items')
      .select('*')
      .eq('po_id', poId)

    if (poItems && poItems.length > 0) {
      lines = poItems
    } else {
      const { data: bomItems } = await adminSupabase
        .from('bom_line_items')
        .select('*')
        .eq('po_number', po.po_number)
      lines = bomItems || []
    }

    if (lines.length === 0) {
      return new Response(JSON.stringify({ error: 'No line items on this PO' }), { status: 400, headers: corsHeaders })
    }

    // Build QBO PO line items
    const qboLines = lines.map((l: any) => {
      const qty = parseFloat(l.quantity || l.qty || '1') || 1
      const unitCost = parseFloat(l.unit_cost || l.your_cost_unit || '0') || 0
      const amount = parseFloat((qty * unitCost).toFixed(2))
      const desc = [l.item_name, l.part_number || l.part_number_sku].filter(Boolean).join(' — ')
      return {
        Amount: amount,
        DetailType: 'ItemBasedExpenseLineDetail',
        Description: desc || 'Item',
        ItemBasedExpenseLineDetail: {
          ItemRef: { value: '1', name: 'Services' },
          Qty: qty,
          UnitPrice: unitCost,
          BillableStatus: 'NotBillable',
        },
      }
    })

    const projectLabel = po.jobs?.job_number
      ? `${po.jobs.job_number} — ${po.jobs.name}`
      : po.proposals?.proposal_name || ''

    const poPayload: any = {
      VendorRef: { value: vendorId },
      Line: qboLines,
      DocNumber: po.po_number,
      POStatus: 'Open',
      Memo: [projectLabel, po.notes].filter(Boolean).join('\n') || undefined,
      TxnDate: new Date().toISOString().split('T')[0],
    }

    // If already pushed, update instead of creating a new one
    let qboPO: any = null
    if (po.qbo_po_id) {
      const fetchRes = await fetch(`${baseUrl}/purchaseorder/${po.qbo_po_id}?minorversion=65`, { headers: qboHeaders })
      const fetchData = await fetchRes.json()
      const existing = fetchData?.PurchaseOrder
      if (existing?.Id) {
        const updateRes = await fetch(`${baseUrl}/purchaseorder?minorversion=65`, {
          method: 'POST',
          headers: qboHeaders,
          body: JSON.stringify({ ...poPayload, Id: existing.Id, SyncToken: existing.SyncToken }),
        })
        const updateData = await updateRes.json()
        qboPO = updateData?.PurchaseOrder
      }
    }

    if (!qboPO?.Id) {
      const createRes = await fetch(`${baseUrl}/purchaseorder?minorversion=65`, {
        method: 'POST',
        headers: qboHeaders,
        body: JSON.stringify(poPayload),
      })
      const createData = await createRes.json()
      qboPO = createData?.PurchaseOrder
    }

    if (!qboPO?.Id) {
      return new Response(JSON.stringify({ error: 'QBO PO creation failed' }), { status: 500, headers: corsHeaders })
    }

    // Store QBO PO ID back on the Forge PO
    await adminSupabase
      .from('purchase_orders')
      .update({ qbo_po_id: qboPO.Id, qbo_po_number: qboPO.DocNumber || po.po_number })
      .eq('id', poId)

    return new Response(JSON.stringify({
      success: true,
      qboPoId: qboPO.Id,
      qboPoNumber: qboPO.DocNumber,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
