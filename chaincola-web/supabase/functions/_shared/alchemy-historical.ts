/**
 * Alchemy Prices API — historical series + optional market cap / volume per point.
 * https://www.alchemy.com/docs/data/prices-api
 */

import { getAlchemyApiKey } from "./alchemy-prices.ts";

export type AlchemyChartInterval = "5m" | "1h" | "1d";

export type AlchemyHistoryPoint = {
  valueUsd: number;
  timestampMs: number;
  marketCapUsd?: number | null;
  totalVolumeUsd?: number | null;
};

function parseNum(v: unknown): number {
  if (v == null) return NaN;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}

/** Map app chart range to Alchemy interval + window (per API limits). */
export function chartRangeToAlchemyWindow(range: string): {
  startMs: number;
  endMs: number;
  interval: AlchemyChartInterval;
} {
  const endMs = Date.now();
  let startMs = endMs - 24 * 60 * 60 * 1000;
  let interval: AlchemyChartInterval = "1h";
  switch (range) {
    case "1H":
      startMs = endMs - 60 * 60 * 1000;
      interval = "5m";
      break;
    case "1D":
      startMs = endMs - 24 * 60 * 60 * 1000;
      interval = "5m";
      break;
    case "1W":
      startMs = endMs - 7 * 24 * 60 * 60 * 1000;
      interval = "1h";
      break;
    case "1M":
      startMs = endMs - 30 * 24 * 60 * 60 * 1000;
      interval = "1h";
      break;
    case "1Y":
      startMs = endMs - 365 * 24 * 60 * 60 * 1000;
      interval = "1d";
      break;
    default:
      startMs = endMs - 24 * 60 * 60 * 1000;
      interval = "5m";
  }
  return { startMs, endMs, interval };
}

export async function fetchAlchemyHistoricalUsd(params: {
  symbol: string;
  startMs: number;
  endMs: number;
  interval: AlchemyChartInterval;
  withMarketData: boolean;
}): Promise<{ points: AlchemyHistoryPoint[]; error?: string }> {
  const apiKey = getAlchemyApiKey();
  if (!apiKey) return { points: [], error: "Missing ALCHEMY_API_KEY" };

  const sym = params.symbol.toUpperCase().trim();
  const url = `https://api.g.alchemy.com/prices/v1/${encodeURIComponent(apiKey)}/tokens/historical`;

  const body = {
    symbol: sym,
    startTime: new Date(params.startMs).toISOString(),
    endTime: new Date(params.endMs).toISOString(),
    interval: params.interval,
    withMarketData: params.withMarketData,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text || `HTTP ${res.status}`;
    return { points: [], error: msg };
  }

  const rows = Array.isArray(json?.data) ? json.data : [];
  const out: AlchemyHistoryPoint[] = [];
  for (const row of rows) {
    const valueUsd = parseNum(row?.value);
    const ts = row?.timestamp ? Date.parse(String(row.timestamp)) : NaN;
    if (!Number.isFinite(valueUsd) || valueUsd <= 0 || !Number.isFinite(ts)) continue;
    out.push({
      valueUsd,
      timestampMs: ts,
      marketCapUsd: row?.marketCap != null ? parseNum(row.marketCap) : null,
      totalVolumeUsd: row?.totalVolume != null ? parseNum(row.totalVolume) : null,
    });
  }

  out.sort((a, b) => a.timestampMs - b.timestampMs);
  return { points: out };
}

/** ~24h % change: last price vs latest point at or before (lastTs − 24h). */
export function computeChange24hPctFromHourly(points: AlchemyHistoryPoint[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => a.timestampMs - b.timestampMs);
  const last = sorted[sorted.length - 1];
  const cutoff = last.timestampMs - 24 * 60 * 60 * 1000;
  let prior: AlchemyHistoryPoint | null = null;
  for (const p of sorted) {
    if (p.timestampMs <= cutoff) prior = p;
    else break;
  }
  if (!prior || prior.valueUsd <= 0) return null;
  return ((last.valueUsd - prior.valueUsd) / prior.valueUsd) * 100;
}
