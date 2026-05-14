/**
 * Alchemy Prices API — token spot in USD (NGN via FX).
 * Docs: https://www.alchemy.com/docs/data/prices-api
 */

const DEFAULT_USD_NGN = 1650;

export function getAlchemyApiKey(): string {
  return (
    Deno.env.get("ALCHEMY_API_KEY") ??
    Deno.env.get("ALCHEMY_ETHEREUM_API_KEY") ??
    Deno.env.get("ALCHEMY_SOLANA_API_KEY") ??
    ""
  ).trim();
}

/** Reject junk FX (e.g. 1.0) that would make USDT price_ngn = ₦1.00 */
const MIN_USD_NGN = 400;
const MAX_USD_NGN = 5000;

export async function getUsdToNgnRate(): Promise<number> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    if (res.ok) {
      const data = await res.json();
      const ngn = typeof data.rates?.NGN === "number" ? data.rates.NGN : NaN;
      if (Number.isFinite(ngn) && ngn >= MIN_USD_NGN && ngn <= MAX_USD_NGN) {
        return ngn;
      }
    }
  } catch {
    // ignore
  }
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=NGN");
    if (res.ok) {
      const data = await res.json();
      const ngn = typeof data.rates?.NGN === "number" ? data.rates.NGN : NaN;
      if (Number.isFinite(ngn) && ngn >= MIN_USD_NGN && ngn <= MAX_USD_NGN) {
        return ngn;
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_USD_NGN;
}

type AlchemyTokenRow = {
  symbol?: string;
  error?: string;
  prices?: Array<{ currency?: string; value?: string; lastUpdatedAt?: string }>;
};

/** USD price per symbol (uppercase keys). */
export async function fetchAlchemyUsdPricesBySymbols(
  symbolsUpper: string[],
): Promise<Map<string, { usd: number; lastUpdatedAt?: string }>> {
  const out = new Map<string, { usd: number; lastUpdatedAt?: string }>();
  const apiKey = getAlchemyApiKey();
  if (!apiKey || symbolsUpper.length === 0) return out;

  const unique = [...new Set(symbolsUpper.map((s) => s.toUpperCase()))];

  for (let i = 0; i < unique.length; i += 25) {
    const chunk = unique.slice(i, i + 25);
    // OpenAPI style=form, explode=true → symbols=BTC&symbols=ETH (not comma-separated)
    const qs = new URLSearchParams();
    for (const sym of chunk) {
      qs.append("symbols", sym);
    }
    const url =
      `https://api.g.alchemy.com/prices/v1/${encodeURIComponent(apiKey)}/tokens/by-symbol?${qs.toString()}`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.warn("⚠️ Alchemy Prices API HTTP:", res.status);
      continue;
    }

    const json = (await res.json()) as { data?: AlchemyTokenRow[] };
    for (const row of json.data ?? []) {
      if (!row.symbol || row.error) continue;
      const sym = row.symbol.toUpperCase();
      const usdEntry = row.prices?.find((p) => String(p.currency || "").toUpperCase() === "USD");
      const v = usdEntry?.value != null ? parseFloat(String(usdEntry.value)) : NaN;
      if (!Number.isFinite(v) || v <= 0) continue;
      out.set(sym, { usd: v, lastUpdatedAt: usdEntry?.lastUpdatedAt });
    }
  }

  return out;
}

export async function fetchAlchemyUsdForSymbol(symbolUpper: string): Promise<number> {
  const m = await fetchAlchemyUsdPricesBySymbols([symbolUpper]);
  return m.get(symbolUpper.toUpperCase())?.usd ?? 0;
}

/**
 * SOL spot in ~USD from Binance public API (no key). USDT tracks USD closely for display pricing.
 */
export async function fetchSolUsdFromBinanceSpot(): Promise<
  { usd: number; lastUpdatedAt?: string } | null
> {
  try {
    const res = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { price?: string };
    const p = parseFloat(String(j.price ?? ""));
    if (!Number.isFinite(p) || p <= 0 || p > 1_000_000) return null;
    return { usd: p, lastUpdatedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}
