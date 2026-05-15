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

    // Verify the caller is a superadmin
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

    const { data: callerProfile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (callerProfile?.role !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Use service role to fetch all profile IDs for the org
    const adminClient = createClient(supabaseUrl, serviceKey)
    const { data: profiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)

    if (profilesError) throw new Error(profilesError.message)

    const userIds = (profiles || []).map((p: { id: string }) => p.id)

    // Delete each auth user via the Admin API
    const results = await Promise.allSettled(
      userIds.map(uid =>
        fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
          method: 'DELETE',
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        })
      )
    )

    const failures = results
      .map((r, i) => ({ uid: userIds[i], r }))
      .filter(({ r }) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))

    if (failures.length > 0) {
      console.error('Some auth users could not be deleted:', failures.map(f => f.uid))
    }

    return new Response(
      JSON.stringify({ deleted: userIds.length - failures.length, failed: failures.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
