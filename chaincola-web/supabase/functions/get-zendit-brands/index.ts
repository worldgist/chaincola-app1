// Get Zendit Gift Card Brands Edge Function
// Fetches available gift card brands from Zendit API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZENDIT_API_BASE_URL = 'https://api.zendit.io/v1';

interface GetBrandsRequest {
  limit: number; // Required: 1-1024
  offset: number; // Required: for pagination
  country?: string; // Optional: 2 letter ISO code
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
    let params: GetBrandsRequest;
    
    if (req.method === 'POST') {
      const body = await req.json();
      params = {
        limit: body.limit || body._limit || 100,
        offset: body.offset || body._offset || 0,
        country: body.country || undefined,
      };
    } else {
      const url = new URL(req.url);
      params = {
        limit: parseInt(url.searchParams.get('_limit') || '100'),
        offset: parseInt(url.searchParams.get('_offset') || '0'),
        country: url.searchParams.get('country') || undefined,
      };
    }

    // Validate required parameters
    if (!params.limit || params.limit < 1 || params.limit > 1024) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Limit must be between 1 and 1024',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (params.offset === undefined || params.offset < 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Offset must be a non-negative number',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Build query parameters for Zendit API
    const queryParams = new URLSearchParams({
      _limit: params.limit.toString(),
      _offset: params.offset.toString(),
    });

    if (params.country) {
      queryParams.append('country', params.country.toUpperCase());
    }

    const zenditUrl = `${ZENDIT_API_BASE_URL}/brands?${queryParams.toString()}`;

    console.log(`📡 Fetching Zendit brands: ${zenditUrl}`);

    // Call Zendit API
    // According to Zendit API docs, authorization should be "Bearer" format
    // See: https://developers.zendit.io - "Authorization: Bearer YOUR_API_KEY"
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

    // According to Zendit API schema, /brands endpoint returns BrandsResponse:
    // {
    //   "limit": number,
    //   "list": [Brand_min],  // Brand_min has: { "brand": string, "brandName": string }
    //   "offset": number,
    //   "total": number
    // }
    let brands: any[] = [];
    let total = 0;

    if (data.list && Array.isArray(data.list)) {
      // Standard BrandsResponse format
      brands = data.list.map((item: any) => ({
        id: item.brand,           // Map "brand" to "id"
        name: item.brandName,     // Map "brandName" to "name"
        brand: item.brand,        // Keep original for reference
        brandName: item.brandName, // Keep original for reference
      }));
      total = data.total || brands.length;
    } else if (Array.isArray(data)) {
      // Fallback: if response is directly an array
      brands = data.map((item: any) => ({
        id: item.brand || item.id,
        name: item.brandName || item.name,
        brand: item.brand,
        brandName: item.brandName,
      }));
      total = brands.length;
    } else if (data.brands && Array.isArray(data.brands)) {
      // Fallback: alternative format
      brands = data.brands.map((item: any) => ({
        id: item.brand || item.id,
        name: item.brandName || item.name,
        brand: item.brand,
        brandName: item.brandName,
      }));
      total = data.total || brands.length;
    } else {
      console.warn('⚠️ Unexpected Zendit API response format:', JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unexpected response format from Zendit API. Expected BrandsResponse with "list" array.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ Fetched ${brands.length} brands from Zendit (total available: ${total})`);

    return new Response(
      JSON.stringify({
        success: true,
        brands,
        total,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit brands:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch brands from Zendit API',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
