// Get Bitcoin Live Market Price Edge Function
// Fetches Bitcoin price using Alchemy API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PriceResponse {
  price: number;
  price_usd: number;
  price_ngn: number;
  last_updated: string;
  source: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Alchemy API key from environment
    // Default to the provided Bitcoin endpoint if ALCHEMY_API_KEY is not set
    // Get Bitcoin RPC URL (Alchemy or custom RPC fallback)
    const bitcoinRpcUrl = Deno.env.get('BITCOIN_RPC_URL') || 
                          Deno.env.get('ALCHEMY_BITCOIN_URL') ||
                          'https://bitcoin-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    const alchemyUrl = bitcoinRpcUrl;

    // Note: Alchemy Bitcoin API is primarily for blockchain data
    // For market prices, you may need to use a different service or calculate from blockchain data
    // This example uses Alchemy to get blockchain data
    
    // Get latest block info from Alchemy Bitcoin API
    const alchemyResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'getbestblockhash',
        params: [],
        id: 1,
      }),
    });

    if (!alchemyResponse.ok) {
      throw new Error('Failed to fetch data from Alchemy API');
    }

    const alchemyResult = await alchemyResponse.json();

    // Get block details
    let blockData = null;
    if (alchemyResult.result) {
      const blockResponse = await fetch(alchemyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getblock',
          params: [alchemyResult.result, 1], // Verbosity 1 for basic info
          id: 2,
        }),
      });

      if (blockResponse.ok) {
        blockData = await blockResponse.json();
      }
    }

    // Note: Alchemy doesn't provide market prices directly
    // You would need to integrate with a price API or calculate from exchange data
    // For now, returning blockchain data structure
    // TODO: Integrate with a price API or calculate price from exchange data

    // USD to NGN exchange rate (you may want to fetch this from an API)
    const usdToNgn = 1650; // Default rate, should be fetched from an exchange rate API

    // Placeholder price - replace with actual price fetching logic
    // This is a structure for when you integrate a price API
    const priceData: PriceResponse = {
      price: 0, // TODO: Fetch actual price
      price_usd: 0, // TODO: Fetch actual price
      price_ngn: 0, // TODO: Calculate from USD price
      last_updated: new Date().toISOString(),
      source: 'alchemy',
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: priceData,
        blockchain: {
          latest_block_hash: alchemyResult.result,
          block_data: blockData?.result || null,
          source: 'alchemy',
        },
        note: 'Alchemy API provides blockchain data, not market prices. Consider integrating a price API for live market data.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Get Bitcoin price error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

