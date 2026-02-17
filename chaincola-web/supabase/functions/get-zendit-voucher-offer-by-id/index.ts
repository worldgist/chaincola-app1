// Get Zendit Voucher Offer by ID Edge Function
// Fetches a specific voucher offer by offer ID from Zendit API

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

    // Parse offerId from request body or query parameters
    let offerId: string;
    
    if (req.method === 'POST') {
      const body = await req.json();
      offerId = body.offerId;
    } else {
      const url = new URL(req.url);
      offerId = url.searchParams.get('offerId') || '';
    }

    if (!offerId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'offerId parameter is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const zenditUrl = `${ZENDIT_API_BASE_URL}/vouchers/offers/${encodeURIComponent(offerId)}`;

    console.log(`📡 Fetching Zendit voucher offer by ID: ${zenditUrl}`);

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
      
      if (response.status === 404) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Voucher offer not found',
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

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

    // Process the offer data
    const send = data.send || {};
    const currencyDivisor = send.currencyDivisor || 100; // Default to 100 (cents)
    let cardAmount: number | null = null;
    let minAmount: number | null = null;
    let maxAmount: number | null = null;

    if (data.priceType === 'Fixed' && send.fixed !== undefined) {
      cardAmount = send.fixed / currencyDivisor;
    } else if (data.priceType === 'Range') {
      if (send.min !== undefined) minAmount = send.min / currencyDivisor;
      if (send.max !== undefined) maxAmount = send.max / currencyDivisor;
    }

    const processedOffer = {
      offerId: data.offerId,
      brand: data.brand,
      country: data.country,
      priceType: data.priceType, // "Fixed" or "Range"
      cardAmount, // For Fixed offers
      minAmount, // For Range offers
      maxAmount, // For Range offers
      currency: send.currency || 'USD',
      currencyDivisor,
      cost: data.cost, // What we pay to Zendit
      price: data.price, // Price to customer (if using Zendit pricing module)
      enabled: data.enabled,
      notes: data.notes,
      shortNotes: data.shortNotes,
      requiredFields: data.requiredFields || [],
      productType: data.productType,
      regions: data.regions || [],
      subTypes: data.subTypes || [],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      // Keep full offer for reference
      fullOffer: data,
    };

    console.log(`✅ Fetched voucher offer: ${offerId}`);

    return new Response(
      JSON.stringify({
        success: true,
        offer: processedOffer,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit voucher offer:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch voucher offer from Zendit API',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
