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

/** v3 API root only (no `/kyc` suffix). Override with FLUTTERWAVE_API_BASE if needed. */
function flutterwaveV3Base(): string {
  const raw = (Deno.env.get('FLUTTERWAVE_API_BASE') || 'https://api.flutterwave.com/v3').trim();
  let base = raw.replace(/\/+$/, '');
  // Avoid doubled paths if someone set .../v3/kyc
  base = base.replace(/\/kyc\/?$/i, '');
  return base || 'https://api.flutterwave.com/v3';
}

function flutterwaveV2ResolveHost(secretKey: string): string {
  if (/TEST|sandbox/i.test(secretKey)) {
    return 'https://ravesandboxapi.flutterwave.com';
  }
  return 'https://api.flutterwave.com';
}

interface VerifyNINRequest {
  nin?: string;
  bvn?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  date_of_birth?: string; // Format: YYYY-MM-DD
}

interface FlutterwaveBVNData {
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
  nin?: string;
  state_of_origin?: string;
  state_of_residence?: string;
  watch_listed?: string;
  date_of_birth?: string;
}

interface FlutterwaveBVNResponse {
  status: string;
  message: string;
  data: FlutterwaveBVNData;
}

function fwTopLevelMessage(parsed: Record<string, unknown>): string {
  const m = parsed.message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m)) return m.map(String).join(' ');
  const d = parsed.data;
  if (d && typeof d === 'object' && 'message' in d && typeof (d as { message?: string }).message === 'string') {
    return (d as { message: string }).message;
  }
  return '';
}

/** v2 `data` object or v3 nested `data.bvn_data` → unified shape for DB insert */
function extractBvnDataFromFlutterwaveJson(
  parsed: Record<string, unknown>,
  fallbackBvn: string,
): FlutterwaveBVNData | null {
  if (parsed.status !== 'success' || parsed.data == null) return null;
  const d = parsed.data as Record<string, unknown>;

  const fromFlat = (): FlutterwaveBVNData | null => {
    const fn = (d.first_name ?? d.firstName) as string | undefined;
    const ln = (d.last_name ?? d.lastName ?? d.surname) as string | undefined;
    if (fn == null && ln == null) return null;
    return {
      bvn: String(d.bvn ?? fallbackBvn),
      first_name: String(fn ?? '').trim() || 'Unknown',
      last_name: String(ln ?? '').trim() || 'Unknown',
      middle_name: (d.middle_name ?? d.middleName) as string | undefined,
      account_number: d.account_number as string | undefined,
      bank_code: d.bank_code as string | undefined,
      phone_number: (d.phone_number ?? d.phoneNumber2 ?? d.phoneNumber1) as string | undefined,
      registration_date: d.registration_date as string | undefined,
      enrollment_bank: d.enrollment_bank as string | undefined,
      enrollment_branch: d.enrollment_branch as string | undefined,
      image: d.image as string | undefined,
      email: d.email as string | undefined,
      level_of_account: d.level_of_account as string | undefined,
      lga_of_origin: d.lga_of_origin as string | undefined,
      lga_of_residence: d.lga_of_residence as string | undefined,
      marital_status: d.marital_status as string | undefined,
      name_on_card: d.name_on_card as string | undefined,
      nationality: d.nationality as string | undefined,
      nin: (d.nin as string | undefined)?.replace(/\s/g, ''),
      state_of_origin: d.state_of_origin as string | undefined,
      state_of_residence: d.state_of_residence as string | undefined,
      watch_listed: (d.watch_listed ?? d.watchlisted) as string | undefined,
      date_of_birth: (d.date_of_birth ?? d.dateOfBirth) as string | undefined,
    };
  };

  const bvnData = d.bvn_data as Record<string, unknown> | undefined;
  if (bvnData && typeof bvnData === 'object') {
    const fn = (bvnData.firstName ?? bvnData.first_name) as string | undefined;
    const ln = (bvnData.surname ?? bvnData.last_name ?? bvnData.lastName) as string | undefined;
    if (!fn && !ln) return fromFlat();
    return {
      bvn: String(bvnData.bvn ?? fallbackBvn),
      first_name: String(fn ?? '').trim() || 'Unknown',
      last_name: String(ln ?? '').trim() || 'Unknown',
      middle_name: (bvnData.middleName ?? bvnData.middle_name) as string | undefined,
      phone_number: (bvnData.phoneNumber2 ?? bvnData.phoneNumber1 ?? bvnData.phone_number) as string | undefined,
      email: bvnData.email as string | undefined,
      nin: typeof bvnData.nin === 'string' ? bvnData.nin.replace(/\s/g, '') : undefined,
      date_of_birth: (bvnData.dateOfBirth ?? bvnData.date_of_birth) as string | undefined,
      enrollment_bank: (bvnData.enrollBankCode ?? bvnData.enrollment_bank) as string | undefined,
      state_of_origin: bvnData.stateOfOrigin as string | undefined,
      state_of_residence: bvnData.stateOfResidence as string | undefined,
      lga_of_origin: bvnData.lgaOfOrigin as string | undefined,
      lga_of_residence: bvnData.lgaOfResidence as string | undefined,
      marital_status: bvnData.maritalStatus as string | undefined,
      nationality: bvnData.nationality as string | undefined,
      watch_listed: bvnData.watchlisted as string | undefined,
    };
  }

  return fromFlat();
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

    const v3Base = flutterwaveV3Base();
    const bearerHeaders = {
      Authorization: `Bearer ${flutterwaveSecretKey}`,
      'Content-Type': 'application/json',
    } as const;

    const v2HostPrimary = flutterwaveV2ResolveHost(flutterwaveSecretKey);
    const attempts: Array<{ label: string; url: string; headers: Record<string, string> }> = [
      {
        label: 'v2-seckey',
        url: `${v2HostPrimary}/v2/kyc/bvn/${verificationNumber}?seckey=${encodeURIComponent(flutterwaveSecretKey)}`,
        headers: { 'Content-Type': 'application/json' },
      },
      {
        label: 'v2-seckey-ravepay',
        url: `https://api.ravepay.co/v2/kyc/bvn/${verificationNumber}?seckey=${encodeURIComponent(flutterwaveSecretKey)}`,
        headers: { 'Content-Type': 'application/json' },
      },
      {
        label: 'v3-bearer-bvns',
        url: `${v3Base}/kyc/bvns/${verificationNumber}`,
        headers: { ...bearerHeaders },
      },
    ];

    let result: FlutterwaveBVNResponse | null = null;
    let lastMessage = '';
    let lastHttp = 400;

    for (const { label, url, headers } of attempts) {
      const res = await fetch(url, { method: 'GET', headers });
      lastHttp = res.status;
      const text = await res.text();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        lastMessage = text.slice(0, 240) || `Invalid response (${res.status})`;
        console.warn(`verify-nin ${label}: non-JSON HTTP ${res.status}`);
        continue;
      }

      const extracted = extractBvnDataFromFlutterwaveJson(parsed, verificationNumber);
      if (extracted) {
        result = {
          status: 'success',
          message: typeof parsed.message === 'string' ? parsed.message : 'BVN resolved',
          data: extracted,
        };
        console.log(`verify-nin OK via ${label}`);
        break;
      }

      lastMessage = fwTopLevelMessage(parsed) || lastMessage || `HTTP ${res.status}`;
      console.warn(`verify-nin ${label}: ${lastMessage}`);
    }

    if (!result || result.status !== 'success' || !result.data) {
      const hint =
        'Ensure your Flutterwave wallet is funded (BVN lookup is paid), the secret key matches live vs test, and BVN resolution is enabled on your Flutterwave account. If it persists, contact Flutterwave support.';
      return new Response(
        JSON.stringify({
          status: 'error',
          message: lastMessage || `Failed to verify ${verificationType}.`,
          hint,
        }),
        {
          status: lastHttp >= 400 ? lastHttp : 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

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
