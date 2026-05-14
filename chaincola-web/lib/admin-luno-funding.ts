import { createClient } from '@/lib/supabase/client';

export type LunoFundingAddressRow = {
  symbol: string;
  luno_asset: string;
  address: string;
  account_id?: string;
  name?: string;
  total_received?: string;
  address_source?: 'address' | 'address_meta' | 'qr_code_uri';
};

/** Aggregated Luno wallet row for one app ticker (from GET /api/1/balance). */
export type LunoBalanceRow = {
  luno_asset: string;
  balance: number;
  reserved: number;
  unconfirmed: number;
};

type FundingPayload = {
  addresses?: Record<string, LunoFundingAddressRow>;
  balances?: Record<string, LunoBalanceRow>;
  balance_error?: string;
  errors?: Record<string, string>;
  error?: string | null;
  luno_ready?: boolean;
  key_id_env?: string;
};

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number.parseFloat(String(v ?? '').replace(/,/g, '') || '0');
  return Number.isFinite(n) ? n : 0;
}

/** Edge / invoke may return snake_case or camelCase; coerce numeric strings. */
function normalizeInvokeFundingData(data: unknown): FundingPayload {
  let raw: unknown = data;
  if (typeof data === 'string') {
    try {
      raw = JSON.parse(data) as unknown;
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const balRaw = o.balances ?? o.Balances;
  const bal =
    balRaw && typeof balRaw === 'object' && !Array.isArray(balRaw)
      ? (balRaw as Record<string, LunoBalanceRow>)
      : undefined;
  const be =
    typeof o.balance_error === 'string'
      ? o.balance_error
      : typeof o.balanceError === 'string'
        ? o.balanceError
        : undefined;
  return {
    addresses: o.addresses as FundingPayload['addresses'],
    balances: bal,
    balance_error: be,
    errors: o.errors as FundingPayload['errors'],
    error: o.error != null ? (typeof o.error === 'string' ? o.error : String(o.error)) : undefined,
    luno_ready: o.luno_ready as boolean | undefined,
    key_id_env: o.key_id_env as string | undefined,
  };
}

function normalizeBalanceRows(
  raw: Record<string, LunoBalanceRow> | undefined,
  symbols: string[],
): Record<string, LunoBalanceRow> {
  const out: Record<string, LunoBalanceRow> = {};
  if (!raw) return out;
  for (const sym of symbols) {
    const row = raw[sym];
    if (!row || typeof row !== 'object') continue;
    out[sym] = {
      luno_asset: String((row as LunoBalanceRow).luno_asset ?? ''),
      balance: num((row as LunoBalanceRow).balance),
      reserved: num((row as LunoBalanceRow).reserved),
      unconfirmed: num((row as LunoBalanceRow).unconfirmed),
    };
  }
  return out;
}

async function readFunctionsInvokeError(error: unknown): Promise<string> {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; context?: Response };
  if (e.context && typeof e.context.json === 'function') {
    try {
      const j = (await e.context.json()) as { error?: string; message?: string };
      if (j?.error) return String(j.error);
      if (j?.message) return String(j.message);
    } catch {
      /* ignore */
    }
  }
  return e.message ?? 'Edge function request failed';
}

/**
 * Fetches Luno receive addresses via Edge function `admin-luno-funding-addresses`.
 * Uses `supabase.functions.invoke` so the user JWT is attached the same way as other Supabase calls.
 */
export async function fetchAdminLunoFundingAddresses(
  symbols: string[],
  _options?: { timeoutMs?: number },
): Promise<{
  addresses: Record<string, LunoFundingAddressRow>;
  balances: Record<string, LunoBalanceRow>;
  balanceError: string | null;
  error: string | null;
  addressErrors?: Record<string, string>;
}> {
  const normalized = [...new Set(symbols.map((s) => s.toUpperCase().trim()).filter(Boolean))];

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return {
      addresses: {},
      balances: {},
      balanceError: null,
      error:
        'You are not signed in with Supabase on this browser. Open **Admin → Login**, sign in, then reload Wallet management → Crypto assets.',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke<FundingPayload>(
      'admin-luno-funding-addresses',
      {
        body: { symbols: normalized },
      },
    );

    if (error) {
      const msg = await readFunctionsInvokeError(error);
      return { addresses: {}, balances: {}, balanceError: null, error: msg };
    }

    const payload = normalizeInvokeFundingData(data);
    const balances = normalizeBalanceRows(payload.balances, normalized);

    if (payload.luno_ready === false) {
      return {
        addresses: {},
        balances: {},
        balanceError: null,
        error:
          payload.error ??
          'Luno keys are not available to this Edge Function (see Dashboard secrets and redeploy).',
        addressErrors: payload.errors,
      };
    }

    if (payload.error && Object.keys(payload.addresses ?? {}).length === 0) {
      return {
        addresses: {},
        balances,
        balanceError: payload.balance_error ?? null,
        error: payload.error,
        addressErrors: payload.errors,
      };
    }

    return {
      addresses: payload.addresses ?? {},
      balances,
      balanceError: payload.balance_error ?? null,
      error: null,
      addressErrors: payload.errors && Object.keys(payload.errors).length > 0 ? payload.errors : undefined,
    };
  } catch (e) {
    return {
      addresses: {},
      balances: {},
      balanceError: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
