// Instant Sell Crypto V2 - Following exact specification
// POST /api/sell
// Atomic internal ledger swap system

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoSellNotification } from "../_shared/send-crypto-sell-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Safety controls
const MAX_SELL_PER_TRANSACTION: Record<string, number> = {
  'BTC': 10,
  'ETH': 100,
  'USDT': 100000,
  'USDC': 100000,
  'XRP': 1000000,
  'SOL': 10000,
};

// Minimum system reserve - can be overridden via environment variable
// Default: ₦1,000,000 for production safety (prevents system from running out of liquidity)
// Set to 0 for testing only
const MIN_SYSTEM_RESERVE = parseFloat(Deno.env.get('MIN_SYSTEM_RESERVE') || '1000000.00');
const DEFAULT_FEE_PERCENTAGE = 0.01; // 1% default - overridden by admin app_settings

// Static NGN rates per 1 unit of crypto (used when no admin override/frozen price)
// Admin can set override_sell_price_ngn or frozen_sell_price_ngn in pricing_engine_config
const STATIC_SELL_RATES_NGN: Record<string, number> = {
  'BTC': 70_000_000,
  'ETH': 4_000_000,
  'USDT': 1_650,
  'USDC': 1_650,
  'XRP': 1_000,
};

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
    const { asset, amount } = body;

    // Validate request
    if (!asset || amount === undefined || amount === null) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: asset, amount' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cryptoAmount = parseFloat(amount);
    const assetUpper = asset.toUpperCase();

    // Validate asset
    const supportedAssets = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
    if (!supportedAssets.includes(assetUpper)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Unsupported asset: ${asset}. Supported: ${supportedAssets.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount
    if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check max sell per transaction
    const maxSell = MAX_SELL_PER_TRANSACTION[assetUpper];
    if (maxSell && cryptoAmount > maxSell) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Amount exceeds maximum sell per transaction: ${maxSell} ${assetUpper}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`💰 Instant sell request: User=${user.id}, Asset=${assetUpper}, Amount=${cryptoAmount}`);

    // Get pricing engine configuration
    let pricingConfig: any = null;
    try {
      const { data: configData, error: configError } = await supabase.rpc('get_pricing_engine_config', {
        p_asset: assetUpper,
      });
      
      if (!configError && configData && configData.length > 0) {
        pricingConfig = configData[0];
        
        // Check if trading is enabled
        if (!pricingConfig.trading_enabled) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: `Trading is currently disabled for ${assetUpper}` 
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch (err) {
      console.warn('⚠️ Error fetching pricing engine config:', err);
    }

    // Use static NGN rate only (no market/Luno API)
    // Priority: admin override_sell_price_ngn > frozen_sell_price_ngn > static fallback
    let rate = 0;
    let rateSource = 'unknown';

    if (pricingConfig?.override_sell_price_ngn) {
      rate = parseFloat(pricingConfig.override_sell_price_ngn.toString());
      rateSource = 'admin_override';
      console.log(`📊 Using admin override sell price for ${assetUpper}: ₦${rate}`);
    } else if (pricingConfig?.price_frozen && pricingConfig.frozen_sell_price_ngn) {
      rate = parseFloat(pricingConfig.frozen_sell_price_ngn.toString());
      rateSource = 'admin_frozen';
      console.log(`📊 Using admin frozen sell price for ${assetUpper}: ₦${rate}`);
    } else {
      rate = STATIC_SELL_RATES_NGN[assetUpper] || 0;
      rateSource = 'static';
      console.log(`📊 Using static sell price for ${assetUpper}: ₦${rate}`);
    }

    if (!rate || rate <= 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unable to fetch current price. Please try again.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Final sell rate (${rateSource}): 1 ${assetUpper} = ₦${rate.toFixed(2)}`);

    // Get platform fee % from app_settings (admin configurable)
    let feePercentage = DEFAULT_FEE_PERCENTAGE;
    try {
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('transaction_fee_percentage')
        .eq('id', 1)
        .single();
      if (appSettings?.transaction_fee_percentage != null) {
        const pct = parseFloat(appSettings.transaction_fee_percentage.toString());
        if (!isNaN(pct) && pct >= 0 && pct <= 100) {
          feePercentage = pct / 100; // Convert 1 to 0.01 (1% = 1 in DB)
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not fetch app_settings fee, using default 1%');
    }
    console.log(`📊 Platform fee: ${(feePercentage * 100).toFixed(2)}%`);

    // Call atomic sell function
    // Formula: NGN_before_fee = crypto_amount × rate; fee = NGN_before_fee × fee%; credit = NGN_before_fee - fee
    const { data: sellResult, error: sellError } = await supabase.rpc('instant_sell_crypto_v2', {
      p_user_id: user.id,
      p_asset: assetUpper,
      p_amount: cryptoAmount,
      p_rate: rate,
      p_fee_percentage: feePercentage,
      p_max_sell_per_transaction: maxSell || null,
      p_min_system_reserve: MIN_SYSTEM_RESERVE,
    });

    if (sellError) {
      console.error('❌ Instant sell error:', sellError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: sellError.message || 'Failed to execute sell' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!sellResult || sellResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No result from sell function' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = sellResult[0];

    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error_message || 'Sell failed' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Instant sell successful: ${cryptoAmount} ${assetUpper} → ₦${result.ngn_amount.toFixed(2)}`);
    console.log(`📊 System inventory updated: ${assetUpper} inventory increased by ${cryptoAmount}`);
    console.log(`💰 System NGN float decreased by ₦${result.ngn_amount.toFixed(2)}`);

    // Note: This is an internal ledger swap. No blockchain movement occurs.
    // The crypto is added to system_wallets.{asset}_inventory (main wallet inventory)
    // The NGN is deducted from system_wallets.ngn_float_balance
    // Real crypto remains in the main wallet addresses configured in Treasury Settings

    // Send push notification
    try {
      await sendCryptoSellNotification({
        supabase,
        userId: user.id,
        cryptoCurrency: assetUpper,
        cryptoAmount: cryptoAmount,
        ngnAmount: result.ngn_amount,
        transactionHash: `instant_sell_${Date.now()}`,
        status: 'COMPLETED',
      });
    } catch (notifError) {
      console.error('⚠️ Failed to send sell notification:', notifError);
      // Don't fail the whole operation if notification fails
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        ngn_amount: result.ngn_amount,
        new_balances: result.new_balances,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Instant sell exception:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
