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

export interface SystemWallet {
  id: number;
  ngn_float_balance: number;
  btc_inventory: number;
  eth_inventory: number;
  usdt_inventory: number;
  usdc_inventory: number;
  xrp_inventory: number;
  sol_inventory: number;
  created_at: string;
  updated_at: string;
}

export interface UserWallet {
  user_id: string;
  ngn_balance: number;
  btc_balance: number;
  eth_balance: number;
  usdt_balance: number;
  usdc_balance: number;
  xrp_balance: number;
  sol_balance: number;
}

export interface TreasuryStats {
  total_ngn_float: number;
  total_crypto_inventory_value_ngn: number;
  total_user_balances_ngn: number;
  total_system_value: number;
  recent_transactions_count: number;
  daily_sell_volume: number;
}

export interface AdjustLiquidityRequest {
  asset: 'NGN' | 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL';
  amount: number;
  operation: 'add' | 'remove';
  reason: string;
}

export interface AdjustLiquidityResponse {
  success: boolean;
  new_balance?: number;
  error?: string;
}

/**
 * Check if current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-user-management`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey,
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

/**
 * Get system wallet balances
 */
export async function getSystemWallet(): Promise<{ data?: SystemWallet; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: 'Not authenticated' };
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-treasury`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getSystemWallet',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: errorText || 'Failed to fetch system wallet' };
    }

    const result = await response.json();
    return { data: result.data };
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch system wallet' };
  }
}

/**
 * Adjust system liquidity
 */
export async function adjustLiquidity(request: AdjustLiquidityRequest): Promise<AdjustLiquidityResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-treasury`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'adjustLiquidity',
        ...request,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {}
      return { success: false, error: errorMessage };
    }

    const result = await response.json();
    return result;
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to adjust liquidity' };
  }
}

/**
 * Get treasury statistics
 */
export async function getTreasuryStats(): Promise<{ data?: TreasuryStats; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: 'Not authenticated' };
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-treasury`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getStats',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: errorText || 'Failed to fetch stats' };
    }

    const result = await response.json();
    return { data: result.data };
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch stats' };
  }
}

/**
 * Get user wallet by user ID
 */
export async function getUserWallet(userId: string): Promise<{ data?: UserWallet; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { error: 'Not authenticated' };
    }

    const { supabaseUrl, supabaseAnonKey } = getSupabaseConfig();

    const response = await fetch(`${supabaseUrl}/functions/v1/admin-treasury`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseAnonKey || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getUserWallet',
        user_id: userId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { error: errorText || 'Failed to fetch user wallet' };
    }

    const result = await response.json();
    return { data: result.data };
  } catch (error: any) {
    return { error: error.message || 'Failed to fetch user wallet' };
  }
}
