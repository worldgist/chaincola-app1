// Instant Buy Crypto - Atomic internal ledger swap system
// POST /functions/v1/instant-buy-crypto
// Swaps NGN to crypto instantly using system inventory

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoBuyNotification } from "../_shared/send-crypto-buy-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Safety controls
const MAX_BUY_PER_TRANSACTION: Record<string, number> = {
  'BTC': 10,
  'ETH': 100,
  'USDT': 100000,
  'USDC': 100000,
  'XRP': 1000000,
  'SOL': 10000,
};

// Minimum system reserve
const MIN_SYSTEM_RESERVE = parseFloat(Deno.env.get('MIN_SYSTEM_RESERVE') || '1000000.00');
const DEFAULT_FEE_PERCENTAGE = 0.01; // 1% default - overridden by admin app_settings

// Static NGN rates per 1 unit of crypto (used when no admin override/frozen price)
const STATIC_BUY_RATES_NGN: Record<string, number> = {
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
    const { asset, ngn_amount } = body;

    // Validate request
    if (!asset || ngn_amount === undefined || ngn_amount === null) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: asset, ngn_amount' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ngnAmount = parseFloat(ngn_amount);
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
    if (isNaN(ngnAmount) || ngnAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid NGN amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check max buy per transaction
    const maxBuy = MAX_BUY_PER_TRANSACTION[assetUpper];
    if (maxBuy) {
      // Estimate crypto amount (rough estimate, actual will be calculated by function)
      const estimatedRate = 1000000; // Placeholder, will get actual rate
      const estimatedCrypto = ngnAmount / estimatedRate;
      if (estimatedCrypto > maxBuy) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Amount exceeds maximum buy per transaction: ${maxBuy} ${assetUpper}` 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

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
    // Priority: admin override_buy_price_ngn > frozen_buy_price_ngn > static fallback
    let rate: number = 0;
    if (pricingConfig?.override_buy_price_ngn) {
      rate = parseFloat(pricingConfig.override_buy_price_ngn.toString());
      console.log(`📊 Using admin override buy price for ${assetUpper}: ₦${rate}`);
    } else if (pricingConfig?.price_frozen && pricingConfig.frozen_buy_price_ngn) {
      rate = parseFloat(pricingConfig.frozen_buy_price_ngn.toString());
      console.log(`📊 Using admin frozen buy price for ${assetUpper}: ₦${rate}`);
    } else {
      rate = STATIC_BUY_RATES_NGN[assetUpper] || 0;
      console.log(`📊 Using static buy price for ${assetUpper}: ₦${rate}`);
    }

    if (!rate || rate <= 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to get ${assetUpper} rate. Please try again later.` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
          feePercentage = pct / 100; // 1 = 1%
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not fetch app_settings fee, using default 1%');
    }

    // Call instant buy function
    const { data: buyResult, error: buyError } = await supabase.rpc('instant_buy_crypto', {
      p_user_id: user.id,
      p_asset: assetUpper,
      p_ngn_amount: ngnAmount,
      p_rate: rate,
      p_fee_percentage: feePercentage,
      p_min_system_reserve: MIN_SYSTEM_RESERVE,
    });

    if (buyError) {
      console.error('❌ Instant buy error:', buyError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: buyError.message || 'Failed to execute instant buy' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!buyResult || buyResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No result from buy function' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = buyResult[0];

    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error_message || 'Buy failed' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Instant buy successful: ₦${ngnAmount} → ${result.crypto_amount} ${assetUpper}`);

    // Get transaction ID from result
    const transactionId = result.new_balances?.transaction_id;
    const transactionHash = transactionId ? `instant_buy_${transactionId}` : `instant_buy_${Date.now()}`;

    // Send push notification
    try {
      await sendCryptoBuyNotification({
        supabase,
        userId: user.id,
        cryptoCurrency: assetUpper,
        cryptoAmount: parseFloat(result.crypto_amount.toString()),
        ngnAmount: ngnAmount,
        transactionHash: transactionHash,
        buyId: transactionId?.toString(),
        status: 'COMPLETED',
      });
    } catch (notifError) {
      console.error('⚠️ Failed to send buy notification:', notifError);
      // Don't fail the whole operation if notification fails
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        crypto_amount: parseFloat(result.crypto_amount.toString()),
        ngn_amount: ngnAmount,
        rate: rate,
        fee_percentage: FEE_PERCENTAGE,
        balances: result.new_balances,
        transaction_id: transactionId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Instant buy exception:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
