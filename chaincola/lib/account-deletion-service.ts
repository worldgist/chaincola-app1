// Account Deletion Service
// Handles account deletion requests from the database
import { supabase } from './supabase';

export interface AccountDeletion {
  id: string;
  user_id: string;
  reason?: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
  requested_at: string;
  scheduled_deletion_at: string; // calculated as requested_at + 30 days
  processed_at?: string;
  created_at: string;
  updated_at: string;
}

const GRACE_PERIOD_DAYS = 30;

/**
 * Creates an account deletion request
 * The account will be scheduled for deletion after 30 days
 */
export async function createAccountDeletionRequest(
  userId: string,
  reason?: string
): Promise<{ success: boolean; data?: AccountDeletion; error?: string }> {
  try {
    // Use the database function to create deletion request
    const { data: deletionId, error } = await supabase.rpc('create_account_deletion_request', {
      p_user_id: userId,
      p_reason: reason || null,
      p_grace_period_days: GRACE_PERIOD_DAYS,
    });

    if (error) {
      console.error('Error creating account deletion request:', error);
      
      // Handle specific error cases
      if (error.message?.includes('already has a pending')) {
        return {
          success: false,
          error: 'You already have a pending deletion request. Please cancel it first or wait for it to be processed.',
        };
      }
      
      return {
        success: false,
        error: error.message || 'Failed to create account deletion request',
      };
    }

    // Fetch the created deletion request
    if (deletionId) {
      const deletionRequest = await getUserDeletionRequest(userId);
      if (deletionRequest) {
        return {
          success: true,
          data: deletionRequest,
        };
      }
    }

    // Fallback: try direct query
    const { data: directData, error: directError } = await supabase
      .from('account_deletions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (directError) {
      return {
        success: false,
        error: directError.message || 'Failed to retrieve deletion request',
      };
    }

    return {
      success: true,
      data: directData as AccountDeletion,
    };
  } catch (error: any) {
    console.error('Exception creating account deletion request:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
}

/**
 * Gets the user's account deletion request
 */
export async function getUserDeletionRequest(userId: string): Promise<AccountDeletion | null> {
  try {
    // Use the database function to get deletion request
    const { data, error } = await supabase.rpc('get_user_deletion_request', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error fetching account deletion request:', error);
      // Fallback to direct query
      const { data: directData, error: directError } = await supabase
        .from('account_deletions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (directError) {
        // If no record found, it's not an error
        if (directError.code === 'PGRST116') {
          return null;
        }
        console.error('Error with fallback query:', directError);
        return null;
      }

      return directData as AccountDeletion | null;
    }

    if (data && data.length > 0) {
      return data[0] as AccountDeletion;
    }

    return null;
  } catch (error: any) {
    console.error('Exception fetching account deletion request:', error);
    return null;
  }
}

/**
 * Cancels an account deletion request
 */
export async function cancelAccountDeletionRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Use the database function to cancel deletion request
    const { error } = await supabase.rpc('cancel_account_deletion_request', {
      p_deletion_id: requestId,
      p_user_id: user.id,
    });

    if (error) {
      console.error('Error cancelling account deletion request:', error);
      
      // Handle specific error cases
      if (error.message?.includes('not found') || error.message?.includes('already processed')) {
        return {
          success: false,
          error: 'Deletion request not found or has already been processed. It cannot be cancelled.',
        };
      }
      
      // Fallback to direct update
      const { error: updateError } = await supabase
        .from('account_deletions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (updateError) {
        return {
          success: false,
          error: updateError.message || 'Failed to cancel deletion request',
        };
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception cancelling account deletion request:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
}

/**
 * Formats the time remaining until account deletion
 */
export function formatTimeRemaining(scheduledDeletionAt: string): string {
  try {
    const now = new Date();
    const deletionDate = new Date(scheduledDeletionAt);
    const diffInMs = deletionDate.getTime() - now.getTime();

    if (diffInMs <= 0) {
      return 'Account will be deleted soon';
    }

    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInDays > 0) {
      const remainingHours = diffInHours % 24;
      if (remainingHours > 0) {
        return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} and ${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}`;
      }
      return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'}`;
    }

    if (diffInHours > 0) {
      const remainingMinutes = diffInMinutes % 60;
      if (remainingMinutes > 0) {
        return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} and ${remainingMinutes} ${remainingMinutes === 1 ? 'minute' : 'minutes'}`;
      }
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'}`;
    }

    if (diffInMinutes > 0) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'}`;
    }

    return 'Less than a minute';
  } catch (error) {
    console.error('Error formatting time remaining:', error);
    return 'Unable to calculate time remaining';
  }
}

/**
 * Formats a date to a readable string
 */
export function formatDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    return date.toLocaleDateString('en-US', options);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

