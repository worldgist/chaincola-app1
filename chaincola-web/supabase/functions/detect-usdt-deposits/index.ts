// Detect USDT Deposits Edge Function
// Monitors Ethereum addresses for incoming USDT (ERC-20) deposits

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoDepositNotification } from "../_shared/send-crypto-deposit-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// USDT Token Contract Address (ERC-20 on Ethereum)
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'.toLowerCase();

// Minimum confirmations required for Ethereum (typically 12 blocks)
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

    // Get all active Ethereum wallet addresses (USDT uses ETH wallets)
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address')
      .eq('asset', 'ETH')
      .eq('network', 'mainnet')
      .eq('is_active', true);

    if (walletsError || !wallets) {
      console.error('Error fetching wallets:', walletsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch wallets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Monitoring ${wallets.length} Ethereum addresses for USDT deposits...`);

    const results = {
      checked: 0,
      depositsFound: 0,
      errors: [] as string[],
    };

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
    const recentFromBlock = Math.max(0, latestBlockNumber - 50000); // Check last ~7 days
    const recentFromBlockHex = '0x' + recentFromBlock.toString(16);

    // Check each wallet for new USDT deposits
    for (const wallet of wallets) {
      try {
        results.checked++;
        
        // Get ERC-20 token transfers for USDT
        const response = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'alchemy_getAssetTransfers',
            params: [{
              fromBlock: recentFromBlockHex,
              toBlock: 'latest',
              toAddress: wallet.address.toLowerCase(),
              contractAddresses: [USDT_CONTRACT_ADDRESS],
              category: ['erc20'],
              excludeZeroValue: true,
            }],
            id: 1,
          }),
        });

        if (!response.ok) {
          throw new Error(`Alchemy API error: ${response.status}`);
        }

        const data = await response.json();
        const transfers = data.result?.transfers || [];

        // Process each transfer
        for (const transfer of transfers) {
          // Verify it's USDT
          if (transfer.asset?.toLowerCase() !== USDT_CONTRACT_ADDRESS && 
              transfer.rawContract?.address?.toLowerCase() !== USDT_CONTRACT_ADDRESS) {
            continue;
          }

          const txHash = transfer.hash;
          const amountRaw = transfer.value || '0';
          const amountWei = BigInt(amountRaw);
          const amountUsdt = Number(amountWei) / 1e6; // USDT has 6 decimals
          const blockNumber = parseInt(transfer.blockNum || '0', 16);
          const confirmations = latestBlockNumber - blockNumber;

          if (amountUsdt <= 0) continue;

          // Check if transaction already exists
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id, status, confirmations, metadata')
            .eq('transaction_hash', txHash.toLowerCase())
            .eq('user_id', wallet.user_id)
            .eq('crypto_currency', 'USDT')
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
                crypto_currency: 'USDT',
                crypto_amount: amountUsdt,
                status: status,
                to_address: wallet.address.toLowerCase(),
                from_address: transfer.from?.toLowerCase() || 'unknown',
                transaction_hash: txHash.toLowerCase(),
                block_number: blockNumber,
                confirmations: confirmations,
                metadata: {
                  detected_at: new Date().toISOString(),
                  value_raw: amountRaw,
                  contract_address: USDT_CONTRACT_ADDRESS,
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
            console.log(`✅ New USDT deposit detected and recorded: ${amountUsdt} USDT (${confirmations} confirmations)`);

            // STEP 3: Send notification AFTER conversion and recording
            try {
              await sendCryptoDepositNotification({
                supabase,
                userId: wallet.user_id,
                cryptoCurrency: 'USDT',
                amount: amountUsdt,
                transactionHash: txHash.toLowerCase(),
                confirmations: confirmations,
                status: status,
                ngnCredited: convertResult.success ? convertResult.ngnCredited : undefined,
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
    console.error('Error detecting USDT deposits:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
