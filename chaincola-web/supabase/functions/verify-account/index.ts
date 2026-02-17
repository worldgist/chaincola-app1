// Flutterwave Bank Account Verification Edge Function
// Verifies bank account details using Flutterwave API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Flutterwave API base URL
const FLUTTERWAVE_API_BASE = Deno.env.get('FLUTTERWAVE_API_BASE') || 'https://api.flutterwave.com/v3';

interface VerifyAccountRequest {
  account_number: string;
  bank_code: string;
}

interface FlutterwaveAccountResolutionResponse {
  status: string;
  message: string;
  data: {
    account_number: string;
    account_name: string;
    bank_id: number;
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
    const body: VerifyAccountRequest = await req.json();
    const { account_number, bank_code } = body;

    if (!account_number || !bank_code) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Account number and bank code are required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate account number format (Nigerian accounts are typically 10 digits)
    if (account_number.length !== 10 || !/^\d+$/.test(account_number)) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Account number must be exactly 10 digits',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🔍 Verifying bank account: ${account_number.substring(0, 4)}**** (Bank: ${bank_code})`);

    // Call Flutterwave API to resolve account
    const resolveUrl = `${FLUTTERWAVE_API_BASE}/accounts/resolve`;
    
    const flutterwaveResponse = await fetch(resolveUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flutterwaveSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_number: account_number,
        account_bank: bank_code,
      }),
    });

    if (!flutterwaveResponse.ok) {
      const errorText = await flutterwaveResponse.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      console.error('❌ Flutterwave account resolution failed:', errorData);
      
      return new Response(
        JSON.stringify({
          status: 'error',
          message: errorData.message || 'Failed to verify account. Please check the account number and bank code.',
        }),
        {
          status: flutterwaveResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result: FlutterwaveAccountResolutionResponse = await flutterwaveResponse.json();

    if (result.status === 'success' && result.data) {
      console.log(`✅ Account verified: ${result.data.account_name}`);

      // Bank name lookup (Nigerian banks)
      const bankNameMap: Record<string, string> = {
        '044': 'Access Bank',
        '050': 'Ecobank Nigeria',
        '070': 'Fidelity Bank',
        '011': 'First Bank of Nigeria',
        '214': 'First City Monument Bank',
        '058': 'Guaranty Trust Bank',
        '030': 'Heritage Bank',
        '301': 'Jaiz Bank',
        '082': 'Keystone Bank',
        '526': 'Parallex Bank',
        '076': 'Polaris Bank',
        '101': 'Providus Bank',
        '221': 'Stanbic IBTC Bank',
        '068': 'Standard Chartered Bank',
        '232': 'Sterling Bank',
        '100': 'Suntrust Bank',
        '032': 'Union Bank of Nigeria',
        '033': 'United Bank For Africa',
        '215': 'Unity Bank',
        '035': 'Wema Bank',
        '057': 'Zenith Bank',
      };

      return new Response(
        JSON.stringify({
          status: 'success',
          data: {
            account_number: result.data.account_number,
            account_name: result.data.account_name,
            bank_code: bank_code,
            bank_name: bankNameMap[bank_code] || '',
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
        message: result.message || 'Invalid response from verification service',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('❌ Error verifying bank account:', error);
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

