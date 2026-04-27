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
    .select('org_id, role, team_id, is_regional_vp, is_operations_manager')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.org_id) {
    return { user: null, profile: null, error: 'Unauthorized' }
  }

  // Get team members if this user is a manager or VP
  let managedTeamIds: string[] = []
  let managedMemberIds: string[] = []

  if (profile.is_regional_vp || profile.is_operations_manager) {
    const { data: managedTeams } = await userSupabase
      .from('teams')
      .select('id')
      .eq('manager_id', user.id)

    managedTeamIds = (managedTeams || []).map((t: any) => t.id)

    if (managedTeamIds.length > 0) {
      const { data: members } = await userSupabase
        .from('team_members')
        .select('profile_id')
        .in('team_id', managedTeamIds)

      managedMemberIds = (members || []).map((m: any) => m.profile_id)
    }
  }

  return { 
    user, 
    profile: {
      ...profile,
      managedTeamIds,
      managedMemberIds,
    }, 
    error: null 
  }
}