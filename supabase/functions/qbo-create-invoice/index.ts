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

function qboBase(realmId: string) {
  const sandbox = Deno.env.get('QBO_SANDBOX') === 'true'
  return sandbox
    ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
    : `https://quickbooks.api.intuit.com/v3/company/${realmId}`
}

async function findOrCreateCustomer(
  accessToken: string, realmId: string,
  clientName: string, companyName: string,
  clientEmail?: string, phone?: string,
  address?: string, city?: string, state?: string, zip?: string
) {
  const baseUrl = qboBase(realmId)
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }

  const displayName = companyName || clientName || 'ForgePt Client'
  const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`)
  const searchRes = await fetch(`${baseUrl}/query?query=${query}&minorversion=65`, { headers })
  const searchData = await searchRes.json()
  const existing = searchData?.QueryResponse?.Customer?.[0]

  // If customer exists but is missing email, do a sparse update
  if (existing) {
    if (clientEmail && !existing.PrimaryEmailAddr?.Address) {
      const updateBody: any = {
        ...existing,
        PrimaryEmailAddr: { Address: clientEmail },
      }
      if (phone && !existing.PrimaryPhone?.FreeFormNumber) {
        updateBody.PrimaryPhone = { FreeFormNumber: phone }
      }
      await fetch(`${baseUrl}/customer?minorversion=65`, {
        method: 'POST',
        headers,
        body: JSON.stringify(updateBody)
      })
    }
    return existing.Id
  }

  const billingAddr = (address || city || state || zip) ? {
    Line1: address || '',
    City: city || '',
    CountrySubDivisionCode: state || '',
    PostalCode: zip || '',
    Country: 'US',
  } : undefined

  const createRes = await fetch(`${baseUrl}/customer?minorversion=65`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      DisplayName: displayName,
      CompanyName: companyName || '',
      GivenName: (clientName || '').split(' ')[0] || '',
      FamilyName: (clientName || '').split(' ').slice(1).join(' ') || '',
      PrimaryEmailAddr: clientEmail ? { Address: clientEmail } : undefined,
      PrimaryPhone: phone ? { FreeFormNumber: phone } : undefined,
      BillAddr: billingAddr,
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

    const body = await req.json()
    const { invoiceId, proposalId } = body

    if (!invoiceId && !proposalId) {
      return new Response(JSON.stringify({ error: 'invoiceId or proposalId required' }), { status: 400, headers: corsHeaders })
    }

    // Fetch org with QBO tokens
    const { data: org } = await adminSupabase
      .from('organizations')
      .select('id, qbo_access_token, qbo_refresh_token, qbo_realm_id, qbo_token_expires_at, qbo_connected')
      .eq('id', profile.org_id)
      .single()

    if (!org?.qbo_connected) {
      return new Response(JSON.stringify({ error: 'QuickBooks not connected' }), { status: 400, headers: corsHeaders })
    }

    // Refresh token if expired
    let accessToken = org.qbo_access_token
    if (new Date(org.qbo_token_expires_at) <= new Date(Date.now() + 60000)) {
      accessToken = await refreshQBOToken(adminSupabase, org)
    }

    const realmId = org.qbo_realm_id
    const baseUrl = qboBase(realmId)
    const qboHeaders = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }

    let clientName = ''
    let companyName = ''
    let clientEmail = ''
    let clientPhone = ''
    let clientAddress = ''
    let clientCity = ''
    let clientState = ''
    let clientZip = ''
    let docNumber = ''
    let dueDate: string | undefined
    let description = ''
    let qboLines: any[] = []
    let fpInvoiceId: string | null = null
    let totalAmount = 0

    // ── Path A: invoiceId — works for all invoice types ──────────────────────
    if (invoiceId) {
      const { data: inv, error: invErr } = await adminSupabase
        .from('invoices')
        .select('*, proposals(proposal_name, company, client_name, client_email, client_id, quote_number), service_tickets(title, client_id, clients(company, client_name, email, phone, address, city, state, zip))')
        .eq('id', invoiceId)
        .eq('org_id', profile.org_id)
        .single()

      if (!inv) return new Response(JSON.stringify({ error: invErr?.message || 'Invoice not found' }), { status: 404, headers: corsHeaders })

      fpInvoiceId = inv.id

      // Resolve client info — proposal > service ticket > invoice description
      if (inv.proposals) {
        companyName = inv.proposals.company || ''
        clientName  = inv.proposals.client_name || ''
        clientEmail = inv.proposals.client_email || ''
        docNumber   = inv.proposals.quote_number || inv.invoice_number || ''

        // Fetch client record separately for phone/address
        if (inv.proposals.client_id) {
          const { data: cl } = await adminSupabase
            .from('clients')
            .select('email, phone, address, city, state, zip')
            .eq('id', inv.proposals.client_id)
            .single()
          if (cl) {
            clientEmail   = clientEmail || cl.email || ''
            clientPhone   = cl.phone || ''
            clientAddress = cl.address || ''
            clientCity    = cl.city || ''
            clientState   = cl.state || ''
            clientZip     = cl.zip || ''
          }
        }
      } else if (inv.service_tickets) {
        const c = inv.service_tickets.clients
        companyName   = c?.company || ''
        clientName    = c?.client_name || ''
        clientEmail   = c?.email || ''
        clientPhone   = c?.phone || ''
        clientAddress = c?.address || ''
        clientCity    = c?.city || ''
        clientState   = c?.state || ''
        clientZip     = c?.zip || ''
        docNumber     = inv.invoice_number || ''
      } else {
        docNumber = inv.invoice_number || ''
      }

      dueDate     = inv.due_date || undefined
      description = inv.description || ''

      const { data: items } = await adminSupabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('id')

      for (const item of (items || [])) {
        if (!item.total) continue
        qboLines.push({
          Amount: item.total,
          DetailType: 'SalesItemLineDetail',
          Description: item.description || '',
          SalesItemLineDetail: {
            Qty: item.quantity || 1,
            UnitPrice: item.unit_price || item.total,
            ItemRef: { value: '1', name: 'Services' }
          }
        })
        totalAmount += item.total
      }

      // Tax line
      if (inv.tax_amount > 0) {
        qboLines.push({
          Amount: inv.tax_amount,
          DetailType: 'SalesItemLineDetail',
          Description: `Tax (${inv.tax_percent}%)`,
          SalesItemLineDetail: {
            Qty: 1,
            UnitPrice: inv.tax_amount,
            ItemRef: { value: '1', name: 'Services' }
          }
        })
      }

    // ── Path B: proposalId — original behavior ────────────────────────────────
    } else {
      const { data: proposal } = await adminSupabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .eq('org_id', profile.org_id)
        .single()

      if (!proposal) return new Response(JSON.stringify({ error: 'Proposal not found' }), { status: 404, headers: corsHeaders })

      companyName = proposal.company || ''
      clientName  = proposal.client_name || ''
      clientEmail = proposal.client_email || ''
      docNumber   = proposal.quote_number || ''
      dueDate     = proposal.close_date || undefined

      const { data: lineItems } = await adminSupabase
        .from('bom_line_items')
        .select('*')
        .eq('proposal_id', proposalId)

      const laborItems = proposal.labor_items || []
      const taxRate   = parseFloat(proposal.tax_rate) || 0
      const taxExempt = proposal.tax_exempt || false
      let matTotal = 0

      for (const item of (lineItems || [])) {
        if (!item.customer_price_unit || !item.quantity) continue
        const lineTotal = (item.customer_price_unit || 0) * (item.quantity || 0)
        matTotal += lineTotal
        qboLines.push({
          Amount: lineTotal,
          DetailType: 'SalesItemLineDetail',
          Description: `${item.item_name}${item.part_number_sku ? ` (${item.part_number_sku})` : ''}`,
          SalesItemLineDetail: {
            Qty: item.quantity,
            UnitPrice: item.customer_price_unit,
            ItemRef: { value: '1', name: 'Services' }
          }
        })
      }

      for (const labor of laborItems) {
        if (!labor.role || !labor.customer_price) continue
        const amt = parseFloat(labor.customer_price) || 0
        qboLines.push({
          Amount: amt,
          DetailType: 'SalesItemLineDetail',
          Description: `${labor.role} (${labor.quantity} ${labor.unit || 'hr'})`,
          SalesItemLineDetail: {
            Qty: 1,
            UnitPrice: amt,
            ItemRef: { value: '1', name: 'Services' }
          }
        })
      }

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

      // Mirror to ForgePt invoices table
      const invTotal = proposal.total_customer_value || 0
      const taxAmt   = !taxExempt && taxRate > 0 ? matTotal * taxRate / 100 : 0
      const fpNum    = `QBO-${Date.now()}`
      const today    = new Date().toISOString().split('T')[0]

      const { data: existingFP } = await adminSupabase.from('invoices').select('id').eq('proposal_id', proposalId).eq('org_id', profile.org_id).maybeSingle()
      if (existingFP) {
        fpInvoiceId = existingFP.id
        await adminSupabase.from('invoices').update({
          status: 'Sent', subtotal: matTotal, tax_percent: taxRate,
          tax_amount: taxAmt, total: invTotal, balance_due: invTotal,
          issued_date: today, due_date: dueDate || null,
        }).eq('id', existingFP.id)
      } else {
        const { data: newFP } = await adminSupabase.from('invoices').insert({
          org_id: profile.org_id, proposal_id: proposalId,
          invoice_number: fpNum, status: 'Sent', issued_date: today,
          due_date: dueDate || null, subtotal: matTotal,
          tax_percent: taxRate, tax_amount: taxAmt,
          total: invTotal, amount_paid: 0, balance_due: invTotal,
          description: `QuickBooks invoice for ${proposal.proposal_name}`,
        }).select('id').single()
        fpInvoiceId = newFP?.id || null
      }

      totalAmount = invTotal
    }

    if (qboLines.length === 0) {
      return new Response(JSON.stringify({ error: 'No billable line items found' }), { status: 400, headers: corsHeaders })
    }

    // Find or create QBO customer
    const customerId = await findOrCreateCustomer(
      accessToken, realmId, clientName, companyName,
      clientEmail, clientPhone, clientAddress, clientCity, clientState, clientZip
    )
    if (!customerId) return new Response(JSON.stringify({ error: 'Could not find or create QBO customer' }), { status: 500, headers: corsHeaders })

    // Create invoice in QBO
    const invoiceRes = await fetch(`${baseUrl}/invoice?minorversion=65`, {
      method: 'POST',
      headers: qboHeaders,
      body: JSON.stringify({
        Line: qboLines,
        CustomerRef: { value: customerId },
        DocNumber: docNumber || undefined,
        DueDate: dueDate || undefined,
        PrivateNote: description || undefined,
      })
    })

    const invoiceData = await invoiceRes.json()
    const qboInvoice = invoiceData?.Invoice

    if (!qboInvoice?.Id) {
      return new Response(JSON.stringify({ error: 'QBO invoice creation failed', detail: invoiceData }), { status: 500, headers: corsHeaders })
    }

    // Store QBO ID on the ForgePt invoice
    if (fpInvoiceId) {
      await adminSupabase.from('invoices').update({
        qbo_invoice_id: qboInvoice.Id,
        qbo_invoice_number: qboInvoice.DocNumber || '',
      }).eq('id', fpInvoiceId)
    }

    // Also store on proposal if this was a proposal sync
    if (proposalId) {
      await adminSupabase.from('proposals').update({
        qbo_invoice_id: qboInvoice.Id,
        qbo_invoice_number: qboInvoice.DocNumber || '',
      }).eq('id', proposalId)

      await adminSupabase.from('activities').insert({
        proposal_id: proposalId,
        org_id: profile.org_id,
        user_id: profile.id,
        type: 'note',
        source: 'system',
        title: `Invoice pushed to QuickBooks${qboInvoice.DocNumber ? ` — #${qboInvoice.DocNumber}` : ''}`
      })
    }

    return new Response(JSON.stringify({
      success: true,
      invoiceId: qboInvoice.Id,
      invoiceNumber: qboInvoice.DocNumber,
      totalAmt: qboInvoice.TotalAmt,
      fpInvoiceId,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: corsHeaders
    })
  }
})
