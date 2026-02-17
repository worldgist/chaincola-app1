// Verify Ethereum SEND Transactions
// Checks pending SEND transactions and updates their status based on blockchain confirmations

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoSendNotification } from "../_shared/send-crypto-send-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum confirmations required for Ethereum (typically 12-15 blocks)
const MIN_CONFIRMATIONS = 12;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Alchemy Ethereum API URL
    const alchemyUrl = Deno.env.get('ALCHEMY_ETHEREUM_URL') || 'https://eth-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';

    // Get latest block number
    const latestBlockResponse = await fetch(alchemyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_blockNumber',
        params: [],
        id: 1,
      }),
    });

    const latestBlockData = await latestBlockResponse.json();
    const latestBlockNumber = parseInt(latestBlockData.result || '0', 16);

    // Get all pending SEND transactions for ETH
    const { data: pendingTxs, error: fetchError } = await supabase
      .from('transactions')
      .select('id, transaction_hash, user_id, crypto_amount, from_address, to_address, status, confirmations, block_number, created_at, metadata')
      .eq('crypto_currency', 'ETH')
      .eq('transaction_type', 'SEND')
      .in('status', ['PENDING', 'CONFIRMING', 'CONFIRMED'])
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching pending transactions:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch transactions', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!pendingTxs || pendingTxs.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No pending SEND transactions found',
          checked: 0,
          confirmed: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Checking ${pendingTxs.length} pending SEND transactions...`);

    const results = {
      checked: 0,
      confirmed: 0,
      stillPending: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const tx of pendingTxs) {
      try {
        results.checked++;

        if (!tx.transaction_hash) {
          results.errors.push(`Transaction ${tx.id}: Missing transaction hash`);
          continue;
        }

        // Get transaction receipt to check status
        const receiptResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getTransactionReceipt',
            params: [tx.transaction_hash],
            id: 1,
          }),
        });

        if (!receiptResponse.ok) {
          results.errors.push(`Transaction ${tx.id}: Failed to fetch receipt (${receiptResponse.status})`);
          continue;
        }

        const receiptData = await receiptResponse.json();
        const receipt = receiptData.result;

        if (!receipt) {
          // Transaction not yet mined
          console.log(`⏳ Transaction ${tx.transaction_hash.substring(0, 16)}... not yet mined`);
          results.stillPending++;
          continue;
        }

        // Transaction was mined - check if it succeeded
        const status = receipt.status;
        const blockNumber = parseInt(receipt.blockNumber || '0', 16);
        const confirmations = latestBlockNumber - blockNumber;

        if (status === '0x0' || status === '0x00') {
          // Transaction failed - refund the debited amount
          console.log(`❌ Transaction ${tx.transaction_hash.substring(0, 16)}... failed`);
          
          // Check if already refunded
          const alreadyRefunded = tx.metadata?.refunded === true;
          
          if (!alreadyRefunded) {
            // Calculate refund amount (send amount + gas fee)
            const amount = parseFloat(tx.crypto_amount || '0');
            const gasFee = parseFloat(tx.metadata?.gas_fee || '0');
            const totalDebited = amount + gasFee;
            
            if (totalDebited > 0) {
              console.log(`💰 Refunding ${totalDebited.toFixed(8)} ETH to user ${tx.user_id}...`);
              
              // Get current balance before refund
              const { data: balanceBefore } = await supabase
                .from('wallet_balances')
                .select('balance')
                .eq('user_id', tx.user_id)
                .eq('currency', 'ETH')
                .single();
              
              const balanceBeforeAmount = balanceBefore ? parseFloat(balanceBefore.balance || '0') : 0;
              
              // Credit back the amount
              const { error: refundError } = await supabase.rpc('credit_crypto_wallet', {
                p_user_id: tx.user_id,
                p_amount: totalDebited,
                p_currency: 'ETH',
              });
              
              if (refundError) {
                console.error(`❌ Failed to refund transaction ${tx.id}:`, refundError);
                results.errors.push(`Transaction ${tx.id}: Refund failed - ${refundError.message}`);
              } else {
                // Get balance after refund
                const { data: balanceAfter } = await supabase
                  .from('wallet_balances')
                  .select('balance')
                  .eq('user_id', tx.user_id)
                  .eq('currency', 'ETH')
                  .single();
                
                const balanceAfterAmount = balanceAfter ? parseFloat(balanceAfter.balance || '0') : 0;
                
                console.log(`✅ Refunded ${totalDebited.toFixed(8)} ETH (balance: ${balanceBeforeAmount.toFixed(8)} → ${balanceAfterAmount.toFixed(8)} ETH)`);
                
                // Update transaction with refund info
                await supabase
                  .from('transactions')
                  .update({
                    status: 'FAILED',
                    confirmations,
                    block_number: blockNumber,
                    error_message: 'Transaction failed on blockchain. Amount refunded.',
                    updated_at: new Date().toISOString(),
                    metadata: {
                      ...(tx.metadata || {}),
                      failed_at: new Date().toISOString(),
                      receipt_status: status,
                      refunded: true,
                      refunded_at: new Date().toISOString(),
                      refund_amount: totalDebited.toFixed(8),
                      refund_reason: 'Transaction failed on blockchain (status: 0x0)',
                      balance_before_refund: balanceBeforeAmount.toFixed(8),
                      balance_after_refund: balanceAfterAmount.toFixed(8),
                    },
                  })
                  .eq('id', tx.id);
                
                results.failed++;
              }
            } else {
              // No amount to refund, just update status
              await supabase
                .from('transactions')
                .update({
                  status: 'FAILED',
                  confirmations,
                  block_number: blockNumber,
                  error_message: 'Transaction failed on blockchain',
                  updated_at: new Date().toISOString(),
                  metadata: {
                    ...(tx.metadata || {}),
                    failed_at: new Date().toISOString(),
                    receipt_status: status,
                  },
                })
                .eq('id', tx.id);
              results.failed++;
            }
          } else {
            // Already refunded, just update status if needed
            if (tx.status !== 'FAILED') {
              await supabase
                .from('transactions')
                .update({
                  status: 'FAILED',
                  confirmations,
                  block_number: blockNumber,
                  error_message: 'Transaction failed on blockchain. Amount refunded.',
                  updated_at: new Date().toISOString(),
                  metadata: {
                    ...(tx.metadata || {}),
                    failed_at: new Date().toISOString(),
                    receipt_status: status,
                  },
                })
                .eq('id', tx.id);
            }
            results.failed++;
            
            // Send push notification when transaction fails
            await sendCryptoSendNotification({
              supabase,
              userId: tx.user_id,
              cryptoCurrency: tx.crypto_currency || 'ETH',
              amount: parseFloat(tx.crypto_amount || '0'),
              transactionHash: tx.transaction_hash,
              toAddress: tx.to_address || '',
              confirmations: 0,
              status: 'FAILED',
            });
          }
        } else {
          // Transaction succeeded
          const newStatus = confirmations >= MIN_CONFIRMATIONS ? 'COMPLETED' : 'CONFIRMING';
          
          await supabase
            .from('transactions')
            .update({
              status: newStatus,
              confirmations,
              block_number: blockNumber,
              confirmed_at: confirmations >= MIN_CONFIRMATIONS ? new Date().toISOString() : null,
              completed_at: confirmations >= MIN_CONFIRMATIONS ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
              metadata: {
                ...(tx.metadata || {}),
                receipt_status: status,
                last_checked_at: new Date().toISOString(),
                confirmations_checked: confirmations,
              },
            })
            .eq('id', tx.id);

          if (confirmations >= MIN_CONFIRMATIONS) {
            console.log(`✅ Transaction ${tx.transaction_hash.substring(0, 16)}... completed (${confirmations} confirmations)`);
            results.confirmed++;
            
            // Send push notification when transaction is confirmed
            if (tx.status !== 'COMPLETED') {
              await sendCryptoSendNotification({
                supabase,
                userId: tx.user_id,
                cryptoCurrency: tx.crypto_currency || 'ETH',
                amount: parseFloat(tx.crypto_amount || '0'),
                transactionHash: tx.transaction_hash,
                toAddress: tx.to_address || '',
                confirmations: confirmations,
                status: 'CONFIRMED',
              });
            }
          } else {
            console.log(`⏳ Transaction ${tx.transaction_hash.substring(0, 16)}... confirming (${confirmations}/${MIN_CONFIRMATIONS} confirmations)`);
            results.stillPending++;
            
            // Send push notification when status changes to CONFIRMING
            if (tx.status === 'PENDING') {
              await sendCryptoSendNotification({
                supabase,
                userId: tx.user_id,
                cryptoCurrency: tx.crypto_currency || 'ETH',
                amount: parseFloat(tx.crypto_amount || '0'),
                transactionHash: tx.transaction_hash,
                toAddress: tx.to_address || '',
                confirmations: confirmations,
                status: 'CONFIRMING',
              });
            }
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing transaction ${tx.id}:`, error);
        results.errors.push(`Transaction ${tx.id}: ${error.message}`);
      }
    }

    console.log(`✅ Verification completed:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        data: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Exception in verify-ethereum-send-transactions:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to verify transactions',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

