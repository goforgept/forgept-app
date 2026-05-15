import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function del(admin: ReturnType<typeof createClient>, table: string, col: string, ids: string[]) {
  if (!ids.length) return
  const { error } = await admin.from(table).delete().in(col, ids)
  if (error) console.error(`delete ${table}:`, error.message)
}

async function delEq(admin: ReturnType<typeof createClient>, table: string, col: string, val: string) {
  const { error } = await admin.from(table).delete().eq(col, val)
  if (error) console.error(`delete ${table}:`, error.message)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { orgId } = await req.json()
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'orgId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    // Verify caller is a superadmin using their own token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: callerProfile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
    if (callerProfile?.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // All subsequent operations use the service role — bypasses RLS entirely
    const admin = createClient(supabaseUrl, serviceKey)

    // Pre-fetch parent IDs
    const ids = (r: { data: any[] | null }) => r.data?.map((x: any) => x.id) ?? []

    const [proposalIds, jobIds, stIds, sheetIds, clientIds, templateIds, poIds, productLibIds, invoiceIds, orderIds, profileIds] = await Promise.all([
      admin.from('proposals').select('id').eq('org_id', orgId).then(ids),
      admin.from('jobs').select('id').eq('org_id', orgId).then(ids),
      admin.from('service_tickets').select('id').eq('org_id', orgId).then(ids),
      admin.from('drawing_sheets').select('id').eq('org_id', orgId).then(ids),
      admin.from('clients').select('id').eq('org_id', orgId).then(ids),
      admin.from('templates').select('id').eq('org_id', orgId).then(ids),
      admin.from('purchase_orders').select('id').eq('org_id', orgId).then(ids),
      admin.from('product_library').select('id').eq('org_id', orgId).then(ids),
      admin.from('invoices').select('id').eq('org_id', orgId).then(ids),
      admin.from('manufacturer_orders').select('id').eq('org_id', orgId).then(ids),
      admin.from('profiles').select('id').eq('org_id', orgId).then(ids),
    ])

    const placementIds = sheetIds.length
      ? (await admin.from('drawing_placements').select('id').in('drawing_sheet_id', sheetIds)).data?.map((x: any) => x.id) ?? []
      : []

    // Phase 1 — leaf records (nothing references these)
    await Promise.all([
      del(admin, 'placement_components', 'placement_id', placementIds),
      del(admin, 'proposal_activity', 'proposal_id', proposalIds),
      del(admin, 'proposal_photos', 'proposal_id', proposalIds),
      del(admin, 'proposal_sections', 'proposal_id', proposalIds),
      del(admin, 'change_orders', 'proposal_id', proposalIds),
      del(admin, 'rfq_requests', 'proposal_id', proposalIds),
      del(admin, 'bom_line_items', 'proposal_id', proposalIds),
      del(admin, 'drawing_packages', 'proposal_id', proposalIds),
      del(admin, 'job_checklist_items', 'job_id', jobIds),
      del(admin, 'job_photos', 'job_id', jobIds),
      del(admin, 'job_tech_schedules', 'job_id', jobIds),
      del(admin, 'tech_daily_logs', 'job_id', jobIds),
      del(admin, 'service_ticket_photos', 'service_ticket_id', stIds),
      del(admin, 'client_contacts', 'client_id', clientIds),
      del(admin, 'client_locations', 'client_id', clientIds),
      del(admin, 'template_line_items', 'template_id', templateIds),
      del(admin, 'purchase_order_line_items', 'purchase_order_id', poIds),
      del(admin, 'invoice_payments', 'invoice_id', invoiceIds),
      del(admin, 'invoice_line_items', 'invoice_id', invoiceIds),
      del(admin, 'manufacturer_order_items', 'order_id', orderIds),
      del(admin, 'product_library_pricing', 'product_id', productLibIds),
    ])

    // Phase 2 — drawing sheet children
    await Promise.all([
      del(admin, 'drawing_placements', 'drawing_sheet_id', sheetIds),
      del(admin, 'cable_runs', 'drawing_sheet_id', sheetIds),
      del(admin, 'vertical_rises', 'drawing_sheet_id', sheetIds),
    ])

    // Phase 3 — drawing_sheets (proposal_id FK)
    await delEq(admin, 'drawing_sheets', 'org_id', orgId)

    // Phase 4 — proposals (pipeline_stage_id FK)
    await delEq(admin, 'proposals', 'org_id', orgId)

    // Phase 5 — pipeline_stages (org_id FK to organizations)
    await delEq(admin, 'pipeline_stages', 'org_id', orgId)

    // Phase 6 — remaining org-level tables
    await Promise.all([
      delEq(admin, 'activities', 'org_id', orgId),
      delEq(admin, 'jobs', 'org_id', orgId),
      delEq(admin, 'service_tickets', 'org_id', orgId),
      delEq(admin, 'invoices', 'org_id', orgId),
      delEq(admin, 'purchase_orders', 'org_id', orgId),
      delEq(admin, 'manufacturer_orders', 'org_id', orgId),
      delEq(admin, 'clients', 'org_id', orgId),
      delEq(admin, 'templates', 'org_id', orgId),
      delEq(admin, 'vendors', 'org_id', orgId),
      delEq(admin, 'contracts', 'org_id', orgId),
      delEq(admin, 'tasks', 'org_id', orgId),
      delEq(admin, 'product_library', 'org_id', orgId),
      delEq(admin, 'labor_rates', 'org_id', orgId),
      delEq(admin, 'targets', 'org_id', orgId),
      delEq(admin, 'client_emails', 'org_id', orgId),
    ])

    // Phase 7 — delete auth users
    await Promise.allSettled(
      profileIds.map((uid: string) =>
        fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
          method: 'DELETE',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        })
      )
    )

    // Phase 8 — profiles then org
    await delEq(admin, 'profiles', 'org_id', orgId)
    const { error: orgErr } = await admin.from('organizations').delete().eq('id', orgId)
    if (orgErr) throw new Error('org delete failed: ' + orgErr.message)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
