import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { sendEmail } from "../_shared/email.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function addInterval(dateStr: string, frequency: string): string {
  const d = new Date(dateStr)
  const f = (frequency || 'Monthly').toLowerCase()
  if (f === 'weekly')          d.setDate(d.getDate() + 7)
  else if (f === 'quarterly')  d.setMonth(d.getMonth() + 3)
  else if (f === 'annual' || f === 'annually' || f === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else                          d.setMonth(d.getMonth() + 1) // monthly default
  return d.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  const authHeader = req.headers.get('Authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  const db = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  try {
    const today = new Date().toISOString().split('T')[0]

    // Find all active contracts with auto_invoice on and next_invoice_date due today or overdue
    const contractsRes = await fetch(
      `${supabaseUrl}/rest/v1/contracts?auto_invoice=eq.true&status=eq.Active&next_invoice_date=lte.${today}&select=*,proposals(proposal_name,company,client_name,client_email,org_id,user_id),clients(company,contact_name,email),organizations(qbo_connected,qbo_access_token,qbo_refresh_token,qbo_realm_id,qbo_token_expires_at)`,
      { headers: db }
    )
    const contracts = await contractsRes.json()

    if (!Array.isArray(contracts) || contracts.length === 0) {
      return new Response(JSON.stringify({ message: 'No invoices due today', created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let created = 0

    for (const contract of contracts) {
      // Support both proposal-linked and standalone (no proposal) contracts
      const proposal = contract.proposals
      const client = contract.clients
      if (!proposal && !client) continue

      const orgId     = contract.org_id
      const amount    = parseFloat(contract.recurring_fee) || 0
      const frequency = contract.billing_frequency || 'Monthly'
      const daysUntilDue = contract.invoice_days_until_due ?? 30
      const clientEmail  = proposal?.client_email ?? client?.email ?? null
      const company      = proposal?.company ?? client?.company ?? contract.name ?? 'Client'

      if (amount <= 0) continue

      // Get next invoice number for this org
      const numRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/get_next_invoice_number`,
        {
          method: 'POST',
          headers: db,
          body: JSON.stringify({ org_id_input: orgId }),
        }
      )
      const invoiceNumber = await numRes.json()

      const issuedDate = today
      const dueDate = (() => {
        const d = new Date(today)
        d.setDate(d.getDate() + daysUntilDue)
        return d.toISOString().split('T')[0]
      })()

      // Create the invoice
      const invRes = await fetch(`${supabaseUrl}/rest/v1/invoices`, {
        method: 'POST',
        headers: { ...db, 'Prefer': 'return=representation' },
        body: JSON.stringify({
          org_id: orgId,
          proposal_id: contract.proposal_id || null,
          client_id: contract.client_id || null,
          invoice_number: invoiceNumber,
          status: 'Sent',
          issued_date: issuedDate,
          due_date: dueDate,
          subtotal: amount,
          tax_percent: 0,
          tax_amount: 0,
          total: amount,
          amount_paid: 0,
          balance_due: amount,
          description: `${contract.name || 'Service Agreement'} — ${frequency} Fee`,
          notes: `Auto-generated recurring invoice for ${company}.`,
          contract_id: contract.id,
        }),
      })
      const invData = await invRes.json()
      const invoice = Array.isArray(invData) ? invData[0] : invData
      if (!invoice?.id) continue

      // Create line item
      await fetch(`${supabaseUrl}/rest/v1/invoice_line_items`, {
        method: 'POST',
        headers: { ...db, 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          invoice_id: invoice.id,
          description: `${contract.name || 'Service Agreement'} — ${frequency} Fee`,
          quantity: 1,
          unit_price: amount,
          total: amount,
        }),
      })

      // Bump next_invoice_date
      const nextDate = addInterval(today, frequency)
      await fetch(`${supabaseUrl}/rest/v1/contracts?id=eq.${contract.id}`, {
        method: 'PATCH',
        headers: { ...db, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ next_invoice_date: nextDate }),
      })

      // Email the client
      if (clientEmail) {
        const invoiceUrl = `https://app.goforgept.com/invoices/${invoice.id}`
        await sendEmail({
          to: clientEmail,
          subject: `Invoice #${invoiceNumber} from ${company} — $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <div style="background:#0F1C2E;padding:20px 28px;">
                <span style="color:#ffffff;font-size:20px;font-weight:bold;">ForgePt.</span>
              </div>
              <div style="padding:28px;">
                <h2 style="color:#0F1C2E;margin-top:0;">Invoice #${invoiceNumber}</h2>
                <p>Hi ${proposal?.client_name ?? client?.contact_name ?? company},</p>
                <p>Please find your invoice for <strong>${contract.name || 'Service Agreement'}</strong> below.</p>
                <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;">
                  <p style="margin:4px 0;"><strong>${contract.name || 'Service Agreement'} — ${frequency} Fee</strong></p>
                  <p style="margin:4px 0;color:#555;">Due: ${new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  <p style="margin:12px 0 0;font-size:20px;font-weight:bold;color:#C8622A;">$${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
                <p><a href="${invoiceUrl}" style="background:#C8622A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View Invoice →</a></p>
                <p style="color:#888;font-size:12px;margin-top:24px;">If you have questions about this invoice, please contact us.</p>
              </div>
            </div>
          `,
          fromName: 'ForgePt.',
        })
      }

      // Notify all org admins via in-app notification
      const adminsRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?org_id=eq.${orgId}&org_role=eq.admin&select=id`,
        { headers: db }
      )
      const admins = await adminsRes.json()
      if (Array.isArray(admins) && admins.length > 0) {
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...db, 'Prefer': 'return=minimal' },
          body: JSON.stringify(
            admins.map((a: any) => ({
              user_id: a.id,
              type: 'invoice_sent',
              title: `Invoice sent to ${company}`,
              body: `#${invoiceNumber} · $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} · due ${new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
              link: `/invoices/${invoice.id}`,
              read: false,
            }))
          ),
        })
      }

      // Auto-push to QuickBooks if org has it connected
      const orgQbo = (contract as any).organizations
      if (orgQbo?.qbo_connected && invoice?.id) {
        try {
          let accessToken = orgQbo.qbo_access_token
          // Refresh token if expired
          if (new Date(orgQbo.qbo_token_expires_at) <= new Date(Date.now() + 60000)) {
            const qboClientId     = Deno.env.get('QBO_CLIENT_ID') ?? ''
            const qboClientSecret = Deno.env.get('QBO_CLIENT_SECRET') ?? ''
            const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${btoa(`${qboClientId}:${qboClientSecret}`)}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
              },
              body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: orgQbo.qbo_refresh_token }),
            })
            const tokens = await tokenRes.json()
            if (tokens.access_token) {
              accessToken = tokens.access_token
              await fetch(`${supabaseUrl}/rest/v1/organizations?id=eq.${orgId}`, {
                method: 'PATCH',
                headers: { ...db, 'Prefer': 'return=minimal' },
                body: JSON.stringify({
                  qbo_access_token: tokens.access_token,
                  qbo_refresh_token: tokens.refresh_token || orgQbo.qbo_refresh_token,
                  qbo_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
                }),
              })
            }
          }

          const realmId = orgQbo.qbo_realm_id
          const qboHeaders = {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }
          const qboBase = `https://quickbooks.api.intuit.com/v3/company/${realmId}`

          // Find or create QBO customer
          const displayName = company
          const custQuery = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${displayName.replace(/'/g, "\\'")}'`)
          const custSearch = await fetch(`${qboBase}/query?query=${custQuery}&minorversion=65`, { headers: qboHeaders })
          const custData   = await custSearch.json()
          let customerId   = custData?.QueryResponse?.Customer?.[0]?.Id

          if (!customerId) {
            const createCust = await fetch(`${qboBase}/customer?minorversion=65`, {
              method: 'POST',
              headers: qboHeaders,
              body: JSON.stringify({ DisplayName: displayName, PrimaryEmailAddr: clientEmail ? { Address: clientEmail } : undefined }),
            })
            const cc = await createCust.json()
            customerId = cc?.Customer?.Id
          }

          if (customerId) {
            const qboInvRes = await fetch(`${qboBase}/invoice?minorversion=65`, {
              method: 'POST',
              headers: qboHeaders,
              body: JSON.stringify({
                CustomerRef: { value: customerId },
                DocNumber: invoiceNumber,
                DueDate: dueDate,
                PrivateNote: `Auto-generated recurring invoice — ${contract.name}`,
                Line: [{
                  Amount: amount,
                  DetailType: 'SalesItemLineDetail',
                  Description: `${contract.name || 'Service Agreement'} — ${frequency} Fee`,
                  SalesItemLineDetail: { Qty: 1, UnitPrice: amount, ItemRef: { value: '1', name: 'Services' } },
                }],
              }),
            })
            const qboInvData = await qboInvRes.json()
            const qboInv = qboInvData?.Invoice
            if (qboInv?.Id) {
              await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${invoice.id}`, {
                method: 'PATCH',
                headers: { ...db, 'Prefer': 'return=minimal' },
                body: JSON.stringify({ qbo_invoice_id: qboInv.Id, qbo_invoice_number: qboInv.DocNumber || '' }),
              })
            }
          }
        } catch (_) {
          // QBO push failure should not block invoice creation
        }
      }

      created++
    }

    // ── Recurring BOM line items ───────────────────────────────────────────────
    const bomRes = await fetch(
      `${supabaseUrl}/rest/v1/bom_line_items?recurring=eq.true&auto_invoice=eq.true&next_invoice_date=lte.${today}&select=*,proposals(id,proposal_name,company,client_name,client_email,org_id,user_id)`,
      { headers: db }
    )
    const bomItems = await bomRes.json()

    if (Array.isArray(bomItems) && bomItems.length > 0) {
      // Group by proposal so we create one invoice per proposal
      const byProposal: Record<string, any[]> = {}
      for (const item of bomItems) {
        const pid = item.proposal_id
        if (!byProposal[pid]) byProposal[pid] = []
        byProposal[pid].push(item)
      }

      for (const [proposalId, items] of Object.entries(byProposal)) {
        const proposal = items[0].proposals
        if (!proposal) continue

        const orgId      = proposal.org_id
        const company    = proposal.company || proposal.client_name || 'Client'
        const clientEmail = proposal.client_email
        const totalAmt   = items.reduce((s: number, i: any) => s + (parseFloat(i.customer_price_total) || 0), 0)

        const numRes2 = await fetch(`${supabaseUrl}/rest/v1/rpc/get_next_invoice_number`, {
          method: 'POST', headers: db, body: JSON.stringify({ org_id_input: orgId }),
        })
        const invoiceNumber2 = await numRes2.json()

        const daysUntilDue2 = 30
        const dueDate2 = (() => {
          const d = new Date(today); d.setDate(d.getDate() + daysUntilDue2)
          return d.toISOString().split('T')[0]
        })()

        const invRes2 = await fetch(`${supabaseUrl}/rest/v1/invoices`, {
          method: 'POST',
          headers: { ...db, 'Prefer': 'return=representation' },
          body: JSON.stringify({
            org_id: orgId,
            proposal_id: proposalId,
            invoice_number: invoiceNumber2,
            status: 'Sent',
            issued_date: today,
            due_date: dueDate2,
            subtotal: totalAmt,
            tax_percent: 0,
            tax_amount: 0,
            total: totalAmt,
            amount_paid: 0,
            balance_due: totalAmt,
            description: `Recurring items — ${proposal.proposal_name}`,
            notes: `Auto-generated recurring invoice for ${company}.`,
          }),
        })
        const invData2 = await invRes2.json()
        const invoice2 = Array.isArray(invData2) ? invData2[0] : invData2
        if (!invoice2?.id) continue

        // Create line items
        await fetch(`${supabaseUrl}/rest/v1/invoice_line_items`, {
          method: 'POST',
          headers: { ...db, 'Prefer': 'return=minimal' },
          body: JSON.stringify(
            items.map((i: any) => ({
              invoice_id: invoice2.id,
              description: `${i.item_name} (${i.billing_frequency || 'Annual'})`,
              quantity: i.quantity || 1,
              unit_price: parseFloat(i.customer_price_unit) || 0,
              total: parseFloat(i.customer_price_total) || 0,
            }))
          ),
        })

        // Bump next_invoice_date on each item
        for (const item of items) {
          const nextDate2 = addInterval(today, item.billing_frequency || 'Annual')
          await fetch(`${supabaseUrl}/rest/v1/bom_line_items?id=eq.${item.id}`, {
            method: 'PATCH',
            headers: { ...db, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ next_invoice_date: nextDate2 }),
          })
        }

        // Email client
        if (clientEmail) {
          await sendEmail({
            to: clientEmail,
            subject: `Invoice #${invoiceNumber2} — $${totalAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <div style="background:#0F1C2E;padding:20px 28px;"><span style="color:#ffffff;font-size:20px;font-weight:bold;">ForgePt.</span></div>
                <div style="padding:28px;">
                  <h2 style="color:#0F1C2E;margin-top:0;">Invoice #${invoiceNumber2}</h2>
                  <p>Hi ${proposal.client_name || company},</p>
                  <p>Your recurring invoice for <strong>${proposal.proposal_name}</strong> is ready.</p>
                  <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;">
                    ${items.map((i: any) => `<p style="margin:4px 0;">• ${i.item_name} — $${(parseFloat(i.customer_price_total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>`).join('')}
                    <p style="margin:12px 0 0;font-size:18px;font-weight:bold;color:#C8622A;">Total: $${totalAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <p>Due: ${new Date(dueDate2).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  <p><a href="https://app.goforgept.com/invoices/${invoice2.id}" style="background:#C8622A;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View Invoice →</a></p>
                </div>
              </div>
            `,
            fromName: 'ForgePt.',
          })
        }

        // Notify org admins
        const adminsRes2 = await fetch(
          `${supabaseUrl}/rest/v1/profiles?org_id=eq.${orgId}&org_role=eq.admin&select=id`,
          { headers: db }
        )
        const admins2 = await adminsRes2.json()
        if (Array.isArray(admins2) && admins2.length > 0) {
          await fetch(`${supabaseUrl}/rest/v1/notifications`, {
            method: 'POST',
            headers: { ...db, 'Prefer': 'return=minimal' },
            body: JSON.stringify(
              admins2.map((a: any) => ({
                user_id: a.id,
                type: 'invoice_sent',
                title: `Invoice sent to ${company}`,
                body: `#${invoiceNumber2} · $${totalAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })} · due ${new Date(dueDate2).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
                link: `/invoices/${invoice2.id}`,
                read: false,
              }))
            ),
          })
        }

        created++
      }
    }

    return new Response(JSON.stringify({ success: true, created }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message ?? 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
