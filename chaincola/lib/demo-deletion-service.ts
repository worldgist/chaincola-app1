/**
 * Demo Deletion Service
 * Creates demo account deletion requests for testing
 */

import { supabase } from './supabase';

export interface DemoDeletionParams {
  daysUntilDeletion?: number; // Number of days until deletion (default: 30)
  reason?: string; // Optional reason for deletion
}

/**
 * Create a demo account deletion request
 * Bypasses normal flow and creates a deletion request directly
 */
export async function createDemoDeletionRequest(
  params: DemoDeletionParams = {}
): Promise<{ success: boolean; deletion_id?: string; error?: string }> {
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
    const { daysUntilDeletion = 30, reason } = params;

    console.log('🧪 Demo: Creating account deletion request...', { userId, daysUntilDeletion });

    // Check if there's an existing pending deletion request
    const { data: existingDeletion } = await supabase
      .from('account_deletions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (existingDeletion) {
      return {
        success: false,
        error: 'You already have a pending deletion request. Please cancel it first.',
      };
    }

    // Calculate scheduled deletion date
    const requestedAt = new Date();
    const scheduledDeletionAt = new Date(requestedAt);
    scheduledDeletionAt.setDate(requestedAt.getDate() + daysUntilDeletion);

    // Create deletion request using the database function
    const { data: deletionId, error: rpcError } = await supabase.rpc('create_account_deletion_request', {
      p_user_id: userId,
      p_reason: reason || 'Demo deletion request for testing purposes',
      p_grace_period_days: daysUntilDeletion,
    });

    if (rpcError) {
      // If RPC fails, try direct insert
      console.warn('⚠️ RPC failed, trying direct insert...', rpcError);
      
      const { data: deletionData, error: insertError } = await supabase
        .from('account_deletions')
        .insert({
          user_id: userId,
          reason: reason || 'Demo deletion request for testing purposes',
          status: 'pending',
          requested_at: requestedAt.toISOString(),
          scheduled_deletion_at: scheduledDeletionAt.toISOString(),
          metadata: {
            is_demo: true,
            demo_created_at: new Date().toISOString(),
            days_until_deletion: daysUntilDeletion,
          },
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Demo: Error creating deletion request:', insertError);
        return {
          success: false,
          error: 'Failed to create deletion request',
        };
      }

      console.log('✅ Demo: Deletion request created:', deletionData.id);
      return {
        success: true,
        deletion_id: deletionData.id,
      };
    }

    // Fetch the created deletion request
    const { data: deletionData, error: fetchError } = await supabase
      .from('account_deletions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (fetchError) {
      console.error('❌ Demo: Error fetching deletion request:', fetchError);
      return {
        success: false,
        error: 'Failed to retrieve deletion request',
      };
    }

    // Update metadata to mark as demo
    await supabase
      .from('account_deletions')
      .update({
        metadata: {
          is_demo: true,
          demo_created_at: new Date().toISOString(),
          days_until_deletion: daysUntilDeletion,
        },
      })
      .eq('id', deletionData.id);

    console.log('✅ Demo: Deletion request created:', deletionData.id);

    return {
      success: true,
      deletion_id: deletionData.id,
    };
  } catch (error: any) {
    console.error('❌ Demo: Exception creating deletion request:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}

/**
 * Cancel demo deletion request (if exists)
 */
export async function cancelDemoDeletionRequest(): Promise<{ success: boolean; error?: string }> {
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

    // Get existing deletion request
    const { data: deletionRequest } = await supabase
      .from('account_deletions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (!deletionRequest) {
      return {
        success: false,
        error: 'No pending deletion request found',
      };
    }

    // Cancel the deletion request
    const { error: cancelError } = await supabase
      .from('account_deletions')
      .update({ status: 'cancelled' })
      .eq('id', deletionRequest.id);

    if (cancelError) {
      console.error('❌ Demo: Error cancelling deletion request:', cancelError);
      return {
        success: false,
        error: 'Failed to cancel deletion request',
      };
    }

    console.log('✅ Demo: Deletion request cancelled');
    return {
      success: true,
    };
  } catch (error: any) {
    console.error('❌ Demo: Exception cancelling deletion request:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred',
    };
  }
}
