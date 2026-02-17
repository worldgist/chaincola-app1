// Flutterwave Get Banks Edge Function
// Fetches list of banks from Flutterwave API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Flutterwave API base URL
const FLUTTERWAVE_API_BASE = Deno.env.get('FLUTTERWAVE_API_BASE') || 'https://api.flutterwave.com/v3';

interface FlutterwaveBank {
  id: number;
  code: string;
  name: string;
}

interface FlutterwaveBanksResponse {
  status: string;
  message: string;
  data: FlutterwaveBank[];
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

    // Get user from auth token (optional - can be public endpoint)
    const authHeader = req.headers.get('Authorization');
    let user = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser(token);
      
      if (!authError && authUser) {
        user = authUser;
      }
    }

    // Get Flutterwave API credentials
    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');

    if (!flutterwaveSecretKey) {
      console.error('❌ Flutterwave API credentials not configured');
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Flutterwave API credentials not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get country code from query params (default to NG for Nigeria)
    const url = new URL(req.url);
    const countryCode = url.searchParams.get('country') || 'NG';

    console.log(`🔍 Fetching banks for country: ${countryCode}`);

    // Call Flutterwave API to get banks
    const banksUrl = `${FLUTTERWAVE_API_BASE}/banks/${countryCode}`;
    
    const flutterwaveResponse = await fetch(banksUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${flutterwaveSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!flutterwaveResponse.ok) {
      const errorText = await flutterwaveResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      console.error('❌ Flutterwave banks fetch failed:', errorData);
      
      return new Response(
        JSON.stringify({
          status: 'error',
          message: errorData.message || 'Failed to fetch banks. Please try again later.',
        }),
        {
          status: flutterwaveResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result: FlutterwaveBanksResponse = await flutterwaveResponse.json();

    if (result.status === 'success' && result.data) {
      console.log(`✅ Fetched ${result.data.length} banks`);

      // Transform to match expected format
      const banks = result.data.map((bank) => ({
        code: bank.code,
        name: bank.name,
        id: bank.id,
      }));

      return new Response(
        JSON.stringify({
          status: 'success',
          data: banks,
          count: banks.length,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        status: 'error',
        message: result.message || 'Invalid response from banks service',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Error fetching banks:', error);
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error.message || 'Network error. Please check your connection and try again.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});









