// Referral Service
// Handles referral codes and relationships from the database
import { createClient } from './supabase/client';

const supabase = createClient();

export interface ReferralCodeValidation {
  isValid: boolean;
  error?: string;
  userId?: string;
}

/**
 * Validates a referral code by checking if it exists in the database
 */
export async function validateReferralCode(code: string): Promise<ReferralCodeValidation> {
  try {
    if (!code || code.trim().length === 0) {
      return {
        isValid: false,
        error: 'Referral code cannot be empty',
      };
    }

    // Use the database function to validate
    const { data, error } = await supabase.rpc('validate_referral_code', {
      p_code: code.trim().toUpperCase(),
    });

    if (error) {
      console.error('Error validating referral code:', error);
      return {
        isValid: false,
        error: 'An error occurred while validating the referral code',
      };
    }

    if (data && data.length > 0) {
      const result = data[0];
      return {
        isValid: result.is_valid,
        error: result.error_message || undefined,
        userId: result.user_id || undefined,
      };
    }

    return {
      isValid: false,
      error: 'Invalid referral code',
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception validating referral code:', msg);
    return {
      isValid: false,
      error: 'An error occurred while validating the referral code',
    };
  }
}

/**
 * Creates a referral relationship between referrer and referred user
 */
export async function createReferralRelationship(
  referrerUserId: string,
  referredUserId: string,
  referralCode: string,
  rewardAmount: number = 200 // Default reward amount in NGN
): Promise<{ error: any }> {
  try {
    // Use the database function to create referral
    const { error } = await supabase.rpc('create_referral', {
      p_referrer_user_id: referrerUserId,
      p_referred_user_id: referredUserId,
      p_referral_code: referralCode.trim().toUpperCase(),
      p_reward_amount: rewardAmount,
      p_reward_currency: 'NGN',
    });

    if (error) {
      console.error('Error creating referral relationship:', error);
      return { error };
    }

    return { error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception creating referral relationship:', msg);
    return { error };
  }
}

/**
 * Gets the referral code for a user (from user_profiles table)
 */
export async function getUserReferralCode(userId: string): Promise<{ code: string | null; error: any }> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('referral_code')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return { code: null, error: null };
      }
      console.error('Error fetching referral code:', error);
      return { code: null, error };
    }

    return { code: data?.referral_code || null, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching referral code:', msg);
    return { code: null, error };
  }
}

/**
 * Generates a referral code for a user
 */
export async function generateReferralCode(userId: string): Promise<{ code: string | null; error: any }> {
  try {
    const { code: existingCode } = await getUserReferralCode(userId);
    
    if (existingCode) {
      return { code: existingCode, error: null };
    }

    // Check if profile exists
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id, user_id, referral_code')
      .eq('user_id', userId)
      .maybeSingle();

    // Generate a referral code from user ID
    const referralCodeValue = userId.replace(/-/g, '').substring(0, 7).toUpperCase();
    
    if (!profile) {
      // Try to create profile with referral code
      const { data: newProfile, error: insertError } = await supabase
        .from('user_profiles')
        .insert({
          user_id: userId,
          referral_code: referralCodeValue,
        })
        .select('referral_code')
        .single();

      if (insertError) {
        return { 
          code: null, 
          error: {
            message: 'Unable to create user profile. Please contact support.',
            code: insertError.code,
            details: insertError.message,
          }
        };
      }

      return { code: newProfile?.referral_code || null, error: null };
    }

    // Update existing profile
    if (!profile.referral_code) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('user_profiles')
        .update({ referral_code: referralCodeValue })
        .eq('user_id', userId)
        .select('referral_code')
        .single();

      if (updateError) {
        return { 
          code: null, 
          error: {
            message: 'Unable to generate referral code. Please contact support.',
            code: updateError.code,
            details: updateError.message,
          }
        };
      }

      return { code: updatedProfile?.referral_code || null, error: null };
    }

    return { code: profile.referral_code, error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception generating referral code:', msg);
    return { 
      code: null, 
      error: {
        message: msg || 'An unexpected error occurred',
      }
    };
  }
}

/**
 * Get referral statistics for a user
 */
export async function getReferralStats(userId: string): Promise<{
  totalReferrals: number;
  pendingReferrals: number;
  totalEarnings: number;
  paidEarnings: number;
  error?: any;
}> {
  try {
    const { data, error } = await supabase.rpc('get_referral_stats', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error fetching referral stats:', error);
      return {
        totalReferrals: 0,
        pendingReferrals: 0,
        totalEarnings: 0,
        paidEarnings: 0,
        error,
      };
    }

    return {
      totalReferrals: data?.total_referrals || 0,
      pendingReferrals: data?.pending_referrals || 0,
      totalEarnings: data?.total_earnings || 0,
      paidEarnings: data?.paid_earnings || 0,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching referral stats:', msg);
    return {
      totalReferrals: 0,
      pendingReferrals: 0,
      totalEarnings: 0,
      paidEarnings: 0,
      error,
    };
  }
}

/**
 * Get recent referrals for a user
 */
export async function getRecentReferrals(
  userId: string,
  limit: number = 10
): Promise<{ referrals: any[]; error: any }> {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent referrals:', error);
      return { referrals: [], error };
    }

    return { referrals: data || [], error: null };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Exception fetching recent referrals:', msg);
    return { referrals: [], error };
  }
}

