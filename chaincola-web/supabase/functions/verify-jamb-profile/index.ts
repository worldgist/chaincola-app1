// Verify JAMB Profile Code Edge Function
// Verifies JAMB profile code using VTU Africa API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VTU_AFRICA_API_BASE_URL = 'https://vtuafrica.com.ng/portal/api/merchant-verify';

interface VerifyJambProfileRequest {
  profilecode: string; // Required: 10-digit JAMB profile code
  product_code: number; // Required: 1 for UTME, 2 for Direct Entry
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

    // Get VTU Africa API key from environment
    const vtuAfricaApiKey = Deno.env.get('VTU_AFRICA_API_KEY');
    
    if (!vtuAfricaApiKey) {
      console.error('❌ VTU Africa API key not configured');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'VTU Africa API key not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    let params: VerifyJambProfileRequest;
    
    if (req.method === 'POST') {
      const body = await req.json();
      params = {
        profilecode: body.profilecode || body.profile_code || '',
        product_code: body.product_code || 1, // Default to UTME (1)
      };
    } else {
      const url = new URL(req.url);
      params = {
        profilecode: url.searchParams.get('profilecode') || url.searchParams.get('profile_code') || '',
        product_code: parseInt(url.searchParams.get('product_code') || '1'),
      };
    }

    // Validate required parameters
    if (!params.profilecode || params.profilecode.trim() === '') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Profile code is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate profile code format (10 digits)
    const profileCodeRegex = /^\d{10}$/;
    if (!profileCodeRegex.test(params.profilecode.trim())) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Profile code must be exactly 10 digits',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate product_code (1 or 2)
    if (params.product_code !== 1 && params.product_code !== 2) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Product code must be 1 (UTME) or 2 (Direct Entry)',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Build query parameters for VTU Africa API
    const queryParams = new URLSearchParams({
      apikey: vtuAfricaApiKey,
      serviceName: 'jamb',
      profilecode: params.profilecode.trim(),
      product_code: params.product_code.toString(),
    });

    const vtuAfricaUrl = `${VTU_AFRICA_API_BASE_URL}/?${queryParams.toString()}`;

    console.log(`📡 Verifying JAMB profile code: ${params.profilecode} (product_code: ${params.product_code})`);

    // Call VTU Africa API
    const response = await fetch(vtuAfricaUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ VTU Africa API error:', response.status, errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `VTU Africa API error: ${response.status} - ${errorText}`,
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();

    // Expected response format:
    // {
    //   "code": 101,
    //   "description": {
    //     "Status": "Completed",
    //     "Customer": "Candidate Name",
    //     "ProfileCode": "6828826915",
    //     "Service": "JAMB Direct Entry Registration PIN",
    //     "product_code": "2",
    //     "message": "Candidate Verification Successful."
    //   }
    // }

    if (data.code === 101 && data.description) {
      const description = data.description;
      console.log(`✅ JAMB profile verified: ${description.Customer}`);

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          candidateName: description.Customer || '',
          profileCode: description.ProfileCode || params.profilecode,
          status: description.Status || '',
          service: description.Service || '',
          productCode: description.product_code || params.product_code.toString(),
          message: description.message || 'Candidate Verification Successful.',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Handle error responses
      const errorMessage = data.description?.message || data.message || 'Verification failed';
      console.error('❌ JAMB verification failed:', errorMessage);

      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: errorMessage,
          code: data.code,
        }),
        {
          status: 200, // API returns 200 even for errors
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error: any) {
    console.error('❌ Exception verifying JAMB profile:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to verify JAMB profile code',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
