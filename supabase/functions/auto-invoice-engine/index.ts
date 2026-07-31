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
      `${supabaseUrl}/rest/v1/contracts?auto_invoice=eq.true&status=eq.Active&next_invoice_date=lte.${today}&select=*,proposals(proposal_name,company,client_name,client_email,org_id,user_id)`,
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
      const proposal = contract.proposals
      if (!proposal) continue

      const orgId     = contract.org_id
      const amount    = parseFloat(contract.recurring_fee) || 0
      const frequency = contract.billing_frequency || 'Monthly'
      const daysUntilDue = contract.invoice_days_until_due ?? 30
      const clientEmail  = proposal.client_email
      const company      = proposal.company || contract.name || 'Client'

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
                <p>Hi ${proposal.client_name || company},</p>
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

      created++
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
