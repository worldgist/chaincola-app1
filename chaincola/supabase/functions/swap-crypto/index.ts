/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

type SwapAction = 'quote' | 'execute';
type Asset = 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL';

type SwapRequest = {
  action?: SwapAction;
  from_asset: Asset;
  to_asset: Asset;
  from_amount: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAsset(v: unknown): v is Asset {
  return (
    v === 'BTC' ||
    v === 'ETH' ||
    v === 'USDT' ||
    v === 'USDC' ||
    v === 'XRP' ||
    v === 'SOL'
  );
}

function roundDown(n: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.floor(n * f) / f;
}

async function getPricesNGN(symbols: Asset[]) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const url = new URL(`${supabaseUrl}/functions/v1/get-token-prices`);
  url.searchParams.set('symbols', symbols.join(','));

  // We call the existing pricing function from your project.
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
  });

  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || text || `HTTP ${res.status}`;
    throw new Error(`Price service error: ${msg}`);
  }

  // Expected shape varies; normalize to { [symbol]: { bid, ask, price_ngn } }
  const prices = data?.prices || data?.data || data;
  if (!prices || typeof prices !== 'object') {
    throw new Error('Price service returned no prices');
  }

  return prices as Record<string, { bid?: number; ask?: number; price_ngn?: number }>;
}

function assetDecimals(asset: Asset): number {
  // Display/rounding precision for output amounts
  switch (asset) {
    case 'BTC':
    case 'ETH':
      return 8;
    case 'XRP':
      return 6;
    case 'SOL':
      return 6;
    case 'USDT':
    case 'USDC':
      return 6;
    default:
      return 8;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) {
      return json({ success: false, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }, 500);
    }

    const authHeader =
      req.headers.get('authorization') || req.headers.get('Authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json({ success: false, error: 'Not authenticated' }, 401);
    }

    const payload = (await req.json().catch(() => null)) as SwapRequest | null;
    if (!payload) return json({ success: false, error: 'Invalid JSON body' }, 400);

    const action: SwapAction = (payload.action || 'execute') as SwapAction;
    const from_asset = payload.from_asset;
    const to_asset = payload.to_asset;
    const from_amount = payload.from_amount;

    if (action !== 'quote' && action !== 'execute') {
      return json({ success: false, error: 'Invalid action' }, 400);
    }
    if (!isAsset(from_asset) || !isAsset(to_asset)) {
      return json({ success: false, error: 'Invalid asset' }, 400);
    }
    if (from_asset === to_asset) {
      return json({ success: false, error: 'from_asset and to_asset must be different' }, 400);
    }
    if (!Number.isFinite(from_amount) || from_amount <= 0) {
      return json({ success: false, error: 'Invalid from_amount' }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ success: false, error: 'Invalid session' }, 401);
    }
    const userId = userData.user.id;

    // Fee: 0.5% (50 bps)
    const feeBps = 50;

    // Prices: sell from_asset at bid, buy to_asset at ask (fallback to price_ngn)
    const prices = await getPricesNGN([from_asset, to_asset]);
    const from = prices[from_asset];
    const to = prices[to_asset];
    const fromSellPrice = Number(from?.bid ?? from?.price_ngn ?? 0);
    const toBuyPrice = Number(to?.ask ?? to?.price_ngn ?? 0);
    if (!Number.isFinite(fromSellPrice) || fromSellPrice <= 0) {
      return json({ success: false, error: `Price not found for ${from_asset}` }, 400);
    }
    if (!Number.isFinite(toBuyPrice) || toBuyPrice <= 0) {
      return json({ success: false, error: `Price not found for ${to_asset}` }, 400);
    }

    const valueInNgn = from_amount * fromSellPrice;
    const swapFee = (valueInNgn * feeBps) / 10_000;
    const valueAfterFee = valueInNgn - swapFee;
    const rawToAmount = valueAfterFee / toBuyPrice;
    const toAmount = roundDown(rawToAmount, assetDecimals(to_asset));

    const quoteResult = {
      success: true,
      from_asset,
      to_asset,
      from_amount,
      to_amount: toAmount,
      value_in_ngn: valueInNgn,
      swap_fee: swapFee,
      exchange_rate: {
        from_sell_price: fromSellPrice,
        to_buy_price: toBuyPrice,
        rate_source: 'get-token-prices',
      },
    };

    if (action === 'quote') {
      return json(quoteResult);
    }

    // Execute swap via RPC (atomic) using service role if available
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const adminClient = createClient(supabaseUrl, serviceKey || anonKey, {
      auth: { persistSession: false },
    });

    const { data: execData, error: execErr } = await adminClient.rpc('swap_crypto_execute', {
      p_user_id: userId,
      p_from_asset: from_asset,
      p_to_asset: to_asset,
      p_from_amount: from_amount,
      p_to_amount: toAmount,
      p_value_in_ngn: valueInNgn,
      p_swap_fee: swapFee,
      p_from_sell_price: fromSellPrice,
      p_to_buy_price: toBuyPrice,
      p_rate_source: 'get-token-prices',
    });

    if (execErr) {
      const msg = execErr.message || String(execErr);
      return json({ success: false, error: msg }, 400);
    }

    const exec = execData as Record<string, unknown> | null;
    const nb = exec?.new_balances as Record<string, unknown> | undefined;

    return json({
      ...quoteResult,
      swap_id: (exec?.swap_id as string | undefined) ?? undefined,
      new_balances: nb
        ? {
            from_balance: Number(nb.from_balance),
            to_balance: Number(nb.to_balance),
            system_from_inventory: Number(nb.system_from_inventory),
            system_to_inventory: Number(nb.system_to_inventory),
          }
        : undefined,
    });
  } catch (e: any) {
    return json({ success: false, error: e?.message || 'Unexpected error' }, 500);
  }
});

