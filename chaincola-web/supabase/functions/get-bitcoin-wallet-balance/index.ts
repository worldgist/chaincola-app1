// Get Bitcoin Wallet Balance with Fiat Conversion Edge Function
// Feature 1: Wallet balance checking with fiat conversion (NGN, USD)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Get Bitcoin RPC URL (Alchemy or custom RPC fallback)
    const bitcoinRpcUrl = Deno.env.get('BITCOIN_RPC_URL') || 
                          Deno.env.get('ALCHEMY_BITCOIN_URL') ||
                          'https://bitcoin-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    const alchemyUrl = bitcoinRpcUrl;

    // Get user's Bitcoin wallet address
    const { data: wallet, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('user_id', user.id)
      .eq('asset', 'BTC')
      .eq('network', 'mainnet')
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Bitcoin wallet not found. Please generate a wallet first.',
          address: null,
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const address = wallet.address;
    console.log(`🔍 Getting Bitcoin balance for address: ${address}`);

    // Get Bitcoin balance using Alchemy API
    let balanceBTC = 0;
    let utxos: any[] = [];

    try {
      // Get known transactions for this address from database
      const { data: knownTransactions } = await supabase
        .from('transactions')
        .select('transaction_hash, crypto_amount, to_address, from_address')
        .or(`to_address.eq.${address},from_address.eq.${address}`)
        .eq('crypto_currency', 'BTC')
        .order('created_at', { ascending: false })
        .limit(200);

      const processedTxids = new Set<string>();

      // Calculate balance and get UTXOs by checking transactions
      for (const dbTx of knownTransactions || []) {
        if (!dbTx.transaction_hash || processedTxids.has(dbTx.transaction_hash)) continue;
        processedTxids.add(dbTx.transaction_hash);

        try {
          // Get transaction details using getrawtransaction
          const txResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'getrawtransaction',
              params: [dbTx.transaction_hash, true],
              id: 1,
            }),
          });

          if (txResponse.ok) {
            const txData = await txResponse.json();
            const tx = txData.result;
            if (!tx || !tx.vout) continue;

            // Check each output
            for (let voutIndex = 0; voutIndex < tx.vout.length; voutIndex++) {
              const output = tx.vout[voutIndex];
              
              if (output.scriptPubKey && output.scriptPubKey.addresses) {
                const outputAddresses = output.scriptPubKey.addresses;
                if (outputAddresses.includes(address)) {
                  // Check if this output is still unspent using gettxout
                  const txoutResponse = await fetch(alchemyUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      jsonrpc: '2.0',
                      method: 'gettxout',
                      params: [dbTx.transaction_hash, voutIndex],
                      id: 2,
                    }),
                  });

                  if (txoutResponse.ok) {
                    const txoutData = await txoutResponse.json();
                    // If gettxout returns a result, the output is unspent
                    if (txoutData.result) {
                      const amount = txoutData.result.value || output.value || 0;
                      balanceBTC += amount;
                      
                      // Add to UTXOs
                      utxos.push({
                        txid: dbTx.transaction_hash,
                        amount: amount,
                        vout: voutIndex,
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (txError) {
          console.warn(`Error checking transaction ${dbTx.transaction_hash}:`, txError);
        }
      }
    } catch (error) {
      console.warn('Could not get balance/UTXOs from Alchemy:', error);
    }

    // Get Bitcoin price for fiat conversion
    // Use a price API (you can integrate with CoinGecko, CoinMarketCap, etc.)
    const btcPriceUSD = await getBitcoinPrice('USD');
    const btcPriceNGN = await getBitcoinPrice('NGN');

    // Calculate fiat values
    const balanceUSD = balanceBTC * btcPriceUSD;
    const balanceNGN = balanceBTC * btcPriceNGN;

    // Get balance from wallet_balances table (if exists)
    const { data: walletBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', user.id)
      .eq('currency', 'BTC')
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          address,
          balance: {
            btc: balanceBTC,
            usd: balanceUSD,
            ngn: balanceNGN,
          },
          prices: {
            btc_usd: btcPriceUSD,
            btc_ngn: btcPriceNGN,
          },
          utxos: utxos.length,
          stored_balance: walletBalance?.balance || 0,
          lastUpdated: new Date().toISOString(),
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception getting Bitcoin balance:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to get Bitcoin balance',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to get Bitcoin price
async function getBitcoinPrice(currency: string): Promise<number> {
  try {
    // Use CoinGecko API (free tier)
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currency.toLowerCase()}`
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.bitcoin?.[currency.toLowerCase()] || 0;
    }
  } catch (error) {
    console.warn('Could not fetch Bitcoin price:', error);
  }

  // Fallback prices (should be updated regularly)
  const fallbackPrices: Record<string, number> = {
    USD: 43000,
    NGN: 70000000, // ~70M NGN per BTC
  };

  return fallbackPrices[currency] || 0;
}




