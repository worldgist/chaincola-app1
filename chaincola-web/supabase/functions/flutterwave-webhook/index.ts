// Flutterwave Webhook Handler
// Automatically processes payment callbacks from Flutterwave

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify webhook signature (optional but recommended)
    // For now, we'll process all webhooks - add signature verification if needed

    // Parse webhook payload
    const payload: FlutterwaveWebhookPayload = await req.json();
    
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

    // Check if already processed
    if (transaction.status === 'COMPLETED') {
      console.log(`✅ Transaction ${txRef} already completed`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Transaction already processed',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const paymentStatus = payload.data?.status?.toUpperCase();
    const isSuccessful = paymentStatus === 'SUCCESSFUL' || paymentStatus === 'SUCCESS';

    if (isSuccessful) {
      const totalAmount = payload.data.amount || transaction.fiat_amount;
      const currency = payload.data.currency || transaction.fiat_currency || 'NGN';
      const userId = transaction.user_id;
      
      // NEW FEE MODEL: Fee is deducted from deposit amount
      // Get credit amount from metadata (deposit - fee)
      // If metadata not available, calculate from deposit and fee (backward compatibility)
      const depositAmount = transaction.metadata?.deposit_amount || totalAmount;
      const feeAmount = transaction.metadata?.fee_amount || (depositAmount * 0.03);
      const creditAmount = transaction.metadata?.credit_amount || (depositAmount - feeAmount);

      console.log(`✅ Processing successful payment: Charged: ${totalAmount} ${currency}, Deposit: ${depositAmount} ${currency}, Fee: ${feeAmount.toFixed(2)} ${currency}, Credit: ${creditAmount.toFixed(2)} ${currency} for user ${userId}`);

      // Update transaction status to COMPLETED
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'COMPLETED',
          external_transaction_id: payload.data.flw_ref || payload.data.id?.toString(),
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...transaction.metadata,
            flutterwave_data: {
              flw_ref: payload.data.flw_ref,
              payment_type: payload.data.payment_type,
              processor_response: payload.data.processor_response,
              webhook_received_at: new Date().toISOString(),
            },
          },
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('❌ Error updating transaction:', updateError);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to update transaction',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Credit user's wallet balance (deposit - fee)
      console.log(`💰 Crediting wallet: ${creditAmount.toFixed(2)} ${currency} to user ${userId} (Fee deducted: ${feeAmount.toFixed(2)} ${currency})`);
      const { error: creditError } = await supabase.rpc('credit_wallet', {
        p_user_id: userId,
        p_amount: creditAmount, // Credit deposit amount minus fee
        p_currency: currency,
      });

      // Record admin revenue from deposit fee (only if fee was charged)
      if (feeAmount > 0 && !creditError) {
        try {
          await supabase.rpc('record_admin_revenue', {
            p_revenue_type: 'DEPOSIT_FEE',
            p_source: 'FLUTTERWAVE',
            p_amount: feeAmount,
            p_currency: currency,
            p_fee_percentage: transaction.metadata?.fee_percentage || 3.00,
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
          console.log(`✅ Recorded admin revenue: ${feeAmount.toFixed(2)} ${currency} from deposit fee`);
        } catch (revenueError) {
          console.error('⚠️ Error recording admin revenue (non-critical):', revenueError);
          // Don't fail the transaction if revenue recording fails
        }
      }

      if (creditError) {
        console.error('❌ Error crediting wallet:', creditError);
        
        // Update transaction with error but keep status as COMPLETED
        await supabase
          .from('transactions')
          .update({
            error_message: `Payment verified but wallet credit failed: ${creditError.message}`,
            metadata: {
              ...transaction.metadata,
              credit_error: creditError.message,
            },
          })
          .eq('id', transaction.id);

        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to credit wallet: ${creditError.message}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.log(`✅ Successfully credited ${depositAmount} ${currency} to user ${userId}`);

      // Create notification for successful payment
      try {
        await supabase.rpc('create_notification', {
          p_user_id: userId,
          p_type: 'deposit',
          p_title: 'Wallet Funded Successfully',
          p_message: `Your wallet has been funded with ${currency} ${depositAmount.toLocaleString()}${feeAmount > 0 ? ` (Fee: ${feeAmount.toLocaleString()})` : ''}`,
          p_data: {
            transaction_id: transaction.id,
            amount: depositAmount,
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
          amount: depositAmount,
          currency: currency,
          feeAmount: feeAmount,
          transactionId: transaction.id,
        });
      } catch (pushError) {
        console.error('⚠️ Error sending push notification:', pushError);
        // Don't fail the webhook if push notification fails
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
