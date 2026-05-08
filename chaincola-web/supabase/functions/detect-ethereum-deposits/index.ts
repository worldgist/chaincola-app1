// Detect Ethereum Deposits Edge Function
// Monitors Ethereum addresses for incoming ETH deposits and credits user balances

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoDepositNotification } from "../_shared/send-crypto-deposit-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum confirmations required for Ethereum (typically 12 blocks)
const MIN_CONFIRMATIONS = 12;

// Fallback price for ETH in NGN
const FALLBACK_ETH_PRICE_NGN = 3500000; // ~$2,100 * 1650

function parseEthTransfer(transfer: any): { amountEth: number; amountWei: bigint } {
  // Alchemy asset transfers for native ETH can return:
  // - transfer.value: human ETH decimal (string/number)
  // - transfer.rawContract.value: wei as hex string or decimal string
  const raw = transfer?.rawContract?.value;
  try {
    if (typeof raw === 'string' && raw.length > 0) {
      const wei = raw.startsWith('0x') ? BigInt(raw) : BigInt(raw);
      const eth = Number(wei) / 1e18;
      return { amountEth: eth, amountWei: wei };
    }
  } catch {
    // fall through
  }

  const eth = Number(transfer?.value || 0);
  if (!Number.isFinite(eth) || eth <= 0) return { amountEth: 0, amountWei: 0n };
  const wei = BigInt(Math.round(eth * 1e18));
  return { amountEth: eth, amountWei: wei };
}

/**
 * Get current ETH price in NGN
 */
async function getEthPriceNgn(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('crypto_rates')
      .select('price_usd, price_ngn, is_active')
      .eq('crypto_symbol', 'ETH')
      .eq('is_active', true)
      .single();

    if (!error && data) {
      const priceUsd = parseFloat(data.price_usd?.toString() || '0');
      const priceNgnRaw = parseFloat(data.price_ngn.toString());
      
      if (priceNgnRaw > 0) {
        const isExchangeRateRange = priceNgnRaw >= 1000 && priceNgnRaw <= 2000;
        if (isExchangeRateRange && priceUsd > 0) {
          const priceNgn = priceUsd * priceNgnRaw;
          return priceNgn;
        } else {
          return priceNgnRaw;
        }
      }
    }
  } catch (error: any) {
    console.warn(`⚠️ Error fetching app rate for ETH:`, error.message);
  }
  return FALLBACK_ETH_PRICE_NGN;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Alchemy Ethereum API URL (prefer full URL secret; fallback to API key secret)
    const alchemyUrl =
      Deno.env.get('ALCHEMY_ETHEREUM_URL') ||
      (Deno.env.get('ALCHEMY_API_KEY')
        ? `https://eth-mainnet.g.alchemy.com/v2/${Deno.env.get('ALCHEMY_API_KEY')}`
        : '');
    if (!alchemyUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing ALCHEMY_ETHEREUM_URL or ALCHEMY_API_KEY secret' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get all active Ethereum wallet addresses
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

    console.log(`🔍 Monitoring ${wallets.length} Ethereum addresses for deposits...`);

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

    // Check each wallet for new deposits
    for (const wallet of wallets) {
      try {
        results.checked++;
        
        // Get asset transfers (native ETH)
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
              category: ['external'],
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
          // Only process native ETH transfers (not ERC-20 tokens)
          if (transfer.asset !== 'ETH' || transfer.category !== 'external') continue;

          const txHash = transfer.hash;
          const { amountEth, amountWei } = parseEthTransfer(transfer);
          const blockNumber = parseInt(transfer.blockNum || '0', 16);
          const confirmations = latestBlockNumber - blockNumber;

          if (amountEth <= 0) continue;

          // Check if transaction already exists
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id, status, confirmations, metadata')
            .eq('transaction_hash', txHash.toLowerCase())
            .eq('user_id', wallet.user_id)
            .eq('crypto_currency', 'ETH')
            .maybeSingle();

          let status: 'PENDING' | 'CONFIRMING' | 'CONFIRMED' = 'PENDING';
          if (confirmations >= MIN_CONFIRMATIONS) {
            status = 'CONFIRMED';
          } else if (confirmations > 0) {
            status = 'CONFIRMING';
          }

          if (!existingTx) {
            // Get ETH price in NGN to calculate fiat amount
            const ethPriceNgn = await getEthPriceNgn(supabase);
            const fiatAmountNgn = amountEth * ethPriceNgn;

            // Record transaction
            const { data: insertedTx, error: insertError } = await supabase
              .from('transactions')
              .insert({
                user_id: wallet.user_id,
                transaction_type: 'RECEIVE',
                crypto_currency: 'ETH',
                crypto_amount: amountEth,
                fiat_amount: fiatAmountNgn,
                fiat_currency: 'NGN',
                status: status,
                to_address: wallet.address.toLowerCase(),
                from_address: transfer.from?.toLowerCase() || 'unknown',
                transaction_hash: txHash.toLowerCase(),
                block_number: blockNumber,
                confirmations: confirmations,
                metadata: {
                  detected_at: new Date().toISOString(),
                  value_wei: amountWei.toString(),
                  price_per_eth_ngn: ethPriceNgn,
                  price_source: 'app_rate',
                  credited: false,
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
            console.log(`✅ New ETH deposit detected: ${amountEth} ETH (${confirmations} confirmations)`);

            // Auto-credit when confirmed (idempotent)
            if (status === 'CONFIRMED') {
              const meta = insertedTx?.metadata || {};
              if (meta.credited !== true) {
                const { error: creditError } = await supabase.rpc('credit_crypto_wallet', {
                  p_user_id: wallet.user_id,
                  p_amount: amountEth,
                  p_currency: 'ETH',
                });
                if (creditError) {
                  console.error('❌ Error crediting ETH wallet:', creditError);
                  results.errors.push(`Credit ETH failed for ${txHash}`);
                } else {
                  const updatedMeta = {
                    ...meta,
                    credited: true,
                    credited_at: new Date().toISOString(),
                    credited_amount: amountEth,
                    credited_currency: 'ETH',
                  };
                  await supabase.from('transactions').update({ metadata: updatedMeta }).eq('id', insertedTx.id);
                  console.log(`✅ Credited ETH wallet for ${wallet.user_id} (${amountEth} ETH)`);
                }
              }
            }

            // Send notification
            await sendCryptoDepositNotification({
              supabase,
              userId: wallet.user_id,
              cryptoCurrency: 'ETH',
              amount: amountEth,
              transactionHash: txHash.toLowerCase(),
              confirmations: confirmations,
              status: status,
            });
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

            // Auto-credit when it flips to CONFIRMED (idempotent)
            if (status === 'CONFIRMED') {
              const meta = existingTx.metadata || {};
              if (meta.credited !== true) {
                const { error: creditError } = await supabase.rpc('credit_crypto_wallet', {
                  p_user_id: wallet.user_id,
                  p_amount: amountEth,
                  p_currency: 'ETH',
                });
                if (creditError) {
                  console.error('❌ Error crediting ETH wallet:', creditError);
                  results.errors.push(`Credit ETH failed for ${txHash}`);
                } else {
                  const updatedMeta = {
                    ...meta,
                    credited: true,
                    credited_at: new Date().toISOString(),
                    credited_amount: amountEth,
                    credited_currency: 'ETH',
                  };
                  await supabase.from('transactions').update({ metadata: updatedMeta }).eq('id', existingTx.id);
                  console.log(`✅ Credited ETH wallet for ${wallet.user_id} (${amountEth} ETH)`);
                }
              }
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
    console.error('Error detecting Ethereum deposits:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
