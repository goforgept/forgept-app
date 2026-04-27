import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateUser, corsHeaders } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { profile, error } = await validateUser(req)
  if (error) {
    return new Response(JSON.stringify({ error }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Only admins can invite team members
  if (profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { email, fullName, orgId, orgRole } = await req.json()

    // Verify the orgId matches the caller's org — prevent inviting to other orgs
    if (orgId !== profile.org_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const adminSupabase = createClient(supabaseUrl, serviceKey)

    // Invite user via Supabase Admin API
    const inviteRes = await fetch(`${supabaseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        email,
        data: { full_name: fullName, org_id: profile.org_id, org_role: orgRole }
      })
    })

    const inviteData = await inviteRes.json()

    if (!inviteRes.ok) {
      return new Response(JSON.stringify({ error: inviteData.message || 'Failed to send invite' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Pre-create profile scoped to caller's org
    await adminSupabase
      .from('profiles')
      .insert({
        id: inviteData.id,
        email,
        full_name: fullName,
        org_id: profile.org_id,
        org_role: orgRole,
        role: orgRole,
      })

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})