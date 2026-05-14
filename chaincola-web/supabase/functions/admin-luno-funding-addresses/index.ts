// Admin-only: Luno receive (funding) addresses + aggregated balances for the linked Luno API account.
// POST body: { "symbols": ["BTC","ETH",...] }  or GET ?symbols=BTC,ETH
// Always returns HTTP 200 JSON after auth so browsers / supabase.functions.invoke can read the body.
// Auth: Bearer user JWT (verify_jwt=false on gateway; we validate inside).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const LUNO_API_BASE = "https://api.luno.com";

/** App ticker → Luno `asset` query value for funding_address */
const LUNO_FUNDING_ASSET: Record<string, string> = {
  BTC: "XBT",
  ETH: "ETH",
  USDT: "USDT",
  USDC: "USDC",
  XRP: "XRP",
  SOL: "SOL",
};

type AddressRow = {
  symbol: string;
  luno_asset: string;
  address: string;
  account_id?: string;
  name?: string;
  total_received?: string;
  address_source?: "address" | "address_meta" | "qr_code_uri";
};

/** Aggregated Luno wallet balance for one app ticker (sums all Luno accounts for that asset). */
type LunoBalanceRow = {
  luno_asset: string;
  balance: number;
  reserved: number;
  unconfirmed: number;
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getLunoCredentials(): { keyId: string; secret: string; source: string } {
  const keyId =
    (Deno.env.get("LUNO_API_KEY_ID") ?? Deno.env.get("LUNO_KEY_ID") ?? Deno.env.get("LUNO_API_KEY") ?? "").trim();
  const secret = (
    Deno.env.get("LUNO_API_SECRET") ??
    Deno.env.get("LUNO_SECRET") ??
    Deno.env.get("LUNO_SECRET_KEY") ??
    Deno.env.get("LUNO_API_KEY_SECRET") ??
    ""
  ).trim();
  const source = Deno.env.get("LUNO_API_KEY_ID")
    ? "LUNO_API_KEY_ID"
    : Deno.env.get("LUNO_KEY_ID")
      ? "LUNO_KEY_ID"
      : Deno.env.get("LUNO_API_KEY")
        ? "LUNO_API_KEY"
        : "none";
  return { keyId, secret, source };
}

function coerceMetaValue(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

function extractFromQrCodeUri(uri: unknown): string {
  if (typeof uri !== "string" || !uri) return "";
  const u = uri.trim();
  // bitcoin:ADDRESS?...  ethereum:0x...  erc20:...
  const btc = u.match(/^(?:bitcoin|btc):([a-zA-HJ-NP-Z0-9]{20,})/i);
  if (btc?.[1]) return btc[1];
  const eth = u.match(/^(?:ethereum|eth):?(0x[a-fA-F0-9]{40})/i);
  if (eth?.[1]) return eth[1];
  return "";
}

function extractLunoDepositAddress(json: Record<string, unknown>): { address: string; source: AddressRow["address_source"] } {
  const rawAddr = json.address;
  const top =
    rawAddr != null && rawAddr !== ""
      ? (typeof rawAddr === "string" ? rawAddr.trim() : String(rawAddr).trim())
      : "";
  if (top.length > 0) return { address: top, source: "address" };

  const meta = json.address_meta;
  if (Array.isArray(meta) && meta.length > 0) {
    const parts: string[] = [];
    for (const entry of meta) {
      if (!entry || typeof entry !== "object") continue;
      const o = entry as Record<string, unknown>;
      const val = coerceMetaValue(o.value ?? o.address ?? o.addr);
      if (!val) continue;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      parts.push(label ? `${label}: ${val}` : val);
    }
    if (parts.length > 0) {
      return { address: parts.join("\n"), source: "address_meta" };
    }
  }

  const fromQr = extractFromQrCodeUri(json.qr_code_uri);
  if (fromQr) return { address: fromQr, source: "qr_code_uri" };

  return { address: "", source: "address_meta" };
}

async function requireAdmin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data: rpcAdmin, error: rpcErr } = await supabase.rpc("is_user_admin", { check_user_id: userId });
  if (!rpcErr && rpcAdmin === true) {
    return { ok: true };
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.is_admin || profile?.role === "admin") {
    return { ok: true };
  }

  return {
    ok: false,
    status: 403,
    message: "Admin access required",
  };
}

function parseSymbolsFromUrl(req: Request): string[] {
  const url = new URL(req.url);
  const raw = url.searchParams.get("symbols");
  const requested = (raw ? raw.split(",") : [])
    .map((s) => s.toUpperCase().trim())
    .filter(Boolean);
  return [...new Set(requested)].filter((s) => LUNO_FUNDING_ASSET[s]);
}

async function aggregateBalancesForSymbols(
  lunoAuth: string,
  symbols: string[],
): Promise<{ balances: Record<string, LunoBalanceRow>; error?: string }> {
  function zeroRow(sym: string): LunoBalanceRow {
    const lun = LUNO_FUNDING_ASSET[sym] ?? sym;
    return { luno_asset: lun, balance: 0, reserved: 0, unconfirmed: 0 };
  }
  function allZeroBalances(): Record<string, LunoBalanceRow> {
    const out: Record<string, LunoBalanceRow> = {};
    for (const sym of symbols) {
      if (LUNO_FUNDING_ASSET[sym]) out[sym] = zeroRow(sym);
    }
    return out;
  }

  function parseAmount(o: Record<string, unknown>, ...keys: string[]): number {
    for (const k of keys) {
      const v = o[k];
      if (v == null) continue;
      const n = Number.parseFloat(String(v).replace(/,/g, "") || "0");
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function extractRows(root: unknown): unknown[] | null {
    if (Array.isArray(root)) return root;
    if (!root || typeof root !== "object") return null;
    const r = root as Record<string, unknown>;
    if (typeof r.error === "string" && r.error.trim()) {
      return null;
    }
    if (Array.isArray(r.balance)) return r.balance;
    if (Array.isArray(r.balances)) return r.balances;
    return null;
  }

  try {
    const res = await fetch(`${LUNO_API_BASE}/api/1/balance`, {
      headers: { Authorization: lunoAuth, Accept: "application/json" },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        balances: {},
        error:
          `Luno GET /balance HTTP ${res.status}: ${text.slice(0, 240)}. Ensure the API key has **Perm_R_Balance**.`,
      };
    }
    let root: unknown;
    try {
      root = JSON.parse(text) as unknown;
    } catch {
      return { balances: {}, error: "Invalid JSON from Luno /balance" };
    }

    if (root && typeof root === "object" && !Array.isArray(root)) {
      const err = (root as Record<string, unknown>).error;
      if (typeof err === "string" && err.trim()) {
        return { balances: {}, error: `Luno /balance: ${err.slice(0, 280)}` };
      }
    }

    const raw = extractRows(root);
    if (raw == null) {
      const keys = root && typeof root === "object" ? Object.keys(root as object).join(",") : typeof root;
      return {
        balances: {},
        error: `Luno /balance: could not find balance[]. Top-level keys: ${keys || "?"}.`,
      };
    }

    if (raw.length === 0) {
      return { balances: allZeroBalances() };
    }

    const byAsset = new Map<string, { b: number; r: number; u: number }>();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const assetRaw =
        (typeof o.asset === "string" && o.asset) ||
        (typeof o.currency === "string" && o.currency) ||
        "";
      const a = assetRaw.trim().toUpperCase();
      if (!a) continue;
      const b = parseAmount(o, "balance", "available", "Available");
      const rsv = parseAmount(o, "reserved", "Reserved");
      const u = parseAmount(o, "unconfirmed", "Unconfirmed");
      const cur = byAsset.get(a) ?? { b: 0, r: 0, u: 0 };
      cur.b += b;
      cur.r += rsv;
      cur.u += u;
      byAsset.set(a, cur);
    }

    const balances: Record<string, LunoBalanceRow> = {};
    for (const sym of symbols) {
      const lun = LUNO_FUNDING_ASSET[sym];
      if (!lun) continue;
      const agg = byAsset.get(lun.toUpperCase()) ?? { b: 0, r: 0, u: 0 };
      balances[sym] = {
        luno_asset: lun,
        balance: agg.b,
        reserved: agg.r,
        unconfirmed: agg.u,
      };
    }
    return { balances };
  } catch (e) {
    return {
      balances: {},
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseKey) {
      return jsonResponse({ error: "Server misconfiguration (SUPABASE_URL / SERVICE_ROLE_KEY)" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization bearer token" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse(
        { error: authError?.message || "Invalid or expired session — sign in again on the admin login page." },
        401,
      );
    }

    const admin = await requireAdmin(supabase, user.id);
    if (!admin.ok) {
      return jsonResponse({ error: admin.message }, admin.status);
    }

    const { keyId: lunoKeyId, secret: lunoSecret, source: keySource } = getLunoCredentials();
    if (!lunoKeyId || !lunoSecret) {
      return jsonResponse({
        luno_ready: false,
        key_id_env: keySource,
        addresses: {},
        errors: undefined,
        error:
          "Luno credentials not visible to this function. In Supabase Dashboard → Edge Functions → Secrets, set **LUNO_API_KEY_ID** and **LUNO_API_SECRET** " +
            "(aliases: **LUNO_KEY_ID** + **LUNO_SECRET_KEY** / **LUNO_SECRET** / **LUNO_API_KEY_SECRET**). Redeploy after adding secrets.",
      });
    }

    const lunoAuth = `Basic ${btoa(`${lunoKeyId}:${lunoSecret}`)}`;

    let symbols: string[] = [];
    if (req.method === "POST") {
      const body = (await req.json().catch(() => null)) as { symbols?: unknown } | null;
      const list = body?.symbols;
      if (Array.isArray(list)) {
        symbols = [...new Set(list.map((s) => String(s).toUpperCase().trim()).filter(Boolean))].filter(
          (s) => LUNO_FUNDING_ASSET[s],
        );
      }
    }
    if (symbols.length === 0) {
      symbols = parseSymbolsFromUrl(req);
    }
    if (symbols.length === 0) {
      symbols = Object.keys(LUNO_FUNDING_ASSET);
    }

    const addresses: Record<string, AddressRow> = {};
    const errors: Record<string, string> = {};

    async function readLunoResponse(res: Response): Promise<{ json: Record<string, unknown>; text: string }> {
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        /* leave json {} */
      }
      return { json, text };
    }

    function assignRow(symbol: string, asset: string, json: Record<string, unknown>): boolean {
      const { address: addr, source } = extractLunoDepositAddress(json);
      if (!addr) return false;
      addresses[symbol] = {
        symbol,
        luno_asset: typeof json.asset === "string" ? String(json.asset) : asset,
        address: addr,
        account_id: typeof json.account_id === "string" ? json.account_id : undefined,
        name: typeof json.name === "string" ? json.name : undefined,
        total_received: json.total_received != null ? String(json.total_received) : undefined,
        address_source: source,
      };
      return true;
    }

    const balancePromise = aggregateBalancesForSymbols(lunoAuth, symbols);

    await Promise.all([
      balancePromise,
      Promise.all(
        symbols.map(async (symbol) => {
          const asset = LUNO_FUNDING_ASSET[symbol];
          const getUrl = `${LUNO_API_BASE}/api/1/funding_address?asset=${encodeURIComponent(asset)}`;
          const authHeaders = { Authorization: lunoAuth, Accept: "application/json" };
          try {
            const res = await fetch(getUrl, { headers: authHeaders });
            const { json, text } = await readLunoResponse(res);

            if (assignRow(symbol, asset, json)) return;

            const lunoErr = typeof json.error === "string" ? json.error : "";
            const tryCreate =
              /errnoaddressesassigned|errnoaddress|no.?address/i.test(lunoErr) ||
              /errnoaddressesassigned|no.?address/i.test(text) ||
              (res.ok && !lunoErr);

            if (tryCreate) {
              const postUrl =
                `${LUNO_API_BASE}/api/1/funding_address?asset=${encodeURIComponent(asset)}&name=${
                  encodeURIComponent(`chaincola-admin-${symbol}`)
                }`;
              const postRes = await fetch(postUrl, { method: "POST", headers: authHeaders });
              const post = await readLunoResponse(postRes);
              if (assignRow(symbol, asset, post.json)) return;
              const postErr = typeof post.json.error === "string" ? post.json.error : "";
              errors[symbol] = postRes.ok
                ? `No usable address after Luno POST for ${asset}. ${postErr || "empty response"}`.slice(0, 420)
                : `Luno POST HTTP ${postRes.status}: ${post.text.slice(0, 260)}`;
              return;
            }

            if (!res.ok) {
              errors[symbol] = `Luno GET HTTP ${res.status}: ${text.slice(0, 280)}`;
              return;
            }

            const metaPreview = json.address_meta != null
              ? JSON.stringify(json.address_meta).slice(0, 200)
              : "null";
            errors[symbol] =
              `No deposit string in Luno response for ${asset}. Luno error: ${lunoErr || "—"}. Keys: ${
                Object.keys(json).join(",")
              }. address_meta sample: ${metaPreview}. Ensure API key has **Perm_R_Addresses** (and **Perm_W_Addresses** if addresses must be created) and this Luno account supports ${asset}.`;
          } catch (e) {
            errors[symbol] = e instanceof Error ? e.message : String(e);
          }
        }),
      ),
    ]);

    const balOut = await balancePromise.catch((e) => ({
      balances: {} as Record<string, LunoBalanceRow>,
      error: e instanceof Error ? e.message : String(e),
    }));

    const errKeys = Object.keys(errors);
    const body: Record<string, unknown> = {
      luno_ready: true,
      addresses,
      balances: balOut.balances,
      errors: errKeys.length ? errors : undefined,
      error: errKeys.length === symbols.length
        ? "Every Luno funding_address call failed — see per-asset errors."
        : errKeys.length > 0
          ? "Some assets failed — see per-asset errors."
        : undefined,
    };
    if (balOut.error) body.balance_error = balOut.error;
    return jsonResponse(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 500);
  }
});
