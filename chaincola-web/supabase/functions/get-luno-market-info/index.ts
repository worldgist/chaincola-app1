// Get Luno Market Info Edge Function
// Fetches market information including minimum volumes from Luno API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LUNO_API_BASE = 'https://api.luno.com';

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get Luno API credentials (optional - market info might be public)
    const lunoApiKeyId = Deno.env.get('LUNO_API_KEY_ID');
    const lunoApiSecret = Deno.env.get('LUNO_API_SECRET');

    // Parse request body or query params
    let pair: string | null = null;
    
    if (req.method === 'POST') {
      const body = await req.json();
      pair = body.pair || null;
    } else {
      const url = new URL(req.url);
      pair = url.searchParams.get('pair');
    }

    if (!pair) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Pair parameter is required (e.g., XBTNGN, ETHNGN)',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`📊 Fetching Luno market info for pair: ${pair}`);

    // Fetch market info from Luno API
    // Note: This endpoint might require authentication, but we'll try without first
    const marketsUrl = `${LUNO_API_BASE}/api/exchange/1/markets?pair=${pair}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication if credentials are available
    if (lunoApiKeyId && lunoApiSecret) {
      const authHeader = `Basic ${btoa(`${lunoApiKeyId}:${lunoApiSecret}`)}`;
      headers['Authorization'] = authHeader;
    }

    const response = await fetch(marketsUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Luno market info API error:', response.status, errorText);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to fetch market info: ${response.status}`,
          details: errorText,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();
    const markets = data.markets || [];
    
    // Find the market for the requested pair
    const market = markets.find((m: any) => m.market_id === pair);

    if (!market) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Market info not found for ${pair}`,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const marketInfo = {
      market_id: market.market_id,
      base_currency: market.base_currency,
      counter_currency: market.counter_currency,
      min_volume: parseFloat(market.min_volume || '0'),
      max_volume: parseFloat(market.max_volume || '0'),
      min_price: parseFloat(market.min_price || '0'),
      max_price: parseFloat(market.max_price || '0'),
      price_scale: market.price_scale || 2,
      volume_scale: market.volume_scale || 8,
      trading_status: market.trading_status || 'UNKNOWN',
    };

    console.log(`✅ Fetched market info for ${pair}: min_volume = ${marketInfo.min_volume}`);

    return new Response(
      JSON.stringify({
        success: true,
        marketInfo,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception fetching Luno market info:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch market info',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});












