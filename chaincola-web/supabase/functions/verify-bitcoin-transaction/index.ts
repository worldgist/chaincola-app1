// Verify Bitcoin Transaction Edge Function
// Verifies Bitcoin transaction status using Alchemy Bitcoin API

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

    // Parse request body
    const body = await req.json();
    const { txid, address } = body;

    if (!txid && !address) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Transaction ID (txid) or address is required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    let result: any = {};

    // If txid is provided, verify the transaction
    if (txid) {
      console.log(`🔍 Verifying Bitcoin transaction: ${txid}`);

      // Get transaction details using getrawtransaction
      const txResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getrawtransaction',
          params: [txid, true], // true = verbose (returns full transaction details)
          id: 1,
        }),
      });

      if (!txResponse.ok) {
        const errorText = await txResponse.text();
        console.error('Alchemy API error:', txResponse.status, errorText);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: `Failed to verify transaction: ${txResponse.status}` 
          }),
          { 
            status: txResponse.status, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const txData = await txResponse.json();

      if (txData.error) {
        console.error('Alchemy API returned error:', txData.error);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: txData.error.message || 'Failed to verify transaction' 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const tx = txData.result;

      if (!tx) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Transaction not found' 
          }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Check if transaction is confirmed
      const confirmations = tx.confirmations || 0;
      const isConfirmed = confirmations > 0;
      const blockHash = tx.blockhash || null;
      const blockHeight = tx.height || null;

      // Get block details if blockhash exists
      let blockTime = null;
      if (blockHash) {
        try {
          const blockResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'getblock',
              params: [blockHash],
              id: 2,
            }),
          });

          if (blockResponse.ok) {
            const blockData = await blockResponse.json();
            if (blockData.result) {
              blockTime = blockData.result.time || null;
            }
          }
        } catch (blockError) {
          console.warn('Could not fetch block details:', blockError);
        }
      }

      result = {
        txid,
        confirmed: isConfirmed,
        confirmations,
        blockHash,
        blockHeight,
        blockTime,
        inputs: tx.vin?.length || 0,
        outputs: tx.vout?.length || 0,
        value: tx.vout?.reduce((sum: number, vout: any) => sum + (vout.value || 0), 0) || 0,
        size: tx.size || 0,
        vsize: tx.vsize || 0,
        weight: tx.weight || 0,
        fee: tx.fee || null,
      };
    }

    // If address is provided, get address balance and transactions
    if (address) {
      console.log(`🔍 Getting Bitcoin address info: ${address}`);

      // Get address balance
      const balanceResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getreceivedbyaddress',
          params: [address, 0], // 0 = minimum confirmations
          id: 3,
        }),
      });

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        result.address = address;
        result.totalReceived = balanceData.result || 0;
      }

      // Get unspent transaction outputs (UTXOs) for the address
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
            id: 4,
          }),
        });

        if (utxoResponse.ok) {
          const utxoData = await utxoResponse.json();
          if (utxoData.result) {
            result.utxos = utxoData.result.unspents?.length || 0;
            result.totalUnspent = utxoData.result.total_amount || 0;
          }
        }
      } catch (utxoError) {
        console.warn('Could not fetch UTXOs:', utxoError);
      }
    }

    console.log(`✅ Bitcoin verification completed`);

    return new Response(
      JSON.stringify({
        success: true,
        data: result,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('❌ Exception in verify Bitcoin transaction:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to verify Bitcoin transaction',
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});















