import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID')!
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    })
    const data = await res.json()
    return data.access_token || null
  } catch { return null }
}

async function refreshMicrosoftToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: MICROSOFT_CLIENT_ID, client_secret: MICROSOFT_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token', scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access' }),
    })
    const data = await res.json()
    return data.access_token || null
  } catch { return null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const { tech_id, google_event_id, microsoft_event_id, calendar_id } = await req.json()

    if (!tech_id) return new Response(JSON.stringify({ error: 'Missing tech_id' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })

    const { data: techProfile } = await supabase
      .from('profiles')
      .select('google_calendar_connected, google_refresh_token, google_calendar_id, microsoft_calendar_connected, microsoft_refresh_token')
      .eq('id', tech_id)
      .single()

    if (!techProfile) return new Response(JSON.stringify({ error: 'Tech not found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 })

    // Delete Google event
    if (google_event_id && techProfile.google_calendar_connected && techProfile.google_refresh_token) {
      const token = await refreshGoogleToken(techProfile.google_refresh_token)
      if (token) {
        const cal = encodeURIComponent(calendar_id || techProfile.google_calendar_id || 'primary')
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events/${google_event_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        await supabase.from('profiles').update({ google_access_token: token }).eq('id', tech_id)
      }
    }

    // Delete Microsoft event
    if (microsoft_event_id && techProfile.microsoft_calendar_connected && techProfile.microsoft_refresh_token) {
      const token = await refreshMicrosoftToken(techProfile.microsoft_refresh_token)
      if (token) {
        await fetch(`https://graph.microsoft.com/v1.0/me/events/${microsoft_event_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        await supabase.from('profiles').update({ microsoft_access_token: token }).eq('id', tech_id)
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})