// Swap Crypto - Exchange one cryptocurrency for another
// Logic: Sell Crypto A at sell price → Buy Crypto B at buy price
// Atomic transaction: debit user Asset A, credit system Asset A, debit system Asset B, credit user Asset B

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveMinSystemReserveNgn } from "../_shared/min-system-reserve-ngn.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SWAP_FEE_PERCENTAGE = 0.005; // 0.5% swap fee

/** NGN per 1 unit when `crypto_prices` has no row */
const STATIC_SWAP_RATES_NGN: Record<string, number> = {
  BTC: 70_000_000,
  ETH: 4_000_000,
  USDT: 1_650,
  USDC: 1_650,
  XRP: 1_000,
  SOL: 250_000,
};

function ngnSellFromRow(
  row: { price_ngn?: unknown; bid?: unknown } | null,
  assetUpper: string,
): number {
  const bid = Number(row?.bid);
  const mid = Number(row?.price_ngn);
  if (bid > 0) return bid;
  if (mid > 0) return mid;
  return STATIC_SWAP_RATES_NGN[assetUpper] ?? 0;
}

function ngnBuyFromRow(
  row: { price_ngn?: unknown; ask?: unknown } | null,
  assetUpper: string,
): number {
  const ask = Number(row?.ask);
  const mid = Number(row?.price_ngn);
  if (ask > 0) return ask;
  if (mid > 0) return mid;
  return STATIC_SWAP_RATES_NGN[assetUpper] ?? 0;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { from_asset, to_asset, from_amount } = body;

    // Validate inputs
    if (!from_asset || !to_asset || !from_amount) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: from_asset, to_asset, from_amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (from_asset === to_asset) {
      return new Response(
        JSON.stringify({ success: false, error: 'Cannot swap the same asset' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fromAmount = parseFloat(from_amount);
    if (isNaN(fromAmount) || fromAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid from_amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fromAssetUpper = from_asset.toUpperCase();
    const toAssetUpper = to_asset.toUpperCase();

    let fromSellPrice = 0;
    let toBuyPrice = 0;
    let rateSource = '';

    try {
      const { data: fromPriceData } = await supabase
        .from('crypto_prices')
        .select('price_ngn, bid')
        .eq('crypto_symbol', fromAssetUpper)
        .maybeSingle();

      const { data: toPriceData } = await supabase
        .from('crypto_prices')
        .select('price_ngn, ask')
        .eq('crypto_symbol', toAssetUpper)
        .maybeSingle();

      fromSellPrice = ngnSellFromRow(fromPriceData, fromAssetUpper);
      toBuyPrice = ngnBuyFromRow(toPriceData, toAssetUpper);

      const fromLive =
        fromPriceData &&
        (Number(fromPriceData.bid) > 0 || Number(fromPriceData.price_ngn) > 0);
      const toLive =
        toPriceData &&
        (Number(toPriceData.ask) > 0 || Number(toPriceData.price_ngn) > 0);
      rateSource = `${fromLive ? 'crypto_prices' : 'static'}_sell+${toLive ? 'crypto_prices' : 'static'}_buy`;
    } catch (pricingError) {
      console.error('Error fetching prices:', pricingError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch pricing. Please try again.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!fromSellPrice || !toBuyPrice || fromSellPrice <= 0 || toBuyPrice <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unable to fetch prices for swap. Please try again.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Swap pricing (${rateSource}):`);
    console.log(`  ${fromAssetUpper} sell price: ₦${fromSellPrice.toFixed(2)}`);
    console.log(`  ${toAssetUpper} buy price: ₦${toBuyPrice.toFixed(2)}`);

    const pMinSystemReserve = await resolveMinSystemReserveNgn(supabase);

    // Call swap function
    const { data: swapResult, error: swapError } = await supabase.rpc('swap_crypto', {
      p_user_id: user.id,
      p_from_asset: fromAssetUpper,
      p_to_asset: toAssetUpper,
      p_from_amount: fromAmount,
      p_from_sell_price: fromSellPrice,
      p_to_buy_price: toBuyPrice,
      p_swap_fee_percentage: SWAP_FEE_PERCENTAGE,
      p_min_system_reserve: pMinSystemReserve,
    });

    if (swapError) {
      console.error('❌ Swap error:', swapError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: swapError.message || 'Failed to execute swap' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!swapResult || swapResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No result from swap function' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = swapResult[0];

    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error_message || 'Swap failed' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Swap successful: ${fromAmount} ${fromAssetUpper} → ${result.to_amount} ${toAssetUpper}`);

    return new Response(
      JSON.stringify({
        success: true,
        from_asset: fromAssetUpper,
        to_asset: toAssetUpper,
        from_amount: parseFloat(result.from_amount.toString()),
        to_amount: parseFloat(result.to_amount.toString()),
        value_in_ngn: parseFloat(result.value_in_ngn.toString()),
        swap_fee: parseFloat(result.swap_fee.toString()),
        new_balances: result.new_balances,
        exchange_rate: {
          from_sell_price: fromSellPrice,
          to_buy_price: toBuyPrice,
          rate_source: rateSource,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception in swap:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
