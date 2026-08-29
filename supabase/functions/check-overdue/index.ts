import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Cron-protected endpoint
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  const authHeader = req.headers.get('Authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const todayStr = new Date().toISOString().split('T')[0]
  const inserted: string[] = []

  try {
    // ── 1. OVERDUE SERVICE TICKETS ───────────────────────────────────────
    // Tickets are overdue when scheduled_date is past and not Resolved/Cancelled
    const { data: tickets } = await supabase
      .from('service_tickets')
      .select('id, ticket_number, title, org_id, assigned_tech_id, scheduled_date')
      .lt('scheduled_date', todayStr)
      .not('status', 'in', '("Resolved","Cancelled")')

    if (tickets?.length) {
      // Find org admins (role: admin) for each ticket's org
      const orgIds = [...new Set(tickets.map((t: any) => t.org_id).filter(Boolean))]
      const { data: admins } = await supabase
        .from('profiles')
        .select('id, org_id')
        .in('org_id', orgIds)
        .in('org_role', ['admin'])

      const adminsByOrg: Record<string, string[]> = {}
      for (const a of (admins || [])) {
        if (!adminsByOrg[a.org_id]) adminsByOrg[a.org_id] = []
        adminsByOrg[a.org_id].push(a.id)
      }

      const ticketNotifications: any[] = []
      for (const ticket of tickets) {
        const recipientSet = new Set<string>()
        if (ticket.assigned_tech_id) recipientSet.add(ticket.assigned_tech_id)
        for (const adminId of (adminsByOrg[ticket.org_id] || [])) recipientSet.add(adminId)

        for (const userId of recipientSet) {
          ticketNotifications.push({
            org_id: ticket.org_id,
            user_id: userId,
            type: 'ticket_overdue',
            title: 'Service Ticket Overdue',
            body: `Ticket #${ticket.ticket_number || ''}: "${ticket.title}" was scheduled for ${ticket.scheduled_date} and is past due.`,
            link: `/service-tickets/${ticket.id}`,
            dedup_key: `overdue:ticket:${ticket.id}:${todayStr}`,
          })
        }
      }

      if (ticketNotifications.length) {
        const { error } = await supabase
          .from('notifications')
          .upsert(ticketNotifications, { onConflict: 'user_id,dedup_key', ignoreDuplicates: true })
        if (error) console.error('ticket notifications error:', error)
        else inserted.push(`${ticketNotifications.length} ticket notifications`)
      }
    }

    // ── 2. OVERDUE INVOICES ──────────────────────────────────────────────
    // Overdue when due_date is past and status is Sent or Partially Paid
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, org_id, due_date, proposals(company, client_name)')
      .lt('due_date', todayStr)
      .in('status', ['Sent', 'Partially Paid'])

    if (invoices?.length) {
      const orgIds = [...new Set(invoices.map((i: any) => i.org_id).filter(Boolean))]
      const { data: admins } = await supabase
        .from('profiles')
        .select('id, org_id')
        .in('org_id', orgIds)
        .in('org_role', ['admin'])

      const adminsByOrg: Record<string, string[]> = {}
      for (const a of (admins || [])) {
        if (!adminsByOrg[a.org_id]) adminsByOrg[a.org_id] = []
        adminsByOrg[a.org_id].push(a.id)
      }

      const invoiceNotifications: any[] = []
      for (const inv of invoices) {
        const client = (inv.proposals as any)?.company || (inv.proposals as any)?.client_name || 'Unknown'
        for (const userId of (adminsByOrg[inv.org_id] || [])) {
          invoiceNotifications.push({
            org_id: inv.org_id,
            user_id: userId,
            type: 'invoice_overdue',
            title: 'Invoice Overdue',
            body: `Invoice #${inv.invoice_number || ''} for ${client} was due ${inv.due_date} and is unpaid.`,
            link: `/invoices/${inv.id}`,
            dedup_key: `overdue:invoice:${inv.id}:${todayStr}`,
          })
        }
      }

      if (invoiceNotifications.length) {
        const { error } = await supabase
          .from('notifications')
          .upsert(invoiceNotifications, { onConflict: 'user_id,dedup_key', ignoreDuplicates: true })
        if (error) console.error('invoice notifications error:', error)
        else inserted.push(`${invoiceNotifications.length} invoice notifications`)
      }
    }

    // ── 3. PROPOSALS PAST CLOSE DATE ─────────────────────────────────────
    // Proposals still open (Draft or Sent) but close_date has passed
    const { data: proposals } = await supabase
      .from('proposals')
      .select('id, quote_number, proposal_name, company, client_name, org_id, close_date')
      .lt('close_date', todayStr)
      .in('status', ['Draft', 'Sent'])

    if (proposals?.length) {
      const orgIds = [...new Set(proposals.map((p: any) => p.org_id).filter(Boolean))]
      const { data: admins } = await supabase
        .from('profiles')
        .select('id, org_id')
        .in('org_id', orgIds)
        .in('org_role', ['admin'])

      const adminsByOrg: Record<string, string[]> = {}
      for (const a of (admins || [])) {
        if (!adminsByOrg[a.org_id]) adminsByOrg[a.org_id] = []
        adminsByOrg[a.org_id].push(a.id)
      }

      const proposalNotifications: any[] = []
      for (const p of proposals) {
        const client = p.company || p.client_name || 'Unknown'
        for (const userId of (adminsByOrg[p.org_id] || [])) {
          proposalNotifications.push({
            org_id: p.org_id,
            user_id: userId,
            type: 'proposal_past_close',
            title: 'Proposal Past Close Date',
            body: `Proposal #${p.quote_number || ''} "${p.proposal_name || ''}" for ${client} passed its close date of ${p.close_date} without being closed.`,
            link: `/proposals/${p.id}`,
            dedup_key: `overdue:proposal:${p.id}:${todayStr}`,
          })
        }
      }

      if (proposalNotifications.length) {
        const { error } = await supabase
          .from('notifications')
          .upsert(proposalNotifications, { onConflict: 'user_id,dedup_key', ignoreDuplicates: true })
        if (error) console.error('proposal notifications error:', error)
        else inserted.push(`${proposalNotifications.length} proposal notifications`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, date: todayStr, results: inserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('check-overdue error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
