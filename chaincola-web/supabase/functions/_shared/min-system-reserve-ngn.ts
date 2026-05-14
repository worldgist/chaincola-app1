/**
 * Minimum system `system_wallets.ngn_float_balance` after instant buy / sell / swap legs.
 * Must stay in sync with `app_settings.additional_settings.risk_settings.minimum_ngn_reserve`
 * (see migration `20260510180000_lower_default_minimum_ngn_reserve.sql`).
 */

/** When DB has no `risk_settings.minimum_ngn_reserve`, use this (not ₦1M legacy default). */
export const DEFAULT_MIN_SYSTEM_RESERVE_NGN = 10_000;

/** Supabase `MIN_SYSTEM_RESERVE` Edge secret overrides DB (set e.g. `0` for tests). */
export function parseMinSystemReserveFromEnv(): number | null {
  const raw = Deno.env.get("MIN_SYSTEM_RESERVE");
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Read `additional_settings.risk_settings.minimum_ngn_reserve` from app_settings row. */
export function parseMinSystemReserveFromAdditionalSettings(additional_settings: unknown): number | null {
  const add = additional_settings as Record<string, unknown> | null | undefined;
  const risk = add?.risk_settings as Record<string, unknown> | undefined;
  const raw = risk?.minimum_ngn_reserve;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

type MinimalSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{ data: { additional_settings?: unknown } | null }>;
      };
    };
  };
};

/** Env wins; else DB `risk_settings.minimum_ngn_reserve`; else {@link DEFAULT_MIN_SYSTEM_RESERVE_NGN}. */
export async function resolveMinSystemReserveNgn(supabase: MinimalSupabase): Promise<number> {
  const env = parseMinSystemReserveFromEnv();
  if (env !== null) return env;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("additional_settings")
      .eq("id", 1)
      .maybeSingle();
    const fromDb = parseMinSystemReserveFromAdditionalSettings(data?.additional_settings);
    if (fromDb !== null) return fromDb;
  } catch {
    // ignore
  }
  return DEFAULT_MIN_SYSTEM_RESERVE_NGN;
}
