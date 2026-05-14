// Alchemy Prices API — spot + historical (with market cap / volume) for crypto details UI.
// GET ?symbol=BTC&range=1D   range ∈ 1H | 1D | 1W | 1M | 1Y

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  fetchAlchemyUsdPricesBySymbols,
  getAlchemyApiKey,
  getUsdToNgnRate,
} from "../_shared/alchemy-prices.ts";
import {
  chartRangeToAlchemyWindow,
  computeChange24hPctFromHourly,
  fetchAlchemyHistoricalUsd,
} from "../_shared/alchemy-historical.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED = new Set(["BTC", "ETH", "USDT", "USDC", "XRP", "SOL"]);
const RANGES = new Set(["1H", "1D", "1W", "1M", "1Y"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = getAlchemyApiKey();
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "ALCHEMY_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const symbolRaw = (url.searchParams.get("symbol") || "").toUpperCase().trim();
    const rangeRaw = (url.searchParams.get("range") || "1D").toUpperCase();

    if (!symbolRaw || !ALLOWED.has(symbolRaw)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or unsupported symbol" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const range = RANGES.has(rangeRaw) ? rangeRaw : "1D";

    const usdToNgn = await getUsdToNgnRate();
    const spotMap = await fetchAlchemyUsdPricesBySymbols([symbolRaw]);
    const spot = spotMap.get(symbolRaw);
    if (!spot?.usd || spot.usd <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: `No spot price from Alchemy for ${symbolRaw}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const priceUsd = spot.usd;
    const priceNgn = Math.round(priceUsd * usdToNgn * 100) / 100;

    const { startMs, endMs, interval } = chartRangeToAlchemyWindow(range);
    const hist = await fetchAlchemyHistoricalUsd({
      symbol: symbolRaw,
      startMs,
      endMs,
      interval,
      withMarketData: true,
    });

    // 24h % change from a dedicated ~72h hourly series (stable vs short ranges like 1H).
    const end72 = Date.now();
    const start72 = end72 - 72 * 60 * 60 * 1000;
    const hist72 = await fetchAlchemyHistoricalUsd({
      symbol: symbolRaw,
      startMs: start72,
      endMs: end72,
      interval: "1h",
      withMarketData: false,
    });
    const change24hPct = computeChange24hPctFromHourly(hist72.points);

    const histOk = !hist.error && hist.points.length > 0;
    let chartPointsNgn: number[] = [];
    let chartTimestamps: number[] = [];
    let marketCapNgn: number | null = null;
    let totalVolumeNgn: number | null = null;
    let circulatingSupply: number | null = null;

    if (histOk) {
      const last = hist.points[hist.points.length - 1];
      const marketCapUsd = last.marketCapUsd ?? null;
      const totalVolumeUsd = last.totalVolumeUsd ?? null;
      marketCapNgn =
        marketCapUsd != null && Number.isFinite(marketCapUsd) ? marketCapUsd * usdToNgn : null;
      totalVolumeNgn =
        totalVolumeUsd != null && Number.isFinite(totalVolumeUsd) ? totalVolumeUsd * usdToNgn : null;
      if (
        marketCapUsd != null &&
        Number.isFinite(marketCapUsd) &&
        last.valueUsd > 0
      ) {
        circulatingSupply = marketCapUsd / last.valueUsd;
      }
      chartPointsNgn = hist.points.map((p) =>
        Math.round(p.valueUsd * usdToNgn * 100) / 100
      );
      chartTimestamps = hist.points.map((p) => p.timestampMs);
    } else {
      const now = Date.now();
      chartPointsNgn = Array.from({ length: 32 }, () => priceNgn);
      chartTimestamps = Array.from({ length: 32 }, (_, i) => now - (31 - i) * 60 * 60 * 1000);
    }

    return new Response(
      JSON.stringify({
        success: true,
        symbol: symbolRaw,
        range,
        source: "alchemy",
        partial: !histOk,
        historical_error: histOk ? null : (hist.error || "Alchemy historical returned no data"),
        usd_to_ngn: usdToNgn,
        spot: {
          price_usd: priceUsd,
          price_ngn: priceNgn,
          last_updated: spot.lastUpdatedAt || new Date().toISOString(),
        },
        change_24h_pct: change24hPct,
        market: {
          market_cap_ngn: marketCapNgn,
          total_volume_ngn: totalVolumeNgn,
          circulating_supply: circulatingSupply,
        },
        chart: {
          vs_currency: "ngn",
          points: chartPointsNgn,
          timestamps: chartTimestamps,
        },
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=60",
        },
      },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
