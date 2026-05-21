import { supabase } from './supabase'

const R2_FUNCTION_URL = 'https://qxypaepvmtmkhbssedki.supabase.co/functions/v1/r2-sign'

// Get a presigned URL for reading a file from R2
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
      body: JSON.stringify({ path, method: 'GET', expiresIn }),
    })
    const json = await res.json()
    return json.url || null
  } catch (err) {
    console.error('R2 sign error:', err)
    return null
  }
}

// Get a presigned URL for uploading a file to R2
export async function getR2UploadUrl(path, contentType = 'application/octet-stream', expiresIn = 3600) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ path, method: 'PUT', expiresIn }),
    })
    const json = await res.json()
    return json.url || null
  } catch (err) {
    console.error('R2 upload sign error:', err)
    return null
  }
}

// Upload a file directly to R2 using presigned URL
export async function uploadToR2(path, file, contentType) {
  const uploadUrl = await getR2UploadUrl(path, contentType)
  if (!uploadUrl) throw new Error('Failed to get upload URL')
  
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
  })
  
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`)
  return path
}
