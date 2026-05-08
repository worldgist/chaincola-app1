import Constants from 'expo-constants';
import { supabase } from './supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/supabase';

// Get Supabase URL for Edge Function
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 
                     process.env.NEXT_PUBLIC_SUPABASE_URL || 
                     process.env.EXPO_PUBLIC_SUPABASE_URL ||
                     SUPABASE_URL;

const VERIFY_JAMB_PROFILE_URL = `${supabaseUrl}/functions/v1/verify-jamb-profile`;

export interface VerifyJambProfileRequest {
  profilecode: string; // Required: 10-digit JAMB profile code
  product_code: number; // Required: 1 for UTME, 2 for Direct Entry
}

export interface VerifyJambProfileResponse {
  success: boolean;
  verified?: boolean;
  candidateName?: string;
  profileCode?: string;
  status?: string;
  service?: string;
  productCode?: string;
  message?: string;
  error?: string;
  code?: number;
}

/**
 * Verify JAMB profile code using VTU Africa API via Supabase Edge Function
 */
export async function verifyJambProfile(
  params: VerifyJambProfileRequest
): Promise<VerifyJambProfileResponse> {
  try {
    // Validate required parameters
    if (!params.profilecode || params.profilecode.trim() === '') {
      return {
        success: false,
        error: 'Profile code is required',
      };
    }

    // Validate profile code format (10 digits)
    const profileCodeRegex = /^\d{10}$/;
    if (!profileCodeRegex.test(params.profilecode.trim())) {
      return {
        success: false,
        error: 'Profile code must be exactly 10 digits',
      };
    }

    // Validate product_code (1 or 2)
    if (params.product_code !== 1 && params.product_code !== 2) {
      return {
        success: false,
        error: 'Product code must be 1 (UTME) or 2 (Direct Entry)',
      };
    }

    // Get Supabase session for authentication
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // Get Supabase anon key for API calls
    const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 
                           process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                           process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
                           SUPABASE_ANON_KEY;

    console.log('📡 Verifying JAMB profile code via Edge Function');

    // Call Supabase Edge Function
    const response = await fetch(VERIFY_JAMB_PROFILE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({
        profilecode: params.profilecode.trim(),
        product_code: params.product_code,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Edge Function error:', response.status, errorText);
      
      // Handle 404 - Edge Function not deployed
      if (response.status === 404) {
        return {
          success: false,
          error: 'JAMB verification service is not available. Please contact support.',
        };
      }
      
      return {
        success: false,
        error: `Failed to verify profile code: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to verify profile code',
        code: result.code,
      };
    }

    console.log(`✅ JAMB profile verified: ${result.candidateName}`);

    return {
      success: true,
      verified: result.verified,
      candidateName: result.candidateName,
      profileCode: result.profileCode,
      status: result.status,
      service: result.service,
      productCode: result.productCode,
      message: result.message,
    };
  } catch (error: any) {
    console.error('❌ Exception verifying JAMB profile:', error);
    return {
      success: false,
      error: error.message || 'Failed to verify JAMB profile code',
    };
  }
}
