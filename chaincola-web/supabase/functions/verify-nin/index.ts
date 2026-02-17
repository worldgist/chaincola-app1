// Flutterwave NIN/BVN Verification Edge Function
// Verifies NIN (National Identification Number) or BVN using Flutterwave API
// Note: Flutterwave currently supports BVN verification. NIN verification may require
// integration with NIMC or a third-party service in the future.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Flutterwave API base URL
const FLUTTERWAVE_API_BASE = Deno.env.get('FLUTTERWAVE_API_BASE') || 'https://api.flutterwave.com/v3';

interface VerifyNINRequest {
  nin?: string;
  bvn?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  date_of_birth?: string; // Format: YYYY-MM-DD
}

interface FlutterwaveBVNResponse {
  status: string;
  message: string;
  data: {
    bvn: string;
    first_name: string;
    last_name: string;
    middle_name?: string;
    account_number?: string;
    bank_code?: string;
    phone_number?: string;
    registration_date?: string;
    enrollment_bank?: string;
    enrollment_branch?: string;
    image?: string;
    email?: string;
    level_of_account?: string;
    lga_of_origin?: string;
    lga_of_residence?: string;
    marital_status?: string;
    name_on_card?: string;
    nationality?: string;
    nin?: string; // BVN data may include NIN
    state_of_origin?: string;
    state_of_residence?: string;
    watch_listed?: string;
    date_of_birth?: string;
  };
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

    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Missing authorization header',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user ID from JWT token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Invalid or expired token',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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

    // Parse request body
    const body: VerifyNINRequest = await req.json();
    const { nin, bvn, first_name, last_name, phone_number, date_of_birth } = body;

    // Validate input - require either NIN or BVN
    if (!nin && !bvn) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Either NIN or BVN is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate NIN format (11 digits)
    if (nin && (nin.length !== 11 || !/^\d+$/.test(nin))) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'NIN must be exactly 11 digits',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate BVN format (11 digits)
    if (bvn && (bvn.length !== 11 || !/^\d+$/.test(bvn))) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'BVN must be exactly 11 digits',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Use BVN for verification (Flutterwave supports BVN)
    // Note: Flutterwave doesn't have direct NIN verification API
    // If NIN is provided but no BVN, we'll request BVN from user
    // For production NIN verification, integrate with NIMC or a third-party NIN verification service
    
    if (nin && !bvn) {
      // NIN provided but no BVN - Flutterwave requires BVN for verification
      // In the future, this can be replaced with NIMC NIN verification API
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'NIN verification requires BVN. Please provide your BVN for verification, or we can verify using BVN instead.',
          requires_bvn: true,
          note: 'For direct NIN verification, please integrate with NIMC API or a third-party NIN verification service.',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const verificationNumber = bvn || nin;
    const verificationType = bvn ? 'BVN' : 'NIN';

    console.log(`🔍 Verifying ${verificationType}: ${verificationNumber.substring(0, 4)}****`);

    // Call Flutterwave BVN Verification API (v2 endpoint)
    // Note: v3 requires customer consent flow, v2 is simpler for backend verification
    const verifyUrl = `${FLUTTERWAVE_API_BASE}/kyc/bvn/${verificationNumber}?bvn=${verificationNumber}`;
    
    const flutterwaveResponse = await fetch(verifyUrl, {
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

      console.error(`❌ Flutterwave ${verificationType} verification failed:`, errorData);
      
      return new Response(
        JSON.stringify({
          status: 'error',
          message: errorData.message || `Failed to verify ${verificationType}. Please check the number and try again.`,
        }),
        {
          status: flutterwaveResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result: FlutterwaveBVNResponse = await flutterwaveResponse.json();

    if (result.status === 'success' && result.data) {
      console.log(`✅ ${verificationType} verified: ${result.data.first_name} ${result.data.last_name}`);

      // Store verification result in account_verifications and update user_profiles
      const fullName = [result.data.first_name, result.data.middle_name, result.data.last_name]
        .filter(Boolean).join(' ').trim() || `${result.data.first_name} ${result.data.last_name}`.trim();
      const phoneNumber = result.data.phone_number || '';

      try {
        // Delete any existing pending verification for this user
        await supabase
          .from('account_verifications')
          .delete()
          .eq('user_id', user.id)
          .eq('status', 'pending');

        // Insert new verification as approved (Flutterwave verified)
        const { error: insertError } = await supabase
          .from('account_verifications')
          .insert({
            user_id: user.id,
            full_name: fullName,
            phone_number: phoneNumber,
            address: '',
            nin: nin || result.data.nin || null,
            nin_front_url: null,
            nin_back_url: null,
            passport_photo_url: null,
            status: 'approved',
            submitted_at: new Date().toISOString(),
            reviewed_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error('❌ Error storing verification result:', insertError);
        } else {
          // Update user_profiles verification_status to approved
          await supabase
            .from('user_profiles')
            .update({
              verification_status: 'approved',
              full_name: fullName,
              phone_number: phoneNumber || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', user.id);
        }
      } catch (dbError) {
        console.error('❌ Exception storing verification result:', dbError);
      }

      return new Response(
        JSON.stringify({
          status: 'success',
          verified: true,
          verification_type: verificationType,
          data: {
            first_name: result.data.first_name,
            last_name: result.data.last_name,
            middle_name: result.data.middle_name,
            phone_number: result.data.phone_number,
            email: result.data.email,
            date_of_birth: result.data.date_of_birth,
            nin: result.data.nin || nin,
            bvn: result.data.bvn || bvn,
            enrollment_bank: result.data.enrollment_bank,
            state_of_origin: result.data.state_of_origin,
            state_of_residence: result.data.state_of_residence,
            lga_of_origin: result.data.lga_of_origin,
            lga_of_residence: result.data.lga_of_residence,
            marital_status: result.data.marital_status,
            nationality: result.data.nationality,
            watch_listed: result.data.watch_listed,
          },
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
        message: result.message || `Invalid response from ${verificationType} verification service`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Error verifying NIN/BVN:', error);
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
