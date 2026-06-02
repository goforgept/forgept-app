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

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    // Verify the caller is a superadmin using their token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role to bypass RLS and fetch all profiles + auth last_sign_in_at
    const adminClient = createClient(supabaseUrl, serviceKey)
    const [{ data: profiles, error }, { data: authUsers }] = await Promise.all([
      adminClient
        .from('profiles')
        .select('id, full_name, email, org_id, role, org_role, company_name, created_at, team_id, is_regional_vp, is_operations_manager')
        .order('created_at', { ascending: false }),
      adminClient.auth.admin.listUsers({ perPage: 1000 }),
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

    return new Response(JSON.stringify({ profiles: enriched }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
