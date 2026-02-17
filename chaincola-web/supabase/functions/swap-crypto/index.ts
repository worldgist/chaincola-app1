// Swap Crypto - Exchange one cryptocurrency for another
// Logic: Sell Crypto A at sell price → Buy Crypto B at buy price
// Atomic transaction: debit user Asset A, credit system Asset A, debit system Asset B, credit user Asset B

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SWAP_FEE_PERCENTAGE = 0.005; // 0.5% swap fee
const MIN_SYSTEM_RESERVE = parseFloat(Deno.env.get('MIN_SYSTEM_RESERVE') || '1000000.00');

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

    // Get pricing from pricing engine
    let fromSellPrice = 0;
    let toBuyPrice = 0;
    let rateSource = 'unknown';

    try {
      // Get pricing config for from_asset (sell price)
      const { data: fromPricingConfig, error: fromPricingError } = await supabase
        .from('pricing_engine_config')
        .select('*')
        .eq('asset', fromAssetUpper)
        .single();

      // Get pricing config for to_asset (buy price)
      const { data: toPricingConfig, error: toPricingError } = await supabase
        .from('pricing_engine_config')
        .select('*')
        .eq('asset', toAssetUpper)
        .single();

      // Get market prices from crypto_prices table
      const { data: fromPriceData } = await supabase
        .from('crypto_prices')
        .select('price_ngn, bid')
        .eq('crypto_symbol', fromAssetUpper)
        .single();

      const { data: toPriceData } = await supabase
        .from('crypto_prices')
        .select('price_ngn, ask')
        .eq('crypto_symbol', toAssetUpper)
        .single();

      // Calculate sell price for from_asset
      if (fromPricingConfig) {
        if (fromPricingConfig.override_sell_price_ngn) {
          fromSellPrice = parseFloat(fromPricingConfig.override_sell_price_ngn.toString());
          rateSource = 'override-sell';
        } else if (fromPricingConfig.price_frozen && fromPricingConfig.frozen_sell_price_ngn) {
          fromSellPrice = parseFloat(fromPricingConfig.frozen_sell_price_ngn.toString());
          rateSource = 'frozen-sell';
        } else {
          fromSellPrice = fromPriceData?.bid || fromPriceData?.price_ngn || 0;
          rateSource = 'market-sell';
        }
      } else {
        // Fallback to market price
        fromSellPrice = fromPriceData?.bid || fromPriceData?.price_ngn || 0;
        rateSource = 'market-sell';
      }

      // Calculate buy price for to_asset
      if (toPricingConfig) {
        if (toPricingConfig.override_buy_price_ngn) {
          toBuyPrice = parseFloat(toPricingConfig.override_buy_price_ngn.toString());
          rateSource += '-override-buy';
        } else if (toPricingConfig.price_frozen && toPricingConfig.frozen_buy_price_ngn) {
          toBuyPrice = parseFloat(toPricingConfig.frozen_buy_price_ngn.toString());
          rateSource += '-frozen-buy';
        } else {
          toBuyPrice = toPriceData?.ask || toPriceData?.price_ngn || 0;
          rateSource += '-market-buy';
        }
      } else {
        // Fallback to market price
        toBuyPrice = toPriceData?.ask || toPriceData?.price_ngn || 0;
        rateSource += '-market-buy';
      }

      // Fallback to hardcoded prices if pricing engine fails
      if (!fromSellPrice || fromSellPrice <= 0) {
        const fallbackPrices: Record<string, number> = {
          'BTC': 95000000,
          'ETH': 3500000,
          'USDT': 1650,
          'USDC': 1650,
          'XRP': 1000,
        };
        fromSellPrice = fallbackPrices[fromAssetUpper] || 0;
        rateSource = 'fallback-sell';
      }

      if (!toBuyPrice || toBuyPrice <= 0) {
        const fallbackPrices: Record<string, number> = {
          'BTC': 95000000,
          'ETH': 3500000,
          'USDT': 1650,
          'USDC': 1650,
          'XRP': 1000,
        };
        toBuyPrice = fallbackPrices[toAssetUpper] || 0;
        rateSource += '-fallback-buy';
      }
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

    // Call swap function
    const { data: swapResult, error: swapError } = await supabase.rpc('swap_crypto', {
      p_user_id: user.id,
      p_from_asset: fromAssetUpper,
      p_to_asset: toAssetUpper,
      p_from_amount: fromAmount,
      p_from_sell_price: fromSellPrice,
      p_to_buy_price: toBuyPrice,
      p_swap_fee_percentage: SWAP_FEE_PERCENTAGE,
      p_min_system_reserve: MIN_SYSTEM_RESERVE,
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
