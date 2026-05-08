// Get Ethereum Price Edge Function
// Fetches live ETH token price using Alchemy Prices API
//
// This function:
//   1. Uses Alchemy Prices API to get ETH token price
//   2. Converts USD price to NGN using exchange rate
//   3. Returns price data in USD and NGN

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  fetchAlchemyUsdForSymbol,
  getAlchemyApiKey,
  getUsdToNgnRate,
} from "../_shared/alchemy-prices.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PriceResponse {
  success: boolean;
  price?: {
    price_usd: number;
    price_ngn: number;
    last_updated: string;
    source: string;
  };
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let ethereumPriceUSD = 0;
    let priceSource = 'Alchemy Prices API';
    const lastUpdated = new Date().toISOString();

    if (getAlchemyApiKey()) {
      try {
        console.log('📊 Fetching ETH price from Alchemy Prices API...');
        ethereumPriceUSD = await fetchAlchemyUsdForSymbol('ETH');
        if (ethereumPriceUSD > 0) {
          console.log(`✅ ETH price from Alchemy: $${ethereumPriceUSD}`);
        }
      } catch (alchemyError) {
        console.error('❌ Error fetching from Alchemy Prices API:', alchemyError);
      }
    } else {
      console.warn('⚠️ ALCHEMY_API_KEY not set');
      priceSource = 'Fallback';
    }

    // Final fallback if all APIs fail
    if (ethereumPriceUSD === 0) {
      console.warn('⚠️ All price sources failed, using fallback price');
      ethereumPriceUSD = 2500.00; // Fallback ETH price
      priceSource = 'Fallback';
    }

    // Get USD to NGN exchange rate
    const usdToNgnRate = await getUsdToNgnRate();
    const ethereumPriceNGN = ethereumPriceUSD * usdToNgnRate;

    console.log(`💰 ETH Price: $${ethereumPriceUSD} USD = ₦${ethereumPriceNGN.toFixed(2)} NGN`);
    console.log(`   Source: ${priceSource}`);
    console.log(`   USD/NGN Rate: ${usdToNgnRate}`);

    const priceData: PriceResponse = {
      success: true,
      price: {
        price_usd: ethereumPriceUSD,
        price_ngn: parseFloat(ethereumPriceNGN.toFixed(2)),
        last_updated: lastUpdated,
        source: priceSource,
      },
    };

    return new Response(
      JSON.stringify(priceData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Error fetching ETH price:', error);
    
    const errorResponse: PriceResponse = {
      success: false,
      error: error.message || 'Failed to fetch ETH price',
    };

    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
