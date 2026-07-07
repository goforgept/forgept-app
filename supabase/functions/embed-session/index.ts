import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

// Used before we have the key's allowed_origins
const defaultCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function makeCors(requestOrigin: string, allowedOrigins: string[]) {
  // If origins are configured, reflect the specific origin; otherwise open
  const origin = allowedOrigins.length > 0 ? (requestOrigin || '*') : '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function j(data: unknown, cors: Record<string, string>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
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
    exp: now + 7200, // 2 hours
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: defaultCors })
  if (req.method !== 'POST') return j({ error: 'POST required' }, defaultCors, 405)

  const requestOrigin = req.headers.get('Origin') || ''

  // Verify API key
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return j({ error: 'Missing API key' }, defaultCors, 401)
  const raw = auth.slice(7).trim()
  if (!raw.startsWith('fpk_')) return j({ error: 'Invalid API key format' }, defaultCors, 401)

  const hash = await sha256(raw)
  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, org_id, scopes, is_active, allowed_origins, allowed_proposal_ids')
    .eq('key_hash', hash)
    .single()

  if (!keyRow?.is_active) return j({ error: 'Invalid or revoked API key' }, defaultCors, 401)
  if (!keyRow.scopes.includes('embed:designer')) return j({ error: 'This key does not have the embed:designer scope' }, defaultCors, 403)

  const allowedOrigins: string[] = keyRow.allowed_origins || []
  const CORS = makeCors(requestOrigin, allowedOrigins)

  // Reject browser calls from non-whitelisted origins (server-to-server has no Origin header)
  if (requestOrigin && allowedOrigins.length > 0 && !allowedOrigins.includes(requestOrigin)) {
    return j({ error: 'Origin not allowed' }, CORS, 403)
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('feature_api, feature_embed, embed_user_id')
    .eq('id', keyRow.org_id)
    .single()

  if (!org?.feature_api)   return j({ error: 'API access is not enabled for this organization' }, CORS, 403)
  if (!org?.feature_embed) return j({ error: 'Embedded designer is not enabled for this organization' }, CORS, 403)

  supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id)

  const body = await req.json().catch(() => ({})) as {
    user?: { id: string; email?: string; name?: string }
    proposal_id?: string
  }

  // Proposal scoping — if the key restricts which proposals can be embedded, enforce it
  const allowedProposalIds: string[] = keyRow.allowed_proposal_ids || []
  if (allowedProposalIds.length > 0) {
    if (!body.proposal_id) return j({ error: 'This key requires a proposal_id in the request body' }, CORS, 400)
    if (!allowedProposalIds.includes(body.proposal_id)) return j({ error: 'Proposal not authorized for this key' }, CORS, 403)
  }

  let embedUserId: string
  let embedEmail: string
  let extUserId: string | null = null
  let extEmail: string | null  = null
  let extName: string | null   = null

  if (body.user?.id) {
    extUserId = String(body.user.id)
    extEmail  = body.user.email ?? null
    extName   = body.user.name  ?? null

    const userHash = await sha256(keyRow.org_id + extUserId)
    embedEmail = `embed_${userHash.slice(0, 16)}@forgept.internal`

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', embedEmail)
      .single()

    if (existingProfile) {
      embedUserId = existingProfile.id
    } else {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: embedEmail,
        email_confirm: true,
        user_metadata: {
          embed_org_id: keyRow.org_id,
          ext_user_id:  extUserId,
          ext_email:    extEmail,
          ext_name:     extName,
        },
      })
      if (createErr || !newUser?.user) return j({ error: 'Failed to create embed user' }, CORS, 500)
      embedUserId = newUser.user.id

      await supabase.from('profiles').insert({
        id:        embedUserId,
        org_id:    keyRow.org_id,
        org_role:  'embed',
        full_name: extName || extEmail || 'Embed User',
        email:     embedEmail,
      })
    }
  } else {
    embedEmail = `embed_${keyRow.org_id}@forgept.internal`
    let sharedUserId = org.embed_user_id

    if (!sharedUserId) {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: embedEmail,
        email_confirm: true,
        user_metadata: { embed_org_id: keyRow.org_id },
      })
      if (createErr || !newUser?.user) return j({ error: 'Failed to create embed session user' }, CORS, 500)
      sharedUserId = newUser.user.id

      await supabase.from('profiles').insert({
        id:        sharedUserId,
        org_id:    keyRow.org_id,
        org_role:  'embed',
        full_name: 'Embed Session',
        email:     embedEmail,
      })

      await supabase.from('organizations').update({ embed_user_id: sharedUserId }).eq('id', keyRow.org_id)
    }

    embedUserId = sharedUserId
  }

  await supabase.from('embed_sessions').insert({
    org_id:      keyRow.org_id,
    api_key_id:  keyRow.id,
    profile_id:  embedUserId,
    ext_user_id: extUserId,
    ext_email:   extEmail,
    ext_name:    extName,
  })

  const access_token = await buildJWT(embedUserId, embedEmail, keyRow.org_id)
  const expires_at   = new Date(Date.now() + 7200 * 1000).toISOString()

  return j({
    access_token,
    expires_at,
    org_id:  keyRow.org_id,
    user_id: embedUserId,
    ...(body.proposal_id ? { proposal_id: body.proposal_id } : {}),
    note: 'Pass access_token to the iframe as ?session=<token>. Do not expose your API key in the browser.',
  }, CORS)
})
