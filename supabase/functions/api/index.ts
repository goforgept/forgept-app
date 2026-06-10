import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  // ── GET /v1/drawings/:id/bom ───────────────────────────────────────────────
  const drawingMatch = path.match(/^\/v1\/drawings\/([^/]+)\/bom$/)
  if (req.method === 'GET' && drawingMatch) {
    if (!hasScope(scopes, 'read:drawings')) return err('This key does not have the drawings scope.', 403)
    const drawingId = drawingMatch[1]
    const { data: drawing } = await supabase
      .from('proposal_drawings')
      .select('id, name, org_id')
      .eq('id', drawingId).eq('org_id', orgId).single()
    if (!drawing) return err('Drawing not found.', 404)
    const { data: placements } = await supabase
      .from('drawing_placements')
      .select('global_product_id, global_products(name, part_number, category, manufacturer, industry)')
      .eq('drawing_id', drawingId)

    const bom: Record<string, { part_number: string; name: string; category: string; manufacturer: string; industry: string; quantity: number }> = {}
    for (const p of (placements ?? []) as any[]) {
      const prod = p.global_products
      if (!prod) continue
      if (bom[prod.part_number]) bom[prod.part_number].quantity++
      else bom[prod.part_number] = { ...prod, quantity: 1 }
    }
    return json({ drawing_id: drawingId, drawing_name: drawing.name, data: Object.values(bom) })
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
      '/drawings/{id}/bom': {
        get: {
          summary: 'Get drawing BOM',
          description: 'Returns device quantities aggregated by part number from a floor plan.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { '200': { description: 'Array of { part_number, name, category, manufacturer, quantity }' } }
        }
      }
    }
  }
}
