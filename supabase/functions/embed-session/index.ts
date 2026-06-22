import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}
function err(msg: string, status = 400) {
  return json({ error: msg }, status)
}

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function buildJWT(userId: string, userEmail: string, orgId: string): Promise<string> {
  const secret = Deno.env.get('SUPABASE_JWT_SECRET')!
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: 'authenticated',
    exp: now + 86400, // 24 hours
    iat: now,
    iss: `${Deno.env.get('SUPABASE_URL')}/auth/v1`,
    sub: userId,
    email: userEmail,
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { embed_org_id: orgId },
    role: 'authenticated',
    aal: 'aal1',
    session_id: crypto.randomUUID(),
  }

  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const body   = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const data   = `${header}.${body}`
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${data}.${sigB64}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return err('POST required', 405)

  // Verify API key with embed:designer scope
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return err('Missing API key', 401)
  const raw = auth.slice(7).trim()
  if (!raw.startsWith('fpk_')) return err('Invalid API key format', 401)

  const hash = await sha256(raw)
  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, org_id, scopes, is_active')
    .eq('key_hash', hash)
    .single()

  if (!keyRow?.is_active) return err('Invalid or revoked API key', 401)
  if (!keyRow.scopes.includes('embed:designer')) return err('This key does not have the embed:designer scope', 403)

  // Verify org has feature_api enabled
  const { data: org } = await supabase
    .from('organizations')
    .select('feature_api, embed_user_id')
    .eq('id', keyRow.org_id)
    .single()

  if (!org?.feature_api) return err('API access is not enabled for this organization', 403)

  // Update last_used
  supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)

  let embedUserId = org.embed_user_id
  const embedEmail = `embed_${keyRow.org_id}@forgept.internal`

  // Create embed user if it doesn't exist yet
  if (!embedUserId) {
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: embedEmail,
      email_confirm: true,
      user_metadata: { embed_org_id: keyRow.org_id },
    })

    if (createErr || !newUser?.user) return err('Failed to create embed session user', 500)
    embedUserId = newUser.user.id

    // Create profile for embed user
    await supabase.from('profiles').insert({
      id:        embedUserId,
      org_id:    keyRow.org_id,
      org_role:  'rep',
      full_name: 'Embed Session',
      email:     embedEmail,
    })

    // Save embed_user_id on org
    await supabase.from('organizations').update({ embed_user_id: embedUserId }).eq('id', keyRow.org_id)
  }

  // Generate 24h JWT
  const access_token = await buildJWT(embedUserId, embedEmail, keyRow.org_id)
  const expires_at   = new Date(Date.now() + 86400 * 1000).toISOString()

  return json({
    access_token,
    expires_at,
    org_id: keyRow.org_id,
    note: 'Pass access_token to the iframe as ?session=<token>. Do not expose your API key in the browser.'
  })
})
