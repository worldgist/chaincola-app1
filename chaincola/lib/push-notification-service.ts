// Push Notification Service
// Handles push notification registration and token management
//
// This must be safe to import in environments without the native notifications module
// (web, and some Expo Go/device combinations). We therefore lazy-load expo-notifications
// and only touch it when available.

import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getUserNotificationPreferences } from './notification-preferences-service';

let handlerConfigured = false;

async function getNotifications() {
  if (Platform.OS === 'web') return null;
  // Never import `expo-notifications` in Expo Go: it loads native push code that is not
  // available there and can crash (PushNotificationIOS / NativeEventEmitter).
  // `isRunningInExpoGo()` uses the native ExpoGo module — more reliable than Constants alone.
  if (isRunningInExpoGo()) return null;
  try {
    const mod = await import('expo-notifications');
    const Notifications = mod as typeof import('expo-notifications');
    if (!handlerConfigured) {
      handlerConfigured = true;
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    }
    return Notifications;
  } catch {
    return null;
  }
}

/**
 * Register for push notifications and save token to database
 */
export async function registerForPushNotificationsAsync(
  userId: string
): Promise<string | null> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) {
      console.warn('⚠️ Notifications module not available in this environment');
      return null;
    }

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
    let data: any[] | null = null;
    try {
      const result = await supabase
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

      if (result.error) {
        const err: any = result.error;
        const code = err?.code as string | undefined;
        const message = err?.message || String(err);

        // Common causes in local/dev setups:
        // - missing table (42P01)
        // - missing unique constraint for onConflict (42P10)
        // - RLS blocks client inserts/updates (42501 / "row-level security")
        if (code === '42P01') {
          console.warn(
            '⚠️ push_notification_tokens table does not exist; skipping DB save (token still valid).'
          );
          return pushToken;
        }
        if (code === '42P10' || message.toLowerCase().includes('no unique or exclusion constraint')) {
          console.warn(
            '⚠️ push_notification_tokens missing unique constraint for (user_id, platform); skipping DB save (token still valid).'
          );
          return pushToken;
        }
        if (
          code === '42501' ||
          message.toLowerCase().includes('row-level security') ||
          message.toLowerCase().includes('rls')
        ) {
          console.warn('⚠️ RLS blocked saving push token; skipping DB save (token still valid).');
          return pushToken;
        }

        console.error('❌ Error saving push token:', { code, message });
        return pushToken;
      }

      data = (result.data as any[]) ?? null;
    } catch (e: any) {
      const message = e?.message || String(e);
      console.warn('⚠️ Exception saving push token (skipping DB save, token still valid):', message);
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
  onNotificationReceived?: (notification: any) => void,
  onNotificationTapped?: (response: any) => void
) {
  let receivedListener: any = null;
  let responseListener: any = null;

  void (async () => {
    const Notifications = await getNotifications();
    if (!Notifications) return;

    // Listener for notifications received while app is foregrounded
    receivedListener = Notifications.addNotificationReceivedListener((notification) => {
      console.log('📬 Notification received:', notification);
      onNotificationReceived?.(notification);
    });

    // Listener for when user taps on a notification
    responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 Notification tapped:', response);
      onNotificationTapped?.(response);
    });
  })();

  // Return cleanup function
  return () => {
    receivedListener?.remove?.();
    responseListener?.remove?.();
  };
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return 0;
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
    const Notifications = await getNotifications();
    if (!Notifications) return;
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error('Error setting badge count:', error);
  }
}

