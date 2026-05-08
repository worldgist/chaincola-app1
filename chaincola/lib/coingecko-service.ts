/**
 * Lightweight CoinGecko helper for the crypto details screen.
 *
 * Provides:
 *  - Historical price points for a chosen timeframe (used by the line chart)
 *  - Market metadata (market cap, 24h volume, circulating supply, description)
 *
 * Uses the public, key-free API. Endpoints chosen to stay under the free
 * rate limit (no key) for typical app usage. Each function fails soft and
 * returns nulls so the UI can render a graceful fallback.
 */

const CG_BASE = 'https://api.coingecko.com/api/v3';

export const SYMBOL_TO_GECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDT: 'tether',
  USDC: 'usd-coin',
  XRP: 'ripple',
};

export type ChartRange = '1H' | '1D' | '1W' | '1M' | '1Y';

const RANGE_TO_DAYS: Record<ChartRange, number | 'max'> = {
  '1H': 1, // CoinGecko's smallest interval is 5-min; we slice the last hour client-side
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '1Y': 365,
};

export interface ChartHistory {
  /** Plain price values, oldest first. Empty array if fetch failed. */
  points: number[];
  /** Currency the prices are quoted in (matches the fetch param). */
  vsCurrency: string;
  /** Wall-clock timestamps (ms) aligned with `points` (same length). */
  timestamps: number[];
}

export interface MarketInfo {
  marketCap: number | null;
  totalVolume: number | null;
  circulatingSupply: number | null;
  description: string | null;
  vsCurrency: string;
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetches a price history series for the given symbol/timeframe.
 *
 * For the `1H` range we still ask for 1 day (the smallest CG window) and
 * slice the last hour locally so the chart shows fine-grained recent action.
 */
export async function getCryptoChartHistory(
  symbol: string,
  range: ChartRange,
  vsCurrency: 'usd' | 'ngn' = 'ngn',
): Promise<ChartHistory> {
  const empty: ChartHistory = { points: [], vsCurrency, timestamps: [] };
  const id = SYMBOL_TO_GECKO_ID[symbol.toUpperCase()];
  if (!id) return empty;

  const days = RANGE_TO_DAYS[range];
  const url = `${CG_BASE}/coins/${id}/market_chart?vs_currency=${vsCurrency}&days=${days}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return empty;
    const json = (await res.json()) as { prices?: [number, number][] };
    const raw = Array.isArray(json.prices) ? json.prices : [];
    if (raw.length === 0) return empty;

    let series = raw;
    if (range === '1H') {
      const cutoff = Date.now() - 60 * 60 * 1000;
      const sliced = raw.filter(([ts]) => ts >= cutoff);
      // Keep at least a few points so the chart isn't a single dot
      series = sliced.length >= 5 ? sliced : raw.slice(-12);
    }

    return {
      points: series.map(([, price]) => price),
      timestamps: series.map(([ts]) => ts),
      vsCurrency,
    };
  } catch {
    return empty;
  }
}

/**
 * Fetches market stats (cap/volume/supply) and a short description for a coin.
 *
 * The `localization=false` and `tickers=false` params trim the response from
 * megabytes to ~30KB, which matters on mobile. We deliberately only return
 * the fields shown in the UI to keep the surface tight.
 */
export async function getCryptoMarketInfo(
  symbol: string,
  vsCurrency: 'usd' | 'ngn' = 'ngn',
): Promise<MarketInfo> {
  const empty: MarketInfo = {
    marketCap: null,
    totalVolume: null,
    circulatingSupply: null,
    description: null,
    vsCurrency,
  };
  const id = SYMBOL_TO_GECKO_ID[symbol.toUpperCase()];
  if (!id) return empty;

  const url =
    `${CG_BASE}/coins/${id}` +
    `?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      description?: { en?: string };
      market_data?: {
        market_cap?: Record<string, number>;
        total_volume?: Record<string, number>;
        circulating_supply?: number;
      };
    };

    const marketCap = json.market_data?.market_cap?.[vsCurrency] ?? null;
    const totalVolume = json.market_data?.total_volume?.[vsCurrency] ?? null;
    const circulatingSupply = json.market_data?.circulating_supply ?? null;

    // CoinGecko's description.en often contains inline HTML anchors. Strip
    // tags and use only the first paragraph so the UI stays readable.
    const rawDesc = json.description?.en?.trim() ?? '';
    const firstParagraph = rawDesc.split(/\n\s*\n/)[0] || rawDesc;
    const description = firstParagraph.replace(/<[^>]+>/g, '').trim() || null;

    return {
      marketCap,
      totalVolume,
      circulatingSupply,
      description,
      vsCurrency,
    };
  } catch {
    return empty;
  }
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
