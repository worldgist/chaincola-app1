/**
 * BTC spot via Luno public tickers (XBT = Bitcoin on Luno). Used for display / fiat conversion — not for on-chain.
 */

const LUNO_API_BASE = "https://api.luno.com/api/1";

async function lunoLastTrade(pair: string): Promise<number> {
  const res = await fetch(`${LUNO_API_BASE}/ticker?pair=${encodeURIComponent(pair)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return 0;
  const data = (await res.json()) as { last_trade?: string; bid?: string; ask?: string };
  const p = parseFloat(data.last_trade || data.bid || data.ask || "0");
  return Number.isFinite(p) && p > 0 ? p : 0;
}

/** BTC/USD from Luno XBTUSD ticker (0 if unavailable). */
export async function fetchBtcUsdFromLuno(): Promise<number> {
  return lunoLastTrade("XBTUSD");
}

/** BTC/NGN from Luno XBTNGN ticker (0 if unavailable). */
export async function fetchBtcNgnFromLuno(): Promise<number> {
  return lunoLastTrade("XBTNGN");
}
