// Shared helper function to send push notifications and emails for cryptocurrency deposits
// This can be imported and used by all deposit detection functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { NOTIFICATION_ICON } from "./notification-config.ts";
import { sendCryptoDepositEmail } from "./send-crypto-email.ts";

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

interface SendNotificationParams {
  supabase: any;
  userId: string;
  cryptoCurrency: string;
  amount: number;
  transactionHash: string;
  confirmations?: number;
  status?: 'PENDING' | 'CONFIRMING' | 'CONFIRMED';
}

/**
 * Sends a push notification for an incoming cryptocurrency deposit
 */
export async function sendCryptoDepositNotification({
  supabase,
  userId,
  cryptoCurrency,
  amount,
  transactionHash,
  confirmations = 0,
  status = 'PENDING',
}: SendNotificationParams): Promise<void> {
  try {
    // Idempotency guard: skip sending if we've already sent this notification status for the transaction
    try {
      if (transactionHash) {
        // Solana transaction hashes are case-sensitive (base58), don't lowercase them
        // Ethereum/Bitcoin hashes can be lowercased for consistency
        const isSolanaTx = cryptoCurrency === 'SOL';
        const hashForQuery = isSolanaTx ? transactionHash : transactionHash.toLowerCase();
        
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id, metadata, status, user_id, crypto_currency')
          .eq('transaction_hash', hashForQuery)
          .eq('user_id', userId)
          .maybeSingle();

        if (existingTx) {
          const notified = existingTx?.metadata?.notifiedStatuses || [];
          if (Array.isArray(notified) && notified.includes(status)) {
            console.log(`⏭️ Notification for transaction ${transactionHash} (user: ${userId}) with status ${status} already sent. Skipping.`);
            return;
          }
          
          // Extra check: if transaction status is CONFIRMED and we're trying to send CONFIRMED notification
          // and the transaction was created more than 5 minutes ago, skip (likely duplicate run)
          // Also check if we've already notified for this status
          if (status === 'CONFIRMED' && existingTx.status === 'CONFIRMED') {
            const txCreatedAt = new Date(existingTx.metadata?.credited_at || existingTx.metadata?.created_at || existingTx.metadata?.detected_at || 0);
            const now = new Date();
            const minutesSinceCreated = (now.getTime() - txCreatedAt.getTime()) / (1000 * 60);
            
            // Check if we've already notified for CONFIRMED status
            const notifiedStatuses = existingTx.metadata?.notifiedStatuses || [];
            if (Array.isArray(notifiedStatuses) && notifiedStatuses.includes('CONFIRMED')) {
              console.log(`⏭️ Transaction ${transactionHash} already notified for CONFIRMED status. Skipping duplicate notification.`);
              return;
            }
            
            // Also skip if transaction is older than 5 minutes (likely duplicate detection run)
            if (minutesSinceCreated > 5) {
              console.log(`⏭️ Transaction ${transactionHash} already CONFIRMED ${minutesSinceCreated.toFixed(1)} minutes ago. Skipping duplicate notification.`);
              return;
            }
          }
          
          // MARK AS NOTIFIED IMMEDIATELY - before sending (prevent race conditions)
          const metadata = existingTx.metadata || {};
          const notifiedStatuses = Array.isArray(metadata.notifiedStatuses) ? metadata.notifiedStatuses : [];
          if (!notifiedStatuses.includes(status)) {
            notifiedStatuses.push(status);
            const updatedMeta = {
              ...metadata,
              notifiedStatuses,
              pre_notified_at: new Date().toISOString(), // Mark before sending
            };
            await supabase
              .from('transactions')
              .update({ metadata: updatedMeta })
              .eq('id', existingTx.id);
            console.log(`✅ Pre-marked transaction ${transactionHash} as notified for status: ${status}`);
          }
        }
      }
    } catch (idempErr) {
      // If idempotency check fails for some reason, log and continue to attempt sending (don't block notifications)
      console.warn('⚠️ Idempotency check failed:', idempErr);
    }
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
      } else if (currency === 'SOL') {
        return `${amt.toFixed(6)} SOL`;
      } else if (currency === 'USDT' || currency === 'USDC') {
        return `${amt.toFixed(2)} ${currency}`;
      } else if (currency === 'TRX') {
        return `${amt.toFixed(2)} TRX`;
      } else if (currency === 'XRP') {
        return `${amt.toFixed(2)} XRP`;
      }
      return `${amt} ${currency}`;
    };

    // Determine status message
    let statusMessage = '';
    if (status === 'CONFIRMED') {
      statusMessage = 'Confirmed';
    } else if (status === 'CONFIRMING') {
      statusMessage = `Confirming (${confirmations} confirmations)`;
    } else {
      statusMessage = 'Pending confirmation';
    }

    // Create notification title and body
    // Standard deposit notification
    const title = `💰 ${cryptoCurrency} Deposit Received`;
    const body = `You received ${formatAmount(amount, cryptoCurrency)}. ${statusMessage}`;

    // Prepare push notification messages
    const messages = tokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: title,
      body: body,
      data: {
        type: 'crypto_deposit',
        cryptoCurrency: cryptoCurrency,
        amount: amount,
        transactionHash: transactionHash,
        confirmations: confirmations,
        status: status,
      },
      priority: 'high' as const,
      icon: NOTIFICATION_ICON,
    }));

    // Send push notifications via Expo API
    console.log(`📤 Sending ${messages.length} push notification(s) for ${cryptoCurrency} deposit to user ${userId}`);

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
        
        // Update last_notified_at timestamp (we already marked it in pre_notified_at before sending)
        try {
          if (transactionHash) {
            const { data: existingTx } = await supabase
              .from('transactions')
              .select('id, metadata')
              .eq('transaction_hash', transactionHash.toLowerCase())
              .maybeSingle();

            if (existingTx) {
              const metadata = existingTx.metadata || {};
              const updatedMeta = {
                ...metadata,
                last_notified_at: new Date().toISOString(),
              };
              await supabase
                .from('transactions')
                .update({ metadata: updatedMeta })
                .eq('id', existingTx.id);
              console.log(`✅ Updated last_notified_at for transaction ${transactionHash}`);
            }
          }
        } catch (metaErr) {
          console.warn('⚠️ Failed to update last_notified_at timestamp:', metaErr);
        }
      } else if (errors.length === 0) {
        console.log('✅ Push notifications sent successfully');
      }
    } catch (fetchError: any) {
      console.error('❌ Network error sending push notifications:', fetchError.message);
    }

    // Send email notification when deposit is CONFIRMED
    if (status === 'CONFIRMED') {
      try {
        // Check email notification preferences
        const { data: emailPreferences } = await supabase
          .from('user_notification_preferences')
          .select('email_notifications_enabled')
          .eq('user_id', userId)
          .maybeSingle();

        // If preferences exist and email is disabled, skip
        if (emailPreferences && emailPreferences.email_notifications_enabled === false) {
          console.log(`⏭️ Email notifications disabled for user ${userId}`);
        } else {
          // Get user email and name
          const { data: userProfile } = await supabase
            .from('user_profiles')
            .select('email, full_name')
            .eq('user_id', userId)
            .maybeSingle();

          // If no profile, try to get email from auth.users
          let userEmail = userProfile?.email;
          let userName = userProfile?.full_name || 'User';

          if (!userEmail) {
            try {
              const { data: authUser } = await supabase.auth.admin.getUserById(userId);
              userEmail = authUser?.user?.email;
            } catch (authError) {
              console.warn('⚠️ Could not fetch user email from auth:', authError);
            }
          }

          if (userEmail) {
            // Get transaction details for email (wallet address, transaction date)
            // Solana transaction hashes are case-sensitive, don't lowercase them
            const isSolanaTx = cryptoCurrency === 'SOL';
            const hashForQuery = isSolanaTx ? transactionHash : transactionHash.toLowerCase();
            
            const { data: txData } = await supabase
              .from('transactions')
              .select('to_address, created_at')
              .eq('transaction_hash', hashForQuery)
              .eq('user_id', userId)
              .maybeSingle();

            const walletAddress = txData?.to_address || 'N/A';
            const transactionDate = txData?.created_at || new Date().toISOString();

            // Format amount for email
            const formatAmountForEmail = (amt: number, currency: string): string => {
              if (currency === 'BTC') {
                return `${amt.toFixed(8)}`;
              } else if (currency === 'ETH') {
                return `${amt.toFixed(6)}`;
              } else if (currency === 'USDT' || currency === 'USDC') {
                return `${amt.toFixed(2)}`;
              } else if (currency === 'SOL') {
                return `${amt.toFixed(6)}`;
              } else if (currency === 'TRX') {
                return `${amt.toFixed(2)}`;
              } else if (currency === 'XRP') {
                return `${amt.toFixed(2)}`;
              }
              return `${amt}`;
            };

            const cryptoAmountFormatted = formatAmountForEmail(amount, cryptoCurrency);

            // Send email notification
            console.log(`📧 Sending email notification for ${cryptoCurrency} deposit to ${userEmail}`);
            await sendCryptoDepositEmail(
              supabase,
              userId,
              userEmail,
              userName,
              {
                cryptoCurrency: cryptoCurrency,
                cryptoAmount: cryptoAmountFormatted,
                transactionHash: transactionHash,
                confirmations: confirmations,
                transactionDate: transactionDate,
                walletAddress: walletAddress,
              }
            );
            console.log(`✅ Email notification sent successfully to ${userEmail}`);
          } else {
            console.log(`⏭️ No email found for user ${userId}, skipping email notification`);
          }
        }
      } catch (emailError: any) {
        console.error('⚠️ Error sending email notification (non-critical):', emailError?.message || emailError);
        // Don't throw - email failure shouldn't fail the deposit processing
      }
    }
  } catch (error: any) {
    console.error('❌ Exception sending crypto deposit notification:', error);
    // Don't throw - we don't want notification failures to break deposit processing
  }
}

