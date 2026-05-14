// Market prices Edge Function — Alchemy Prices API (USD → NGN) only

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  fetchAlchemyUsdPricesBySymbols,
  getAlchemyApiKey,
  getUsdToNgnRate,
} from "../_shared/alchemy-prices.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED_SYMBOLS = ["BTC", "ETH", "SOL", "USDT", "USDC", "TRX", "XRP"];

interface PriceResponse {
  crypto_symbol: string;
  price_ngn: number;
  price_usd: number;
  bid: number;
  ask: number;
  last_updated: string;
  volume_24h: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const symbolsParam = url.searchParams.get("symbols");
    const requestedSymbols = symbolsParam ? symbolsParam.split(",") : SUPPORTED_SYMBOLS;

    const supportedSymbols = requestedSymbols
      .map((symbol) => symbol.toUpperCase().trim())
      .filter((symbol) => SUPPORTED_SYMBOLS.includes(symbol));

    if (supportedSymbols.length === 0) {
      return new Response(JSON.stringify({ error: "No valid symbols provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prices: Record<string, PriceResponse> = {};
    const timestamp = new Date().toISOString();
    const usdToNgn = await getUsdToNgnRate();

    // Alchemy — global USD spot, convert to NGN
    const alchemyKey = getAlchemyApiKey();
    if (!alchemyKey) {
      return new Response(
        JSON.stringify({ success: false, error: "ALCHEMY_API_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const alchemyMap = await fetchAlchemyUsdPricesBySymbols(supportedSymbols);
    for (const sym of supportedSymbols) {
      const row = alchemyMap.get(sym);
      if (!row || row.usd <= 0) continue;
      const ngn = row.usd * usdToNgn;
      prices[sym] = {
        crypto_symbol: sym,
        price_usd: row.usd,
        price_ngn: Math.round(ngn * 100) / 100,
        bid: row.usd,
        ask: row.usd,
        last_updated: row.lastUpdatedAt || timestamp,
        volume_24h: 0,
      };
    }

    console.log(`✅ Processed prices for ${Object.keys(prices).length} cryptocurrencies`);

    return new Response(
      JSON.stringify({
        success: true,
        prices,
        timestamp,
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
    console.error("❌ Error fetching market prices:", msg);
    return new Response(
      JSON.stringify({
        success: false,
        error: msg || "Failed to fetch prices",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
