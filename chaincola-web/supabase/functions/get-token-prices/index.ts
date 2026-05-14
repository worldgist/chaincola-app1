// Token prices Edge Function — Alchemy Prices API (USD → NGN)
//
// Returns spot prices for all supported symbols used in the app.
// Query: ?symbols=BTC,ETH,USDT,...
// Default: BTC,ETH,USDT,USDC,XRP,SOL,TRX

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  fetchAlchemyUsdPricesBySymbols,
  fetchSolUsdFromBinanceSpot,
  getAlchemyApiKey,
  getUsdToNgnRate,
} from "../_shared/alchemy-prices.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_SYMBOLS = ["BTC", "ETH", "USDT", "USDC", "XRP", "SOL", "TRX"];

type PriceRow = {
  crypto_symbol: string;
  price_usd: number;
  price_ngn: number;
  last_updated: string;
  source: "alchemy" | "public_spot";
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get("symbols");
    const requested = (symbolsParam ? symbolsParam.split(",") : DEFAULT_SYMBOLS)
      .map((s) => s.toUpperCase().trim())
      .filter(Boolean);
    const symbols = [...new Set(requested)];

    const timestamp = new Date().toISOString();
    /** NGN per 1 USD — live FX; market NGN = token USD spot × this rate. */
    const usdToNgn = await getUsdToNgnRate();
    const apiKey = getAlchemyApiKey();

    const map = await fetchAlchemyUsdPricesBySymbols(apiKey ? symbols : []);
    const prices: Record<string, PriceRow> = {};

    for (const sym of symbols) {
      const row = map.get(sym);
      if (!row || !row.usd || row.usd <= 0) {
        continue;
      }
      // NGN spot = USD/TOKEN (Alchemy) × NGN/USD (FX)
      const ngn = row.usd * usdToNgn;
      prices[sym] = {
        crypto_symbol: sym,
        price_usd: row.usd,
        price_ngn: Math.round(ngn * 100) / 100,
        last_updated: row.lastUpdatedAt || timestamp,
        source: "alchemy",
      };
    }

    // SOL: Binance public SOL/USDT when Alchemy has no row (still real market spot × FX).
    if (!prices["SOL"] && symbols.includes("SOL")) {
      const fb = await fetchSolUsdFromBinanceSpot();
      if (fb && fb.usd > 0) {
        const ngn = fb.usd * usdToNgn;
        prices["SOL"] = {
          crypto_symbol: "SOL",
          price_usd: fb.usd,
          price_ngn: Math.round(ngn * 100) / 100,
          last_updated: fb.lastUpdatedAt || timestamp,
          source: "public_spot",
        };
      }
    }

    const missing = symbols.filter((s) => !prices[s]);

    // If Alchemy returns nothing for all symbols, surface a useful error for debugging.
    if (Object.keys(prices).length === 0 && symbols.length > 0) {
      if (!apiKey) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "ALCHEMY_API_KEY not set and no public spot fallback matched the requested symbols (SOL uses Binance when listed).",
            missing,
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      try {
        const qs = new URLSearchParams();
        qs.append("symbols", symbols[0]);
        const probeUrl =
          `https://api.g.alchemy.com/prices/v1/${encodeURIComponent(apiKey)}/tokens/by-symbol?${qs.toString()}`;
        const probe = await fetch(probeUrl, { headers: { Accept: "application/json" } });
        const t = await probe.text().catch(() => "");
        return new Response(
          JSON.stringify({
            success: false,
            error: "Alchemy Prices API returned no prices. Check ALCHEMY_API_KEY has Prices API access.",
            alchemy_http_status: probe.status,
            alchemy_body: t.slice(0, 500),
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (e: any) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Alchemy Prices API returned no prices and probe failed",
            details: e?.message || String(e),
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        prices,
        missing,
        timestamp,
        usd_to_ngn: usdToNgn,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: msg || "Failed to fetch token prices" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

