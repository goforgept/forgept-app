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
    const [{ data: profiles, error }, { data: authUsers }, { data: saProfiles }] = await Promise.all([
      adminClient
        .from('profiles')
        .select('id, full_name, email, org_id, role, org_role, company_name, created_at, team_id, is_regional_vp, is_operations_manager')
        .order('created_at', { ascending: false }),
      adminClient.auth.admin.listUsers({ perPage: 1000 }),
      adminClient.from('profiles').select('id, full_name, email, created_at').eq('role', 'superadmin').order('created_at'),
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

    return new Response(JSON.stringify({ profiles: enriched, sa_users: enrichedSA }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
