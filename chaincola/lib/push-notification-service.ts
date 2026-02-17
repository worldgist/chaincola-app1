// Push Notification Service
// Handles push notification registration and token management

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getUserNotificationPreferences } from './notification-preferences-service';

// Configure notification handler (use modern fields: shouldShowBanner & shouldShowList)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register for push notifications and save token to database
 */
export async function registerForPushNotificationsAsync(
  userId: string
): Promise<string | null> {
  try {
    // Check if device is physical (not simulator)
    if (!Device.isDevice) {
      console.warn('⚠️ Push notifications are not supported on simulators');
      return null;
    }

    // Check user notification preferences (but don't block registration if preferences don't exist)
    // We'll check preferences when sending, not when registering
    const preferences = await getUserNotificationPreferences(userId);
    if (preferences && preferences.push_notifications_enabled === false) {
      console.log('📱 Push notifications disabled by user - skipping registration');
      return null;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('⚠️ Permission for push notifications was denied');
      return null;
    }

    // Get projectId - try multiple sources
    // Priority: Constants.expoConfig.extra.eas.projectId > Constants.expoConfig.projectId > env var
    let projectId: string | undefined;
    
    // Try app.config.js extra.eas.projectId first (most reliable)
    if (Constants.expoConfig?.extra?.eas?.projectId) {
      projectId = Constants.expoConfig.extra.eas.projectId as string;
      console.log('✅ Found projectId from app.config.js:', projectId);
    } 
    // Try Constants.expoConfig.projectId (for Expo Go) - use any to avoid strict ExpoConfig typing
    else if ((Constants as any).expoConfig?.projectId) {
      projectId = (Constants as any).expoConfig.projectId as string;
      console.log('✅ Found projectId from Constants:', projectId);
    } 
    // Try environment variable
    else if (process.env.EXPO_PUBLIC_PROJECT_ID) {
      projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
      console.log('✅ Found projectId from env var:', projectId);
    }
    
    // If still no projectId, warn but continue (might work in development builds)
    if (!projectId) {
      console.warn('⚠️ No projectId found. Push notifications may not work.');
      console.warn('💡 Set projectId in app.config.js extra.eas.projectId');
      console.warn('💡 Or set EXPO_PUBLIC_PROJECT_ID in .env file');
      // Don't return null here - let it try to get token anyway (might work in dev builds)
    }

    // Get Expo push token
    // In Expo Go without projectId, this will fail, so we catch and handle gracefully
    let tokenData;
    try {
      tokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
    } catch (error: any) {
      // If it's a projectId error and we're in Expo Go, provide helpful message
      if (error.message?.includes('projectId') || error.message?.includes('No "projectId"')) {
        console.warn('⚠️ Push notifications require a projectId in Expo Go');
        console.warn('💡 To fix: Create an Expo project at https://expo.dev and set EXPO_PUBLIC_PROJECT_ID');
        console.warn('💡 Or use a development build instead of Expo Go for full push notification support');
        return null;
      }
      throw error; // Re-throw if it's a different error
    }

    const pushToken = tokenData.data;

    if (!pushToken) {
      console.error('❌ Failed to get push token');
      return null;
    }

    console.log('📱 Push token obtained:', pushToken);

    // Save token to database
    console.log('💾 Saving push token to database...');
    const { error, data } = await supabase
      .from('push_notification_tokens')
      .upsert(
        {
          user_id: userId,
          token: pushToken,
          platform: Platform.OS,
          device_id: Device.modelName || 'unknown',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,platform',
        }
      )
      .select();

    if (error) {
      console.error('❌ Error saving push token:', error);
      // Don't fail if table doesn't exist yet - it will be created by migration
      if (error.code === '42P01') {
        console.warn('⚠️ push_notification_tokens table does not exist. Run migration: supabase db push');
        return null;
      }
      // For other errors, still return the token (it might work even if DB save fails)
      console.warn('⚠️ Could not save token to database, but token is valid:', pushToken);
      return pushToken;
    }

    if (data && data.length > 0) {
      console.log('✅ Push token saved to database:', data[0].id);
    } else {
      console.log('✅ Push token registered (upsert completed)');
    }
    
    return pushToken;
  } catch (error: any) {
    console.error('❌ Exception registering for push notifications:', error);
    return null;
  }
}

/**
 * Unregister push notifications (remove token from database)
 */
export async function unregisterPushNotifications(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('push_notification_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Error removing push token:', error);
    } else {
      console.log('✅ Push token unregistered');
    }
  } catch (error: any) {
    console.error('❌ Exception unregistering push notifications:', error);
  }
}

/**
 * Setup notification listeners
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
) {
  // Listener for notifications received while app is foregrounded
  const receivedListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('📬 Notification received:', notification);
      onNotificationReceived?.(notification);
    }
  );

  // Listener for when user taps on a notification
  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('👆 Notification tapped:', response);
      onNotificationTapped?.(response);
    }
  );

  // Return cleanup function
  return () => {
    receivedListener.remove();
    responseListener.remove();
  };
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch (error) {
    console.error('Error getting badge count:', error);
    return 0;
  }
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error('Error setting badge count:', error);
  }
}

