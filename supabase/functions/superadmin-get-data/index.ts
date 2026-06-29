import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function unauth(msg = 'Unauthorized') {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const saPassword  = Deno.env.get('SA_PASSWORD') ?? ''

  try {
    // Read body once — may contain sa_password for password-based auth
    const body = await req.json().catch(() => ({})) as Record<string, string>

    const authHeader = req.headers.get('Authorization') ?? ''
    let authorized = false

    if (body.sa_password) {
      // Password-based auth — allows access regardless of which user is logged in
      if (!saPassword || body.sa_password !== saPassword) return unauth('Invalid password')
      authorized = true
    } else {
      // Legacy: role-based auth via Bearer token
      if (!authHeader.startsWith('Bearer ')) return unauth()
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } }
      })
      const { data: { user }, error: authError } = await userClient.auth.getUser()
      if (authError || !user) return unauth()
      const { data: callerProfile } = await userClient.from('profiles').select('role').eq('id', user.id).single()
      if (callerProfile?.role !== 'superadmin') return unauth('Forbidden')
      authorized = true
    }

    if (!authorized) return unauth()

    const adminClient = createClient(supabaseUrl, serviceKey)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: profiles, error }, { data: authUsers }, { data: saProfiles }, { data: roadmapItems }, { data: embedSessions }] = await Promise.all([
      adminClient
        .from('profiles')
        .select('id, full_name, email, org_id, role, org_role, company_name, created_at, team_id, is_regional_vp, is_operations_manager')
        .order('created_at', { ascending: false }),
      adminClient.auth.admin.listUsers({ perPage: 1000 }),
      adminClient.from('profiles').select('id, full_name, email, created_at').eq('role', 'superadmin').order('created_at'),
      adminClient
        .from('roadmap_items')
        .select('*, requester:requested_by(full_name, email), org:org_id(company_name)')
        .order('created_at', { ascending: false }),
      adminClient
        .from('embed_sessions')
        .select('org_id, ext_user_id, ext_email, ext_name, created_at')
        .order('created_at', { ascending: false }),
    ])

    if (error) throw error

    const lastSignInMap: Record<string, string> = {}
    for (const u of (authUsers?.users ?? [])) {
      if (u.last_sign_in_at) lastSignInMap[u.id] = u.last_sign_in_at
    }

    const enriched = (profiles || []).map(p => ({
      ...p,
      last_login: lastSignInMap[p.id] ?? null,
    }))

    const enrichedSA = (saProfiles || []).map(p => ({
      ...p,
      last_login: lastSignInMap[p.id] ?? null,
    }))

    // Roll up embed sessions per org for billing view
    const embedByOrg: Record<string, { sessions_total: number; sessions_30d: number; unique_users_total: number; unique_users_30d: number; last_session: string | null }> = {}
    for (const s of (embedSessions || [])) {
      if (!embedByOrg[s.org_id]) embedByOrg[s.org_id] = { sessions_total: 0, sessions_30d: 0, unique_users_total: 0, unique_users_30d: 0, last_session: null }
      const e = embedByOrg[s.org_id]
      e.sessions_total++
      if (s.created_at >= thirtyDaysAgo) e.sessions_30d++
      if (!e.last_session || s.created_at > e.last_session) e.last_session = s.created_at
    }
    // Unique user counts (by ext_user_id per org)
    const userSets: Record<string, { all: Set<string>; month: Set<string> }> = {}
    for (const s of (embedSessions || [])) {
      if (!s.ext_user_id) continue
      if (!userSets[s.org_id]) userSets[s.org_id] = { all: new Set(), month: new Set() }
      userSets[s.org_id].all.add(s.ext_user_id)
      if (s.created_at >= thirtyDaysAgo) userSets[s.org_id].month.add(s.ext_user_id)
    }
    for (const [orgId, sets] of Object.entries(userSets)) {
      if (embedByOrg[orgId]) {
        embedByOrg[orgId].unique_users_total = sets.all.size
        embedByOrg[orgId].unique_users_30d   = sets.month.size
      }
    }

    return new Response(JSON.stringify({ profiles: enriched, sa_users: enrichedSA, roadmap_items: roadmapItems || [], embed_usage: embedByOrg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
