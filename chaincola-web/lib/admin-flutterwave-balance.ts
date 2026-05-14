import { createClient } from '@/lib/supabase/client';

export type AdminFlutterwaveBalance = {
  available_balance: number;
  ledger_balance: number;
  currency: string;
};

/**
 * Calls Edge Function `flutterwave-management?action=balance` (admin JWT).
 * Same source as Admin → Flutterwave Management.
 */
export async function fetchAdminFlutterwaveBalance(): Promise<{
  success: boolean;
  data: AdminFlutterwaveBalance | null;
  error: string | null;
}> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { success: false, data: null, error: 'Not signed in' };
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anonKey) {
    return { success: false, data: null, error: 'Supabase URL or anon key not configured' };
  }
  const url = `${supabaseUrl}/functions/v1/flutterwave-management?action=balance`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    return { success: false, data: null, error: (e as Error)?.message || 'Network error' };
  }
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      typeof json.error === 'string'
        ? json.error
        : typeof json.details === 'string'
          ? json.details
          : `HTTP ${res.status}`;
    return { success: false, data: null, error: msg };
  }
  if (json.success === true && json.data && typeof json.data === 'object' && !Array.isArray(json.data)) {
    const d = json.data as Record<string, unknown>;
    return {
      success: true,
      data: {
        available_balance: parseFloat(String(d.available_balance ?? 0)) || 0,
        ledger_balance: parseFloat(String(d.ledger_balance ?? 0)) || 0,
        currency: String(d.currency || 'NGN'),
      },
      error: null,
    };
  }
  const err =
    typeof json.error === 'string'
      ? json.error
      : typeof json.note === 'string'
        ? json.note
        : 'Unexpected balance response';
  return { success: false, data: null, error: err };
}
