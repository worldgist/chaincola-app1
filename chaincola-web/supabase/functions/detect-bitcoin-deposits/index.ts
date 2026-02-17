// Detect Bitcoin Deposits Edge Function
// Monitors Bitcoin addresses for incoming BTC deposits

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoDepositNotification } from "../_shared/send-crypto-deposit-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum confirmations required for Bitcoin (typically 6 blocks)
const MIN_CONFIRMATIONS = 6;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Bitcoin RPC URL (Alchemy or custom RPC fallback)
    const bitcoinRpcUrl = Deno.env.get('BITCOIN_RPC_URL') || 
                          Deno.env.get('ALCHEMY_BITCOIN_URL') ||
                          'https://bitcoin-mainnet.g.alchemy.com/v2/3L_iw-7-b25_bzLHmLyUJ';
    
    const alchemyUrl = bitcoinRpcUrl;
    
    console.log(`🔗 Using Bitcoin RPC URL: ${bitcoinRpcUrl}`);

    // Get all active Bitcoin wallet addresses
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address')
      .eq('asset', 'BTC')
      .eq('network', 'mainnet')
      .eq('is_active', true);

    if (walletsError || !wallets) {
      console.error('Error fetching wallets:', walletsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch wallets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Monitoring ${wallets.length} Bitcoin addresses for deposits...`);

    const results = {
      checked: 0,
      depositsFound: 0,
      depositsCredited: 0,
      errors: [] as string[],
    };

    // Check each wallet for new deposits
    for (const wallet of wallets) {
      try {
        results.checked++;
        
        // Get recent transactions for this address using Alchemy
        const response = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alchemy_getAssetTransfers',
            params: [{
              fromBlock: '0x0',
              toBlock: 'latest',
              toAddress: wallet.address,
              category: ['receive'],
              excludeZeroValue: true,
            }],
            id: 1,
          }),
        });

        if (!response.ok) {
          // Fallback: Use getaddressinfo if alchemy_getAssetTransfers not available
          const fallbackResponse = await fetch(alchemyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'getaddressinfo',
              params: [wallet.address],
              id: 1,
            }),
          });

          if (!fallbackResponse.ok) {
            throw new Error(`Bitcoin API error: ${response.status}`);
          }

          const fallbackData = await fallbackResponse.json();
          const addressInfo = fallbackData.result;
          
          // Get transaction history
          const txids = addressInfo?.txids || [];
          const recentTxids = txids.slice(0, 50); // Check last 50 transactions

          for (const txid of recentTxids) {
            // Check if transaction already exists
            const { data: existingTx } = await supabase
              .from('transactions')
              .select('id, status, confirmations, metadata')
              .eq('transaction_hash', txid.toLowerCase())
              .eq('user_id', wallet.user_id)
              .eq('crypto_currency', 'BTC')
              .maybeSingle();

            if (existingTx) continue;

            // Get transaction details
            const txResponse = await fetch(alchemyUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'getrawtransaction',
                params: [txid, true],
                id: 2,
              }),
            });

            if (!txResponse.ok) continue;

            const txData = await txResponse.json();
            const txDetails = txData.result;
            if (!txDetails || !txDetails.vout) continue;

            // Calculate amount received by this address
            let amountBtc = 0;
            for (const vout of txDetails.vout || []) {
              if (vout.scriptPubKey?.addresses?.includes(wallet.address)) {
                amountBtc += vout.value || 0;
              }
            }

            if (amountBtc <= 0) continue;

            // Get confirmations
            const blockHeight = txDetails.blockheight || 0;
            const currentBlockResponse = await fetch(alchemyUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'getblockcount',
                params: [],
                id: 3,
              }),
            });

            const currentBlockData = await currentBlockResponse.json();
            const currentBlockHeight = currentBlockData.result || 0;
            const confirmations = Math.max(0, currentBlockHeight - blockHeight);

            let status: 'PENDING' | 'CONFIRMING' | 'CONFIRMED' = 'PENDING';
            if (confirmations >= MIN_CONFIRMATIONS) {
              status = 'CONFIRMED';
            } else if (confirmations > 0) {
              status = 'CONFIRMING';
            }

            // Record transaction
            const { data: insertedTx, error: insertError } = await supabase
              .from('transactions')
              .insert({
                user_id: wallet.user_id,
                transaction_type: 'RECEIVE',
                crypto_currency: 'BTC',
                crypto_amount: amountBtc,
                status: status,
                to_address: wallet.address,
                transaction_hash: txid.toLowerCase(),
                block_number: blockHeight,
                confirmations: confirmations,
                metadata: {
                  detected_at: new Date().toISOString(),
                },
              })
              .select()
              .single();

            if (insertError) {
              console.error(`Error inserting transaction ${txid}:`, insertError);
              results.errors.push(`Failed to insert transaction ${txid}`);
              continue;
            }

            results.depositsFound++;
            console.log(`✅ New BTC deposit detected and recorded: ${amountBtc} BTC (${confirmations} confirmations)`);

            // STEP 3: Send notification AFTER conversion and recording
            await sendCryptoDepositNotification({
              supabase,
              userId: wallet.user_id,
              cryptoCurrency: 'BTC',
              amount: amountBtc,
              transactionHash: txid.toLowerCase(),
              confirmations: confirmations,
              status: status,
            });
          }
          continue;
        }

        const data = await response.json();
        const transfers = data.result?.transfers || [];

        // Process each transfer
        for (const transfer of transfers) {
          const txHash = transfer.hash || transfer.txid;
          const amountBtc = parseFloat(transfer.value || '0');
          const blockNumber = transfer.blockNum || 0;
          const confirmations = transfer.confirmations || 0;

          if (amountBtc <= 0) continue;

          // Check if transaction already exists
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id, status, confirmations, metadata')
            .eq('transaction_hash', txHash.toLowerCase())
            .eq('user_id', wallet.user_id)
            .eq('crypto_currency', 'BTC')
            .maybeSingle();

          let status: 'PENDING' | 'CONFIRMING' | 'CONFIRMED' = 'PENDING';
          if (confirmations >= MIN_CONFIRMATIONS) {
            status = 'CONFIRMED';
          } else if (confirmations > 0) {
            status = 'CONFIRMING';
          }

          if (!existingTx) {
            // Record transaction
            const { data: insertedTx, error: insertError } = await supabase
              .from('transactions')
              .insert({
                user_id: wallet.user_id,
                transaction_type: 'RECEIVE',
                crypto_currency: 'BTC',
                crypto_amount: amountBtc,
                status: status,
                to_address: wallet.address.toLowerCase(),
                transaction_hash: txHash.toLowerCase(),
                block_number: blockNumber,
                confirmations: confirmations,
                metadata: {
                  detected_at: new Date().toISOString(),
                },
              })
              .select()
              .single();

            if (insertError) {
              console.error(`Error inserting transaction ${txHash}:`, insertError);
              results.errors.push(`Failed to insert transaction ${txHash}`);
              continue;
            }

            results.depositsFound++;
            console.log(`✅ New BTC deposit detected and recorded: ${amountBtc} BTC (${confirmations} confirmations)`);

            // STEP 3: Send notification AFTER conversion and recording
            try {
              await sendCryptoDepositNotification({
                supabase,
                userId: wallet.user_id,
                cryptoCurrency: 'BTC',
                amount: amountBtc,
                transactionHash: txHash.toLowerCase(),
                confirmations: confirmations,
                status: status,
              });
            } catch (notifError: any) {
              console.error(`⚠️ Failed to send notification (non-critical):`, notifError?.message || notifError);
              // Don't fail the whole operation if notification fails
            }
          } else {
            // Update existing transaction
            const needsUpdate = 
              existingTx.status !== status ||
              existingTx.confirmations !== confirmations;

            if (needsUpdate) {
              const updateData: any = {
                status: status,
                confirmations: confirmations,
                block_number: blockNumber,
              };


              await supabase
                .from('transactions')
                .update(updateData)
                .eq('id', existingTx.id);
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
    console.error('Error detecting Bitcoin deposits:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
