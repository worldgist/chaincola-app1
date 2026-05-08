import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPPORTED_ASSETS = ["BTC", "ETH", "USDT", "USDC", "XRP", "SOL", "TRX"] as const;
const STABLE_ASSETS = new Set(["USDT", "USDC"]);

function retailMarkupForAsset(asset: string): number {
  return STABLE_ASSETS.has(asset) ? 0.003 : 0.052;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Supabase env vars (URL / service role / anon key)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const marketUrl = `${supabaseUrl}/functions/v1/get-token-prices?symbols=${SUPPORTED_ASSETS.join(",")}`;
    const marketRes = await fetch(marketUrl, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!marketRes.ok) {
      const text = await marketRes.text();
      return new Response(
        JSON.stringify({ success: false, error: `Price fetch failed (${marketRes.status}): ${text}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const marketJson = await marketRes.json();
    const prices = (marketJson?.prices ?? {}) as Record<string, {
      price_ngn?: number;
      bid?: number;
      ask?: number;
    }>;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const updated: Array<Record<string, unknown>> = [];

    for (const asset of SUPPORTED_ASSETS) {
      const row = prices[asset];
      if (!row) continue;

      const ask = Number(row.ask ?? 0);
      const bid = Number(row.bid ?? 0);
      const mid = Number(row.price_ngn ?? 0);
      const buy = ask > 0 ? ask : (mid > 0 ? mid : 0);
      const sell = bid > 0 ? bid : (mid > 0 ? mid / (1 + retailMarkupForAsset(asset)) : 0);
      if (buy <= 0 || sell <= 0) continue;

      const { data, error } = await supabase
        .from("pricing_engine_config")
        .upsert({
          asset,
          override_buy_price_ngn: buy,
          override_sell_price_ngn: sell,
          retail_markup_fraction: retailMarkupForAsset(asset),
          trading_enabled: true,
          price_frozen: false,
          notes: "Auto-synced from live market feed",
          updated_at: new Date().toISOString(),
        }, { onConflict: "asset" })
        .select("asset, override_buy_price_ngn, override_sell_price_ngn, updated_at")
        .single();

      if (error) {
        console.error(`Failed to upsert ${asset}:`, error.message);
        continue;
      }
      if (data) updated.push(data as Record<string, unknown>);
    }

    return new Response(
      JSON.stringify({ success: true, updated_count: updated.length, updated }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
