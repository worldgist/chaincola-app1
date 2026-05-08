// Get Solana Price Edge Function
// Fetches live SOL token price using Alchemy Prices API
//
// This function:
//   1. Uses Alchemy Prices API to get SOL token price
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
    let solanaPriceUSD = 0;
    let priceSource = 'Alchemy Prices API';
    const lastUpdated = new Date().toISOString();

    if (getAlchemyApiKey()) {
      try {
        console.log('📊 Fetching SOL price from Alchemy Prices API...');
        solanaPriceUSD = await fetchAlchemyUsdForSymbol('SOL');
        if (solanaPriceUSD > 0) {
          console.log(`✅ SOL price from Alchemy: $${solanaPriceUSD}`);
        }
      } catch (alchemyError) {
        console.error('❌ Error fetching from Alchemy Prices API:', alchemyError);
      }
    } else {
      console.warn('⚠️ ALCHEMY_API_KEY not set');
      priceSource = 'Fallback';
    }

    // Final fallback if all APIs fail
    if (solanaPriceUSD === 0) {
      console.warn('⚠️ All price sources failed, using fallback price');
      solanaPriceUSD = 98.50; // Fallback SOL price
      priceSource = 'Fallback';
    }

    // Get USD to NGN exchange rate
    const usdToNgnRate = await getUsdToNgnRate();
    const solanaPriceNGN = solanaPriceUSD * usdToNgnRate;

    console.log(`💰 SOL Price: $${solanaPriceUSD} USD = ₦${solanaPriceNGN.toFixed(2)} NGN`);
    console.log(`   Source: ${priceSource}`);
    console.log(`   USD/NGN Rate: ${usdToNgnRate}`);

    const priceData: PriceResponse = {
      success: true,
      price: {
        price_usd: solanaPriceUSD,
        price_ngn: parseFloat(solanaPriceNGN.toFixed(2)),
        last_updated: lastUpdated,
        source: priceSource,
      },
    };

    return new Response(
      JSON.stringify(priceData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Error fetching SOL price:', error);
    
    const errorResponse: PriceResponse = {
      success: false,
      error: error.message || 'Failed to fetch SOL price',
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
