import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const supabase = createClient(
  'https://qxypaepvmtmkhbssedki.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIzMTQxNywiZXhwIjoyMDg4ODA3NDE3fQ.3K8pUdlcoDoKAwlV308fqgK4n6mip9U_8M87u023pOw'
)

const R2_ACCOUNT_ID = 'd85855745c63944431c61d6fc5b3e923'
const R2_ACCESS_KEY = 'd076e695a80b396f494e88cb44e673af'
const R2_SECRET_KEY = 'b3feba3ca79857c046cfeeda9fe5aab7674b20550d8659d4737bb60662560a69'
const R2_BUCKET     = 'forgept-assets'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
})

async function main() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, org_id, logo_url')
    .not('logo_url', 'is', null)

  console.log(`Found ${profiles?.length} profiles with logos`)

  for (const profile of profiles || []) {
    if (!profile.logo_url || !profile.logo_url.startsWith('http')) {
      console.log(`Skip ${profile.id} — already migrated`)
      continue
    }

    try {
      const urlParts = profile.logo_url.split('/Logos/')
      const fileName = urlParts[1]?.split('?')[0]
      if (!fileName) { console.log(`Skip — can't parse filename`); continue }

      const { data, error } = await supabase.storage.from('Logos').download(fileName)
      if (error) { console.error(`Download failed:`, error.message); continue }

      const r2Path = `${profile.org_id}/logos/${fileName}`
      const buffer = Buffer.from(await data.arrayBuffer())

      await s3.send(new PutObjectCommand({
        Bucket:      R2_BUCKET,
        Key:         r2Path,
        Body:        buffer,
        ContentType: data.type || 'image/png',
      }))

      await supabase.from('profiles').update({ logo_url: r2Path }).eq('id', profile.id)
      console.log(`✓ Migrated: ${fileName} → ${r2Path}`)

    } catch (err) {
      console.error(`Error:`, err.message)
    }
  }
  console.log('Done!')
}

main()