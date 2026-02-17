// Notification Preferences Service
// Handles user notification preferences from the database
import { supabase } from './supabase';

export interface UserNotificationPreferences {
  user_id: string;
  push_notifications_enabled: boolean;
  email_notifications_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Fetches user notification preferences from the database
 * Falls back to user_profiles table if user_notification_preferences doesn't exist
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<UserNotificationPreferences | null> {
  try {
    // First, try to get from user_notification_preferences table
    const { data: preferences, error: prefError } = await supabase
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (!prefError && preferences) {
      return {
        user_id: preferences.user_id,
        push_notifications_enabled: preferences.push_notifications_enabled ?? true,
        email_notifications_enabled: preferences.email_notifications_enabled ?? true,
        created_at: preferences.created_at,
        updated_at: preferences.updated_at,
      };
    }

    // Fallback to user_profiles table
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('push_notifications, email_notifications')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching notification preferences:', profileError);
      return null;
    }

    if (profile) {
      return {
        user_id: userId,
        push_notifications_enabled: profile.push_notifications ?? true,
        email_notifications_enabled: profile.email_notifications ?? true,
      };
    }

    // Return default preferences if nothing found
    return {
      user_id: userId,
      push_notifications_enabled: true,
      email_notifications_enabled: true,
    };
  } catch (error: any) {
    console.error('Exception fetching notification preferences:', error);
    // Return default preferences on error
    return {
      user_id: userId,
      push_notifications_enabled: true,
      email_notifications_enabled: true,
    };
  }
}

/**
 * Updates user notification preferences
 * Tries user_notification_preferences table first, falls back to user_profiles
 */
export async function updateUserNotificationPreferences(
  userId: string,
  updates: {
    push_notifications_enabled?: boolean;
    email_notifications_enabled?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // First, try to update user_notification_preferences table
    const { error: prefError } = await supabase
      .from('user_notification_preferences')
      .upsert(
        {
          user_id: userId,
          push_notifications_enabled: updates.push_notifications_enabled,
          email_notifications_enabled: updates.email_notifications_enabled,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (!prefError) {
      return { success: true };
    }

    // If user_notification_preferences table doesn't exist, fall back to user_profiles
    const updateData: any = {};
    if (updates.push_notifications_enabled !== undefined) {
      updateData.push_notifications = updates.push_notifications_enabled;
    }
    if (updates.email_notifications_enabled !== undefined) {
      updateData.email_notifications = updates.email_notifications_enabled;
    }

    if (Object.keys(updateData).length === 0) {
      return { success: true };
    }

    updateData.updated_at = new Date().toISOString();

    const { error: profileError } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('user_id', userId);

    if (profileError) {
      console.error('Error updating notification preferences:', profileError);
      return {
        success: false,
        error: profileError.message || 'Failed to update notification preferences',
      };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Exception updating notification preferences:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred',
    };
  }
}






