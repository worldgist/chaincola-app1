// Verification Service for Web
// Handles user account verification status
import { createClient } from './supabase/client';

const supabase = createClient();

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | null;

export interface VerificationData {
  id: string;
  user_id: string;
  status: VerificationStatus;
  submitted_at?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  full_name?: string;
  phone_number?: string;
  address?: string;
  nin?: string;
  nin_front_url?: string;
  nin_back_url?: string;
  passport_photo_url?: string;
}

/**
 * Get user verification status
 */
export async function getUserVerificationStatus(userId: string): Promise<VerificationStatus> {
  try {
    const { data, error } = await supabase
      .from('account_verifications')
      .select('status')
      .eq('user_id', userId)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No verification record found
      }
      // Only log non-empty errors
      if (error.message || error.code) {
        console.error('Error fetching verification status:', error);
      }
      return null;
    }

    return data?.status || null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching verification status:', msg);
    return null;
  }
}

/**
 * Verify NIN using Flutterwave API
 */
export async function verifyNIN(
  nin: string,
  firstName?: string,
  lastName?: string,
  phoneNumber?: string,
  dateOfBirth?: string
): Promise<{ success: boolean; verified?: boolean; data?: any; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get Supabase URL from environment (loaded from .env.local)
    // Next.js automatically loads NEXT_PUBLIC_* variables from .env.local
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('❌ NEXT_PUBLIC_SUPABASE_URL not found in environment variables');
      return { 
        success: false, 
        error: 'Supabase URL not configured. Please check your .env.local file.' 
      };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/verify-nin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        nin,
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        date_of_birth: dateOfBirth,
      }),
    });

    const result = await response.json();

    if (!response.ok || result.status === 'error') {
      return {
        success: false,
        verified: false,
        error: result.message || 'Failed to verify NIN',
      };
    }

    return {
      success: true,
      verified: result.verified || false,
      data: result.data,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception verifying NIN:', msg);
    return { success: false, error: msg };
  }
}

/**
 * Submit verification documents
 */
export async function submitVerification(
  userId: string,
  data: {
    full_name: string;
    phone_number: string;
    address: string;
    nin: string;
    nin_front_url: string;
    nin_back_url: string;
    passport_photo_url: string;
  }
): Promise<{ success: boolean; error: any }> {
  try {
    // Upload files to storage first (if needed)
    // Then create verification record
    
    const { error } = await supabase
      .from('account_verifications')
      .insert({
        user_id: userId,
        status: 'pending',
        full_name: data.full_name,
        phone_number: data.phone_number,
        address: data.address,
        nin: data.nin,
        nin_front_url: data.nin_front_url,
        nin_back_url: data.nin_back_url,
        passport_photo_url: data.passport_photo_url,
        submitted_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error submitting verification:', error);
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception submitting verification:', msg);
    return { success: false, error };
  }
}
