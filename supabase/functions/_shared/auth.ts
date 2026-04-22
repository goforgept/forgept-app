import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export async function validateUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, profile: null, error: 'Unauthorized' }
  }

  const userSupabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await userSupabase.auth.getUser()
  if (authError || !user) {
    return { user: null, profile: null, error: 'Unauthorized' }
  }

  const { data: profile, error: profileError } = await userSupabase
    .from('profiles')
    .select('org_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.org_id) {
    return { user: null, profile: null, error: 'Unauthorized' }
  }

  return { user, profile, error: null }
}