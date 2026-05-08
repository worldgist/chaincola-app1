// Verify Pending Flutterwave Payments
// Periodically checks pending Flutterwave payments and verifies them with Flutterwave API

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const flutterwaveSecretKey = Deno.env.get('FLUTTERWAVE_SECRET_KEY');

    if (!flutterwaveSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Flutterwave API credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all pending Flutterwave transactions
    const { data: pendingTransactions, error: fetchError } = await supabase
      .from('transactions')
      .select('id, user_id, external_reference, fiat_amount, fiat_currency, status, created_at, metadata')
      .eq('status', 'PENDING')
      .eq('transaction_type', 'DEPOSIT')
      .not('external_reference', 'is', null)
      .like('external_reference', 'CHAINCOLA-%')
      .lt('created_at', new Date(Date.now() - 10000).toISOString()) // Brief delay so webhook can run first
      .limit(50); // Process up to 50 at a time

    if (fetchError) {
      console.error('❌ Error fetching pending transactions:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch pending transactions', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingTransactions || pendingTransactions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending transactions to verify', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Found ${pendingTransactions.length} pending Flutterwave transactions to verify`);

    let completed = 0;
    let failed = 0;
    let stillPending = 0;
    const errors: string[] = [];

    for (const tx of pendingTransactions) {
      try {
        if (!tx.external_reference) continue;

        const txRef = tx.external_reference;

        // Call Flutterwave API to verify payment
        const verifyUrl = `${FLUTTERWAVE_API_BASE}/transactions/verify_by_reference?tx_ref=${txRef}`;
        
        const flutterwaveResponse = await fetch(verifyUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${flutterwaveSecretKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!flutterwaveResponse.ok) {
          const errorText = await flutterwaveResponse.text();
          console.error(`❌ Error verifying transaction ${txRef}:`, errorText);
          errors.push(`Transaction ${txRef}: ${errorText}`);
          continue;
        }

        const flutterwaveResult = await flutterwaveResponse.json();

        const paymentStatus = flutterwaveResult.data?.status?.toUpperCase();
        const isSuccessful = paymentStatus === 'SUCCESSFUL' || paymentStatus === 'SUCCESS';

        if (isSuccessful) {
          const totalAmount = flutterwaveResult.data.amount || tx.fiat_amount;
          const currency = String(
            flutterwaveResult.data.currency || tx.fiat_currency || 'NGN',
          ).toUpperCase();

          const depositAmount = tx.metadata?.deposit_amount || totalAmount;
          const feeAmount = tx.metadata?.fee_amount || depositAmount * 0.03;
          const creditAmount = tx.metadata?.credit_amount || depositAmount - feeAmount;

          console.log(
            `💰 Crediting wallet: ${creditAmount.toFixed(2)} ${currency} to user ${tx.user_id} (Fee: ${feeAmount.toFixed(2)} ${currency})`,
          );
          const creditResult = await creditUserWallet(supabase, tx.user_id, creditAmount, currency);

          if (!creditResult.ok) {
            console.error(`❌ Wallet credit failed for ${tx.id}:`, creditResult.message);
            errors.push(`Credit ${tx.id}: ${creditResult.message}`);
            await supabase
              .from('transactions')
              .update({
                error_message: `Payment received but wallet credit failed: ${creditResult.message}`,
                metadata: {
                  ...tx.metadata,
                  credit_error: creditResult.message,
                  pending_verify_credit_at: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq('id', tx.id);
            continue;
          }

          const prevMeta = tx.metadata || {};
          const { credit_error: _ce, ...metaWithoutCreditErr } = prevMeta as Record<string, unknown>;

          let depositFeeRecorded = prevMeta.deposit_fee_recorded === true;
          if (feeAmount > 0 && !depositFeeRecorded) {
            try {
              await supabase.rpc('record_admin_revenue', {
                p_revenue_type: 'DEPOSIT_FEE',
                p_source: 'FLUTTERWAVE',
                p_amount: feeAmount,
                p_currency: currency,
                p_fee_percentage: tx.metadata?.fee_percentage || 3.0,
                p_base_amount: depositAmount,
                p_transaction_id: tx.id,
                p_user_id: tx.user_id,
                p_metadata: {
                  flutterwave_ref: flutterwaveResult.data.flw_ref,
                  deposit_amount: depositAmount,
                  credit_amount: creditAmount,
                },
                p_notes: `Deposit fee from Flutterwave payment (pending verification)`,
              });
              depositFeeRecorded = true;
              console.log(`✅ Recorded admin revenue: ${feeAmount.toFixed(2)} ${currency} from deposit fee`);
            } catch (revenueError) {
              console.error(`⚠️ Error recording admin revenue for transaction ${tx.id} (non-critical):`, revenueError);
            }
          }

          const verifiedAt = new Date().toISOString();
          const { error: updateError } = await supabase
            .from('transactions')
            .update({
              status: 'COMPLETED',
              error_message: null,
              external_transaction_id: flutterwaveResult.data.flw_ref || flutterwaveResult.data.id?.toString(),
              completed_at: verifiedAt,
              updated_at: verifiedAt,
              metadata: {
                ...metaWithoutCreditErr,
                wallet_credited_at: verifiedAt,
                deposit_fee_recorded: depositFeeRecorded,
                flutterwave_data: {
                  flw_ref: flutterwaveResult.data.flw_ref,
                  payment_type: flutterwaveResult.data.payment_type,
                  processor_response: flutterwaveResult.data.processor_response,
                  verified_at: verifiedAt,
                },
              },
            })
            .eq('id', tx.id);

          if (updateError) {
            console.error(`❌ Error updating transaction ${tx.id}:`, updateError);
            errors.push(`Transaction ${tx.id}: ${updateError.message}`);
          } else {
            console.log(
              `✅ Updated transaction ${tx.id} to COMPLETED (Charged: ${totalAmount} ${currency}, Credit: ${creditAmount.toFixed(2)} ${currency})`,
            );
            completed++;

            console.log(`✅ Credited ${creditAmount} ${currency} to user ${tx.user_id}`);

              // Create notification (only after successful credit)
              try {
                await supabase.rpc('create_notification', {
                  p_user_id: tx.user_id,
                  p_type: 'deposit',
                  p_title: 'Payment successful',
                  p_message: `Your wallet was credited with ${currency} ${creditAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${feeAmount > 0 ? ` (fee: ${feeAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ''}.`,
                  p_data: {
                    transaction_id: tx.id,
                    amount: creditAmount,
                    fee_amount: feeAmount,
                    deposit_amount: depositAmount,
                    total_payment: totalAmount,
                    currency: currency,
                    status: 'COMPLETED',
                  },
                });
              } catch (notifError) {
                console.error(`⚠️ Error creating notification for transaction ${tx.id}:`, notifError);
              }

              try {
                await sendWalletFundingNotification({
                  supabase,
                  userId: tx.user_id,
                  amount: creditAmount,
                  currency: currency,
                  feeAmount: feeAmount,
                  depositAmount: depositAmount,
                  transactionId: tx.id,
                });
              } catch (pushError) {
                console.error(`⚠️ Error sending push notification for transaction ${tx.id}:`, pushError);
              }

              try {
                await sendFlutterwaveWalletFundingReceiptEmail(supabase, tx.user_id, {
                  creditAmount,
                  depositAmount,
                  feeAmount,
                  currency,
                  transactionId: tx.id,
                });
              } catch (emailErr) {
                console.error(`⚠️ Error sending wallet funding receipt email for ${tx.id}:`, emailErr);
              }
            }
        } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
          // Update to FAILED
          const { error: updateError } = await supabase
            .from('transactions')
            .update({
              status: 'FAILED',
              error_message: `Payment ${paymentStatus.toLowerCase()}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', tx.id);

          if (updateError) {
            console.error(`❌ Error updating transaction ${tx.id} to FAILED:`, updateError);
            errors.push(`Transaction ${tx.id}: ${updateError.message}`);
          } else {
            console.log(`⚠️ Updated transaction ${tx.id} to FAILED`);
            failed++;
          }
        } else {
          // Still pending
          stillPending++;
        }
      } catch (error: any) {
        console.error(`❌ Error processing transaction ${tx.id}:`, error);
        errors.push(`Transaction ${tx.id}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: pendingTransactions.length,
        completed,
        failed,
        stillPending,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception in verify-pending-flutterwave-payments:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to verify transactions' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
