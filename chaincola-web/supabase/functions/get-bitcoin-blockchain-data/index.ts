// Get Bitcoin Blockchain Data Edge Function
// Feature 5: Blockchain data reading - Block numbers, network status, transaction status

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

    // Get Bitcoin RPC URL (Alchemy or custom RPC fallback)
    const bitcoinRpcUrl = Deno.env.get('BITCOIN_RPC_URL') || 
                          Deno.env.get('ALCHEMY_BITCOIN_URL') ||
                          'https://bitcoin-mainnet.g.alchemy.com/v2/rq1GQ1LbhwToT3n4E6IIB';
    const alchemyUrl = bitcoinRpcUrl;

    // Parse query parameters
    const url = new URL(req.url);
    const txid = url.searchParams.get('txid');
    const blockHash = url.searchParams.get('block');

    const blockchainData: any = {
      network: 'bitcoin-mainnet',
      timestamp: new Date().toISOString(),
    };

    // Get best block hash (latest block)
    const bestBlockResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'getbestblockhash',
        params: [],
        id: 1,
      }),
    });

    if (bestBlockResponse.ok) {
      const bestBlockData = await bestBlockResponse.json();
      blockchainData.latestBlockHash = bestBlockData.result;

      // Get block details
      if (bestBlockData.result) {
        const blockResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'getblock',
            params: [bestBlockData.result],
            id: 2,
          }),
        });

        if (blockResponse.ok) {
          const blockData = await blockResponse.json();
          const block = blockData.result;

          blockchainData.latestBlock = {
            hash: block.hash,
            height: block.height,
            time: block.time,
            mediantime: block.mediantime,
            nonce: block.nonce,
            difficulty: block.difficulty,
            chainwork: block.chainwork,
            nTx: block.nTx,
            previousblockhash: block.previousblockhash,
            nextblockhash: block.nextblockhash,
            size: block.size,
            strippedsize: block.strippedsize,
            weight: block.weight,
            version: block.version,
            versionHex: block.versionHex,
            merkleroot: block.merkleroot,
          };
        }
      }
    }

    // Get blockchain info
    const chainInfoResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'getblockchaininfo',
        params: [],
        id: 3,
      }),
    });

    if (chainInfoResponse.ok) {
      const chainInfoData = await chainInfoResponse.json();
      const info = chainInfoData.result;

      blockchainData.networkInfo = {
        chain: info.chain,
        blocks: info.blocks,
        headers: info.headers,
        bestblockhash: info.bestblockhash,
        difficulty: info.difficulty,
        mediantime: info.mediantime,
        verificationprogress: info.verificationprogress,
        chainwork: info.chainwork,
        pruned: info.pruned,
        softforks: info.softforks,
        bip9_softforks: info.bip9_softforks,
        warnings: info.warnings,
      };
    }

    // Get mempool info (pending transactions)
    const mempoolInfoResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'getmempoolinfo',
        params: [],
        id: 4,
      }),
    });

    if (mempoolInfoResponse.ok) {
      const mempoolData = await mempoolInfoResponse.json();
      blockchainData.mempool = mempoolData.result;
    }

    // Get network info
    const networkInfoResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'getnetworkinfo',
        params: [],
        id: 5,
      }),
    });

    if (networkInfoResponse.ok) {
      const networkData = await networkInfoResponse.json();
      blockchainData.networkStatus = networkData.result;
    }

    // If txid provided, get transaction status
    if (txid) {
      const txResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getrawtransaction',
          params: [txid, true],
          id: 6,
        }),
      });

      if (txResponse.ok) {
        const txData = await txResponse.json();
        const tx = txData.result;

        blockchainData.transaction = {
          txid,
          confirmations: tx.confirmations || 0,
          blockhash: tx.blockhash,
          blockheight: tx.height,
          blocktime: tx.blocktime,
          status: tx.confirmations >= 6 ? 'CONFIRMED' : tx.confirmations > 0 ? 'CONFIRMING' : 'PENDING',
          size: tx.size,
          vsize: tx.vsize,
          weight: tx.weight,
          fee: tx.fee,
          inputs: tx.vin?.length || 0,
          outputs: tx.vout?.length || 0,
        };
      }
    }

    // Calculate network health score
    const healthScore = calculateNetworkHealth(blockchainData);
    blockchainData.health = {
      score: healthScore,
      status: healthScore >= 0.9 ? 'HEALTHY' : healthScore >= 0.7 ? 'DEGRADED' : 'UNHEALTHY',
      factors: {
        blocksSynced: blockchainData.networkInfo?.verificationprogress || 0,
        mempoolSize: blockchainData.mempool?.size || 0,
        networkConnections: blockchainData.networkStatus?.connections || 0,
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
    console.error('❌ Exception getting blockchain data:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to get blockchain data',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to calculate network health
function calculateNetworkHealth(data: any): number {
  let score = 1.0;

  // Check verification progress
  const verificationProgress = data.networkInfo?.verificationprogress || 0;
  if (verificationProgress < 0.99) {
    score -= 0.2;
  }

  // Check mempool size (too large = network congestion)
  const mempoolSize = data.mempool?.size || 0;
  if (mempoolSize > 100000) {
    score -= 0.2;
  } else if (mempoolSize > 50000) {
    score -= 0.1;
  }

  // Check network connections
  const connections = data.networkStatus?.connections || 0;
  if (connections < 8) {
    score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}















