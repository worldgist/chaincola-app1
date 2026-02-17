// Get Zendit Brand Details Edge Function
// Fetches detailed brand information including logos from Zendit API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZENDIT_API_BASE_URL = 'https://api.zendit.io/v1';

interface GetBrandDetailsRequest {
  brand: string; // Required: Brand name/slug
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

    // Parse request body or query parameters
    let brand: string;
    
    if (req.method === 'POST') {
      const body = await req.json();
      brand = body.brand;
    } else {
      const url = new URL(req.url);
      brand = url.searchParams.get('brand') || '';
    }

    if (!brand) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Brand parameter is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const zenditUrl = `${ZENDIT_API_BASE_URL}/brands/${encodeURIComponent(brand)}`;

    console.log(`📡 Fetching Zendit brand details: ${zenditUrl}`);

    // Call Zendit API
    const response = await fetch(zenditUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${zenditApiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

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

    // According to Zendit API schema, /brands/{brand} endpoint returns Brand object:
    // {
    //   "brand": string,
    //   "brandName": string,
    //   "brandLogo": string (URL),
    //   "brandBigImage": string (URL),
    //   "brandGiftImage": string (URL),
    //   "brandColor": string,
    //   "description": string,
    //   ...
    // }
    
    const brandDetails = {
      id: data.brand,
      name: data.brandName,
      brand: data.brand,
      brandName: data.brandName,
      logo: data.brandLogo || data.brandGiftImage || data.brandBigImage || null,
      brandLogo: data.brandLogo,
      brandGiftImage: data.brandGiftImage,
      brandBigImage: data.brandBigImage,
      brandColor: data.brandColor,
      brandLogoExtension: data.brandLogoExtension,
      brandInfoPdf: data.brandInfoPdf,
      description: data.description,
      inputMasks: data.inputMasks || [],
      redemptionInstructions: data.redemptionInstructions || [],
      requiredFieldsLabels: data.requiredFieldsLabels || [],
      fullDetails: data, // Keep full details for reference
    };

    console.log(`✅ Fetched brand details for: ${brand}`);

    return new Response(
      JSON.stringify({
        success: true,
        brand: brandDetails,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit brand details:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch brand details from Zendit API',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
