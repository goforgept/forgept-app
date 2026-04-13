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

// Refresh Google access token using refresh token
async function refreshGoogleToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json()
    return data.access_token || null
  } catch {
    return null
  }
}

// Refresh Microsoft access token using refresh token
async function refreshMicrosoftToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: 'https://graph.microsoft.com/Calendars.ReadWrite offline_access',
      }),
    })
    const data = await res.json()
    return data.access_token || null
  } catch {
    return null
  }
}

// Build ISO datetime strings for calendar events
function buildEventTimes(date: string, startTime: string | null, durationHours: number) {
  const baseDate = date // YYYY-MM-DD
  const start = startTime
    ? `${baseDate}T${startTime}:00`
    : `${baseDate}T08:00:00`
  const startMs = new Date(start).getTime()
  const endMs = startMs + durationHours * 60 * 60 * 1000
  const end = new Date(endMs).toISOString().slice(0, 19)
  return { start, end }
}

// Push or update a Google Calendar event
async function pushGoogleEvent(
  accessToken: string,
  calendarId: string,
  title: string,
  description: string,
  date: string,
  startTime: string | null,
  durationHours: number,
  existingEventId: string | null,
  timezone: string
): Promise<string | null> {
  const { start, end } = buildEventTimes(date, startTime, durationHours)

  const event = {
    summary: title,
    description,
    start: { dateTime: start, timeZone: timezone || 'America/Chicago' },
    end: { dateTime: end, timeZone: timezone || 'America/Chicago' },
  }

  const cal = calendarId || 'primary'
  const url = existingEventId
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${existingEventId}`
    : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events`

  const res = await fetch(url, {
    method: existingEventId ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Google Calendar error:', err)
    return null
  }

  const data = await res.json()
  return data.id || null
}

// Push or update a Microsoft Calendar event
async function pushMicrosoftEvent(
  accessToken: string,
  title: string,
  description: string,
  date: string,
  startTime: string | null,
  durationHours: number,
  existingEventId: string | null,
  timezone: string
): Promise<string | null> {
  const { start, end } = buildEventTimes(date, startTime, durationHours)

  const event = {
    subject: title,
    body: { contentType: 'text', content: description },
    start: { dateTime: start, timeZone: timezone || 'America/Chicago' },
    end: { dateTime: end, timeZone: timezone || 'America/Chicago' },
  }

  const url = existingEventId
    ? `https://graph.microsoft.com/v1.0/me/events/${existingEventId}`
    : 'https://graph.microsoft.com/v1.0/me/events'

  const res = await fetch(url, {
    method: existingEventId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Microsoft Calendar error:', err)
    return null
  }

  const data = await res.json()
  return data.id || null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const {
      tech_id,           // UUID of the technician
      title,             // Event title
      description,       // Event description
      date,              // YYYY-MM-DD
      start_time,        // HH:MM or null
      duration_hours,    // number
      record_type,       // 'job_schedule' | 'ticket'
      record_id,         // UUID of the job_tech_schedules or service_tickets row
      existing_google_event_id,   // string | null
      existing_microsoft_event_id, // string | null
      timezone,                    // string e.g. 'America/New_York'
    } = body

    if (!tech_id || !title || !date || !record_type || !record_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Fetch tech's calendar tokens
    const { data: techProfile, error: profileError } = await supabase
      .from('profiles')
      .select('google_calendar_connected, google_access_token, google_refresh_token, google_calendar_id, microsoft_calendar_connected, microsoft_access_token, microsoft_refresh_token')
      .eq('id', tech_id)
      .single()

    if (profileError || !techProfile) {
      return new Response(JSON.stringify({ error: 'Tech profile not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    const hours = parseFloat(duration_hours) || 2
    const results: Record<string, string | null> = {
      google_event_id: existing_google_event_id || null,
      microsoft_event_id: existing_microsoft_event_id || null,
    }

    // ── Google Calendar ──
    if (techProfile.google_calendar_connected && techProfile.google_refresh_token) {
      // Always refresh — tokens expire in 1 hour
      const freshToken = await refreshGoogleToken(techProfile.google_refresh_token)
      if (freshToken) {
        // Save refreshed token
        await supabase.from('profiles').update({ google_access_token: freshToken }).eq('id', tech_id)

        const googleEventId = await pushGoogleEvent(
          freshToken,
          techProfile.google_calendar_id || 'primary',
          title,
          description,
          date,
          start_time || null,
          hours,
          existing_google_event_id || null,
          timezone || 'America/Chicago'
        )
        results.google_event_id = googleEventId
      }
    }

    // ── Microsoft Calendar ──
    if (techProfile.microsoft_calendar_connected && techProfile.microsoft_refresh_token) {
      const freshToken = await refreshMicrosoftToken(techProfile.microsoft_refresh_token)
      if (freshToken) {
        await supabase.from('profiles').update({ microsoft_access_token: freshToken }).eq('id', tech_id)

        const msEventId = await pushMicrosoftEvent(
          freshToken,
          title,
          description,
          date,
          start_time || null,
          hours,
          existing_microsoft_event_id || null,
          timezone || 'America/Chicago'
        )
        results.microsoft_event_id = msEventId
      }
    }

    // ── Persist event IDs back to the record ──
    if (record_type === 'job_schedule') {
      await supabase.from('job_tech_schedules').update({
        google_event_id: results.google_event_id,
        microsoft_event_id: results.microsoft_event_id,
      }).eq('id', record_id)
    } else if (record_type === 'ticket') {
      await supabase.from('service_tickets').update({
        google_event_id: results.google_event_id,
        microsoft_event_id: results.microsoft_event_id,
      }).eq('id', record_id)
    }

    return new Response(JSON.stringify({ ok: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('push-calendar-event error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})