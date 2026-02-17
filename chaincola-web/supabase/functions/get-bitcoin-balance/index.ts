// Get Bitcoin Balance Edge Function
// Gets Bitcoin address balance and transaction history using Alchemy Bitcoin API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Bitcoin RPC URL (Alchemy or custom RPC fallback)
    const bitcoinRpcUrl = Deno.env.get('BITCOIN_RPC_URL') || 
                          Deno.env.get('ALCHEMY_BITCOIN_URL') ||
                          'https://bitcoin-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    const alchemyUrl = bitcoinRpcUrl;

    // Parse request body or query parameters
    const url = new URL(req.url);
    const address = url.searchParams.get('address') || (await req.json().catch(() => ({}))).address;

    if (!address) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Bitcoin address is required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`🔍 Getting Bitcoin balance for address: ${address}`);

    // Get address balance using multiple methods
    const balance = {
      confirmed: 0,
      unconfirmed: 0,
      total: 0,
    };

    // Method 1: Get received amount
    try {
      const receivedResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getreceivedbyaddress',
          params: [address, 0], // 0 = minimum confirmations
          id: 1,
        }),
      });

      if (receivedResponse.ok) {
        const receivedData = await receivedResponse.json();
        if (receivedData.result !== undefined) {
          balance.total = receivedData.result;
        }
      }
    } catch (error) {
      console.warn('Could not get received amount:', error);
    }

    // Method 2: Get unspent transaction outputs (UTXOs)
    let utxos: any[] = [];
    try {
      const utxoResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'scantxoutset',
          params: ['start', [`addr(${address})`]],
          id: 2,
        }),
      });

      if (utxoResponse.ok) {
        const utxoData = await utxoResponse.json();
        if (utxoData.result && utxoData.result.unspents) {
          utxos = utxoData.result.unspents;
          balance.confirmed = utxoData.result.total_amount || 0;
        }
      }
    } catch (error) {
      console.warn('Could not get UTXOs:', error);
    }

    // Get recent transactions for the address
    let transactions: any[] = [];
    try {
      // Note: Alchemy Bitcoin API doesn't have a direct method to get address transactions
      // You would need to use a block explorer API or index the blockchain
      // For now, we'll return the balance and UTXO information
    } catch (error) {
      console.warn('Could not get transactions:', error);
    }

    console.log(`✅ Bitcoin balance retrieved: ${balance.confirmed} BTC`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          address,
          balance: {
            confirmed: balance.confirmed,
            unconfirmed: balance.unconfirmed,
            total: balance.total || balance.confirmed,
          },
          utxos: utxos.length,
          utxoDetails: utxos.slice(0, 10), // Return first 10 UTXOs
          lastUpdated: new Date().toISOString(),
        },
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('❌ Exception getting Bitcoin balance:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to get Bitcoin balance',
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});















