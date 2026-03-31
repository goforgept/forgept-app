import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Use anon key client to verify the user token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token', detail: userError?.message }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Use service role for DB queries
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: profile } = await adminClient.from('profiles').select('org_id').eq('id', user.id).single()
    if (!profile?.org_id) {
      return new Response(JSON.stringify({ error: 'No org found for user' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const clientId = Deno.env.get('QBO_CLIENT_ID')!
    const redirectUri = Deno.env.get('QBO_REDIRECT_URI')!
    const scope = 'com.intuit.quickbooks.accounting com.intuit.quickbooks.payment'
    const state = btoa(JSON.stringify({ org_id: profile.org_id, user_id: user.id }))

    const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
      `client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`

    return new Response(JSON.stringify({ url: authUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})