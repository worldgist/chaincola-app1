// Shared helper function to send push notifications for cryptocurrency sends
// This can be imported and used by all crypto send functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { NOTIFICATION_ICON } from "./notification-config.ts";

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

interface SendCryptoSendNotificationParams {
  supabase: any;
  userId: string;
  cryptoCurrency: string;
  amount: number;
  transactionHash: string;
  toAddress: string;
  confirmations?: number;
  status?: 'PENDING' | 'CONFIRMING' | 'CONFIRMED' | 'FAILED';
}

/**
 * Sends a push notification for a cryptocurrency send transaction
 */
export async function sendCryptoSendNotification({
  supabase,
  userId,
  cryptoCurrency,
  amount,
  transactionHash,
  toAddress,
  confirmations = 0,
  status = 'PENDING',
}: SendCryptoSendNotificationParams): Promise<void> {
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
    const formatAmount = (amt: number, currency: string): string => {
      if (currency === 'BTC') {
        return `${amt.toFixed(8)} BTC`;
      } else if (currency === 'ETH') {
        return `${amt.toFixed(6)} ETH`;
      } else if (currency === 'USDT' || currency === 'USDC') {
        return `${amt.toFixed(2)} ${currency}`;
      } else if (currency === 'TRX') {
        return `${amt.toFixed(2)} TRX`;
      } else if (currency === 'XRP') {
        return `${amt.toFixed(2)} XRP`;
      } else if (currency === 'SOL') {
        return `${amt.toFixed(4)} SOL`;
      }
      return `${amt} ${currency}`;
    };

    // Format address for display (first 6 + last 4 characters)
    const formatAddress = (address: string): string => {
      if (address.length <= 10) return address;
      return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    };

    // Determine status message and title
    let statusMessage = '';
    let title = '';
    
    if (status === 'CONFIRMED') {
      title = `✅ ${cryptoCurrency} Sent Successfully`;
      statusMessage = 'Transaction confirmed';
    } else if (status === 'CONFIRMING') {
      title = `⏳ ${cryptoCurrency} Sending`;
      statusMessage = `Confirming (${confirmations} confirmations)`;
    } else if (status === 'FAILED') {
      title = `❌ ${cryptoCurrency} Send Failed`;
      statusMessage = 'Transaction failed';
    } else {
      title = `📤 ${cryptoCurrency} Send Initiated`;
      statusMessage = 'Pending confirmation';
    }

    // Create notification body
    const body = `${formatAmount(amount, cryptoCurrency)} sent to ${formatAddress(toAddress)}. ${statusMessage}`;

    // Prepare push notification messages
    const messages = tokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: {
        type: 'crypto_send',
        cryptoCurrency: cryptoCurrency,
        amount: amount,
        transactionHash: transactionHash,
        toAddress: toAddress,
        confirmations: confirmations,
        status: status,
      },
      priority: 'high' as const,
      icon: NOTIFICATION_ICON,
    }));

    // Send push notifications via Expo API
    console.log(`📤 Sending ${messages.length} push notification(s) for ${cryptoCurrency} send to user ${userId}`);

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
    console.error('❌ Exception sending crypto send notification:', error);
    // Don't throw - we don't want notification failures to break send processing
  }
}









