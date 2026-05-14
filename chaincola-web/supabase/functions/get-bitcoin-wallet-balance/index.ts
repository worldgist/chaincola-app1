// User BTC balance (on-chain via Tatum) + fiat from Luno tickers (XBTUSD / XBTNGN).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchBtcNgnFromLuno, fetchBtcUsdFromLuno } from "../_shared/luno-btc-price.ts";
import { getUsdToNgnRate } from "../_shared/alchemy-prices.ts";
import {
  getTatumApiKey,
  getTatumApiKeyMissingMessage,
  tatumBtcAddressBalanceBtc,
} from "../_shared/tatum-bitcoin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!getTatumApiKey()) {
      return new Response(JSON.stringify({ success: false, error: getTatumApiKeyMissingMessage() }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: wallet, error: walletError } = await supabase
      .from("crypto_wallets")
      .select("address")
      .eq("user_id", user.id)
      .eq("asset", "BTC")
      .eq("network", "mainnet")
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Bitcoin wallet not found. Please generate a wallet first.",
          address: null,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const address = wallet.address;
    const balanceBTC = await tatumBtcAddressBalanceBtc(address);

    let btcPriceUSD = await fetchBtcUsdFromLuno();
    let btcPriceNGN = await fetchBtcNgnFromLuno();
    if (btcPriceUSD <= 0 && btcPriceNGN > 0) {
      const fx = await getUsdToNgnRate();
      if (fx > 0) btcPriceUSD = btcPriceNGN / fx;
    }
    if (btcPriceNGN <= 0 && btcPriceUSD > 0) {
      btcPriceNGN = btcPriceUSD * (await getUsdToNgnRate());
    }
    if (btcPriceUSD <= 0) btcPriceUSD = 0;
    if (btcPriceNGN <= 0) btcPriceNGN = 0;

    const balanceUSD = balanceBTC * btcPriceUSD;
    const balanceNGN = balanceBTC * btcPriceNGN;

    const { data: walletBalance } = await supabase
      .from("wallet_balances")
      .select("balance")
      .eq("user_id", user.id)
      .eq("currency", "BTC")
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          address,
          balance: {
            btc: balanceBTC,
            usd: balanceUSD,
            ngn: balanceNGN,
          },
          prices: {
            btc_usd: btcPriceUSD,
            btc_ngn: btcPriceNGN,
            source: "luno",
          },
          utxos: 0,
          stored_balance: walletBalance?.balance || 0,
          lastUpdated: new Date().toISOString(),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("get-bitcoin-wallet-balance:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg || "Failed to get Bitcoin balance" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
