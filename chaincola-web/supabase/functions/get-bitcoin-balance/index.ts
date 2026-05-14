// Bitcoin address balance via Tatum gateway (requires TATUM_API_KEY).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    if (!getTatumApiKey()) {
      return new Response(
        JSON.stringify({
          success: false,
          error: getTatumApiKeyMissingMessage(),
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = new URL(req.url);
    const address =
      url.searchParams.get("address") || (await req.json().catch(() => ({}))).address;

    if (!address || typeof address !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Bitcoin address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const total = await tatumBtcAddressBalanceBtc(address);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          address,
          balance: {
            confirmed: total,
            unconfirmed: 0,
            total,
          },
          source: "tatum",
          lastUpdated: new Date().toISOString(),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("get-bitcoin-balance:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg || "Failed to get Bitcoin balance" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
