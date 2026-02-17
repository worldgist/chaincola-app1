// Get Zendit Voucher Purchases Edge Function
// Fetches list of voucher purchase transactions from Zendit API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ZENDIT_API_BASE_URL = 'https://api.zendit.io/v1';

interface GetVoucherPurchasesRequest {
  limit: number; // Required: 1-1024
  offset: number; // Required: for pagination
  createdAt?: string; // Optional: Date filter
  status?: string; // Optional: Status filter (DONE, FAILED, PENDING, ACCEPTED, AUTHORIZED, IN_PROGRESS)
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
    let params: GetVoucherPurchasesRequest;
    
    if (req.method === 'POST') {
      const body = await req.json();
      params = {
        limit: body.limit || body._limit || 100,
        offset: body.offset || body._offset || 0,
        createdAt: body.createdAt || undefined,
        status: body.status || undefined,
      };
    } else {
      const url = new URL(req.url);
      params = {
        limit: parseInt(url.searchParams.get('_limit') || '100'),
        offset: parseInt(url.searchParams.get('_offset') || '0'),
        createdAt: url.searchParams.get('createdAt') || undefined,
        status: url.searchParams.get('status') || undefined,
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

    if (params.createdAt) {
      queryParams.append('createdAt', params.createdAt);
    }

    if (params.status) {
      queryParams.append('status', params.status);
    }

    const zenditUrl = `${ZENDIT_API_BASE_URL}/vouchers/purchases?${queryParams.toString()}`;

    console.log(`📡 Fetching Zendit voucher purchases: ${zenditUrl}`);

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

    // Process the purchases data
    // According to Zendit API schema, /vouchers/purchases endpoint returns:
    // {
    //   "limit": number,
    //   "list": [VoucherPurchase],  // Array of purchases
    //   "offset": number,
    //   "total": number
    // }
    let purchases: any[] = [];
    let total = 0;

    if (data.list && Array.isArray(data.list)) {
      purchases = data.list.map((purchase: any) => {
        // Process purchase data - keep full purchase object for reference
        return {
          purchaseId: purchase.purchaseId,
          offerId: purchase.offerId,
          brand: purchase.brand,
          country: purchase.country,
          status: purchase.status, // DONE, FAILED, PENDING, ACCEPTED, AUTHORIZED, IN_PROGRESS
          cost: purchase.cost, // What we paid to Zendit
          price: purchase.price, // Price charged to customer
          send: purchase.send, // Value sent by gift card
          receipt: purchase.receipt, // Receipt information
          createdAt: purchase.createdAt,
          updatedAt: purchase.updatedAt,
          // Keep full purchase for reference
          fullPurchase: purchase,
        };
      });
      total = data.total || purchases.length;
    } else if (Array.isArray(data)) {
      // Fallback: if response is directly an array
      purchases = data.map((purchase: any) => ({
        purchaseId: purchase.purchaseId,
        offerId: purchase.offerId,
        brand: purchase.brand,
        country: purchase.country,
        status: purchase.status,
        cost: purchase.cost,
        price: purchase.price,
        send: purchase.send,
        receipt: purchase.receipt,
        createdAt: purchase.createdAt,
        updatedAt: purchase.updatedAt,
        fullPurchase: purchase,
      }));
      total = purchases.length;
    } else {
      console.warn('⚠️ Unexpected Zendit API response format:', JSON.stringify(data).substring(0, 500));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unexpected response format from Zendit API. Expected VoucherPurchasesResponse with "list" array.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`✅ Fetched ${purchases.length} voucher purchases from Zendit (total available: ${total})`);

    return new Response(
      JSON.stringify({
        success: true,
        purchases,
        total,
        limit: data.limit || params.limit,
        offset: data.offset || params.offset,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Exception fetching Zendit voucher purchases:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to fetch voucher purchases from Zendit API',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
