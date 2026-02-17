// Shared helper function to send push notifications for wallet funding
// This can be imported and used by all wallet funding functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { NOTIFICATION_ICON } from "./notification-config.ts";

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

interface SendWalletFundingNotificationParams {
  supabase: any;
  userId: string;
  amount: number;
  currency: string;
  feeAmount?: number;
  transactionId?: string;
}

/**
 * Sends a push notification for successful wallet funding
 */
export async function sendWalletFundingNotification({
  supabase,
  userId,
  amount,
  currency,
  feeAmount = 0,
  transactionId,
}: SendWalletFundingNotificationParams): Promise<void> {
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

    // Format amount based on currency
    const formatAmount = (amt: number, curr: string): string => {
      if (curr === 'NGN') {
        return `₦${amt.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`;
    };

    // Create notification title and body
    const title = `💰 Wallet Funded Successfully`;
    let body = `Your wallet has been credited with ${formatAmount(amount, currency)}`;
    
    if (feeAmount > 0) {
      body += ` (Fee: ${formatAmount(feeAmount, currency)})`;
    }

    // Prepare push notification messages
    const messages = tokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: {
        type: 'wallet_funding',
        amount: amount,
        currency: currency,
        fee_amount: feeAmount,
        transaction_id: transactionId,
      },
      priority: 'high' as const,
      icon: NOTIFICATION_ICON,
    }));

    // Send push notifications via Expo API
    console.log(`📤 Sending ${messages.length} push notification(s) for wallet funding to user ${userId}`);

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
    console.error('❌ Exception sending wallet funding notification:', error);
    // Don't throw - we don't want notification failures to break wallet funding processing
  }
}












