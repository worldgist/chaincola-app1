// Get Zendit Voucher Offers Edge Function
// Fetches available voucher offers (gift card amounts) from Zendit API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZENDIT_API_BASE_URL = 'https://api.zendit.io/v1';

interface GetVoucherOffersRequest {
  limit: number; // Required: 1-1024
  offset: number; // Required: for pagination
  brand?: string; // Optional: Brand name to filter
  country?: string; // Optional: 2 letter ISO code
  regions?: string; // Optional: Region name to filter
  subType?: string; // Optional: Offer subtype
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
    let params: GetVoucherOffersRequest;
    
    if (req.method === 'POST') {
      const body = await req.json();
      params = {
        limit: body.limit || body._limit || 100,
        offset: body.offset || body._offset || 0,
        brand: body.brand || undefined,
        country: body.country || undefined,
        regions: body.regions || undefined,
        subType: body.subType || undefined,
      };
    } else {
      const url = new URL(req.url);
      params = {
        limit: parseInt(url.searchParams.get('_limit') || '100'),
        offset: parseInt(url.searchParams.get('_offset') || '0'),
        brand: url.searchParams.get('brand') || undefined,
        country: url.searchParams.get('country') || undefined,
        regions: url.searchParams.get('regions') || undefined,
        subType: url.searchParams.get('subType') || undefined,
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

    if (params.brand) {
      queryParams.append('brand', params.brand);
    }

    if (params.country) {
      queryParams.append('country', params.country.toUpperCase());
    }

    if (params.regions) {
      queryParams.append('regions', params.regions);
    }

    if (params.subType) {
      queryParams.append('subType', params.subType);
    }

    const zenditUrl = `${ZENDIT_API_BASE_URL}/vouchers/offers?${queryParams.toString()}`;

    console.log(`📡 Fetching Zendit voucher offers: ${zenditUrl}`);

    // Call Zendit API with timeout (30 seconds)
    // According to Zendit API docs, authorization should be "Bearer" format
    // See: https://developers.zendit.io - "Authorization: Bearer YOUR_API_KEY"
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
            error: 'Request to Zendit API timed out. Please try again with a smaller limit or add filters.',
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

    // According to Zendit API schema, /vouchers/offers endpoint returns VoucherOffersResponse:
    // {
    //   "limit": number,
    //   "list": [VoucherOffer],  // Array of offers
    //   "offset": number,
    //   "total": number
    // }
    // Each VoucherOffer has: offerId, brand, country, send (dto.Zend), cost (dto.Cost), priceType (Fixed/Range), etc.
    let offers: any[] = [];
    let total = 0;

    if (data.list && Array.isArray(data.list)) {
      // Standard VoucherOffersResponse format
      offers = data.list
        .filter((offer: any) => offer.enabled !== false) // Only enabled offers
        .map((offer: any) => {
          // Extract card amount from send value
          const send = offer.send || {};
          const currencyDivisor = send.currencyDivisor || 100; // Default to 100 (cents)
          let cardAmount: number | null = null;
          let minAmount: number | null = null;
          let maxAmount: number | null = null;

          if (offer.priceType === 'Fixed' && send.fixed !== undefined) {
            cardAmount = send.fixed / currencyDivisor;
          } else if (offer.priceType === 'Range') {
            if (send.min !== undefined) minAmount = send.min / currencyDivisor;
            if (send.max !== undefined) maxAmount = send.max / currencyDivisor;
          }

          return {
            offerId: offer.offerId,
            brand: offer.brand,
            country: offer.country,
            priceType: offer.priceType, // "Fixed" or "Range"
            cardAmount, // For Fixed offers
            minAmount, // For Range offers
            maxAmount, // For Range offers
            currency: send.currency || 'USD',
            currencyDivisor,
            cost: offer.cost, // What we pay to Zendit
            enabled: offer.enabled,
            notes: offer.notes,
            shortNotes: offer.shortNotes,
            requiredFields: offer.requiredFields || [],
            // Keep full offer for reference
            fullOffer: offer,
          };
        });
      total = data.total || offers.length;
    } else if (Array.isArray(data)) {
      // Fallback: if response is directly an array
      offers = data
        .filter((offer: any) => offer.enabled !== false)
        .map((offer: any) => {
          const send = offer.send || {};
          const currencyDivisor = send.currencyDivisor || 100;
          let cardAmount: number | null = null;
          let minAmount: number | null = null;
          let maxAmount: number | null = null;

          if (offer.priceType === 'Fixed' && send.fixed !== undefined) {
            cardAmount = send.fixed / currencyDivisor;
          } else if (offer.priceType === 'Range') {
            if (send.min !== undefined) minAmount = send.min / currencyDivisor;
            if (send.max !== undefined) maxAmount = send.max / currencyDivisor;
          }

          return {
            offerId: offer.offerId,
            brand: offer.brand,
            country: offer.country,
            priceType: offer.priceType,
            cardAmount,
            minAmount,
            maxAmount,
            currency: send.currency || 'USD',
            currencyDivisor,
            cost: offer.cost,
            enabled: offer.enabled,
            notes: offer.notes,
            shortNotes: offer.shortNotes,
            requiredFields: offer.requiredFields || [],
            fullOffer: offer,
          };
        });
      total = offers.length;
    } else {
      console.warn('⚠️ Unexpected Zendit API response format:', JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unexpected response format from Zendit API. Expected VoucherOffersResponse with "list" array.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ Fetched ${offers.length} voucher offers from Zendit (total available: ${total})`);

    return new Response(
      JSON.stringify({
        success: true,
        offers,
        total,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit voucher offers:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch voucher offers from Zendit API',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
