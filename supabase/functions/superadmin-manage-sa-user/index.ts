import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const saPassword = Deno.env.get('SA_PASSWORD') ?? ''
  const body = await req.json().catch(() => ({})) as Record<string, string>

  if (!body.sa_password || body.sa_password !== saPassword) return json({ error: 'Unauthorized' }, 401)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  if (body.action === 'add') {
    if (!body.email) return json({ error: 'Email required' }, 400)
    const { data: profile, error } = await adminClient
      .from('profiles')
      .select('id, full_name')
      .eq('email', body.email)
      .single()
    if (error || !profile) return json({ error: 'No user found with that email.' }, 404)
    await adminClient.from('profiles').update({ role: 'superadmin' }).eq('id', profile.id)
    return json({ ok: true, name: profile.full_name })
  }

  if (body.action === 'remove') {
    if (!body.user_id) return json({ error: 'user_id required' }, 400)
    await adminClient.from('profiles').update({ role: 'user' }).eq('id', body.user_id)
    return json({ ok: true })
  }

  // ── Roadmap mutations ──────────────────────────────────────────────────────
  if (body.action === 'roadmap_insert') {
    const item = body.item as unknown as Record<string, unknown>
    if (!item?.title) return json({ error: 'title required' }, 400)
    const { data, error } = await adminClient
      .from('roadmap_items')
      .insert([item])
      .select('*, requester:requested_by(full_name, email), org:org_id(name)')
      .single()
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, data })
  }

  if (body.action === 'roadmap_update_status') {
    if (!body.id || !body.status) return json({ error: 'id and status required' }, 400)
    const { error } = await adminClient
      .from('roadmap_items')
      .update({ status: body.status })
      .eq('id', body.id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  if (body.action === 'roadmap_delete') {
    if (!body.id) return json({ error: 'id required' }, 400)
    const { error } = await adminClient
      .from('roadmap_items')
      .delete()
      .eq('id', body.id)
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Unknown action' }, 400)
})
