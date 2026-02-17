// Detect XRP Deposits Edge Function
// Monitors XRP addresses for incoming XRP deposits

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoDepositNotification } from "../_shared/send-crypto-deposit-notification.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Minimum confirmations required for XRP (typically ledger validated)
const MIN_LEDGERS = 1; // XRP transactions are considered final after 1 ledger

// Fallback price for XRP in NGN
const FALLBACK_XRP_PRICE_NGN = 1000; // ~$0.60 * 1650

/**
 * Get current XRP price in NGN
 */
async function getXrpPriceNgn(supabase: SupabaseClient): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('crypto_rates')
      .select('price_usd, price_ngn, is_active')
      .eq('crypto_symbol', 'XRP')
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
    console.warn(`⚠️ Error fetching app rate for XRP:`, error.message);
  }
  return FALLBACK_XRP_PRICE_NGN;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // XRP Ledger API endpoint (using public Ripple API)
    const xrpApiUrl = 'https://xrplcluster.com';

    // Get all active XRP wallet addresses
    const { data: wallets, error: walletsError } = await supabase
      .from('crypto_wallets')
      .select('id, user_id, address')
      .eq('asset', 'XRP')
      .eq('network', 'mainnet')
      .eq('is_active', true);

    if (walletsError || !wallets) {
      console.error('Error fetching wallets:', walletsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch wallets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Monitoring ${wallets.length} XRP addresses for deposits...`);

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
        
        // Get account transactions using XRP Ledger API
        const response = await fetch(xrpApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'account_tx',
            params: [{
              account: wallet.address,
              ledger_index_min: -1,
              ledger_index_max: -1,
              limit: 50,
            }],
          }),
        });

        if (!response.ok) {
          throw new Error(`XRP API error: ${response.status}`);
        }

        const data = await response.json();
        const transactions = data.result?.transactions || [];

        // Process each transaction
        for (const txInfo of transactions) {
          const tx = txInfo.tx;
          const meta = txInfo.meta;

          // Only process Payment transactions
          if (tx.TransactionType !== 'Payment') continue;

          // Check if this is a deposit (Destination matches our wallet)
          if (tx.Destination !== wallet.address) continue;

          // Calculate amount (XRP is in drops, 1 XRP = 1,000,000 drops)
          const amountDrops = tx.Amount;
          const amountXrp = typeof amountDrops === 'string' 
            ? parseFloat(amountDrops) / 1e6 
            : amountDrops / 1e6;

          if (amountXrp <= 0) continue;

          const txHash = tx.hash;
          const ledgerIndex = tx.ledger_index || meta?.ledger_index || 0;
          const validated = meta?.TransactionResult === 'tesSUCCESS';

          // Check if transaction already exists
          const { data: existingTx } = await supabase
            .from('transactions')
            .select('id, status, confirmations, metadata')
            .eq('transaction_hash', txHash.toLowerCase())
            .eq('user_id', wallet.user_id)
            .eq('crypto_currency', 'XRP')
            .maybeSingle();

          let status: 'PENDING' | 'CONFIRMING' | 'CONFIRMED' = 'PENDING';
          let confirmations = 0;

          if (validated) {
            status = 'CONFIRMED';
            confirmations = MIN_LEDGERS;
          }

          if (!existingTx) {
            // Get XRP price in NGN to calculate fiat amount
            const xrpPriceNgn = await getXrpPriceNgn(supabase);
            const fiatAmountNgn = amountXrp * xrpPriceNgn;

            // Record transaction
            const { data: insertedTx, error: insertError } = await supabase
              .from('transactions')
              .insert({
                user_id: wallet.user_id,
                transaction_type: 'RECEIVE',
                crypto_currency: 'XRP',
                crypto_amount: amountXrp,
                fiat_amount: fiatAmountNgn,
                fiat_currency: 'NGN',
                status: status,
                to_address: wallet.address,
                from_address: tx.Account || 'unknown',
                transaction_hash: txHash.toLowerCase(),
                block_number: ledgerIndex,
                confirmations: confirmations,
                metadata: {
                  detected_at: new Date().toISOString(),
                  validated: validated,
                  transaction_type: tx.TransactionType,
                  price_per_xrp_ngn: xrpPriceNgn,
                  price_source: 'app_rate',
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
            console.log(`✅ New XRP deposit detected and recorded: ${amountXrp} XRP (validated: ${validated})`);

            // STEP 3: Send notification AFTER conversion and recording
            try {
              await sendCryptoDepositNotification({
                supabase,
                userId: wallet.user_id,
                cryptoCurrency: 'XRP',
                amount: amountXrp,
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
                block_number: ledgerIndex,
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
    console.error('Error detecting XRP deposits:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
