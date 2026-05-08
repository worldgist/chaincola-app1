// Get Bitcoin Price Edge Function
// Fetches live BTC token price using Alchemy Prices API

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
    let btcPriceUsd = 0;
    let priceSource = 'Alchemy Prices API';
    const lastUpdated = new Date().toISOString();

    if (getAlchemyApiKey()) {
      try {
        console.log('📊 Fetching BTC price from Alchemy Prices API...');
        btcPriceUsd = await fetchAlchemyUsdForSymbol('BTC');
        if (btcPriceUsd > 0) {
          console.log(`✅ BTC price from Alchemy: $${btcPriceUsd}`);
        }
      } catch (alchemyError) {
        console.error('❌ Error fetching from Alchemy Prices API:', alchemyError);
      }
    } else {
      console.warn('⚠️ ALCHEMY_API_KEY not set');
      priceSource = 'Fallback';
    }

    if (btcPriceUsd === 0) {
      console.warn('⚠️ All price sources failed, using fallback price');
      btcPriceUsd = 65000.0;
      priceSource = 'Fallback';
    }

    const usdToNgn = await getUsdToNgnRate();
    const btcPriceNgn = btcPriceUsd * usdToNgn;

    const priceData: PriceResponse = {
      price_usd: btcPriceUsd,
      price_ngn: parseFloat(btcPriceNgn.toFixed(2)),
      last_updated: lastUpdated,
      source: priceSource,
    };

    return new Response(
      JSON.stringify({
        success: true,
        price: priceData,
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

