import { createClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/resolved-env'

const supabaseUrl = getSupabaseUrl()
const supabaseAnonKey = getSupabaseAnonKey()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or anon key (set NEXT_PUBLIC_* in .env.local or update constants/supabase.json)')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
