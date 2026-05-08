// Get Ethereum Wallet Balance with Fiat Conversion Edge Function
// Feature 1: Wallet balance checking with fiat conversion (NGN, USD)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchAlchemyUsdForSymbol,
  getUsdToNgnRate,
} from "../_shared/alchemy-prices.ts";

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

    // Get user from auth token
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
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Alchemy Ethereum API URL
    const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

    // Get user's Ethereum wallet address
    const { data: wallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('user_id', user.id)
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Ethereum wallet not found. Please generate a wallet first.',
          address: null,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const address = wallet.address;
    console.log(`🔍 Getting Ethereum balance for address: ${address}`);

    // Get Ethereum balance using Alchemy API
    const balanceResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBalance',
        params: [address, 'latest'],
        id: 1,
      }),
    });

    if (!balanceResponse.ok) {
      throw new Error('Failed to fetch balance from Alchemy');
    }

    const balanceData = await balanceResponse.json();
    // Convert from wei to ETH (1 ETH = 10^18 wei)
    const balanceWei = BigInt(balanceData.result || '0');
    const balanceETH = Number(balanceWei) / 1e18;

    // Get token balances (ERC-20 tokens) if needed
    // You can extend this to fetch USDT, USDC, etc.

    // Get Ethereum price for fiat conversion
    const ethPriceUSD = await getEthereumPrice('USD');
    const ethPriceNGN = await getEthereumPrice('NGN');

    // Calculate fiat values
    const balanceUSD = balanceETH * ethPriceUSD;
    const balanceNGN = balanceETH * ethPriceNGN;

    // Get balance from wallet_balances table
    const { data: walletBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', 'ETH')
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          address,
          balance: {
            eth: balanceETH,
            usd: balanceUSD,
            ngn: balanceNGN,
          },
          prices: {
            eth_usd: ethPriceUSD,
            eth_ngn: ethPriceNGN,
          },
          stored_balance: walletBalance?.balance || 0,
          lastUpdated: new Date().toISOString(),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception getting Ethereum balance:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to get Ethereum balance',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getEthereumPrice(currency: string): Promise<number> {
  const cur = currency.toUpperCase();
  try {
    const usd = await fetchAlchemyUsdForSymbol("ETH");
    if (usd > 0) {
      if (cur === "USD") return usd;
      if (cur === "NGN") return usd * (await getUsdToNgnRate());
    }
  } catch (error) {
    console.warn("Could not fetch Ethereum price from Alchemy:", error);
  }

  const fallbackPrices: Record<string, number> = {
    USD: 2500,
    NGN: 4000000,
  };

  return fallbackPrices[cur] || 0;
}















