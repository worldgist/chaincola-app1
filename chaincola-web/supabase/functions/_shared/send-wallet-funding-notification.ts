// Shared helper: mobile push via Expo after successful wallet funding (email receipts use Resend through send-email).

import { CHAINCOLA_LOGO_URL, NOTIFICATION_ICON } from "./notification-config.ts";

const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";
/** Android notification accent (matches other ChainCola pushes) */
const ANDROID_NOTIFICATION_COLOR = "#6B46C1";

interface SendWalletFundingNotificationParams {
  supabase: any;
  userId: string;
  /** Net amount credited to the user's wallet */
  amount: number;
  currency: string;
  feeAmount?: number;
  /** Gross deposit before fee — improves copy when a fee was deducted */
  depositAmount?: number;
  transactionId?: string;
}

/**
 * Sends a push notification after a successful wallet funding payment.
 * `amount` must be the net credited balance (not the pre-fee deposit).
 */
export async function sendWalletFundingNotification({
  supabase,
  userId,
  amount,
  currency,
  feeAmount = 0,
  depositAmount,
  transactionId,
}: SendWalletFundingNotificationParams): Promise<void> {
  try {
    const { data: preferences } = await supabase
      .from("user_notification_preferences")
      .select("push_notifications_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    if (preferences && preferences.push_notifications_enabled === false) {
      console.log(`⏭️ Push notifications disabled for user ${userId}`);
      return;
    }

    const { data: tokens, error: tokensError } = await supabase
      .from("push_notification_tokens")
      .select("token, platform")
      .eq("user_id", userId);

    if (tokensError) {
      console.error("❌ Error fetching push tokens:", tokensError);
      return;
    }

    if (!tokens || tokens.length === 0) {
      console.log(`⏭️ No push tokens found for user ${userId}`);
      return;
    }

    const formatAmount = (amt: number, curr: string): string => {
      if (curr === "NGN") {
        return `₦${amt.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `${amt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`;
    };

    const creditStr = formatAmount(amount, currency);
    const title = "Payment successful";

    let body: string;
    if (feeAmount > 0) {
      const feeStr = formatAmount(feeAmount, currency);
      if (depositAmount != null && depositAmount > amount + 0.0001) {
        const paidStr = formatAmount(depositAmount, currency);
        body = `${creditStr} was added to your wallet. Your ${paidStr} payment included a ${feeStr} fee.`;
      } else {
        body = `${creditStr} was added to your wallet after a ${feeStr} processing fee.`;
      }
    } else {
      body = `${creditStr} was added to your ChainCola wallet.`;
    }

    const messages = tokens.map(({ token, platform }: { token: string; platform?: string | null }) => {
      const msg: Record<string, unknown> = {
        to: token,
        sound: "default",
        title,
        body,
        data: {
          type: "wallet_funding",
          amount,
          currency,
          fee_amount: feeAmount,
          deposit_amount: depositAmount ?? null,
          transaction_id: transactionId,
        },
        priority: "high",
        icon: NOTIFICATION_ICON,
      };
      if (CHAINCOLA_LOGO_URL) {
        msg.image = CHAINCOLA_LOGO_URL;
      }
      if (platform === "android") {
        msg.color = ANDROID_NOTIFICATION_COLOR;
      }
      return msg;
    });

    console.log(`📤 Sending ${messages.length} wallet funding push(es) to user ${userId}`);

    const response = await fetch(EXPO_PUSH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Expo Push API error:", response.status, errorText);
      return;
    }

    const result = await response.json();

    if (!result || !result.data) {
      console.error("❌ Invalid response from Expo Push API:", result);
      return;
    }

    const errors = result.data.filter((item: { status?: string }) => item.status === "error") || [];
    const success = result.data.filter((item: { status?: string }) => item.status === "ok") || [];

    if (errors.length > 0) {
      console.warn(`⚠️ ${errors.length} push(es) failed:`, errors);
    }
    if (success.length > 0) {
      console.log(`✅ ${success.length} wallet funding push(es) delivered`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Exception sending wallet funding notification:", message);
  }
}
