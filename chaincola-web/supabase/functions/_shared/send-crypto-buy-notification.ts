// Shared helper function to send push notifications for cryptocurrency buy transactions

import { NOTIFICATION_ICON } from "./notification-config.ts";

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

interface SendCryptoBuyNotificationParams {
  supabase: any;
  userId: string;
  cryptoCurrency: string;
  cryptoAmount: number;
  ngnAmount: number;
  transactionHash?: string;
  buyId?: string;
  status?: 'PENDING' | 'COMPLETED' | 'FAILED';
}

/**
 * Sends a push notification for a cryptocurrency buy transaction
 */
export async function sendCryptoBuyNotification({
  supabase,
  userId,
  cryptoCurrency,
  cryptoAmount,
  ngnAmount,
  transactionHash,
  buyId,
  status = 'COMPLETED',
}: SendCryptoBuyNotificationParams): Promise<void> {
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

    // Format NGN amount
    const formatNGN = (amount: number): string => {
      return `₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    // Determine status message and title
    let statusMessage = '';
    let title = '';
    
    if (status === 'COMPLETED') {
      title = `✅ ${cryptoCurrency} Purchased Successfully`;
      statusMessage = 'Your buy order has been completed';
    } else if (status === 'PENDING') {
      title = `⏳ ${cryptoCurrency} Buy Pending`;
      statusMessage = 'Your buy order is being processed';
    } else if (status === 'FAILED') {
      title = `❌ ${cryptoCurrency} Buy Failed`;
      statusMessage = 'Your buy order failed';
    } else {
      title = `💰 ${cryptoCurrency} Buy Initiated`;
      statusMessage = 'Buy order placed';
    }

    // Create notification body
    const body = `Purchased ${formatAmount(cryptoAmount, cryptoCurrency)} for ${formatNGN(ngnAmount)}. ${statusMessage}`;

    // Prepare push notification messages
    const messages = tokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: {
        type: 'crypto_buy',
        cryptoCurrency: cryptoCurrency,
        cryptoAmount: cryptoAmount,
        ngnAmount: ngnAmount,
        transactionHash: transactionHash,
        buyId: buyId,
        status: status,
      },
      priority: 'high' as const,
      icon: NOTIFICATION_ICON,
    }));

    // Send push notifications via Expo API
    console.log(`📤 Sending ${messages.length} push notification(s) for ${cryptoCurrency} buy to user ${userId}`);

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
    console.error('❌ Exception sending crypto buy notification:', error);
  }
}
