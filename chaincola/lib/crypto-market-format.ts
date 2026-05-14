/**
 * Chart range + number formatting for crypto detail / market UI.
 * (Pricing and history come from Alchemy via Supabase Edge — no third-party coin APIs here.)
 */

export type ChartRange = '1H' | '1D' | '1W' | '1M' | '1Y';

/** Market stats shown on the About tab (values are typically NGN from Alchemy-backed edge). */
export interface MarketInfo {
  marketCap: number | null;
  totalVolume: number | null;
  circulatingSupply: number | null;
  description: string | null;
  vsCurrency: string;
}

/**
 * Format large numbers compactly (1.6T, 46.1B, 20M, 350K).
 * Used for market-cap / volume / supply rows in the About tab.
 */
export function formatCompactNumber(value: number | null | undefined, prefix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const fmt = (n: number, suffix: string) => {
    const fixed = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
    return `${sign}${prefix}${fixed}${suffix}`;
  };
  if (abs >= 1_000_000_000_000) return fmt(abs / 1_000_000_000_000, 'T');
  if (abs >= 1_000_000_000) return fmt(abs / 1_000_000_000, 'B');
  if (abs >= 1_000_000) return fmt(abs / 1_000_000, 'M');
  if (abs >= 1_000) return fmt(abs / 1_000, 'K');
  return `${sign}${prefix}${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
