// Instant Sell Crypto - Internal swap engine
// Swaps crypto to NGN instantly using atomic database transactions
// No blockchain or exchange API calls - pure internal swap

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoSellNotification } from "../_shared/send-crypto-sell-notification.ts";
import { evaluateInstantSell } from "../_shared/treasury-trade-gates.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLATFORM_FEE_PERCENTAGE = 0.01; // 1% platform fee

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
    const { crypto_currency, crypto_amount, price_per_unit } = body;

    // Validate inputs
    if (!crypto_currency || !crypto_amount || !price_per_unit) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: crypto_currency, crypto_amount, price_per_unit' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cryptoAmount = parseFloat(crypto_amount);
    const pricePerUnit = parseFloat(price_per_unit);

    if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid crypto_amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isNaN(pricePerUnit) || pricePerUnit <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid price_per_unit' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Supported cryptocurrencies
    const supportedCryptos = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
    const cryptoCurrency = crypto_currency.toUpperCase();

    if (!supportedCryptos.includes(cryptoCurrency)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Unsupported cryptocurrency: ${cryptoCurrency}. Supported: ${supportedCryptos.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sellEval = await evaluateInstantSell(supabase, cryptoCurrency, corsHeaders, cryptoAmount);
    if (!sellEval.ok) return sellEval.response;

    console.log(`💰 Instant sell request: User=${user.id}, Crypto=${cryptoCurrency}, Amount=${cryptoAmount}, Price=₦${pricePerUnit}`);

    // Check system liquidity before proceeding (optional pre-check)
    // The database function will also check, but this gives us early feedback
    const { data: systemWallet } = await supabase
      .from('system_wallet')
      .select('ngn_float_balance')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .single();

    const estimatedNgn = cryptoAmount * pricePerUnit * (1 - PLATFORM_FEE_PERCENTAGE);
    if (systemWallet && systemWallet.ngn_float_balance < estimatedNgn) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `System liquidity low. Please try again later or contact support.` 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call atomic swap function
    const { data: swapResult, error: swapError } = await supabase.rpc('instant_sell_crypto', {
      p_user_id: user.id,
      p_crypto_currency: cryptoCurrency,
      p_crypto_amount: cryptoAmount,
      p_price_per_unit: pricePerUnit,
      p_platform_fee_percentage: PLATFORM_FEE_PERCENTAGE,
    });

    if (swapError) {
      console.error('❌ Instant sell error:', swapError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: swapError.message || 'Failed to execute instant sell' 
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

    console.log(`✅ Instant sell successful: ${cryptoAmount} ${cryptoCurrency} → ₦${result.ngn_credited.toFixed(2)}`);

    // Create transaction record
    const transactionHash = `instant_sell_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        transaction_type: 'SELL',
        crypto_currency: cryptoCurrency,
        crypto_amount: cryptoAmount.toString(),
        fiat_currency: 'NGN',
        fiat_amount: result.ngn_credited,
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
        transaction_hash: transactionHash,
        metadata: {
          instant_sell: true,
          price_per_unit: pricePerUnit,
          total_ngn_before_fee: (cryptoAmount * pricePerUnit).toFixed(2),
          platform_fee: result.platform_fee.toFixed(2),
          platform_fee_percentage: PLATFORM_FEE_PERCENTAGE,
          new_crypto_balance: result.new_crypto_balance.toFixed(8),
          new_ngn_balance: result.new_ngn_balance.toFixed(2),
          executed_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (txError) {
      console.error('⚠️ Failed to create transaction record:', txError);
      // Don't fail the whole operation if transaction record fails
    }

    // Send push notification
    try {
      await sendCryptoSellNotification({
        supabase,
        userId: user.id,
        cryptoCurrency: cryptoCurrency,
        cryptoAmount: cryptoAmount,
        ngnAmount: result.ngn_credited,
        transactionHash: transactionHash,
        sellId: transaction?.id?.toString(),
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
        data: {
          crypto_currency: cryptoCurrency,
          crypto_amount: cryptoAmount,
          ngn_credited: result.ngn_credited,
          platform_fee: result.platform_fee,
          new_crypto_balance: result.new_crypto_balance,
          new_ngn_balance: result.new_ngn_balance,
          transaction_id: transaction?.id,
          transaction_hash: transactionHash,
        },
        message: `Successfully sold ${cryptoAmount} ${cryptoCurrency} for ₦${result.ngn_credited.toFixed(2)}`,
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
