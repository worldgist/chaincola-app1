// Get On-Chain Balances Edge Function
// Fetches real-time balances from blockchain for all user crypto wallets

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getOnChainBalance } from "../_shared/auto-sweep-utility.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user ID from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Get all active crypto wallets for this user
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, asset, address, network')
      .eq('user_id', userId)
      .eq('network', 'mainnet')
      .eq('is_active', true);

    if (walletsError) {
      console.error('Error fetching wallets:', walletsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch wallets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!wallets || wallets.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          balances: {
            BTC: 0,
            ETH: 0,
            USDT: 0,
            USDC: 0,
            XRP: 0,
            SOL: 0,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map asset names to currency symbols
    const assetToCurrency: Record<string, string> = {
      'BTC': 'BTC',
      'ETH': 'ETH',
      'SOL': 'SOL',
      'XRP': 'XRP',
      'USDT': 'USDT',
      'USDC': 'USDC',
    };

    // Fetch on-chain balances for each wallet
    const balances: Record<string, number> = {
      BTC: 0,
      ETH: 0,
      USDT: 0,
      USDC: 0,
      XRP: 0,
      SOL: 0,
    };

    const balancePromises = wallets.map(async (wallet) => {
      const currency = assetToCurrency[wallet.asset];
      if (!currency) {
        console.warn(`⚠️ Unknown asset: ${wallet.asset}`);
        return;
      }

      try {
        const balance = await getOnChainBalance(currency, wallet.address);
        console.log(`✅ ${currency} balance for ${wallet.address.substring(0, 10)}...: ${balance}`);
        
        // Sum balances if user has multiple wallets for same currency
        balances[currency] = (balances[currency] || 0) + balance;
      } catch (error: any) {
        console.error(`❌ Error fetching ${currency} balance for ${wallet.address}:`, error.message);
        // Continue with other wallets even if one fails
      }
    });

    await Promise.allSettled(balancePromises);

    return new Response(
      JSON.stringify({
        success: true,
        balances,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error getting on-chain balances:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
