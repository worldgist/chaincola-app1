// Create Zendit Voucher Purchase Edge Function
// Creates a new voucher purchase transaction via Zendit API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZENDIT_API_BASE_URL = 'https://api.zendit.io/v1';

interface VoucherField {
  name: string;
  value: string;
}

interface PurchaseValue {
  type: 'PRICE' | 'AMOUNT';
  value: number;
}

interface CreateVoucherPurchaseRequest {
  fields: VoucherField[]; // Required: Fields required for offer
  offerId: string; // Required: Catalog ID of the offer
  transactionId: string; // Required: Transaction ID provided by partner
  value?: PurchaseValue; // Optional: Purchase amount and type (required for RANGE offers, omitted for FIXED)
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

    // Parse request body
    let body: CreateVoucherPurchaseRequest;
    
    if (req.method === 'POST') {
      body = await req.json();
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Method not allowed. Use POST.',
        }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate required parameters
    if (!body.offerId || body.offerId.trim() === '') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'offerId is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!body.transactionId || body.transactionId.trim() === '') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'transactionId is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!body.fields || !Array.isArray(body.fields)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'fields array is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Build request payload
    const requestPayload: any = {
      offerId: body.offerId.trim(),
      transactionId: body.transactionId.trim(),
      fields: body.fields,
    };

    // Add value only if provided (required for RANGE offers)
    if (body.value) {
      requestPayload.value = body.value;
    }

    const zenditUrl = `${ZENDIT_API_BASE_URL}/vouchers/purchases`;

    console.log(`📡 Creating Zendit voucher purchase: ${zenditUrl}`);
    console.log(`   Offer ID: ${requestPayload.offerId}`);
    console.log(`   Transaction ID: ${requestPayload.transactionId}`);

    // Call Zendit API with timeout (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    let response: Response;
    try {
      response = await fetch(zenditUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${zenditApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestPayload),
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
          statusCode: response.status,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();

    // Process the response
    // According to Zendit API schema, /vouchers/purchases POST endpoint returns:
    // {
    //   "status": string, // Status of transaction acceptance
    //   "transactionId": string // Transaction ID provided by partner
    // }
    
    console.log(`✅ Created voucher purchase: ${data.transactionId} - Status: ${data.status}`);

    return new Response(
      JSON.stringify({
        success: true,
        status: data.status,
        transactionId: data.transactionId,
        // Include full response for reference
        fullResponse: data,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception creating Zendit voucher purchase:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to create voucher purchase via Zendit API',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
