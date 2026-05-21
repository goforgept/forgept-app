import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20'

const ACCOUNT_ID = Deno.env.get('R2_ACCOUNT_ID')!
const ACCESS_KEY  = Deno.env.get('R2_ACCESS_KEY_ID')!
const SECRET_KEY  = Deno.env.get('R2_SECRET_ACCESS_KEY')!
const BUCKET      = Deno.env.get('R2_BUCKET_NAME')!
const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-file-path, x-file-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
}

const aws = new AwsClient({
  accessKeyId:     ACCESS_KEY,
  secretAccessKey: SECRET_KEY,
  service:         's3',
  region:          'auto',
})

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

      const body   = await req.arrayBuffer()
      const r2Url  = `${R2_ENDPOINT}/${BUCKET}/${path}`

      const r2Res = await aws.fetch(r2Url, {
        method:  'PUT',
        headers: { 'Content-Type': contentType },
        body,
      })

      if (!r2Res.ok) {
        const text = await r2Res.text()
        console.error('R2 PUT failed:', r2Res.status, text)
        return new Response(JSON.stringify({ error: `R2 error: ${r2Res.status}: ${text}` }), { status: 500, headers: corsHeaders })
      }

      return new Response(JSON.stringify({ success: true, path }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST — presigned read URL
    const { path, expiresIn = 3600 } = await req.json()
    if (!path) return new Response(JSON.stringify({ error: 'path required' }), { status: 400, headers: corsHeaders })

    const r2Url = `${R2_ENDPOINT}/${BUCKET}/${path}`
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
