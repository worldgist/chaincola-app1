// Check Crypto Price Alerts Edge Function
// Fetches crypto prices from Alchemy, stores them, and checks user alerts
// This function should be called periodically (every 2-5 minutes) via cron job

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoPriceAlertNotification } from "../_shared/send-crypto-price-alert-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Supported crypto symbols for Alchemy Prices API
const SUPPORTED_CRYPTOS = ['SOL', 'ETH', 'BTC'];

// Minimum time between alerts for the same user/alert (in minutes) - prevents spam
const MIN_ALERT_INTERVAL_MINUTES = 5;

/**
 * Get USD to NGN exchange rate
 */
async function getUsdToNgnRate(): Promise<number> {
  try {
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

/**
 * Fetch crypto price from Alchemy Prices API
 */
async function fetchPriceFromAlchemy(
  alchemyApiKey: string,
  symbol: string
): Promise<{ priceUSD: number; source: string } | null> {
  try {
    console.log(`📊 Fetching ${symbol} price from Alchemy Prices API...`);
    const alchemyPricesUrl = `https://api.g.alchemy.com/prices/v1/tokens/by-symbol?symbols=${symbol}`;
    
    const alchemyResponse = await fetch(alchemyPricesUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${alchemyApiKey}`,
        'Accept': 'application/json',
      },
    });

    if (alchemyResponse.ok) {
      const alchemyData = await alchemyResponse.json();
      console.log(`📊 Alchemy API response for ${symbol}:`, JSON.stringify(alchemyData, null, 2));
      
      // Parse Alchemy Prices API response
      // Response format: { "data": [{ "symbol": "SOL", "prices": [{ "currency": "USD", "value": "116.66", ... }] }] }
      if (alchemyData.data && Array.isArray(alchemyData.data)) {
        const cryptoData = alchemyData.data.find((item: any) => item.symbol === symbol);
        if (cryptoData) {
          // Check for error field first
          if (cryptoData.error) {
            console.error(`❌ Alchemy API error for ${symbol}: ${cryptoData.error}`);
            return null;
          } else if (cryptoData.prices && Array.isArray(cryptoData.prices) && cryptoData.prices.length > 0) {
            // Find USD price (check both uppercase and lowercase)
            const usdPrice = cryptoData.prices.find((p: any) => 
              p.currency?.toLowerCase() === 'usd' || p.currency === 'USD'
            );
            if (usdPrice && usdPrice.value) {
              const parsedPrice = parseFloat(usdPrice.value);
              if (!isNaN(parsedPrice) && parsedPrice > 0) {
                console.log(`✅ ${symbol} price from Alchemy: $${parsedPrice}`);
                return { priceUSD: parsedPrice, source: 'Alchemy Prices API' };
              } else {
                console.error(`❌ Invalid price value for ${symbol}: ${usdPrice.value}`);
              }
            } else {
              console.error(`❌ No USD price found for ${symbol}. Available currencies:`, cryptoData.prices.map((p: any) => p.currency));
            }
          } else {
            console.error(`❌ No prices array found for ${symbol}. Response structure:`, JSON.stringify(cryptoData, null, 2));
          }
        } else {
          console.error(`❌ ${symbol} not found in Alchemy response. Available symbols:`, alchemyData.data.map((item: any) => item.symbol));
        }
      } else {
        console.error(`❌ Invalid response structure for ${symbol}. Expected data array, got:`, JSON.stringify(alchemyData, null, 2));
      }
    } else {
      const errorText = await alchemyResponse.text();
      console.error(`❌ Alchemy Prices API returned error ${alchemyResponse.status} for ${symbol}:`, errorText);
      console.error(`   URL: ${alchemyPricesUrl}`);
      console.error(`   API Key present: ${!!alchemyApiKey} (length: ${alchemyApiKey?.length || 0})`);
    }
  } catch (alchemyError) {
    console.error(`❌ Error fetching ${symbol} price from Alchemy:`, alchemyError);
  }
  
  return null;
}

/**
 * Store or update crypto price in database
 */
async function storeCryptoPrice(
  supabase: any,
  symbol: string,
  priceUSD: number,
  priceNGN: number,
  source: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc('get_or_create_crypto_price', {
      p_crypto_symbol: symbol,
      p_price_usd: priceUSD,
      p_price_ngn: priceNGN,
      p_source: source,
    });

    if (error) {
      console.error(`❌ Error storing ${symbol} price:`, error);
    } else {
      console.log(`✅ Stored ${symbol} price: $${priceUSD} USD = ₦${priceNGN.toFixed(2)} NGN`);
    }
  } catch (error) {
    console.error(`❌ Exception storing ${symbol} price:`, error);
  }
}

/**
 * Check percentage move alerts
 */
async function checkPercentageMoveAlerts(
  supabase: any,
  symbol: string,
  currentPrice: number,
  previousPrice: number | null
): Promise<void> {
  if (!previousPrice || previousPrice === 0) {
    console.log(`⏭️ No previous price for ${symbol}, skipping percentage move checks`);
    return;
  }

  const percentageChange = ((currentPrice - previousPrice) / previousPrice) * 100;
  const absPercentageChange = Math.abs(percentageChange);

  console.log(`📊 ${symbol} price change: ${percentageChange > 0 ? '+' : ''}${percentageChange.toFixed(2)}% (${previousPrice} → ${currentPrice})`);

  // Get all enabled percentage move alerts for this crypto
  const { data: alerts, error } = await supabase
    .from('user_price_alerts')
    .select('*')
    .eq('crypto_symbol', symbol)
    .eq('alert_type', 'PERCENTAGE_MOVE')
    .eq('is_enabled', true);

  if (error) {
    console.error(`❌ Error fetching percentage move alerts for ${symbol}:`, error);
    return;
  }

  if (!alerts || alerts.length === 0) {
    console.log(`⏭️ No percentage move alerts configured for ${symbol}`);
    return;
  }

  // Check each alert
  for (const alert of alerts) {
    const threshold = parseFloat(alert.percentage_threshold);
    if (isNaN(threshold) || threshold <= 0) {
      continue;
    }

    // Check if price change meets threshold
    const meetsThreshold = absPercentageChange >= threshold;

    // Check direction preferences
    const shouldNotify = meetsThreshold && (
      (percentageChange > 0 && alert.notify_on_up) ||
      (percentageChange < 0 && alert.notify_on_down)
    );

    if (!shouldNotify) {
      continue;
    }

    // Check if we've notified recently (prevent spam)
    const now = new Date();
    const lastTriggered = alert.last_triggered_at ? new Date(alert.last_triggered_at) : null;
    if (lastTriggered) {
      const minutesSinceLastTrigger = (now.getTime() - lastTriggered.getTime()) / (1000 * 60);
      if (minutesSinceLastTrigger < MIN_ALERT_INTERVAL_MINUTES) {
        console.log(`⏭️ Alert ${alert.id} triggered recently (${minutesSinceLastTrigger.toFixed(1)} min ago), skipping`);
        continue;
      }
    }

    // Send notification
    console.log(`🔔 Triggering percentage move alert for user ${alert.user_id}: ${symbol} ${percentageChange > 0 ? 'rose' : 'dropped'} ${absPercentageChange.toFixed(2)}%`);
    
    await sendCryptoPriceAlertNotification({
      supabase,
      userId: alert.user_id,
      cryptoSymbol: symbol,
      currentPrice: currentPrice,
      alertType: 'PERCENTAGE_MOVE',
      percentageChange: percentageChange,
    });

    // Update last_triggered_at
    await supabase
      .from('user_price_alerts')
      .update({ last_triggered_at: now.toISOString() })
      .eq('id', alert.id);
  }
}

/**
 * Check target price alerts
 */
async function checkTargetPriceAlerts(
  supabase: any,
  symbol: string,
  currentPrice: number
): Promise<void> {
  // Get all enabled target price alerts for this crypto
  const { data: alerts, error } = await supabase
    .from('user_price_alerts')
    .select('*')
    .eq('crypto_symbol', symbol)
    .eq('alert_type', 'TARGET_PRICE')
    .eq('is_enabled', true);

  if (error) {
    console.error(`❌ Error fetching target price alerts for ${symbol}:`, error);
    return;
  }

  if (!alerts || alerts.length === 0) {
    console.log(`⏭️ No target price alerts configured for ${symbol}`);
    return;
  }

  // Check each alert
  for (const alert of alerts) {
    const targetPrice = parseFloat(alert.target_price_usd);
    if (isNaN(targetPrice) || targetPrice <= 0) {
      continue;
    }

    const direction = alert.direction;
    let shouldNotify = false;

    if (direction === 'ABOVE' && currentPrice >= targetPrice) {
      shouldNotify = true;
    } else if (direction === 'BELOW' && currentPrice <= targetPrice) {
      shouldNotify = true;
    }

    if (!shouldNotify) {
      continue;
    }

    // Check if we've notified recently (prevent spam)
    const now = new Date();
    const lastTriggered = alert.last_triggered_at ? new Date(alert.last_triggered_at) : null;
    if (lastTriggered) {
      const minutesSinceLastTrigger = (now.getTime() - lastTriggered.getTime()) / (1000 * 60);
      if (minutesSinceLastTrigger < MIN_ALERT_INTERVAL_MINUTES) {
        console.log(`⏭️ Alert ${alert.id} triggered recently (${minutesSinceLastTrigger.toFixed(1)} min ago), skipping`);
        continue;
      }
    }

    // Send notification
    console.log(`🔔 Triggering target price alert for user ${alert.user_id}: ${symbol} ${direction === 'ABOVE' ? 'reached' : 'dropped below'} ${targetPrice}`);
    
    await sendCryptoPriceAlertNotification({
      supabase,
      userId: alert.user_id,
      cryptoSymbol: symbol,
      currentPrice: currentPrice,
      alertType: 'TARGET_PRICE',
      targetPrice: targetPrice,
      direction: direction,
    });

    // Update last_triggered_at
    await supabase
      .from('user_price_alerts')
      .update({ last_triggered_at: now.toISOString() })
      .eq('id', alert.id);
  }
}

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

    // Get Alchemy API key from environment
    const alchemyApiKey = Deno.env.get('ALCHEMY_API_KEY') || 
                         Deno.env.get('ALCHEMY_SOLANA_API_KEY');
    
    if (!alchemyApiKey) {
      console.error('❌ ALCHEMY_API_KEY not set in environment variables');
      console.error('Available env vars:', Object.keys(Deno.env.toObject()).filter(k => k.includes('ALCHEMY')));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ALCHEMY_API_KEY not configured',
          debug: {
            hasAlchemyKey: !!Deno.env.get('ALCHEMY_API_KEY'),
            hasSolanaKey: !!Deno.env.get('ALCHEMY_SOLANA_API_KEY'),
            envKeys: Object.keys(Deno.env.toObject()).filter(k => k.includes('ALCHEMY')),
          },
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    
    console.log('✅ Alchemy API key found (length:', alchemyApiKey.length, ')');

    // Get USD to NGN exchange rate
    const usdToNgnRate = await getUsdToNgnRate();
    console.log(`💱 USD/NGN Rate: ${usdToNgnRate}`);

    const results: any[] = [];

    // Process each supported crypto
    for (const symbol of SUPPORTED_CRYPTOS) {
      try {
        // Fetch current price from Alchemy
        const priceData = await fetchPriceFromAlchemy(alchemyApiKey, symbol);
        
        if (!priceData) {
          console.error(`❌ Failed to fetch ${symbol} price from Alchemy API`);
          console.error(`   Check function logs for detailed error messages`);
          results.push({ symbol, success: false, error: 'Failed to fetch price - check function logs' });
          continue;
        }

        const { priceUSD, source } = priceData;
        const priceNGN = priceUSD * usdToNgnRate;

        // Get previous price from database
        const { data: previousPriceData } = await supabase
          .from('crypto_prices')
          .select('price_usd')
          .eq('crypto_symbol', symbol)
          .maybeSingle();

        const previousPrice = previousPriceData?.price_usd || null;

        // Store current price
        await storeCryptoPrice(supabase, symbol, priceUSD, priceNGN, source);

        // Check percentage move alerts
        await checkPercentageMoveAlerts(supabase, symbol, priceUSD, previousPrice);

        // Check target price alerts
        await checkTargetPriceAlerts(supabase, symbol, priceUSD);

        results.push({
          symbol,
          success: true,
          priceUSD,
          priceNGN,
          previousPrice,
          source,
        });
      } catch (error: any) {
        console.error(`❌ Error processing ${symbol}:`, error);
        results.push({ symbol, success: false, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Price alerts checked',
        results,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('❌ Exception checking crypto price alerts:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to check crypto price alerts',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
