// Get Ethereum Blockchain Data Edge Function
// Feature 5: Blockchain data reading

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

    const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

    const url = new URL(req.url);
    const txHash = url.searchParams.get('txid');

    const blockchainData: any = {
      network: 'ethereum-mainnet',
      timestamp: new Date().toISOString(),
    };

    // Get latest block number
    const blockNumberResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    if (blockNumberResponse.ok) {
      const blockNumberData = await blockNumberResponse.json();
      blockchainData.latestBlockNumber = parseInt(blockNumberData.result || '0', 16);

      // Get block details
      const blockResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBlockByNumber',
          params: [blockNumberData.result, true],
          id: 2,
        }),
      });

      if (blockResponse.ok) {
        const blockData = await blockResponse.json();
        const block = blockData.result;

        blockchainData.latestBlock = {
          number: parseInt(block.number || '0', 16),
          hash: block.hash,
          timestamp: parseInt(block.timestamp || '0', 16),
          transactions: block.transactions?.length || 0,
          gasUsed: block.gasUsed,
          gasLimit: block.gasLimit,
          difficulty: block.difficulty,
          totalDifficulty: block.totalDifficulty,
        };
      }
    }

    // Get gas price
    const gasPriceResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_gasPrice',
        params: [],
        id: 3,
      }),
    });

    if (gasPriceResponse.ok) {
      const gasPriceData = await gasPriceResponse.json();
      const gasPriceWei = BigInt(gasPriceData.result || '0');
      blockchainData.gasPrice = {
        wei: gasPriceData.result,
        gwei: Number(gasPriceWei) / 1e9,
        usd: (Number(gasPriceWei) / 1e9) * 0.000001, // Approximate
      };
    }

    // Get transaction if txHash provided
    if (txHash) {
      const txResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionByHash',
          params: [txHash],
          id: 4,
        }),
      });

      if (txResponse.ok) {
        const txData = await txResponse.json();
        const tx = txData.result;

        if (tx) {
          // Get transaction receipt for confirmations
          const receiptResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'eth_getTransactionReceipt',
              params: [txHash],
              id: 5,
            }),
          });

          let confirmations = 0;
          let status = 'PENDING';
          if (receiptResponse.ok) {
            const receiptData = await receiptResponse.json();
            const receipt = receiptData.result;
            if (receipt) {
              const blockNum = parseInt(receipt.blockNumber || '0', 16);
              confirmations = blockchainData.latestBlockNumber - blockNum;
              status = receipt.status === '0x1' ? 'CONFIRMED' : 'FAILED';
            }
          }

          blockchainData.transaction = {
            hash: tx.hash,
            from: tx.from,
            to: tx.to,
            value: tx.value,
            valueEth: Number(BigInt(tx.value || '0')) / 1e18,
            gas: tx.gas,
            gasPrice: tx.gasPrice,
            nonce: tx.nonce,
            blockNumber: tx.blockNumber ? parseInt(tx.blockNumber, 16) : null,
            confirmations,
            status,
          };
        }
      }
    }

    // Calculate network health
    const healthScore = calculateNetworkHealth(blockchainData);
    blockchainData.health = {
      score: healthScore,
      status: healthScore >= 0.9 ? 'HEALTHY' : healthScore >= 0.7 ? 'DEGRADED' : 'UNHEALTHY',
      factors: {
        latestBlock: blockchainData.latestBlockNumber,
        gasPrice: blockchainData.gasPrice?.gwei || 0,
      },
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: blockchainData,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception getting Ethereum blockchain data:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to get blockchain data',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function calculateNetworkHealth(data: any): number {
  let score = 1.0;
  const gasPriceGwei = data.gasPrice?.gwei || 0;
  
  // High gas prices indicate network congestion
  if (gasPriceGwei > 100) {
    score -= 0.3;
  } else if (gasPriceGwei > 50) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}















