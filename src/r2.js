import { supabase } from './supabase'

const R2_FUNCTION_URL = 'https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/r2-sign'

// Bucket names
export const BUCKETS = {
  FLOOR_PLANS: 'floor-plans',
  DOCUMENTS:   'documents',
  PHOTOS:      'photos',
  ASSETS:      'assets',
}

// Get presigned URL for reading (authenticated)
export async function getR2Url(path, expiresIn = 3600, bucket = BUCKETS.FLOOR_PLANS) {
  if (!path || path === 'blank' || path === 'pending') return null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ path, expiresIn, bucket }),
    })
    const json = await res.json()
    if (json.url) return json.url
    return null
  } catch (err) {
    console.error('R2 sign error:', err)
    return null
  }
}

// Get presigned URL using public token (no auth)
export async function getR2UrlPublic(path, publicToken, expiresIn = 3600, bucket = BUCKETS.DOCUMENTS) {
  if (!path || !publicToken) return null
  try {
    const res = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-public-token': publicToken,
      },
      body: JSON.stringify({ path, expiresIn, bucket }),
    })
    const json = await res.json()
    return json.url || null
  } catch (err) {
    console.error('R2 public sign error:', err)
    return null
  }
}

// Upload file through Edge Function
export async function uploadToR2(path, file, contentType, bucket = BUCKETS.FLOOR_PLANS) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(R2_FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session?.access_token}`,
      'x-file-path':   path,
      'x-file-type':   contentType || file.type || 'application/octet-stream',
      'x-bucket':      bucket,
    },
    body: file,
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Upload failed')
  return path
}
