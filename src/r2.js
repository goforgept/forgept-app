import { supabase } from './supabase'

const R2_FUNCTION_URL = 'https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/r2-sign'

// Get presigned URL for reading a file from R2
export async function getR2Url(path, expiresIn = 3600) {
  if (!path || path === 'blank' || path === 'pending') return null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ path, expiresIn }),
    })
    const json = await res.json()
    return json.url || null
  } catch (err) {
    console.error('R2 sign error:', err)
    return null
  }
}

// Upload file through Edge Function — no CORS issues
export async function uploadToR2(path, file, contentType) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(R2_FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session?.access_token}`,
      'x-file-path':   path,
      'x-file-type':   contentType || file.type || 'application/octet-stream',
    },
    body: file,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Upload failed')
  return path
}
