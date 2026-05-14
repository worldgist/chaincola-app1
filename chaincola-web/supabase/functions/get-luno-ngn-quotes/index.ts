// Luno public ticker (NGN pairs) + SOL spot: Alchemy USD when configured, else Binance SOL/USDT × FX (no Luno SOL/NGN pair).
// Query: ?symbols=BTC,ETH,USDT,USDC,XRP,SOL
// Returns bid = best NGN per 1 coin when user sells, ask = when user buys (Luno book).

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

const LUNO_TICKER = "https://api.luno.com/api/1/ticker";

const LUNO_PAIR_BY_SYMBOL: Record<string, string> = {
  BTC: "XBTNGN",
  ETH: "ETHNGN",
  USDT: "USDTNGN",
  USDC: "USDCNGN",
  XRP: "XRPNGN",
};

const STABLE = new Set(["USDT", "USDC"]);

function retailMarkupMultiplier(symbol: string): number {
  return STABLE.has(symbol.toUpperCase()) ? 1.003 : 1.052;
}

type QuoteRow = {
  crypto_symbol: string;
  price_usd: number;
  price_ngn: number;
  bid: number;
  ask: number;
  last_updated: string;
  source: "luno" | "alchemy_spread";
};

async function fetchLunoTicker(pair: string): Promise<{ bid: number; ask: number; last: number } | null> {
  const url = `${LUNO_TICKER}?pair=${encodeURIComponent(pair)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    bid?: string;
    ask?: string;
    last_trade?: string;
  };
  const bid = parseFloat(String(j.bid ?? ""));
  const ask = parseFloat(String(j.ask ?? ""));
  const last = parseFloat(String(j.last_trade ?? ""));
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || ask < bid) {
    return null;
  }
  const mid = Number.isFinite(last) && last > 0 ? last : (bid + ask) / 2;
  return { bid, ask, last: mid };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("symbols");
    const requested = (raw ? raw.split(",") : ["BTC", "ETH", "USDT", "USDC", "XRP", "SOL"])
      .map((s) => s.toUpperCase().trim())
      .filter(Boolean);
    const symbols = [...new Set(requested)];

    const usdToNgn = await getUsdToNgnRate();
    const timestamp = new Date().toISOString();
    const prices: Record<string, QuoteRow> = {};
    const errors: Record<string, string> = {};

    await Promise.all(
      symbols.map(async (sym) => {
        const pair = LUNO_PAIR_BY_SYMBOL[sym];
        if (pair) {
          try {
            const t = await fetchLunoTicker(pair);
            if (!t) {
              errors[sym] = "Luno ticker unavailable";
              return;
            }
            const midNgn = t.last;
            const priceUsd = midNgn / usdToNgn;
            prices[sym] = {
              crypto_symbol: sym,
              price_usd: Math.round(priceUsd * 1e8) / 1e8,
              price_ngn: Math.round(midNgn * 100) / 100,
              bid: Math.round(t.bid * 100) / 100,
              ask: Math.round(t.ask * 100) / 100,
              last_updated: timestamp,
              source: "luno",
            };
          } catch (e) {
            errors[sym] = e instanceof Error ? e.message : String(e);
          }
          return;
        }

        if (sym === "SOL") {
          try {
            let usd = 0;
            let lastUpdated = timestamp;
            let source: QuoteRow["source"] = "public_spread";

            const apiKey = getAlchemyApiKey();
            if (apiKey) {
              const map = await fetchAlchemyUsdPricesBySymbols(["SOL"]);
              const row = map.get("SOL");
              if (row && row.usd > 0) {
                usd = row.usd;
                lastUpdated = row.lastUpdatedAt || timestamp;
                source = "alchemy_spread";
              }
            }

            if (!(usd > 0)) {
              const bin = await fetchSolUsdFromBinanceSpot();
              if (bin && bin.usd > 0) {
                usd = bin.usd;
                lastUpdated = bin.lastUpdatedAt || timestamp;
                source = "public_spread";
              }
            }

            if (!(usd > 0)) {
              errors[sym] = apiKey
                ? "No SOL USD from Alchemy or Binance"
                : "No SOL USD from Binance (set ALCHEMY_API_KEY for Alchemy spot)";
              return;
            }

            const midNgn = usd * usdToNgn;
            const mult = retailMarkupMultiplier("SOL");
            const bid = Math.round(midNgn * 100) / 100;
            const ask = Math.round(midNgn * mult * 100) / 100;
            prices[sym] = {
              crypto_symbol: "SOL",
              price_usd: usd,
              price_ngn: Math.round(((bid + ask) / 2) * 100) / 100,
              bid,
              ask,
              last_updated: lastUpdated,
              source,
            };
          } catch (e) {
            errors[sym] = e instanceof Error ? e.message : String(e);
          }
          return;
        }

        errors[sym] = "Unsupported symbol for Luno NGN quotes";
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        prices,
        errors: Object.keys(errors).length ? errors : undefined,
        usd_to_ngn: usdToNgn,
        timestamp,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=8",
        },
      },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: msg || "Failed to fetch Luno NGN quotes" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
