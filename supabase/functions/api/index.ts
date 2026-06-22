import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
function err(message: string, status = 400) {
  return json({ error: message }, status)
}

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function verifyKey(authHeader: string | null): Promise<{ orgId: string; scopes: string[]; keyId: string } | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const raw = authHeader.slice(7).trim()
  if (!raw.startsWith('fpk_')) return null

  const hash = await sha256(raw)

  const { data: key } = await supabase
    .from('api_keys')
    .select('id, org_id, scopes, is_active')
    .eq('key_hash', hash)
    .single()

  if (!key?.is_active) return null

  const { data: org } = await supabase
    .from('organizations')
    .select('feature_api')
    .eq('id', key.org_id)
    .single()

  if (!org?.feature_api) return null

  // Fire-and-forget last_used update
  supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)

  return { orgId: key.org_id, scopes: key.scopes, keyId: key.id }
}

function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required) || scopes.includes('read') || scopes.includes('write')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  // Strip the function prefix to get the API path: /functions/v1/api/v1/... → /v1/...
  const path = url.pathname.replace(/^\/functions\/v1\/api/, '') || '/'

  // Public: OpenAPI spec (no auth required)
  if (req.method === 'GET' && (path === '/v1/openapi.json' || path === '/v1/openapi')) {
    return json(buildOpenAPISpec())
  }

  // All other routes require auth
  const auth = req.headers.get('Authorization')
  const keyData = await verifyKey(auth)
  if (!keyData) return err('Invalid or missing API key. Generate one in Settings → API.', 401)

  const { orgId, scopes } = keyData

  // ── GET /v1/proposals ──────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/v1/proposals') {
    if (!hasScope(scopes, 'read:proposals')) return err('This key does not have the proposals scope.', 403)
    const status = url.searchParams.get('status')
    let q = supabase
      .from('proposals')
      .select('id, proposal_name, quote_number, status, close_date, industry, company, client_name, client_email, total_price, total_gross_margin_percent, created_at, updated_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return err(error.message, 500)
    return json({ data, count: data?.length ?? 0 })
  }

  // ── GET /v1/proposals/:id ──────────────────────────────────────────────────
  const proposalMatch = path.match(/^\/v1\/proposals\/([^/]+)$/)
  if (req.method === 'GET' && proposalMatch) {
    if (!hasScope(scopes, 'read:proposals')) return err('This key does not have the proposals scope.', 403)
    const proposalId = proposalMatch[1]
    const [{ data: proposal }, { data: lineItems }, { data: laborItems }] = await Promise.all([
      supabase.from('proposals')
        .select('id, proposal_name, quote_number, status, close_date, industry, company, client_name, client_email, rep_name, scope_of_work, total_price, total_your_cost, total_gross_margin_percent, tax_rate, tax_exempt, signature_name, signature_at, created_at')
        .eq('id', proposalId).eq('org_id', orgId).single(),
      supabase.from('bom_line_items')
        .select('id, item_name, part_number_sku, category, manufacturer, quantity, unit, customer_price_unit, customer_price_total, your_cost_unit, section_name, recurring, renewal_date')
        .eq('proposal_id', proposalId).order('sort_order'),
      supabase.from('labor_line_items')
        .select('id, role, hours, unit, customer_price, your_cost, section_name')
        .eq('proposal_id', proposalId),
    ])
    if (!proposal) return err('Proposal not found.', 404)
    return json({ data: { ...proposal, line_items: lineItems ?? [], labor_items: laborItems ?? [] } })
  }

  // ── POST /v1/proposals ────────────────────────────────────────────────────
  if (req.method === 'POST' && path === '/v1/proposals') {
    if (!hasScope(scopes, 'read:proposals')) return err('This key does not have the proposals scope.', 403)
    let body: any = {}
    try { body = await req.json() } catch { return err('Invalid JSON body', 400) }
    const { proposal_name, company, client_name, client_email, industry, close_date } = body
    if (!proposal_name) return err('proposal_name is required', 400)
    const { data, error } = await supabase.from('proposals').insert({
      org_id:        orgId,
      proposal_name: proposal_name.trim(),
      company:       company ?? null,
      client_name:   client_name ?? null,
      client_email:  client_email ?? null,
      industry:      industry ?? 'Security',
      close_date:    close_date ?? null,
      status:        'Draft',
    }).select('id, proposal_name, quote_number, status, industry, company, client_name, client_email, created_at').single()
    if (error) return err(error.message, 500)
    return json({ data }, 201)
  }

  // ── GET /v1/clients ────────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/v1/clients') {
    if (!hasScope(scopes, 'read:clients')) return err('This key does not have the clients scope.', 403)
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, email, phone, company, address, city, state, zip, created_at')
      .eq('org_id', orgId)
      .order('name')
    if (error) return err(error.message, 500)
    return json({ data, count: data?.length ?? 0 })
  }

  // ── GET /v1/clients/:id ────────────────────────────────────────────────────
  const clientMatch = path.match(/^\/v1\/clients\/([^/]+)$/)
  if (req.method === 'GET' && clientMatch) {
    if (!hasScope(scopes, 'read:clients')) return err('This key does not have the clients scope.', 403)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientMatch[1]).eq('org_id', orgId).single()
    if (error || !data) return err('Client not found.', 404)
    return json({ data })
  }

  // ── GET /v1/jobs ───────────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/v1/jobs') {
    if (!hasScope(scopes, 'read:jobs')) return err('This key does not have the jobs scope.', 403)
    const { data, error } = await supabase
      .from('jobs')
      .select('id, title, status, address, city, state, scheduled_date, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (error) return err(error.message, 500)
    return json({ data, count: data?.length ?? 0 })
  }

  // ── GET /v1/jobs/:id ───────────────────────────────────────────────────────
  const jobMatch = path.match(/^\/v1\/jobs\/([^/]+)$/)
  if (req.method === 'GET' && jobMatch) {
    if (!hasScope(scopes, 'read:jobs')) return err('This key does not have the jobs scope.', 403)
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobMatch[1]).eq('org_id', orgId).single()
    if (error || !data) return err('Job not found.', 404)
    return json({ data })
  }

  // ── GET /v1/drawings ──────────────────────────────────────────────────────
  if (req.method === 'GET' && path === '/v1/drawings') {
    if (!hasScope(scopes, 'read:drawings')) return err('This key does not have the drawings scope.', 403)
    // Return proposals that have at least one drawing sheet
    const { data: sheets } = await supabase
      .from('drawing_sheets')
      .select('proposal_id, proposals!inner(id, proposal_name, quote_number, status, client_name, company)')
      .eq('org_id', orgId)
    if (!sheets) return json({ data: [], count: 0 })
    // Deduplicate by proposal_id
    const seen = new Set<string>()
    const drawings: any[] = []
    for (const s of sheets as any[]) {
      if (!seen.has(s.proposal_id)) {
        seen.add(s.proposal_id)
        drawings.push({
          proposal_id:    s.proposal_id,
          proposal_name:  s.proposals?.proposal_name,
          quote_number:   s.proposals?.quote_number,
          status:         s.proposals?.status,
          client_name:    s.proposals?.client_name,
          company:        s.proposals?.company,
        })
      }
    }
    return json({ data: drawings, count: drawings.length })
  }

  // ── GET /v1/drawings/:proposalId ──────────────────────────────────────────
  const drawingDetailMatch = path.match(/^\/v1\/drawings\/([^/]+)$/)
  if (req.method === 'GET' && drawingDetailMatch) {
    if (!hasScope(scopes, 'read:drawings')) return err('This key does not have the drawings scope.', 403)
    const proposalId = drawingDetailMatch[1]
    // Verify proposal belongs to org
    const { data: proposal } = await supabase
      .from('proposals').select('id, proposal_name, quote_number, status').eq('id', proposalId).eq('org_id', orgId).single()
    if (!proposal) return err('Drawing not found.', 404)
    const { data: sheets } = await supabase
      .from('drawing_sheets')
      .select('id, name, sort_order, created_at')
      .eq('proposal_id', proposalId)
      .neq('storage_path', 'pending')
      .order('sort_order')
    return json({ data: { ...proposal, sheets: sheets ?? [] } })
  }

  // ── GET /v1/drawings/:proposalId/placements ────────────────────────────────
  const placementsMatch = path.match(/^\/v1\/drawings\/([^/]+)\/placements$/)
  if (req.method === 'GET' && placementsMatch) {
    if (!hasScope(scopes, 'read:drawings')) return err('This key does not have the drawings scope.', 403)
    const proposalId = placementsMatch[1]
    const { data: proposal } = await supabase
      .from('proposals').select('id').eq('id', proposalId).eq('org_id', orgId).single()
    if (!proposal) return err('Drawing not found.', 404)
    const { data: sheets } = await supabase
      .from('drawing_sheets').select('id, name').eq('proposal_id', proposalId).neq('storage_path', 'pending')
    const sheetIds = (sheets ?? []).map((s: any) => s.id)
    const sheetMap: Record<string, string> = {}
    ;(sheets ?? []).forEach((s: any) => { sheetMap[s.id] = s.name })
    if (sheetIds.length === 0) return json({ data: [], count: 0 })
    const { data: placements } = await supabase
      .from('drawing_placements')
      .select('id, drawing_sheet_id, device_address, x, y, rotation, quantity, notes, fov_angle, fov_range, part_number_override, manufacturer_override, description_override, global_products(name, part_number, category, manufacturer)')
      .in('drawing_sheet_id', sheetIds)
    const out = (placements ?? []).map((p: any) => ({
      id:             p.id,
      sheet_id:       p.drawing_sheet_id,
      sheet_name:     sheetMap[p.drawing_sheet_id],
      device_address: p.device_address,
      x:              p.x,
      y:              p.y,
      rotation:       p.rotation,
      quantity:       p.quantity ?? 1,
      notes:          p.notes,
      fov_angle:      p.fov_angle,
      fov_range:      p.fov_range,
      part_number:    p.part_number_override || p.global_products?.part_number,
      name:           p.description_override || p.global_products?.name,
      manufacturer:   p.manufacturer_override || p.global_products?.manufacturer,
      category:       p.global_products?.category,
    }))
    return json({ data: out, count: out.length })
  }

  // ── GET /v1/drawings/:proposalId/bom ──────────────────────────────────────
  const drawingBomMatch = path.match(/^\/v1\/drawings\/([^/]+)\/bom$/)
  if (req.method === 'GET' && drawingBomMatch) {
    if (!hasScope(scopes, 'read:drawings')) return err('This key does not have the drawings scope.', 403)
    const proposalId = drawingBomMatch[1]
    const { data: proposal } = await supabase
      .from('proposals').select('id, proposal_name').eq('id', proposalId).eq('org_id', orgId).single()
    if (!proposal) return err('Drawing not found.', 404)
    const { data: sheets } = await supabase
      .from('drawing_sheets').select('id').eq('proposal_id', proposalId).neq('storage_path', 'pending')
    const sheetIds = (sheets ?? []).map((s: any) => s.id)
    if (sheetIds.length === 0) return json({ proposal_id: proposalId, proposal_name: proposal.proposal_name, data: [], count: 0 })
    const { data: placements } = await supabase
      .from('drawing_placements')
      .select('quantity, part_number_override, manufacturer_override, description_override, global_products(name, part_number, category, manufacturer)')
      .in('drawing_sheet_id', sheetIds)
    const bom: Record<string, any> = {}
    for (const p of (placements ?? []) as any[]) {
      const key  = p.part_number_override || p.global_products?.part_number || 'unassigned'
      const qty  = p.quantity ?? 1
      if (bom[key]) { bom[key].quantity += qty }
      else bom[key] = {
        part_number:  key === 'unassigned' ? null : key,
        name:         p.description_override || p.global_products?.name,
        manufacturer: p.manufacturer_override || p.global_products?.manufacturer,
        category:     p.global_products?.category,
        quantity:     qty,
      }
    }
    const data = Object.values(bom).sort((a: any, b: any) => (a.category ?? '').localeCompare(b.category ?? ''))
    return json({ proposal_id: proposalId, proposal_name: proposal.proposal_name, data, count: data.length })
  }

  return err('Endpoint not found. See /v1/openapi.json for available routes.', 404)
})

function buildOpenAPISpec() {
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/api`
  return {
    openapi: '3.0.0',
    info: {
      title: 'ForgePt. API',
      version: '1.0.0',
      description: 'Read proposals, clients, jobs, and designer BOMs. Authenticate with a Bearer token from Settings → API.'
    },
    servers: [{ url: `${base}/v1`, description: 'Production' }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'fpk_...', description: 'API key from Settings → API' }
      }
    },
    paths: {
      '/proposals': {
        get: {
          summary: 'List proposals',
          description: 'Returns all proposals. Filter by status with ?status=Won',
          parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['Draft','Sent','Won','Lost'] } }],
          responses: { '200': { description: 'Array of proposals with status, value, client, close date' } }
        },
        post: {
          summary: 'Create proposal',
          description: 'Create a new proposal/design project. Returns the new proposal including its id, which can be passed to the embed designer.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['proposal_name'], properties: {
              proposal_name: { type: 'string' },
              company:       { type: 'string' },
              client_name:   { type: 'string' },
              client_email:  { type: 'string' },
              industry:      { type: 'string', default: 'Security' },
              close_date:    { type: 'string', format: 'date' },
            }}}}
          },
          responses: { '201': { description: 'Created proposal with id' } }
        }
      },
      '/proposals/{id}': {
        get: {
          summary: 'Get proposal with full BOM',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Proposal with line_items and labor_items arrays' }, '404': { description: 'Not found' } }
        }
      },
      '/clients': {
        get: { summary: 'List clients', responses: { '200': { description: 'Array of clients with contact info' } } }
      },
      '/clients/{id}': {
        get: {
          summary: 'Get client',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Client record' }, '404': { description: 'Not found' } }
        }
      },
      '/jobs': {
        get: { summary: 'List jobs', responses: { '200': { description: 'Array of jobs with status and location' } } }
      },
      '/jobs/{id}': {
        get: {
          summary: 'Get job',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Job record' }, '404': { description: 'Not found' } }
        }
      },
      '/drawings': {
        get: {
          summary: 'List drawings',
          description: 'Returns all proposals that have at least one drawing sheet.',
          responses: { '200': { description: 'Array of { proposal_id, proposal_name, quote_number, status, client_name, company }' } }
        }
      },
      '/drawings/{proposalId}': {
        get: {
          summary: 'Get drawing project',
          description: 'Returns proposal info and list of sheets.',
          parameters: [{ name: 'proposalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Proposal with sheets array' }, '404': { description: 'Not found' } }
        }
      },
      '/drawings/{proposalId}/placements': {
        get: {
          summary: 'Get all device placements',
          description: 'Returns every device placed on every sheet, with position (x/y as 0–1 normalized), label, notes, FOV, and product info.',
          parameters: [{ name: 'proposalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Array of placement records' }, '404': { description: 'Not found' } }
        }
      },
      '/drawings/{proposalId}/bom': {
        get: {
          summary: 'Get drawing BOM',
          description: 'Returns device quantities aggregated by part number across all sheets of a drawing project.',
          parameters: [{ name: 'proposalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Array of { part_number, name, category, manufacturer, quantity } sorted by category' }, '404': { description: 'Not found' } }
        }
      }
    }
  }
}
