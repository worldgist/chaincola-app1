// Price Oracle Service — Alchemy, Luno, Binance (DB-driven priority)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchAlchemyUsdForSymbol,
  getUsdToNgnRate,
} from "../_shared/alchemy-prices.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PriceSource {
  source_name: string;
  api_endpoint: string;
  priority: number;
  reliability_score: number;
}

interface PriceData {
  asset: string;
  price_usd: number;
  price_ngn: number;
  price_source: string;
  price_change_24h?: number;
  volume_24h?: number;
  market_cap?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, assets } = body;

    switch (action) {
      case 'fetchPrices': {
        const assetsToFetch = assets || ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
        const results: any[] = [];

        // Get active price sources ordered by priority
        const { data: sources } = await supabase
          .from('price_sources')
          .select('*')
          .eq('is_active', true)
          .order('priority', { ascending: true });

        if (!sources || sources.length === 0) {
          return new Response(
            JSON.stringify({ success: false, error: 'No active price sources configured' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Fetch prices for each asset
        for (const asset of assetsToFetch) {
          let priceFetched = false;
          let lastError: string | null = null;

          // Try each source in priority order
          for (const source of sources as PriceSource[]) {
            try {
              const priceData = await fetchPriceFromSource(asset, source);
              
              if (priceData) {
                // Calculate deviation from previous price
                const { data: lastPrice } = await supabase
                  .from('price_cache')
                  .select('price_usd, price_ngn')
                  .eq('asset', asset)
                  .order('fetched_at', { ascending: false })
                  .limit(1)
                  .single();

                let deviation_percentage = 0;
                let is_fallback = false;
                let fallback_reason = null;

                if (lastPrice) {
                  const deviation = Math.abs(
                    ((priceData.price_usd - parseFloat(lastPrice.price_usd)) / parseFloat(lastPrice.price_usd)) * 100
                  );
                  deviation_percentage = deviation;

                  // Check if deviation exceeds threshold
                  const { data: config } = await supabase
                    .from('alert_configurations')
                    .select('*')
                    .eq('alert_type', 'PRICE_DEVIATION')
                    .eq('is_active', true)
                    .single();

                  if (config && deviation > parseFloat(config.severity_threshold || '5')) {
                    // Create alert for price deviation
                    await supabase.rpc('create_treasury_alert', {
                      p_alert_type: 'PRICE_DEVIATION',
                      p_severity: deviation > 10 ? 'HIGH' : 'MEDIUM',
                      p_title: `${asset} Price Deviation Alert`,
                      p_message: `${asset} price deviated by ${deviation.toFixed(2)}% from last known price`,
                      p_asset: asset,
                      p_details: {
                        current_price: priceData.price_usd,
                        previous_price: lastPrice.price_usd,
                        deviation_percentage: deviation
                      }
                    });
                  }
                }

                // Save to price cache
                const { error: insertError } = await supabase
                  .from('price_cache')
                  .insert({
                    asset,
                    price_usd: priceData.price_usd,
                    price_ngn: priceData.price_ngn,
                    price_source: source.source_name,
                    price_change_24h: priceData.price_change_24h,
                    volume_24h: priceData.volume_24h,
                    market_cap: priceData.market_cap,
                    deviation_percentage,
                    is_fallback,
                    fallback_reason
                  });

                if (!insertError) {
                  results.push({
                    asset,
                    ...priceData,
                    source: source.source_name,
                    success: true
                  });
                  priceFetched = true;
                  break; // Success, move to next asset
                }
              }
            } catch (error: any) {
              lastError = error.message;
              console.error(`Error fetching ${asset} from ${source.source_name}:`, error);
              // Continue to next source
            }
          }

          // If all sources failed, use last known price as fallback
          if (!priceFetched) {
            const { data: lastKnownPrice } = await supabase
              .from('price_cache')
              .select('*')
              .eq('asset', asset)
              .order('fetched_at', { ascending: false })
              .limit(1)
              .single();

            if (lastKnownPrice) {
              // Mark as fallback
              const { error: insertError } = await supabase
                .from('price_cache')
                .insert({
                  asset,
                  price_usd: lastKnownPrice.price_usd,
                  price_ngn: lastKnownPrice.price_ngn,
                  price_source: lastKnownPrice.price_source,
                  is_fallback: true,
                  fallback_reason: `All price sources failed. Last error: ${lastError || 'Unknown'}`,
                  deviation_percentage: 0
                });

              if (!insertError) {
                results.push({
                  asset,
                  price_usd: parseFloat(lastKnownPrice.price_usd),
                  price_ngn: parseFloat(lastKnownPrice.price_ngn),
                  source: lastKnownPrice.price_source,
                  is_fallback: true,
                  success: true
                });
              }
            } else {
              results.push({
                asset,
                success: false,
                error: `Failed to fetch price from all sources. ${lastError || 'No price data available'}`
              });
            }
          }
        }

        return new Response(
          JSON.stringify({ success: true, data: results }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'getLatestPrices': {
        const { data: prices } = await supabase
          .from('price_cache')
          .select('*')
          .in('asset', assets || ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'])
          .order('fetched_at', { ascending: false });

        // Get latest price per asset
        const latestPrices: Record<string, any> = {};
        const seenAssets = new Set<string>();

        for (const price of prices || []) {
          if (!seenAssets.has(price.asset)) {
            latestPrices[price.asset] = {
              price_usd: parseFloat(price.price_usd),
              price_ngn: parseFloat(price.price_ngn),
              price_source: price.price_source,
              fetched_at: price.fetched_at,
              is_fallback: price.is_fallback,
              deviation_percentage: parseFloat(price.deviation_percentage || '0')
            };
            seenAssets.add(price.asset);
          }
        }

        return new Response(
          JSON.stringify({ success: true, data: latestPrices }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: any) {
    console.error('Price oracle error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchPriceFromAlchemy(asset: string): Promise<PriceData | null> {
  try {
    const price_usd = await fetchAlchemyUsdForSymbol(asset);
    if (!price_usd || price_usd <= 0) return null;
    const ngnRate = await getUsdToNgnRate();
    return {
      asset,
      price_usd,
      price_ngn: price_usd * ngnRate,
      price_source: 'ALCHEMY',
    };
  } catch (error) {
    console.error(`Alchemy fetch error for ${asset}:`, error);
    return null;
  }
}

// Fetch price from Luno
async function fetchPriceFromLuno(asset: string): Promise<PriceData | null> {
  if (asset !== 'BTC' && asset !== 'ETH' && asset !== 'XRP') {
    return null; // Luno only supports BTC, ETH, XRP
  }

  try {
    const pair = asset === 'BTC' ? 'XBTNGN' : asset === 'ETH' ? 'ETHNGN' : 'XRPNGN';
    const response = await fetch(`https://api.luno.com/api/1/ticker?pair=${pair}`);

    if (!response.ok) {
      throw new Error(`Luno API error: ${response.status}`);
    }

    const data = await response.json();
    const price_ngn = parseFloat(data.last_trade);
    const price_usd = price_ngn / 1500; // Approximate USD conversion

    return {
      asset,
      price_usd,
      price_ngn,
      price_source: 'LUNO',
      price_change_24h: parseFloat(data.rolling_24_hour_volume || '0')
    };
  } catch (error) {
    console.error(`Luno fetch error for ${asset}:`, error);
    return null;
  }
}

// Fetch price from Binance
async function fetchPriceFromBinance(asset: string): Promise<PriceData | null> {
  const symbolMap: Record<string, string> = {
    'BTC': 'BTCUSDT',
    'ETH': 'ETHUSDT',
    'USDT': 'USDTUSDT',
    'USDC': 'USDCUSDT',
    'XRP': 'XRPUSDT',
    'SOL': 'SOLUSDT'
  };

  const symbol = symbolMap[asset];
  if (!symbol) return null;

  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json();
    const price_usd = parseFloat(data.lastPrice);
    const price_ngn = price_usd * 1500; // Approximate NGN conversion

    return {
      asset,
      price_usd,
      price_ngn,
      price_source: 'BINANCE',
      price_change_24h: parseFloat(data.priceChangePercent),
      volume_24h: parseFloat(data.volume)
    };
  } catch (error) {
    console.error(`Binance fetch error for ${asset}:`, error);
    return null;
  }
}

// Main fetch function that routes to appropriate source
async function fetchPriceFromSource(asset: string, source: PriceSource): Promise<PriceData | null> {
  switch (source.source_name) {
    case 'ALCHEMY':
    case 'COINGECKO':
      return fetchPriceFromAlchemy(asset);
    case 'LUNO':
      return fetchPriceFromLuno(asset);
    case 'BINANCE':
      return fetchPriceFromBinance(asset);
    default:
      return null;
  }
}
