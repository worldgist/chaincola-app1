import Constants from 'expo-constants';
import { supabase } from './supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase';

function getSupabaseConfig() {
  const supabaseUrl =
    Constants.expoConfig?.extra?.supabaseUrl ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    SUPABASE_URL;
  const supabaseAnonKey =
    Constants.expoConfig?.extra?.supabaseAnonKey ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY;
  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Check if current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return false;

    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-user-management`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getUserDetails',
        user_id: session.user.id,
      }),
    });

    if (!response.ok) return false;
    const result = await response.json();
    return result.is_admin === true;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}
