// Admin Get Ethereum Wallet Balance (by email) Edge Function
// Purpose: allow ops/testing to check a user's on-chain ETH balance without needing the user's password.
// Security: requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pow10(decimals: number): bigint {
  // decimals is small (<= 36) for ERC-20; safe in loop
  let v = 1n;
  for (let i = 0; i < decimals; i++) v *= 10n;
  return v;
}

function formatUnits(raw: bigint, decimals: number): string {
  if (decimals <= 0) return raw.toString();
  const base = pow10(decimals);
  const whole = raw / base;
  const frac = raw % base;
  if (frac === 0n) return whole.toString();

  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadB64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadB64 + "===".slice((payloadB64.length + 3) % 4);
    const jsonStr = atob(padded);
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) return json(500, { success: false, error: "Missing Supabase env" });

    // Auth: allow either:
    // - service role KEY as bearer token, or
    // - service_role JWT (as returned by CLI `projects api-keys`)
    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!bearer) return json(401, { success: false, error: "Unauthorized" });

    const payload = decodeJwtPayload(bearer);
    const role = String(payload?.role || "");

    const ok =
      bearer === serviceKey ||
      role === "service_role";

    if (!ok) {
      return json(401, { success: false, error: "Unauthorized" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { email } = (await req.json().catch(() => ({}))) as { email?: string };
    const e = (email || "").trim().toLowerCase();
    if (!e) return json(400, { success: false, error: "Missing email" });

    // Resolve user_id from user_profiles (email is stored there in this project)
    const { data: profile, error: pe } = await supabase
      .from("user_profiles")
      .select("user_id, email")
      .eq("email", e)
      .maybeSingle();

    if (pe) return json(500, { success: false, error: pe.message });
    if (!profile?.user_id) return json(404, { success: false, error: "User not found in user_profiles" });

    // Find the user's ETH wallet address
    const { data: wallet, error: we } = await supabase
      .from("crypto_wallets")
      .select("address")
      .eq("user_id", profile.user_id)
      .eq("asset", "ETH")
      .eq("network", "mainnet")
      .maybeSingle();

    if (we) return json(500, { success: false, error: we.message });
    if (!wallet?.address) {
      return json(404, { success: false, error: "Ethereum wallet not found for user", user_id: profile.user_id });
    }

    const alchemyUrl =
      Deno.env.get("ALCHEMY_ETHEREUM_URL") ||
      (Deno.env.get("ALCHEMY_API_KEY")
        ? `https://eth-mainnet.g.alchemy.com/v2/${Deno.env.get("ALCHEMY_API_KEY")}`
        : "");
    if (!alchemyUrl) return json(500, { success: false, error: "Missing Alchemy secret (ALCHEMY_ETHEREUM_URL or ALCHEMY_API_KEY)" });

    // Token contracts
    const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase();
    const USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7".toLowerCase();

    // Get on-chain balance
    const balanceRes = await fetch(alchemyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getBalance",
        params: [wallet.address, "latest"],
        id: 1,
      }),
    });
    if (!balanceRes.ok) {
      const t = await balanceRes.text().catch(() => "");
      return json(502, { success: false, error: `Alchemy error ${balanceRes.status}`, details: t.slice(0, 500) });
    }
    const balanceJson = await balanceRes.json();
    const weiHex = String(balanceJson?.result || "0x0");
    const wei = BigInt(weiHex);
    const eth = Number(wei) / 1e18;

    // Get ERC-20 balances (Alchemy enhanced API)
    let usdcRaw = 0n;
    let usdtRaw = 0n;
    let usdcMeta: { name?: string; symbol?: string; decimals?: number; logo?: string } | null = null;
    let usdtMeta: { name?: string; symbol?: string; decimals?: number; logo?: string } | null = null;
    try {
      const tokenRes = await fetch(alchemyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "alchemy_getTokenBalances",
          params: [wallet.address, [USDC, USDT]],
          id: 2,
        }),
      });
      if (tokenRes.ok) {
        const tokenJson = await tokenRes.json();
        const arr = tokenJson?.result?.tokenBalances || [];
        for (const row of arr) {
          const addr = String(row?.contractAddress || "").toLowerCase();
          const bal = String(row?.tokenBalance || "0x0");
          try {
            const v = bal.startsWith("0x") ? BigInt(bal) : BigInt(bal);
            if (addr === USDC) usdcRaw = v;
            if (addr === USDT) usdtRaw = v;
          } catch {
            // ignore malformed
          }
        }
      }

      const [usdcMetaRes, usdtMetaRes] = await Promise.all([
        fetch(alchemyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "alchemy_getTokenMetadata",
            params: [USDC],
            id: 3,
          }),
        }),
        fetch(alchemyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method: "alchemy_getTokenMetadata",
            params: [USDT],
            id: 4,
          }),
        }),
      ]);

      if (usdcMetaRes.ok) {
        const j = await usdcMetaRes.json();
        const r = j?.result || {};
        usdcMeta = {
          name: typeof r.name === "string" ? r.name : undefined,
          symbol: typeof r.symbol === "string" ? r.symbol : undefined,
          decimals: typeof r.decimals === "number" ? r.decimals : undefined,
          logo: typeof r.logo === "string" ? r.logo : undefined,
        };
      }
      if (usdtMetaRes.ok) {
        const j = await usdtMetaRes.json();
        const r = j?.result || {};
        usdtMeta = {
          name: typeof r.name === "string" ? r.name : undefined,
          symbol: typeof r.symbol === "string" ? r.symbol : undefined,
          decimals: typeof r.decimals === "number" ? r.decimals : undefined,
          logo: typeof r.logo === "string" ? r.logo : undefined,
        };
      }
    } catch {
      // ignore token balance failure; still return ETH
    }

    const usdcDecimals = typeof usdcMeta?.decimals === "number" ? usdcMeta!.decimals! : 6;
    const usdtDecimals = typeof usdtMeta?.decimals === "number" ? usdtMeta!.decimals! : 6;

    const usdc = Number(formatUnits(usdcRaw, usdcDecimals));
    const usdt = Number(formatUnits(usdtRaw, usdtDecimals));

    // Ledger balance (credited)
    const { data: ethLedger } = await supabase
      .from("wallet_balances")
      .select("balance, updated_at")
      .eq("user_id", profile.user_id)
      .eq("currency", "ETH")
      .maybeSingle();

    const { data: usdcLedger } = await supabase
      .from("wallet_balances")
      .select("balance, updated_at")
      .eq("user_id", profile.user_id)
      .eq("currency", "USDC")
      .maybeSingle();

    const { data: usdtLedger } = await supabase
      .from("wallet_balances")
      .select("balance, updated_at")
      .eq("user_id", profile.user_id)
      .eq("currency", "USDT")
      .maybeSingle();

    return json(200, {
      success: true,
      data: {
        email: e,
        user_id: profile.user_id,
        address: wallet.address,
        on_chain: {
          eth,
          wei: wei.toString(),
          tokens: [
            {
              contract: USDC,
              name: usdcMeta?.name ?? "USD Coin",
              symbol: usdcMeta?.symbol ?? "USDC",
              decimals: usdcDecimals,
              raw: usdcRaw.toString(),
              formatted: formatUnits(usdcRaw, usdcDecimals),
              logo: usdcMeta?.logo ?? null,
            },
            {
              contract: USDT,
              name: usdtMeta?.name ?? "Tether USD",
              symbol: usdtMeta?.symbol ?? "USDT",
              decimals: usdtDecimals,
              raw: usdtRaw.toString(),
              formatted: formatUnits(usdtRaw, usdtDecimals),
              logo: usdtMeta?.logo ?? null,
            },
          ],
          // Backwards compatible fields (for older clients/tools)
          usdc,
          usdc_raw: usdcRaw.toString(),
          usdt,
          usdt_raw: usdtRaw.toString(),
        },
        ledger: {
          eth: ethLedger?.balance ?? 0,
          eth_updated_at: ethLedger?.updated_at ?? null,
          usdc: usdcLedger?.balance ?? 0,
          usdc_updated_at: usdcLedger?.updated_at ?? null,
          usdt: usdtLedger?.balance ?? 0,
          usdt_updated_at: usdtLedger?.updated_at ?? null,
        },
      },
    });
  } catch (err: any) {
    return json(500, { success: false, error: err?.message || "Unknown error" });
  }
});

