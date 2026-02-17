// Shared helper function to send push notifications for crypto price alerts
// This can be imported and used by the crypto price alert checking function

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { NOTIFICATION_ICON } from "./notification-config.ts";

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

interface SendCryptoPriceAlertNotificationParams {
  supabase: any;
  userId: string;
  cryptoSymbol: string;
  currentPrice: number;
  alertType: 'PERCENTAGE_MOVE' | 'TARGET_PRICE';
  percentageChange?: number;
  targetPrice?: number;
  direction?: 'ABOVE' | 'BELOW';
}

/**
 * Sends a push notification for crypto price alerts
 */
export async function sendCryptoPriceAlertNotification({
  supabase,
  userId,
  cryptoSymbol,
  currentPrice,
  alertType,
  percentageChange,
  targetPrice,
  direction,
}: SendCryptoPriceAlertNotificationParams): Promise<void> {
  try {
    // Check user notification preferences
    const { data: preferences } = await supabase
      .from('user_notification_preferences')
      .select('push_notifications_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    // If preferences exist and push is disabled, skip
    if (preferences && preferences.push_notifications_enabled === false) {
      console.log(`⏭️ Push notifications disabled for user ${userId}`);
      return;
    }

    // Get push tokens for user
    const { data: tokens, error: tokensError } = await supabase
      .from('push_notification_tokens')
      .select('token')
      .eq('user_id', userId);

    if (tokensError) {
      console.error('❌ Error fetching push tokens:', tokensError);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log(`⏭️ No push tokens found for user ${userId}`);
      return;
    }

    // Format price for display
    const formatPrice = (price: number): string => {
      return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Create notification title and body based on alert type
    let title: string;
    let body: string;

    if (alertType === 'PERCENTAGE_MOVE') {
      const changeSign = percentageChange && percentageChange > 0 ? '+' : '';
      const changeEmoji = percentageChange && percentageChange > 0 ? '📈' : '📉';
      title = `${changeEmoji} ${cryptoSymbol} Price Alert`;
      body = `${cryptoSymbol} just ${percentageChange && percentageChange > 0 ? 'rose' : 'dropped'} ${changeSign}${percentageChange?.toFixed(2)}% to ${formatPrice(currentPrice)}`;
    } else {
      // TARGET_PRICE alert
      const directionText = direction === 'ABOVE' ? 'reached' : 'dropped below';
      title = `🎯 ${cryptoSymbol} Target Price Alert`;
      body = `${cryptoSymbol} just ${directionText} ${formatPrice(currentPrice)}`;
      if (targetPrice) {
        body += ` (Target: ${formatPrice(targetPrice)})`;
      }
    }

    // Prepare push notification messages
    const messages = tokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: {
        type: 'crypto_price_alert',
        crypto_symbol: cryptoSymbol,
        current_price: currentPrice,
        alert_type: alertType,
        percentage_change: percentageChange,
        target_price: targetPrice,
        direction: direction,
      },
      priority: 'high' as const,
      icon: NOTIFICATION_ICON,
    }));

    // Send push notifications via Expo API
    console.log(`📤 Sending ${messages.length} push notification(s) for ${cryptoSymbol} price alert to user ${userId}`);

    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Expo Push API error:', response.status, errorText);
        return;
      }

      const result = await response.json();
      
      if (!result || !result.data) {
        console.error('❌ Invalid response from Expo Push API:', result);
        return;
      }

      const errors = result.data.filter((item: any) => item.status === 'error') || [];
      const success = result.data.filter((item: any) => item.status === 'ok') || [];
      
      if (errors.length > 0) {
        console.warn(`⚠️ ${errors.length} push notification(s) failed:`, errors);
        errors.forEach((err: any) => {
          console.warn(`   - Token: ${err.expoPushToken?.substring(0, 20)}... Error: ${err.message || 'Unknown error'}`);
        });
      }
      
      if (success.length > 0) {
        console.log(`✅ ${success.length} push notification(s) sent successfully`);
      } else if (errors.length === 0) {
        console.log('✅ Push notifications sent successfully');
      }
    } catch (fetchError: any) {
      console.error('❌ Network error sending push notifications:', fetchError.message);
    }
  } catch (error: any) {
    console.error('❌ Exception sending crypto price alert notification:', error);
    // Don't throw - we don't want notification failures to break price checking
  }
}
