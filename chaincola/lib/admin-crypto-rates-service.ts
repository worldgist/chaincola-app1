/**
 * Admin Crypto Rates Service
 * Functions for admins to manage cryptocurrency rates
 */

import { supabase } from './supabase';

export interface CryptoRate {
  id: string;
  crypto_symbol: string;
  price_usd: number;
  price_ngn: number;
  bid?: number;
  ask?: number;
  volume_24h?: number;
  is_active: boolean;
  notes?: string;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SetCryptoRateRequest {
  crypto_symbol: string;
  price_usd: number;
  price_ngn: number;
  bid?: number;
  ask?: number;
  volume_24h?: number;
  notes?: string;
  is_active?: boolean;
}

/**
 * Set or update a crypto rate (admin only)
 */
export async function setCryptoRate(
  request: SetCryptoRateRequest
): Promise<{ success: boolean; rateId?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { data: rateId, error } = await supabase.rpc('set_crypto_rate', {
      p_crypto_symbol: request.crypto_symbol.toUpperCase(),
      p_price_usd: request.price_usd,
      p_price_ngn: request.price_ngn,
      p_admin_user_id: user.id,
      p_bid: request.bid || null,
      p_ask: request.ask || null,
      p_volume_24h: request.volume_24h || null,
      p_notes: request.notes || null,
      p_is_active: request.is_active !== undefined ? request.is_active : true,
    });

    if (error) {
      console.error('Error setting crypto rate:', error);
      return { success: false, error: error.message || 'Failed to set crypto rate' };
    }

    return { success: true, rateId: rateId || undefined };
  } catch (error: any) {
    console.error('Exception setting crypto rate:', error);
    return { success: false, error: error.message || 'Failed to set crypto rate' };
  }
}

/**
 * Get all crypto rates (admin only)
 */
export async function getAllCryptoRates(): Promise<{ rates: CryptoRate[]; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('get_all_crypto_rates');

    if (error) {
      console.error('Error fetching crypto rates:', error);
      return { rates: [], error: error.message };
    }

    if (!data || data.length === 0) {
      return { rates: [] };
    }

    const rates: CryptoRate[] = data.map((rate: any) => ({
      id: rate.id,
      crypto_symbol: rate.crypto_symbol,
      price_usd: parseFloat(rate.price_usd.toString()),
      price_ngn: parseFloat(rate.price_ngn.toString()),
      bid: rate.bid ? parseFloat(rate.bid.toString()) : undefined,
      ask: rate.ask ? parseFloat(rate.ask.toString()) : undefined,
      volume_24h: rate.volume_24h ? parseFloat(rate.volume_24h.toString()) : undefined,
      is_active: rate.is_active,
      notes: rate.notes,
      created_by: rate.created_by,
      updated_by: rate.updated_by,
      created_at: rate.created_at,
      updated_at: rate.updated_at,
    }));

    return { rates };
  } catch (error: any) {
    console.error('Exception fetching crypto rates:', error);
    return { rates: [], error: error.message || 'Failed to fetch crypto rates' };
  }
}

/**
 * Toggle crypto rate active status (admin only)
 */
export async function toggleCryptoRateStatus(
  cryptoSymbol: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase.rpc('toggle_crypto_rate_status', {
      p_crypto_symbol: cryptoSymbol.toUpperCase(),
      p_admin_user_id: user.id,
      p_is_active: isActive,
    });

    if (error) {
      console.error('Error toggling crypto rate status:', error);
      return { success: false, error: error.message || 'Failed to toggle crypto rate status' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception toggling crypto rate status:', error);
    return { success: false, error: error.message || 'Failed to toggle crypto rate status' };
  }
}

/**
 * Get active crypto rate by symbol (public)
 */
export async function getActiveCryptoRate(
  cryptoSymbol: string
): Promise<{ rate: CryptoRate | null; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('get_active_crypto_rate', {
      p_crypto_symbol: cryptoSymbol.toUpperCase(),
    });

    if (error) {
      console.error('Error fetching active crypto rate:', error);
      return { rate: null, error: error.message };
    }

    if (!data || data.length === 0) {
      return { rate: null };
    }

    const rateData = data[0];
    const rate: CryptoRate = {
      id: rateData.id,
      crypto_symbol: rateData.crypto_symbol,
      price_usd: parseFloat(rateData.price_usd.toString()),
      price_ngn: parseFloat(rateData.price_ngn.toString()),
      bid: rateData.bid ? parseFloat(rateData.bid.toString()) : undefined,
      ask: rateData.ask ? parseFloat(rateData.ask.toString()) : undefined,
      volume_24h: rateData.volume_24h ? parseFloat(rateData.volume_24h.toString()) : undefined,
      is_active: true, // Active rates only
      updated_at: rateData.updated_at,
      created_at: rateData.updated_at, // Fallback
    };

    return { rate };
  } catch (error: any) {
    console.error('Exception fetching active crypto rate:', error);
    return { rate: null, error: error.message || 'Failed to fetch active crypto rate' };
  }
}
















