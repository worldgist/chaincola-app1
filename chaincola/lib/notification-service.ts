// Notification Service
// Handles user notifications from the database
import { supabase } from './supabase';

export interface Notification {
  id: string;
  user_id: string;
  type: 'transaction' | 'payment' | 'withdrawal' | 'deposit' | 'system' | 'promotion' | 'security' | 'referral' | 'gift-card';
  title: string;
  message: string;
  status: 'read' | 'unread';
  data?: any;
  created_at: string;
  updated_at?: string;
  read_at?: string;
}

/**
 * Fetches all notifications for a user (ordered by most recent first)
 */
export async function getUserNotifications(userId: string): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }

    return (data || []) as Notification[];
  } catch (error: any) {
    console.error('Exception fetching notifications:', error);
    return [];
  }
}

/**
 * Gets the count of unread notifications for a user
 */
export async function getUnreadNotificationsCount(userId: string): Promise<number> {
  try {
    // Use the database function for better performance (if it exists)
    const { data, error } = await supabase.rpc('get_unread_notifications_count', {
      p_user_id: userId,
    });

    if (error) {
      // If RPC function doesn't exist (code 42883 or P0001), silently fallback
      // Also suppress network errors - they're expected when offline
      const isRpcNotFound = error.code === '42883' || error.code === 'P0001' || error.message?.includes('does not exist');
      const isNetworkError = error.message?.includes('Network request failed') || 
                            error.message?.includes('Failed to fetch') ||
                            error.message?.includes('network') ||
                            error.message?.includes('NetworkError') ||
                            error.name === 'TypeError';
      const isAbortError = error.name === 'AbortError' || error.message?.includes('Aborted');
      
      // Only log if it's a different error (not RPC not found, network, or abort)
      if (!isRpcNotFound && !isNetworkError && !isAbortError) {
        console.warn('Error fetching unread count via RPC:', error.message);
      }
      
      // Fallback to direct query (skip if network or abort to avoid double failure)
      if (!isNetworkError && !isAbortError) {
        try {
          const { count, error: countError } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'unread');

          if (countError) {
            // Only log if it's a real error, not just missing table or network error
            const isTableNotFound = countError.code === '42P01';
            const isCountNetworkError = countError.message?.includes('Network request failed') || 
                                      countError.message?.includes('Failed to fetch') ||
                                      countError.message?.includes('network');
            
            if (!isTableNotFound && !isCountNetworkError) {
              console.warn('Error with fallback unread count:', countError.message);
            }
            return 0;
          }

          return count || 0;
        } catch (fallbackError: any) {
          // Silently handle network errors in fallback
          if (!fallbackError.message?.includes('Network request failed') && 
              !fallbackError.message?.includes('Failed to fetch')) {
            console.warn('Exception in fallback unread count:', fallbackError.message);
          }
          return 0;
        }
      }
      
      // Return 0 for network errors - don't spam console
      return 0;
    }

    return data || 0;
  } catch (error: any) {
    // Silently handle errors - don't spam console
    // The function should gracefully return 0 if anything fails
    return 0;
  }
}

/**
 * Marks a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<{ success: boolean; error?: any }> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Use the database function
    const { error } = await supabase.rpc('mark_notification_as_read', {
      p_notification_id: notificationId,
      p_user_id: user.id,
    });

    if (error) {
      console.error('Error marking notification as read:', error);
      // Fallback to direct update
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', user.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception marking notification as read:', error);
    return { success: false, error: error.message || 'Failed to mark notification as read' };
  }
}

/**
 * Marks all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<{ success: boolean; error?: any }> {
  try {
    // Use the database function
    const { data, error } = await supabase.rpc('mark_all_notifications_as_read', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error marking all notifications as read:', error);
      // Fallback to direct update
      const { error: updateError } = await supabase
        .from('notifications')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'unread');

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception marking all notifications as read:', error);
    return { success: false, error: error.message || 'Failed to mark all notifications as read' };
  }
}

/**
 * Deletes a notification
 */
export async function deleteNotification(notificationId: string): Promise<{ success: boolean; error?: any }> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting notification:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception deleting notification:', error);
    return { success: false, error: error.message || 'Failed to delete notification' };
  }
}

/**
 * Creates a new notification (for use by backend/triggers)
 */
export async function createNotification(
  userId: string,
  type: Notification['type'],
  title: string,
  message: string,
  data?: any
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  try {
    // Use the database function
    const { data: notificationId, error } = await supabase.rpc('create_notification', {
      p_user_id: userId,
      p_type: type,
      p_title: title,
      p_message: message,
      p_data: data || null,
    });

    if (error) {
      console.error('Error creating notification:', error);
      // Fallback to direct insert
      const { data: insertedData, error: insertError } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type,
          title,
          message,
          data: data || null,
          status: 'unread',
        })
        .select('id')
        .single();

      if (insertError) {
        return { success: false, error: insertError.message };
      }

      return { success: true, notificationId: insertedData.id };
    }

    return { success: true, notificationId: notificationId || undefined };
  } catch (error: any) {
    console.error('Exception creating notification:', error);
    return { success: false, error: error.message || 'Failed to create notification' };
  }
}

/**
 * Formats a timestamp to relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(timestamp: string): string {
  try {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    }

    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) {
      return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    }

    const diffInWeeks = Math.floor(diffInDays / 7);
    if (diffInWeeks < 4) {
      return `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
    }

    const diffInYears = Math.floor(diffInDays / 365);
    return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return 'Recently';
  }
}

/**
 * Gets the appropriate icon and color for a notification type
 */
export function getNotificationIcon(
  type: Notification['type']
): { icon: string; color: string } {
  switch (type) {
    case 'transaction':
      return { icon: 'swap-horiz', color: '#6B46C1' };
    case 'payment':
      return { icon: 'payment', color: '#10B981' };
    case 'withdrawal':
      return { icon: 'arrow-upward', color: '#F59E0B' };
    case 'deposit':
      return { icon: 'arrow-downward', color: '#3B82F6' };
    case 'system':
      return { icon: 'settings', color: '#6B7280' };
    case 'promotion':
      return { icon: 'local-offer', color: '#EC4899' };
    case 'security':
      return { icon: 'security', color: '#EF4444' };
    case 'referral':
      return { icon: 'card-giftcard', color: '#8B5CF6' };
    case 'gift-card':
      return { icon: 'card-giftcard', color: '#EC4899' };
    default:
      return { icon: 'notifications', color: '#6B46C1' };
  }
}

