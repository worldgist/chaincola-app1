/**
 * Resolve NGN per 1 unit of crypto for instant buy/sell edges from `public.crypto_prices`
 * (same source as `swap-crypto`), with legacy static fallbacks when rows are missing.
 */

export const STATIC_NGN_RATES_PER_UNIT: Record<string, number> = {
  BTC: 70_000_000,
  ETH: 4_000_000,
  USDT: 1_650,
  USDC: 1_650,
  XRP: 1_000,
  SOL: 250_000,
};

type PriceRow = {
  price_ngn?: unknown;
  bid?: unknown;
  ask?: unknown;
};

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: PriceRow | null }>;
      };
    };
  };
};

export async function fetchCryptoPriceRow(
  supabase: SupabaseLike,
  assetUpper: string,
): Promise<PriceRow | null> {
  const { data } = await supabase
    .from("crypto_prices")
    .select("price_ngn, bid, ask")
    .eq("crypto_symbol", assetUpper)
    .maybeSingle();
  return data;
}

/** Buy side: prefer ask, then mid `price_ngn`, then static. */
export function resolveBuyNgnPerUnit(row: PriceRow | null, assetUpper: string): {
  rate: number;
  source: "crypto_prices" | "static";
} {
  const ask = Number(row?.ask);
  const mid = Number(row?.price_ngn);
  if (Number.isFinite(ask) && ask > 0) return { rate: ask, source: "crypto_prices" };
  if (Number.isFinite(mid) && mid > 0) return { rate: mid, source: "crypto_prices" };
  const st = STATIC_NGN_RATES_PER_UNIT[assetUpper] ?? 0;
  return { rate: st, source: "static" };
}

/** Sell side: prefer bid, then mid, then static. */
export function resolveSellNgnPerUnit(row: PriceRow | null, assetUpper: string): {
  rate: number;
  source: "crypto_prices" | "static";
} {
  const bid = Number(row?.bid);
  const mid = Number(row?.price_ngn);
  if (Number.isFinite(bid) && bid > 0) return { rate: bid, source: "crypto_prices" };
  if (Number.isFinite(mid) && mid > 0) return { rate: mid, source: "crypto_prices" };
  const st = STATIC_NGN_RATES_PER_UNIT[assetUpper] ?? 0;
  return { rate: st, source: "static" };
}
