/**
 * Demo Verification Service
 * Creates demo account verification records for testing
 */

import { supabase } from './supabase';

export interface DemoVerificationParams {
  autoApprove?: boolean; // If true, automatically approve the verification
}

/**
 * Create a demo account verification
 * Bypasses document upload and creates a verification record directly
 */
export async function createDemoVerification(
  params: DemoVerificationParams = {}
): Promise<{ success: boolean; verification_id?: string; error?: string }> {
  try {
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session || !session.user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    const userId = session.user.id;
    const { autoApprove = false } = params;

    console.log('🧪 Demo: Creating account verification...', { userId, autoApprove });

    // Get user profile for demo data
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('full_name, phone_number')
      .eq('user_id', userId)
      .single();

    // Generate demo data
    const fullName = userProfile?.full_name || 'Demo User';
    const phoneNumber = userProfile?.phone_number || '+2348012345678';
    const address = '123 Demo Street, Lagos, Nigeria';
    const nin = Math.floor(10000000000 + Math.random() * 90000000000).toString(); // 11-digit NIN

    // Generate demo document URLs (placeholder URLs)
    const ninFrontUrl = `https://via.placeholder.com/400x300/6B46C1/FFFFFF?text=NIN+Front`;
    const ninBackUrl = `https://via.placeholder.com/400x300/9333EA/FFFFFF?text=NIN+Back`;
    const passportPhotoUrl = `https://via.placeholder.com/400x400/10B981/FFFFFF?text=Passport+Photo`;

    // Check if there's an existing pending verification
    const { data: existingVerification } = await supabase
      .from('account_verifications')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (existingVerification) {
      console.log('🗑️ Removing existing pending verification...');
      await supabase
        .from('account_verifications')
        .delete()
        .eq('id', existingVerification.id);
    }

    // Create verification record
    const status = autoApprove ? 'approved' : 'pending';
    const reviewedAt = autoApprove ? new Date().toISOString() : null;

    const { data: verificationData, error: insertError } = await supabase
      .from('account_verifications')
      .insert({
        user_id: userId,
        full_name: fullName,
        phone_number: phoneNumber,
        address: address,
        nin: nin,
        nin_front_url: ninFrontUrl,
        nin_back_url: ninBackUrl,
        passport_photo_url: passportPhotoUrl,
        status: status,
        reviewed_at: reviewedAt,
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Demo: Error creating verification:', insertError);
      return {
        success: false,
        error: 'Failed to create verification record',
      };
    }

    // Update metadata to mark as demo
    await supabase
      .from('account_verifications')
      .update({
        metadata: {
          is_demo: true,
          demo_created_at: new Date().toISOString(),
        },
      })
      .eq('id', verificationData.id);

    console.log('✅ Demo: Verification created:', verificationData.id);

    return {
      success: true,
      verification_id: verificationData.id,
    };
  } catch (error: any) {
    console.error('❌ Demo: Exception creating verification:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}
