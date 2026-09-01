import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qxypaepvmtmkhbssedki.supabase.co'
const supabaseKey = 'sb_publishable__NqeZGEO3Uh3JR5fK3pk8w_UBngpGZS'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    storageKey: 'sb-qxypaepvmtmkhbssedki-auth-token',
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})