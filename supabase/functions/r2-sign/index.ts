import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!
const ACCESS_KEY  = Deno.env.get('R2_ACCESS_KEY_ID')!
const SECRET_KEY  = Deno.env.get('R2_SECRET_ACCESS_KEY')!
const BUCKET      = Deno.env.get('R2_BUCKET_NAME')!

// Bucket-specific endpoint
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-file-path, x-file-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

async function sha256hex(data: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hexBuf(data: ArrayBuffer) {
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(key: ArrayBuffer, data: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data))
}

async function hmacHex(key: ArrayBuffer, data: string) {
  const buf = await hmac(key, data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function getSigningKey(secret: string, date: string) {
  const kDate    = await hmac(new TextEncoder().encode(`AWS4${secret}`), date)
  const kRegion  = await hmac(kDate, 'auto')
  const kService = await hmac(kRegion, 's3')
  return hmac(kService, 'aws4_request')
}

async function r2Put(path: string, body: ArrayBuffer, contentType: string) {
  const url  = `${R2_ENDPOINT}/${BUCKET}/${path}`
  const now  = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.toISOString().slice(0, 19).replace(/[-:T]/g, '') + 'Z'

  const payloadHash    = await sha256hexBuf(body)
  const canonicalUri   = `/${BUCKET}/${path}`
  const signedHeaders  = 'content-type;host;x-amz-content-sha256;x-amz-date'
  const host           = new URL(R2_ENDPOINT).host

  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${time}`,
    '',
  ].join('\n')

  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${date}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    time,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join('\n')

  const signingKey = await getSigningKey(SECRET_KEY, date)
  const signature  = await hmacHex(signingKey, stringToSign)

  const authHeader = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization':        authHeader,
      'Content-Type':         contentType,
      'X-Amz-Date':          time,
      'X-Amz-Content-Sha256': payloadHash,
    },
    body,
  })

  return res
}

async function r2GetPresigned(path: string, expiresIn: number) {
  const url  = new URL(`${R2_ENDPOINT}/${BUCKET}/${path}`)
  const now  = new Date()
  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const time = now.toISOString().slice(0, 19).replace(/[-:T]/g, '') + 'Z'
  const host = url.host

  url.searchParams.set('X-Amz-Algorithm',     'AWS4-HMAC-SHA256')
  url.searchParams.set('X-Amz-Credential',    `${ACCESS_KEY}/${date}/auto/s3/aws4_request`)
  url.searchParams.set('X-Amz-Date',          time)
  url.searchParams.set('X-Amz-Expires',       String(expiresIn))
  url.searchParams.set('X-Amz-SignedHeaders', 'host')

  const sortedParams = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

  const canonicalRequest = [
    'GET',
    `/${BUCKET}/${path}`,
    sortedParams,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const credentialScope = `${date}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    time,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join('\n')

  const signingKey = await getSigningKey(SECRET_KEY, date)
  const signature  = await hmacHex(signingKey, stringToSign)

  url.searchParams.set('X-Amz-Signature', signature)
  return url.toString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    if (req.method === 'PUT') {
      const path        = req.headers.get('x-file-path')
      const contentType = req.headers.get('x-file-type') || 'application/octet-stream'
      if (!path) return new Response(JSON.stringify({ error: 'x-file-path required' }), { status: 400, headers: corsHeaders })

      const body  = await req.arrayBuffer()
      const r2Res = await r2Put(path, body, contentType)

      if (!r2Res.ok) {
        const text = await r2Res.text()
        console.error('R2 PUT failed:', r2Res.status, text)
        return new Response(JSON.stringify({ error: `R2 error: ${r2Res.status}` }), { status: 500, headers: corsHeaders })
      }

      return new Response(JSON.stringify({ success: true, path }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST — presigned read URL
    const { path, expiresIn = 3600 } = await req.json()
    if (!path) return new Response(JSON.stringify({ error: 'path required' }), { status: 400, headers: corsHeaders })

    const url = await r2GetPresigned(path, expiresIn)
    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('r2-sign error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
