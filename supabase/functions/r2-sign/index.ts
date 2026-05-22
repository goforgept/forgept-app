import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!
const ACCESS_KEY  = Deno.env.get('R2_ACCESS_KEY_ID')!
const SECRET_KEY  = Deno.env.get('R2_SECRET_ACCESS_KEY')!
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`

// Bucket routing
const BUCKETS = {
  'floor-plans': 'forgept-floor-plans',
  'documents':   'forgept-documents',
  'photos':      'forgept-photos',
  'assets':      'forgept-assets',
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-file-path, x-file-type, x-bucket, x-public-token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

const aws = new AwsClient({
  accessKeyId:     ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  service:         's3',
  region:          'auto',
})

const unauthorized = (msg = 'Unauthorized') =>
  new Response(JSON.stringify({ error: msg }), { status: 401, headers: corsHeaders })

const forbidden = () =>
  new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader  = req.headers.get('Authorization')
    const publicToken = req.headers.get('x-public-token')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
    )

    let orgId: string | null = null
    let isPublicAccess = false

    if (authHeader) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) return unauthorized()

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id, role')
        .eq('id', user.id)
        .single()

      if (!profile?.org_id) return unauthorized('No org found')
      orgId = profile.org_id

    } else if (publicToken) {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('org_id')
        .eq('signing_token', publicToken)
        .single()

      if (!proposal) {
        const { data: pkg } = await supabase
          .from('drawing_packages')
          .select('org_id')
          .eq('share_token', publicToken)
          .single()

        if (!pkg) return unauthorized('Invalid token')
        orgId = pkg.org_id
      } else {
        orgId = proposal.org_id
      }

      isPublicAccess = true
    } else {
      return unauthorized()
    }

    // Get bucket and path
    let path: string
    let bucketKey: string
    let expiresIn = 3600

    if (req.method === 'PUT') {
      path      = req.headers.get('x-file-path') || ''
      bucketKey = req.headers.get('x-bucket') || 'floor-plans'
    } else {
      const body = await req.json()
      path       = body.path      || ''
      bucketKey  = body.bucket    || 'floor-plans'
      expiresIn  = body.expiresIn || 3600
    }

    if (!path) {
      return new Response(JSON.stringify({ error: 'path required' }), { status: 400, headers: corsHeaders })
    }

    const bucket = BUCKETS[bucketKey] || 'forgept-floor-plans'

    // Org path validation
    const { data: superCheck } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', (await supabase.auth.getUser()).data.user?.id || '')
      .limit(1)

    const isSuperAdmin = superCheck?.[0]?.role === 'superadmin'

    if (!isSuperAdmin && !path.startsWith(orgId!)) {
      console.error(`Path violation: org=${orgId} path=${path}`)
      return forbidden()
    }

    // PUT — upload
    if (req.method === 'PUT') {
      if (isPublicAccess) return forbidden()

      const contentType = req.headers.get('x-file-type') || 'application/octet-stream'
      const body        = await req.arrayBuffer()
      const r2Url       = `${R2_ENDPOINT}/${bucket}/${path}`

      const r2Res = await aws.fetch(r2Url, {
        method:  'PUT',
        headers: { 'Content-Type': contentType },
        body,
      })

      if (!r2Res.ok) {
        const text = await r2Res.text()
        console.error('R2 PUT failed:', r2Res.status, text)
        return new Response(
          JSON.stringify({ error: `R2 error: ${r2Res.status}` }),
          { status: 500, headers: corsHeaders }
        )
      }

      return new Response(JSON.stringify({ success: true, path, bucket }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST — presigned read URL
    const r2Url  = `${R2_ENDPOINT}/${bucket}/${path}`
    const signed = await aws.sign(new Request(r2Url), {
      aws: { signQuery: true, expiresIn },
    })

    return new Response(JSON.stringify({ url: signed.url }), {
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
