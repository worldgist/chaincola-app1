/**
 * Crypto details from Supabase Edge → Alchemy Prices API (spot + historical + market data).
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase';
import type { ChartRange } from '@/lib/crypto-market-format';

export const ALCHEMY_CRYPTO_DETAILS_SYMBOLS = new Set([
  'BTC',
  'ETH',
  'USDT',
  'USDC',
  'XRP',
  'SOL',
]);

export type AlchemyCryptoDetailsResponse = {
  success: boolean;
  symbol?: string;
  range?: string;
  partial?: boolean;
  historical_error?: string | null;
  spot?: {
    price_usd: number;
    price_ngn: number;
    last_updated: string;
  };
  change_24h_pct?: number | null;
  market?: {
    market_cap_ngn: number | null;
    total_volume_ngn: number | null;
    circulating_supply: number | null;
  };
  chart?: {
    vs_currency: string;
    points: number[];
    timestamps: number[];
  };
  error?: string;
};

export function supportsAlchemyCryptoDetails(symbol: string): boolean {
  return ALCHEMY_CRYPTO_DETAILS_SYMBOLS.has(symbol.toUpperCase());
}

export async function fetchAlchemyCryptoDetails(
  symbol: string,
  range: ChartRange
): Promise<AlchemyCryptoDetailsResponse | null> {
  const sym = symbol.toUpperCase();
  if (!supportsAlchemyCryptoDetails(sym)) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const url = new URL(`${SUPABASE_URL}/functions/v1/alchemy-crypto-details`);
  url.searchParams.set('symbol', sym);
  url.searchParams.set('range', range);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    let data: AlchemyCryptoDetailsResponse | null = null;
    try {
      data = JSON.parse(text) as AlchemyCryptoDetailsResponse;
    } catch {
      data = null;
    }
    if (!data) return { success: false, error: text || `HTTP ${res.status}` };
    if (!res.ok) return { ...data, success: false };
    return data;
  } catch (e: any) {
    return { success: false, error: e?.message || 'Network error' };
  }
}
