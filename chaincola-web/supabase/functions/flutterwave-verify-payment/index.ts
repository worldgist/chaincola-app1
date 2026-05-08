// Flutterwave Payment Verification Edge Function
// Verifies payment status with Flutterwave API and credits user wallet if successful

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditUserWallet } from "../_shared/credit-user-wallet.ts";
import { sendFlutterwaveWalletFundingReceiptEmail } from "../_shared/send-crypto-email.ts";
import { sendWalletFundingNotification } from "../_shared/send-wallet-funding-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Flutterwave API base URL
const FLUTTERWAVE_API_BASE = Deno.env.get('FLUTTERWAVE_API_BASE') || 'https://api.flutterwave.com/v3';

interface VerifyPaymentRequest {
  tx_ref: string;
}

interface FlutterwaveVerifyResponse {
  status: string;
  message: string;
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

    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: 'Missing authorization header',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user ID from JWT token
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: 'Invalid or expired token',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get Flutterwave API credentials
    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');

    if (!flutterwaveSecretKey) {
      console.error('❌ Flutterwave API credentials not configured');
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: 'Flutterwave API credentials not configured',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: VerifyPaymentRequest = await req.json();
    const { tx_ref } = body;

    if (!tx_ref) {
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: 'Transaction reference (tx_ref) is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🔍 Verifying Flutterwave payment: ${tx_ref}`);

    // Find transaction in database
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('external_reference', tx_ref)
      .eq('user_id', user.id)
      .single();

    if (txError || !transaction) {
      console.error('❌ Transaction not found:', txError);
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: 'Transaction not found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const creditStuck =
      transaction.status === 'COMPLETED' &&
      !!(transaction.metadata?.credit_error ||
        (typeof transaction.error_message === 'string' &&
          transaction.error_message.toLowerCase().includes('wallet credit')));

    if (transaction.status === 'COMPLETED' && !creditStuck) {
      console.log(`✅ Transaction ${tx_ref} already completed`);
      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          transaction_id: transaction.id,
          amount: transaction.fiat_amount,
          status: 'COMPLETED',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Call Flutterwave API to verify payment
    const verifyUrl = `${FLUTTERWAVE_API_BASE}/transactions/verify_by_reference?tx_ref=${tx_ref}`;
    
    const flutterwaveResponse = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${flutterwaveSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!flutterwaveResponse.ok) {
      const errorText = await flutterwaveResponse.text();
      console.error('❌ Flutterwave API error:', flutterwaveResponse.status, errorText);
      
      return new Response(
        JSON.stringify({
          success: false,
          verified: false,
          error: `Flutterwave API error: ${flutterwaveResponse.status}`,
        }),
        {
          status: flutterwaveResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const flutterwaveResult: FlutterwaveVerifyResponse = await flutterwaveResponse.json();

    console.log(`📊 Flutterwave verification result:`, {
      status: flutterwaveResult.status,
      payment_status: flutterwaveResult.data?.status,
      amount: flutterwaveResult.data?.amount,
    });

    // Check if payment was successful
    const paymentStatus = flutterwaveResult.data?.status?.toUpperCase();
    const isSuccessful = paymentStatus === 'SUCCESSFUL' || paymentStatus === 'SUCCESS';

    if (isSuccessful) {
      const totalAmount = flutterwaveResult.data.amount || transaction.fiat_amount;
      const currency = String(
        flutterwaveResult.data.currency || transaction.fiat_currency || 'NGN',
      ).toUpperCase();

      const depositAmount = transaction.metadata?.deposit_amount || totalAmount;
      const feeAmount = transaction.metadata?.fee_amount || depositAmount * 0.03;
      const creditAmount = transaction.metadata?.credit_amount || depositAmount - feeAmount;

      console.log(
        `✅ Payment verified successfully: Charged: ${totalAmount} ${currency}, Deposit: ${depositAmount} ${currency}, Fee: ${feeAmount.toFixed(2)} ${currency}, Credit: ${creditAmount.toFixed(2)} ${currency}${creditStuck ? ' (retry credit)' : ''}`,
      );

      console.log(
        `💰 Crediting wallet: ${creditAmount.toFixed(2)} ${currency} to user ${user.id} (Fee: ${feeAmount.toFixed(2)} ${currency})`,
      );
      const creditResult = await creditUserWallet(supabase, user.id, creditAmount, currency);

      if (!creditResult.ok) {
        console.error('❌ Wallet credit failed:', creditResult.message);
        await supabase
          .from('transactions')
          .update({
            error_message: `Payment received but wallet credit failed: ${creditResult.message}`,
            metadata: {
              ...transaction.metadata,
              credit_error: creditResult.message,
              verify_credit_attempt_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', transaction.id);

        return new Response(
          JSON.stringify({
            success: false,
            verified: true,
            error: `Payment verified but failed to credit wallet: ${creditResult.message}`,
            transaction_id: transaction.id,
            status: transaction.status,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      const prevMeta = transaction.metadata || {};
      const { credit_error: _ce, ...metaWithoutCreditErr } = prevMeta as Record<string, unknown>;

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
            p_user_id: user.id,
            p_metadata: {
              flutterwave_ref: flutterwaveResult.data.flw_ref,
              deposit_amount: depositAmount,
              credit_amount: creditAmount,
            },
            p_notes: `Deposit fee from Flutterwave payment (verified)`,
          });
          depositFeeRecorded = true;
          console.log(`✅ Recorded admin revenue: ${feeAmount.toFixed(2)} ${currency} from deposit fee`);
        } catch (revenueError) {
          console.error('⚠️ Error recording admin revenue (non-critical):', revenueError);
        }
      }

      const completedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'COMPLETED',
          error_message: null,
          external_transaction_id: flutterwaveResult.data.flw_ref || flutterwaveResult.data.id?.toString(),
          completed_at: completedAt,
          updated_at: completedAt,
          metadata: {
            ...metaWithoutCreditErr,
            wallet_credited_at: completedAt,
            deposit_fee_recorded: depositFeeRecorded,
            flutterwave_data: {
              flw_ref: flutterwaveResult.data.flw_ref,
              payment_type: flutterwaveResult.data.payment_type,
              processor_response: flutterwaveResult.data.processor_response,
            },
          },
        })
        .eq('id', transaction.id);

      if (updateError) {
        console.error('❌ Error updating transaction after credit:', updateError);
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            error: 'Failed to update transaction status',
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }

      console.log(`✅ Successfully credited ${creditAmount} ${currency} to user ${user.id}`);

      // Create notification for successful payment
      try {
        await supabase.rpc('create_notification', {
          p_user_id: user.id,
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
        // Don't fail the verification if notification fails
      }

      // Send push notification for successful wallet funding
      try {
        await sendWalletFundingNotification({
          supabase,
          userId: user.id,
          amount: creditAmount,
          currency: currency,
          feeAmount: feeAmount,
          depositAmount: depositAmount,
          transactionId: transaction.id,
        });
      } catch (pushError) {
        console.error('⚠️ Error sending push notification:', pushError);
        // Don't fail the verification if push notification fails
      }

      try {
        await sendFlutterwaveWalletFundingReceiptEmail(supabase, user.id, {
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
          verified: true,
          transaction_id: transaction.id,
          amount: depositAmount,
          fee_amount: feeAmount,
          total_payment: totalAmount,
          status: 'COMPLETED',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
      // Update transaction status to FAILED
      await supabase
        .from('transactions')
        .update({
          status: 'FAILED',
          error_message: `Payment ${paymentStatus.toLowerCase()}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction.id);

      return new Response(
        JSON.stringify({
          success: true,
          verified: false,
          transaction_id: transaction.id,
          amount: transaction.fiat_amount,
          status: 'FAILED',
          error: `Payment ${paymentStatus.toLowerCase()}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      // Payment still pending
      return new Response(
        JSON.stringify({
          success: true,
          verified: false,
          transaction_id: transaction.id,
          amount: transaction.fiat_amount,
          status: 'PENDING',
          error: 'Payment is still pending',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error: any) {
    console.error('❌ Exception in verify payment function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        verified: false,
        error: error.message || 'Failed to verify payment',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
