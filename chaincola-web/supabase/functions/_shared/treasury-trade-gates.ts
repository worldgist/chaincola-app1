/**
 * Shared checks for instant buy/sell: emergency_controls.trading_enabled
 * and app_settings.additional_settings.risk_settings (buying_enabled,
 * selling_enabled, max_sell_limits).
 */

const DEFAULT_ASSET_FLAGS: Record<string, boolean> = {
  BTC: true,
  ETH: true,
  USDT: true,
  USDC: true,
  XRP: true,
  SOL: true,
};

/** Defaults aligned with admin-treasury getRiskSettings. */
const DEFAULT_MAX_SELL_LIMITS: Record<string, number> = {
  BTC: 0.1,
  ETH: 1.0,
  USDT: 10000,
  USDC: 10000,
  XRP: 10000,
  SOL: 100,
};

/** Hard safety ceiling per instant-sell-crypto-v2 (cannot be exceeded). */
const HARD_CAP_MAX_SELL: Record<string, number> = {
  BTC: 10,
  ETH: 100,
  USDT: 100000,
  USDC: 100000,
  XRP: 1000000,
  SOL: 10000,
};

export type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
      };
    };
  };
};

type TradeGatesState = {
  tradingEnabled: boolean;
  buyingEnabled: Record<string, boolean>;
  sellingEnabled: Record<string, boolean>;
  maxSellLimits: Record<string, number>;
};

function coercePositiveNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function loadTradeGates(supabase: SupabaseLike): Promise<TradeGatesState> {
  const [ecRes, settingsRes] = await Promise.all([
    supabase.from("emergency_controls").select("trading_enabled").eq("id", 1).maybeSingle(),
    supabase.from("app_settings").select("additional_settings").eq("id", 1).maybeSingle(),
  ]);

  const tradingEnabled = ecRes.data?.trading_enabled !== false;

  const rawRisk = (settingsRes.data?.additional_settings as Record<string, unknown> | null | undefined)?.[
    "risk_settings"
  ] as Record<string, unknown> | undefined;

  const buyingEnabled = {
    ...DEFAULT_ASSET_FLAGS,
    ...(rawRisk?.buying_enabled as Record<string, boolean> | undefined),
  };
  const sellingEnabled = {
    ...DEFAULT_ASSET_FLAGS,
    ...(rawRisk?.selling_enabled as Record<string, boolean> | undefined),
  };

  const rawLimits = (rawRisk?.max_sell_limits as Record<string, unknown> | undefined) ?? {};
  const maxSellLimits: Record<string, number> = { ...DEFAULT_MAX_SELL_LIMITS };
  for (const key of Object.keys(rawLimits)) {
    const coerced = coercePositiveNumber(rawLimits[key]);
    if (coerced != null) maxSellLimits[key] = coerced;
  }

  return { tradingEnabled, buyingEnabled, sellingEnabled, maxSellLimits };
}

function jsonResponse(
  corsHeaders: Record<string, string>,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** min(hard cap, admin risk max); both layers must agree. */
export function effectiveMaxSellUnits(assetUpper: string, maxSellLimits: Record<string, number>): number {
  const riskCap = coercePositiveNumber(maxSellLimits[assetUpper]) ??
    DEFAULT_MAX_SELL_LIMITS[assetUpper] ??
    0;
  const hardCap = coercePositiveNumber(HARD_CAP_MAX_SELL[assetUpper]) ?? riskCap;
  return Math.min(hardCap, riskCap);
}

/** Returns a Response to return early, or null if the buy may proceed. */
export async function assertInstantBuyAllowed(
  supabase: SupabaseLike,
  assetUpper: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const { tradingEnabled, buyingEnabled } = await loadTradeGates(supabase);

  if (!tradingEnabled) {
    return jsonResponse(corsHeaders, 403, {
      success: false,
      error: "Trading is temporarily paused. Please try again later.",
      code: "TRADING_PAUSED",
    });
  }

  if (buyingEnabled[assetUpper] === false) {
    return jsonResponse(corsHeaders, 403, {
      success: false,
      error: `Buying ${assetUpper} is currently disabled.`,
      code: "BUYING_DISABLED",
    });
  }

  return null;
}

export type InstantSellGateResult =
  | { ok: true; effectiveMaxSell: number }
  | { ok: false; response: Response };

/**
 * Policy gates + optional amount vs effective max (min of hard cap and risk_settings.max_sell_limits).
 * When cryptoAmount is provided, returns effectiveMaxSell for passing to instant_sell_crypto_v2.
 */
export async function evaluateInstantSell(
  supabase: SupabaseLike,
  assetUpper: string,
  corsHeaders: Record<string, string>,
  cryptoAmount?: number,
): Promise<InstantSellGateResult> {
  const gates = await loadTradeGates(supabase);

  if (!gates.tradingEnabled) {
    return {
      ok: false,
      response: jsonResponse(corsHeaders, 403, {
        success: false,
        error: "Trading is temporarily paused. Please try again later.",
        code: "TRADING_PAUSED",
      }),
    };
  }

  if (gates.sellingEnabled[assetUpper] === false) {
    return {
      ok: false,
      response: jsonResponse(corsHeaders, 403, {
        success: false,
        error: `Selling ${assetUpper} is currently disabled.`,
        code: "SELLING_DISABLED",
      }),
    };
  }

  const effectiveMaxSell = effectiveMaxSellUnits(assetUpper, gates.maxSellLimits);

  if (
    cryptoAmount != null &&
    Number.isFinite(cryptoAmount) &&
    cryptoAmount > 0 &&
    cryptoAmount > effectiveMaxSell
  ) {
    return {
      ok: false,
      response: jsonResponse(corsHeaders, 400, {
        success: false,
        error:
          `Amount exceeds maximum sell per transaction (${effectiveMaxSell} ${assetUpper}). ` +
          `Admin limit and platform cap are applied.`,
        code: "MAX_SELL_EXCEEDED",
        max_allowed: effectiveMaxSell,
      }),
    };
  }

  return { ok: true, effectiveMaxSell };
}
