// Get Solana Price Edge Function
// Fetches live SOL token price using Alchemy Prices API
//
// This function:
//   1. Uses Alchemy Prices API to get SOL token price
//   2. Converts USD price to NGN using exchange rate
//   3. Returns price data in USD and NGN

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

/**
 * Get USD to NGN exchange rate
 */
async function getUsdToNgnRate(): Promise<number> {
  try {
    // Use a reliable exchange rate API
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (response.ok) {
      const data = await response.json();
      return data.rates?.NGN || 1650; // Fallback rate
    }
  } catch (error) {
    console.warn('⚠️ Failed to fetch USD/NGN rate, using default:', error);
  }
  return 1650; // Default fallback rate
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Alchemy API key from environment
    const alchemyApiKey = Deno.env.get('ALCHEMY_API_KEY') || 
                         Deno.env.get('ALCHEMY_SOLANA_API_KEY');
    
    if (!alchemyApiKey) {
      console.warn('⚠️ ALCHEMY_API_KEY not set, will use fallback');
    }

    let solanaPriceUSD = 0;
    let priceSource = 'Alchemy Prices API';
    let lastUpdated = new Date().toISOString();

    // Use Alchemy Prices API to get SOL token price
    if (alchemyApiKey) {
      try {
        console.log('📊 Fetching SOL price from Alchemy Prices API...');
        const alchemyPricesUrl = `https://api.g.alchemy.com/prices/v1/tokens/by-symbol?symbols=SOL`;
        
        const alchemyResponse = await fetch(alchemyPricesUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${alchemyApiKey}`,
            'Accept': 'application/json',
          },
        });

        if (alchemyResponse.ok) {
          const alchemyData = await alchemyResponse.json();
          console.log('📊 Alchemy Prices API response:', JSON.stringify(alchemyData, null, 2));
          
          // Parse Alchemy Prices API response
          // Response format: { "data": [{ "symbol": "SOL", "prices": [{ "currency": "USD", "value": "116.66", ... }] }] }
          if (alchemyData.data && Array.isArray(alchemyData.data)) {
            const solData = alchemyData.data.find((item: any) => item.symbol === 'SOL');
            if (solData) {
              // Check for error field first
              if (solData.error) {
                console.warn(`⚠️ Alchemy API error for SOL: ${solData.error}`);
              } else if (solData.prices && Array.isArray(solData.prices) && solData.prices.length > 0) {
                // Find USD price
                const usdPrice = solData.prices.find((p: any) => p.currency === 'USD');
                if (usdPrice && usdPrice.value) {
                  const parsedPrice = parseFloat(usdPrice.value);
                  if (!isNaN(parsedPrice) && parsedPrice > 0) {
                    solanaPriceUSD = parsedPrice;
                    priceSource = 'Alchemy Prices API';
                    console.log(`✅ SOL price from Alchemy: $${solanaPriceUSD}`);
                  }
                }
              }
            }
          }
        } else {
          const errorText = await alchemyResponse.text();
          console.warn(`⚠️ Alchemy Prices API returned error ${alchemyResponse.status}:`, errorText);
        }
      } catch (alchemyError) {
        console.error('❌ Error fetching from Alchemy Prices API:', alchemyError);
      }
    }

    // Fallback to CoinGecko if Alchemy fails
    if (solanaPriceUSD === 0) {
      try {
        console.log('📊 Falling back to CoinGecko API...');
        const coinGeckoResponse = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',
          {
            headers: {
              'Accept': 'application/json',
            },
          }
        );

        if (coinGeckoResponse.ok) {
          const coinGeckoData = await coinGeckoResponse.json();
          if (coinGeckoData.solana && coinGeckoData.solana.usd) {
            solanaPriceUSD = coinGeckoData.solana.usd;
            priceSource = 'CoinGecko (fallback)';
            console.log(`✅ SOL price from CoinGecko: $${solanaPriceUSD}`);
          }
        } else {
          console.warn('⚠️ CoinGecko API returned error:', coinGeckoResponse.status);
        }
      } catch (coinGeckoError) {
        console.error('❌ Error fetching from CoinGecko:', coinGeckoError);
      }
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
