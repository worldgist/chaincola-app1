// Get Zendit Balance Edge Function
// Fetches account balance from Zendit API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZENDIT_API_BASE_URL = 'https://api.zendit.io/v1';

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

    // Get Zendit API key from environment
    const zenditApiKey = Deno.env.get('ZENDIT_API_KEY');
    
    if (!zenditApiKey) {
      console.error('❌ Zendit API key not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Zendit API key not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const zenditUrl = `${ZENDIT_API_BASE_URL}/balance`;

    console.log(`📡 Fetching Zendit balance: ${zenditUrl}`);

    // Call Zendit API with timeout (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response: Response;
    try {
      response = await fetch(zenditUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${zenditApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('❌ Zendit API request timed out after 30 seconds');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Request to Zendit API timed out. Please try again.',
          }),
          {
            status: 504,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Zendit API error:', response.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Zendit API error: ${response.status} - ${errorText}`,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();

    // Process the balance data
    // According to Zendit API schema, /balance endpoint returns:
    // {
    //   "availableBalance": number (integer),
    //   "currency": string
    // }
    const balance = {
      availableBalance: data.availableBalance || 0,
      currency: data.currency || 'USD',
      // Convert from smallest currency unit (e.g., cents) to main unit
      balance: data.availableBalance ? data.availableBalance / 100 : 0,
    };

    console.log(`✅ Fetched Zendit balance: ${balance.balance} ${balance.currency}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: balance,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit balance:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch balance from Zendit API',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
