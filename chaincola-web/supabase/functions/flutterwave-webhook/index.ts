// Flutterwave Webhook Handler
// Automatically processes payment callbacks from Flutterwave

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditUserWallet } from "../_shared/credit-user-wallet.ts";
import { sendFlutterwaveWalletFundingReceiptEmail } from "../_shared/send-crypto-email.ts";
import { sendWalletFundingNotification } from "../_shared/send-wallet-funding-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FlutterwaveWebhookPayload {
  event: string;
  data: {
    id: number;
    tx_ref: string;
    flw_ref: string;
    device_fingerprint: string;
    amount: number;
    currency: string;
    charged_amount: number;
    app_fee: number;
    merchant_fee: number;
    processor_response: string;
    auth_model: string;
    card: any;
    created_at: string;
    status: string;
    payment_type: string;
    customer: {
      id: number;
      name: string;
      phone_number: string;
      email: string;
      created_at: string;
    };
    account_id: number;
    meta: any;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const rawBody = await req.text();
    const expectedHash = Deno.env.get('FLUTTERWAVE_SECRET_HASH');
    if (expectedHash) {
      const verifHash =
        req.headers.get('verif-hash') ?? req.headers.get('Verif-Hash') ?? '';
      if (verifHash !== expectedHash) {
        console.error('❌ Flutterwave webhook: verif-hash mismatch or missing');
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const payload: FlutterwaveWebhookPayload = JSON.parse(rawBody);
    
    console.log(`📨 Flutterwave webhook received: ${payload.event}`, {
      tx_ref: payload.data?.tx_ref,
      status: payload.data?.status,
    });

    // Only process charge.completed events
    if (payload.event !== 'charge.completed') {
      console.log(`⏭️ Skipping event: ${payload.event}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Event not processed',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const txRef = payload.data?.tx_ref;
    if (!txRef) {
      console.error('❌ Missing tx_ref in webhook payload');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing tx_ref',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Find transaction in database
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('external_reference', txRef)
      .single();

    if (txError || !transaction) {
      console.error('❌ Transaction not found:', txError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Transaction not found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const paymentStatus = payload.data?.status?.toUpperCase();
    const isSuccessful = paymentStatus === 'SUCCESSFUL' || paymentStatus === 'SUCCESS';

    if (isSuccessful) {
      const totalAmount = payload.data.amount || transaction.fiat_amount;
      const currency = String(
        payload.data.currency || transaction.fiat_currency || 'NGN',
      ).toUpperCase();
      const userId = transaction.user_id;

      const depositAmount = transaction.metadata?.deposit_amount || totalAmount;
      const feeAmount = transaction.metadata?.fee_amount || depositAmount * 0.03;
      const creditAmount = transaction.metadata?.credit_amount || depositAmount - feeAmount;

      const creditStuck =
        transaction.status === 'COMPLETED' &&
        !!(transaction.metadata?.credit_error ||
          (typeof transaction.error_message === 'string' &&
            transaction.error_message.toLowerCase().includes('wallet credit')));

      if (transaction.status === 'COMPLETED' && !creditStuck) {
        console.log(`✅ Transaction ${txRef} already completed`);
        return new Response(
          JSON.stringify({ success: true, message: 'Transaction already processed' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (transaction.status !== 'PENDING' && !creditStuck) {
        console.warn(`⚠️ Unexpected status ${transaction.status} for successful payment ${txRef}`);
        return new Response(
          JSON.stringify({ success: true, message: 'Transaction not pending; skipped' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      console.log(
        `✅ Processing successful payment: Charged: ${totalAmount} ${currency}, Deposit: ${depositAmount} ${currency}, Fee: ${feeAmount.toFixed(2)} ${currency}, Credit: ${creditAmount.toFixed(2)} ${currency} for user ${userId}${creditStuck ? ' (retry credit)' : ''}`,
      );

      console.log(
        `💰 Crediting wallet: ${creditAmount.toFixed(2)} ${currency} to user ${userId} (Fee: ${feeAmount.toFixed(2)} ${currency})`,
      );
      const creditResult = await creditUserWallet(supabase, userId, creditAmount, currency);

      if (!creditResult.ok) {
        console.error('❌ Wallet credit failed:', creditResult.message);
        await supabase
          .from('transactions')
          .update({
            error_message: `Payment received but wallet credit failed: ${creditResult.message}`,
            metadata: {
              ...transaction.metadata,
              credit_error: creditResult.message,
              webhook_credit_attempt_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', transaction.id);

        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to credit wallet: ${creditResult.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const prevMeta = transaction.metadata || {};
      const { credit_error: _dropCreditErr, ...metaWithoutCreditErr } = prevMeta as Record<string, unknown>;

      let depositFeeRecorded = prevMeta.deposit_fee_recorded === true;
      if (feeAmount > 0 && !depositFeeRecorded) {
        try {
          await supabase.rpc('record_admin_revenue', {
            p_revenue_type: 'DEPOSIT_FEE',
            p_source: 'FLUTTERWAVE',
            p_amount: feeAmount,
            p_currency: currency,
            p_fee_percentage: transaction.metadata?.fee_percentage || 3.0,
            p_base_amount: depositAmount,
            p_transaction_id: transaction.id,
            p_user_id: userId,
            p_metadata: {
              flutterwave_ref: payload.data.flw_ref,
              deposit_amount: depositAmount,
              credit_amount: creditAmount,
            },
            p_notes: `Deposit fee from Flutterwave payment`,
          });
          depositFeeRecorded = true;
          console.log(`✅ Recorded admin revenue: ${feeAmount.toFixed(2)} ${currency} from deposit fee`);
        } catch (revenueError) {
          console.error('⚠️ Error recording admin revenue (non-critical):', revenueError);
        }
      }

      const creditedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'COMPLETED',
          error_message: null,
          external_transaction_id: payload.data.flw_ref || payload.data.id?.toString(),
          completed_at: creditedAt,
          updated_at: creditedAt,
          metadata: {
            ...metaWithoutCreditErr,
            wallet_credited_at: creditedAt,
            deposit_fee_recorded: depositFeeRecorded,
            flutterwave_data: {
              flw_ref: payload.data.flw_ref,
              payment_type: payload.data.payment_type,
              processor_response: payload.data.processor_response,
              webhook_received_at: creditedAt,
            },
          },
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('❌ Error updating transaction after credit:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to update transaction' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      console.log(`✅ Successfully credited ${creditAmount} ${currency} to user ${userId}`);

      // Create notification for successful payment
      try {
        await supabase.rpc('create_notification', {
          p_user_id: userId,
          p_type: 'deposit',
          p_title: 'Payment successful',
          p_message: `Your wallet was credited with ${currency} ${creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${feeAmount > 0 ? ` (fee: ${feeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}.`,
          p_data: {
            transaction_id: transaction.id,
            amount: creditAmount,
            deposit_amount: depositAmount,
            fee_amount: feeAmount,
            total_payment: totalAmount,
            currency: currency,
            status: 'COMPLETED',
          },
        });
      } catch (notifError) {
        console.error('⚠️ Error creating notification:', notifError);
        // Don't fail the webhook if notification fails
      }

      // Send push notification for successful wallet funding
      try {
        await sendWalletFundingNotification({
          supabase,
          userId: userId,
          amount: creditAmount,
          currency: currency,
          feeAmount: feeAmount,
          depositAmount: depositAmount,
          transactionId: transaction.id,
        });
      } catch (pushError) {
        console.error('⚠️ Error sending push notification:', pushError);
        // Don't fail the webhook if push notification fails
      }

      // Receipt email via send-email → Resend (mobile push uses Expo, not Resend)
      try {
        await sendFlutterwaveWalletFundingReceiptEmail(supabase, userId, {
          creditAmount,
          depositAmount,
          feeAmount,
          currency,
          transactionId: transaction.id,
        });
      } catch (emailErr) {
        console.error('⚠️ Error sending wallet funding receipt email:', emailErr);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Payment processed successfully',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Payment failed or cancelled
      await supabase
        .from('transactions')
        .update({
          status: 'FAILED',
          error_message: `Payment ${paymentStatus?.toLowerCase() || 'failed'}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Payment status updated',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error: any) {
    console.error('❌ Exception in webhook handler:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to process webhook',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
