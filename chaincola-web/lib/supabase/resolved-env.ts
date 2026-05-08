import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase'

/** Prefer env (production); fall back to constants/supabase.json (same as Expo app). */
export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY
}
