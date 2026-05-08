// Detect Solana Deposits Edge Function
// Monitors Solana addresses for incoming SOL deposits

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoDepositNotification } from "../_shared/send-crypto-deposit-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum confirmations required for Solana (typically 32 blocks for finalized)
const MIN_CONFIRMATIONS = 32;

/**
 * Get current SOL price in NGN
 * Checks app rates first, then fallback
 * Always ensures price is in NGN (converts from USD if needed)
 */
async function getSolPriceNgn(supabase: SupabaseClient): Promise<number> {
  try {
    // Check app rate from crypto_rates table
    const { data, error } = await supabase
      .from('crypto_rates')
      .select('price_usd, price_ngn, is_active')
      .eq('crypto_symbol', 'SOL')
      .eq('is_active', true)
      .single();

    if (!error && data) {
      const priceUsd = parseFloat(data.price_usd?.toString() || '0');
      const priceNgnRaw = parseFloat(data.price_ngn.toString());
      
      // If we have both USD price and NGN value, use USD price with exchange rate
      if (priceUsd > 0 && priceNgnRaw > 0) {
        // Check if price_ngn looks like a USD-to-NGN exchange rate (typically 1400-1650)
        const isExchangeRateRange = priceNgnRaw >= 1000 && priceNgnRaw <= 2000;
        
        if (isExchangeRateRange) {
          // price_ngn is an exchange rate, multiply by price_usd to get NGN price
          const priceNgn = priceUsd * priceNgnRaw;
          console.log(`✅ Using app rate for SOL: ₦${priceNgn.toFixed(2)} (calculated from ${priceUsd} USD × ${priceNgnRaw} NGN/USD)`);
          return priceNgn;
        } else {
          // price_ngn is already the price per SOL in NGN
          console.log(`✅ Using app rate for SOL: ₦${priceNgnRaw.toFixed(2)} per SOL`);
          return priceNgnRaw;
        }
      } else if (priceUsd > 0 && priceNgnRaw <= 0) {
        // Only USD price available, convert using standard exchange rate (1650 NGN/USD)
        const USD_TO_NGN_RATE = 1650;
        const priceNgn = priceUsd * USD_TO_NGN_RATE;
        console.log(`✅ Converting USD price to NGN: ₦${priceNgn.toFixed(2)} (${priceUsd} USD × ${USD_TO_NGN_RATE} NGN/USD)`);
        return priceNgn;
      } else if (priceNgnRaw > 0) {
        // Only NGN price available, use directly
        console.log(`✅ Using app rate for SOL: ₦${priceNgnRaw.toFixed(2)} per SOL`);
        return priceNgnRaw;
      }
    }
  } catch (error: any) {
    console.warn(`⚠️ Error fetching app rate for SOL:`, error.message);
  }

  // No fallback: require pricing engine / crypto_rates
  console.warn(`⚠️ No SOL price available from app rate or pricing engine`);
  return 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Supabase env (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Alchemy Solana API URL
    const alchemyUrl =
      Deno.env.get('ALCHEMY_SOLANA_URL') ||
      (Deno.env.get('ALCHEMY_API_KEY')
        ? `https://solana-mainnet.g.alchemy.com/v2/${Deno.env.get('ALCHEMY_API_KEY')}`
        : '');
    if (!alchemyUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Alchemy secret (ALCHEMY_SOLANA_URL or ALCHEMY_API_KEY)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all active Solana wallet addresses
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address')
      .eq('asset', 'SOL')
      .eq('network', 'mainnet')
      .eq('is_active', true);

    if (walletsError || !wallets) {
      console.error('Error fetching wallets:', walletsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch wallets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Monitoring ${wallets.length} Solana addresses for deposits...`);

    const results = {
      checked: 0,
      depositsFound: 0,
      errors: [] as string[],
    };

    // Check each wallet for new deposits
    for (const wallet of wallets) {
      try {
        results.checked++;
        
        // Get recent signatures for this address
        const signaturesResponse = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'getSignaturesForAddress',
            params: [
              wallet.address,
              { limit: 50, commitment: 'finalized' }
            ],
            id: 1,
          }),
        });

        if (!signaturesResponse.ok) {
          throw new Error(`Solana API error: ${signaturesResponse.status}`);
        }

        const signaturesData = await signaturesResponse.json();
        const signatures = signaturesData.result || [];

        // Process each signature
        for (const sigInfo of signatures) {
          const signature = sigInfo.signature;
          const slot = sigInfo.slot;
          const err = sigInfo.err;
          const confirmationStatus = sigInfo.confirmationStatus;

          // Skip failed transactions
          if (err) continue;

          // Check if transaction already exists
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id, user_id, status, confirmations, metadata, created_at, crypto_amount')
            .eq('transaction_hash', signature)
            .eq('crypto_currency', 'SOL')
            .maybeSingle();
          
          // If transaction exists for a different user, skip (not our deposit)
          if (existingTx && existingTx.user_id !== wallet.user_id) {
            console.log(`⏭️ Transaction ${signature} exists for different user, skipping...`);
            continue;
          }
          
          // If transaction exists for this user and was already processed, skip completely
          if (existingTx && existingTx.user_id === wallet.user_id) {
            const metadata = existingTx.metadata || {};
            const txCreatedAt = new Date(existingTx.created_at || metadata.detected_at || 0);
            const now = new Date();
            const minutesSinceCreated = (now.getTime() - txCreatedAt.getTime()) / (1000 * 60);
            
            // If transaction is older than 2 minutes and already confirmed/credited, skip entirely
            if (minutesSinceCreated > 2 && 
                (existingTx.status === 'CONFIRMED' || existingTx.status === 'COMPLETED') &&
                metadata.credited === true) {
              console.log(`⏭️ Transaction ${signature} already processed ${minutesSinceCreated.toFixed(1)} minutes ago, skipping...`);
              continue;
            }
          }

          // Get transaction details
          const txResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'getTransaction',
              params: [
                signature,
                { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' }
              ],
              id: 2,
            }),
          });

          if (!txResponse.ok) continue;

          const txData = await txResponse.json();
          const txDetails = txData.result;
          if (!txDetails) continue;

          // Calculate amount received by this address
          // PRIORITY 1: Check transfer instructions first (most accurate - gives exact deposit amount)
          let amountSol = 0;
          if (txDetails.transaction?.message?.instructions) {
            for (const instruction of txDetails.transaction.message.instructions) {
              if (instruction.program === 'system' && instruction.parsed?.type === 'transfer') {
                const transferInfo = instruction.parsed.info;
                if (transferInfo.destination === wallet.address) {
                  const transferAmount = parseFloat(transferInfo.lamports || '0') / 1e9;
                  // Sum all transfers to this address (in case of multiple transfers in one tx)
                  amountSol += transferAmount;
                }
              }
            }
          }

          // PRIORITY 2: Fallback to balance change if no transfer instructions found
          // This handles edge cases where transfer instructions aren't parsed correctly
          if (amountSol === 0) {
            const preBalances = txDetails.meta?.preBalances || [];
            const postBalances = txDetails.meta?.postBalances || [];
            const accountKeys = txDetails.transaction?.message?.accountKeys || [];

            // Find the index of our wallet address
            const walletIndex = accountKeys.findIndex((key: any) => 
              (typeof key === 'string' ? key : key.pubkey) === wallet.address
            );

            if (walletIndex >= 0 && preBalances[walletIndex] !== undefined && postBalances[walletIndex] !== undefined) {
              const balanceChange = (postBalances[walletIndex] - preBalances[walletIndex]) / 1e9; // Convert lamports to SOL
              if (balanceChange > 0) {
                amountSol = balanceChange;
              }
            }
          }

          if (amountSol <= 0) continue;

          // Determine status based on confirmation status
          // We request finalized data; treat all processed deposits as confirmed
          // (Some RPC nodes may still include confirmationStatus; keep it in metadata)
          const status: 'CONFIRMED' = 'CONFIRMED';
          const confirmations = MIN_CONFIRMATIONS;

          if (!existingTx) {
            // Get SOL price in NGN to calculate fiat amount
            const solPriceNgn = await getSolPriceNgn(supabase);
            const fiatAmountNgn = amountSol * solPriceNgn;

            // Record transaction
            const { data: insertedTx, error: insertError } = await supabase
              .from('transactions')
              .insert({
                user_id: wallet.user_id,
                transaction_type: 'RECEIVE',
                crypto_currency: 'SOL',
                crypto_amount: amountSol,
                fiat_amount: fiatAmountNgn,
                fiat_currency: 'NGN',
                status: status,
                to_address: wallet.address,
                transaction_hash: signature,
                block_number: slot,
                confirmations: confirmations,
                metadata: {
                  detected_at: new Date().toISOString(),
                  confirmation_status: confirmationStatus,
                  notifiedStatuses: [], // Track which status notifications were sent
                  price_per_sol_ngn: solPriceNgn,
                  price_source: 'app_rate', // Could be enhanced to track actual source
                },
              })
              .select()
              .single();

            if (insertError) {
              console.error(`Error inserting transaction ${signature}:`, insertError);
              results.errors.push(`Failed to insert transaction ${signature}`);
              continue;
            }

            results.depositsFound++;
            console.log(`✅ New SOL deposit detected and recorded: ${amountSol} SOL (${confirmationStatus})`);

            // Credit balance when confirmed
            if (status === 'CONFIRMED') {
              try {
                console.log(`💰 Crediting ${amountSol} SOL to user ${wallet.user_id}...`);
                const { error: creditError } = await supabase.rpc('credit_crypto_wallet', {
                  p_user_id: wallet.user_id,
                  p_amount: amountSol,
                  p_currency: 'SOL',
                });

                if (creditError) {
                  console.error(`⚠️ Failed to credit balance via RPC:`, creditError);
                  // Fallback: direct update
                  const { data: currentBalance } = await supabase
                    .from('wallet_balances')
                    .select('balance')
                    .eq('user_id', wallet.user_id)
                    .eq('currency', 'SOL')
                    .maybeSingle();

                  const currentSolBalance = currentBalance ? parseFloat(currentBalance.balance || '0') : 0;
                  const newSolBalance = currentSolBalance + amountSol;

                  const { error: updateError } = await supabase
                    .from('wallet_balances')
                    .upsert({
                      user_id: wallet.user_id,
                      currency: 'SOL',
                      balance: newSolBalance,
                      updated_at: new Date().toISOString(),
                    }, {
                      onConflict: 'user_id,currency',
                    });

                  if (updateError) {
                    console.error(`❌ Failed to credit balance via direct update:`, updateError);
                    results.errors.push(`Failed to credit balance for transaction ${signature}`);
                  } else {
                    console.log(`✅ Balance credited via direct update: ${newSolBalance.toFixed(9)} SOL`);
                  }
                } else {
                  console.log(`✅ Balance credited successfully: ${amountSol} SOL`);
                }

                // Update transaction metadata to mark as credited
                await supabase
                  .from('transactions')
                  .update({
                    metadata: {
                      ...insertedTx.metadata,
                      credited: true,
                      credited_at: new Date().toISOString(),
                    },
                  })
                  .eq('id', insertedTx.id);
              } catch (creditException: any) {
                console.error(`⚠️ Exception crediting balance (non-critical):`, creditException?.message || creditException);
                // Don't fail the whole operation if balance crediting fails
              }
            }

            // Send notification
            try {
              await sendCryptoDepositNotification({
                supabase,
                userId: wallet.user_id,
                cryptoCurrency: 'SOL',
                amount: amountSol,
                transactionHash: signature,
                confirmations: confirmations,
                status: status,
              });
            } catch (notifError: any) {
              console.error(`⚠️ Failed to send notification (non-critical):`, notifError?.message || notifError);
              // Don't fail the whole operation if notification fails
            }
          } else {
            // Update existing transaction - but DON'T send duplicate notifications
            const metadata = existingTx.metadata || {};
            const notifiedStatuses = Array.isArray(metadata.notifiedStatuses) ? metadata.notifiedStatuses : [];
            const alreadyCredited = metadata.credited === true;
            const needsUpdate = 
              existingTx.status !== status ||
              existingTx.confirmations !== confirmations;

            // Use the stored crypto_amount from the transaction record instead of recalculating
            // This ensures we credit the exact amount that was recorded
            const actualAmountReceived = parseFloat(existingTx.crypto_amount?.toString() || '0') || amountSol;

            if (needsUpdate) {
              const updateData: any = {
                status: status,
                confirmations: confirmations,
                block_number: slot,
              };

              await supabase
                .from('transactions')
                .update(updateData)
                .eq('id', existingTx.id);

              // Credit balance if status changed to CONFIRMED and hasn't been credited yet
              if (status === 'CONFIRMED' && existingTx.status !== 'CONFIRMED' && !alreadyCredited) {
                try {
                  console.log(`💰 Crediting ${actualAmountReceived} SOL to user ${wallet.user_id} (status changed to CONFIRMED, using stored amount from transaction record)...`);
                  const { error: creditError } = await supabase.rpc('credit_crypto_wallet', {
                    p_user_id: wallet.user_id,
                    p_amount: actualAmountReceived,
                    p_currency: 'SOL',
                  });

                  if (creditError) {
                    console.error(`⚠️ Failed to credit balance via RPC:`, creditError);
                    // Fallback: direct update
                    const { data: currentBalance } = await supabase
                      .from('wallet_balances')
                      .select('balance')
                      .eq('user_id', wallet.user_id)
                      .eq('currency', 'SOL')
                      .maybeSingle();

                    const currentSolBalance = currentBalance ? parseFloat(currentBalance.balance || '0') : 0;
                    const newSolBalance = currentSolBalance + actualAmountReceived;

                    const { error: updateError } = await supabase
                      .from('wallet_balances')
                      .upsert({
                        user_id: wallet.user_id,
                        currency: 'SOL',
                        balance: newSolBalance,
                        updated_at: new Date().toISOString(),
                      }, {
                        onConflict: 'user_id,currency',
                      });

                    if (updateError) {
                      console.error(`❌ Failed to credit balance via direct update:`, updateError);
                    } else {
                      console.log(`✅ Balance credited via direct update: ${newSolBalance.toFixed(9)} SOL`);
                    }
                  } else {
                    console.log(`✅ Balance credited successfully: ${actualAmountReceived} SOL`);
                  }

                  // Update transaction metadata to mark as credited
                  await supabase
                    .from('transactions')
                    .update({
                      metadata: {
                        ...metadata,
                        credited: true,
                        credited_at: new Date().toISOString(),
                      },
                    })
                    .eq('id', existingTx.id);
                } catch (creditException: any) {
                  console.error(`⚠️ Exception crediting balance (non-critical):`, creditException?.message || creditException);
                }
              }

              // Only send notification if status changed AND we haven't notified for this status yet
              if (!notifiedStatuses.includes(status)) {
                try {
                  await sendCryptoDepositNotification({
                    supabase,
                    userId: wallet.user_id,
                    cryptoCurrency: 'SOL',
                    amount: actualAmountReceived,
                    transactionHash: signature,
                    confirmations: confirmations,
                    status: status,
                  });
                } catch (notifError: any) {
                  console.error(`⚠️ Failed to send notification (non-critical):`, notifError?.message || notifError);
                }
              } else {
                console.log(`⏭️ Notification for ${signature} (status: ${status}) already sent, skipping...`);
              }
            } else {
              // Transaction exists and doesn't need update - skip completely
              // Don't send any notifications for transactions that don't need updates
              console.log(`⏭️ Transaction ${signature} already processed (status: ${existingTx.status}), skipping...`);
            }
          }
        }
      } catch (error: any) {
        console.error(`Error processing wallet ${wallet.address}:`, error);
        results.errors.push(`Wallet ${wallet.address}: ${error.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error detecting Solana deposits:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
