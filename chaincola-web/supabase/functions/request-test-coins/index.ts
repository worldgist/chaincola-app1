// Request Free Test Coins Edge Function
// Distributes free testnet coins to users for testing purposes
// Only works when network is 'testnet'

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Test coin amounts (in smallest unit, then converted)
const TEST_COIN_AMOUNTS: Record<string, number> = {
  BTC: 0.001,      // 0.001 BTC testnet
  ETH: 0.1,        // 0.1 ETH testnet
  SOL: 1.0,        // 1 SOL devnet
  XRP: 1000,       // 1000 XRP testnet
  USDT: 100,       // 100 USDT testnet (ERC-20)
  USDC: 100,       // 100 USDC testnet (ERC-20)
};

// Rate limiting: Max requests per user per asset per hour
const MAX_REQUESTS_PER_HOUR = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check
    const auth = req.headers.get("authorization");
    if (!auth) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = auth.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { asset, network = 'testnet' } = body;

    // Validate asset
    const validAssets = ['BTC', 'ETH', 'SOL', 'XRP', 'USDT', 'USDC'];
    if (!asset || !validAssets.includes(asset.toUpperCase())) {
      return new Response(
        JSON.stringify({ error: `Invalid asset. Must be one of: ${validAssets.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only allow testnet
    if (network !== 'testnet') {
      return new Response(
        JSON.stringify({ error: "Free test coins are only available for testnet. Set network to 'testnet'." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const assetUpper = asset.toUpperCase();

    // Check rate limiting
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { data: recentRequests, error: rateLimitError } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', user.id)
      .eq('crypto_currency', assetUpper)
      .eq('transaction_type', 'DEPOSIT')
      .eq('status', 'COMPLETED')
      .gte('created_at', oneHourAgo)
      .eq('metadata->>test_coins', 'true');

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
    }

    const requestCount = recentRequests?.length || 0;
    if (requestCount >= MAX_REQUESTS_PER_HOUR) {
      return new Response(
        JSON.stringify({ 
          error: `Rate limit exceeded. You can request ${assetUpper} test coins ${MAX_REQUESTS_PER_HOUR} times per hour. Please try again later.`,
          requestsUsed: requestCount,
          maxRequests: MAX_REQUESTS_PER_HOUR,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's wallet address for this asset
    const assetToLookup = (assetUpper === 'USDT' || assetUpper === 'USDC') ? 'ETH' : assetUpper;
    
    const { data: wallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('address, id')
      .eq('user_id', user.id)
      .eq('asset', assetToLookup)
      .eq('network', 'testnet')
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ 
          error: `${assetUpper} testnet wallet not found. Please generate a testnet wallet first.`,
          hint: 'Generate a wallet on testnet before requesting test coins',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get test coin amount
    const amount = TEST_COIN_AMOUNTS[assetUpper];
    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({ error: `Test coin amount not configured for ${assetUpper}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`💰 Requesting ${amount} ${assetUpper} test coins for user ${user.id}...`);

    // Credit test coins to wallet_balances table
    const { data: existingBalance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', assetUpper)
      .single();

    const currentBalance = existingBalance 
      ? parseFloat(existingBalance.balance?.toString() || '0')
      : 0;
    const newBalance = currentBalance + amount;

    // Upsert wallet balance
    const { error: updateError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: user.id,
        currency: assetUpper,
        balance: newBalance.toFixed(8),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (updateError) {
      console.error('Error updating wallet balance:', updateError);
      return new Response(
        JSON.stringify({ error: `Failed to credit test coins: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create transaction record
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        transaction_type: 'DEPOSIT',
        crypto_currency: assetUpper,
        crypto_amount: amount,
        status: 'COMPLETED',
        to_address: wallet.address,
        metadata: {
          test_coins: true,
          source: 'faucet',
          network: 'testnet',
          requested_at: new Date().toISOString(),
        },
      });

    if (txError) {
      console.error('Error creating transaction record:', txError);
      // Don't fail the whole operation if transaction record fails
    }

    console.log(`✅ Credited ${amount} ${assetUpper} test coins to user ${user.id}`);
    console.log(`   Previous balance: ${currentBalance}`);
    console.log(`   New balance: ${newBalance}`);

    return new Response(
      JSON.stringify({
        success: true,
        asset: assetUpper,
        amount: amount,
        previousBalance: currentBalance,
        newBalance: newBalance,
        walletAddress: wallet.address,
        message: `Successfully credited ${amount} ${assetUpper} test coins`,
        requestsRemaining: MAX_REQUESTS_PER_HOUR - requestCount - 1,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception in request-test-coins function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to request test coins',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
