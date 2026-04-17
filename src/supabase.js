import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qxypaepvmtmkhbssedki.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eXBhZXB2bXRta2hic3NlZGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMzE0MTcsImV4cCI6MjA4ODgwNzQxN30.kCZjM-wR8GbRC4K2A8-r1EBVgkzRD1shx3Vl3EEyELE'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    storageKey: 'sb-qxypaepvmtmkhbssedki-auth-token',
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})