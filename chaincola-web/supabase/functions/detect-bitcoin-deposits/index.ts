// Detect Bitcoin Deposits — Tatum Bitcoin mainnet gateway (incoming txs). Requires TATUM_API_KEY secret.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoDepositNotification } from "../_shared/send-crypto-deposit-notification.ts";
import {
  getTatumApiKey,
  getTatumApiKeyMissingMessage,
  tatumBtcCurrentBlockHeight,
  tatumBtcIncomingTransactions,
  tatumConfirmations,
  incomingBtcAmount,
} from "../_shared/tatum-bitcoin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_CONFIRMATIONS = 6;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!getTatumApiKey()) {
      console.error(getTatumApiKeyMissingMessage());
      return new Response(
        JSON.stringify({ success: false, error: getTatumApiKeyMissingMessage() }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: wallets, error: walletsError } = await supabase
      .from("crypto_wallets")
      .select("id, user_id, address")
      .eq("asset", "BTC")
      .eq("network", "mainnet")
      .eq("is_active", true);

    if (walletsError || !wallets) {
      console.error("Error fetching wallets:", walletsError);
      return new Response(JSON.stringify({ success: false, error: "Failed to fetch wallets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tip = await tatumBtcCurrentBlockHeight();
    console.log(`🔗 Tatum BTC tip height: ${tip}; monitoring ${wallets.length} addresses`);

    const results = {
      checked: 0,
      depositsFound: 0,
      depositsCredited: 0,
      errors: [] as string[],
    };

    for (const wallet of wallets) {
      try {
        results.checked++;
        const txs = await tatumBtcIncomingTransactions(wallet.address, 50, 0);

        for (const tx of txs) {
          const txHash = (tx.hash || "").trim();
          if (!txHash) continue;

          const amountBtc = incomingBtcAmount(tx, wallet.address);
          if (amountBtc <= 0) continue;

          const blockNum =
            tx.blockNumber != null && typeof tx.blockNumber === "number" ? tx.blockNumber : null;
          const confirmations = tatumConfirmations(blockNum, tip);

          let status: "PENDING" | "CONFIRMING" | "CONFIRMED" = "PENDING";
          if (confirmations >= MIN_CONFIRMATIONS) status = "CONFIRMED";
          else if (confirmations > 0) status = "CONFIRMING";

          const { data: existingTx } = await supabase
            .from("transactions")
            .select("id, status, confirmations, metadata")
            .eq("transaction_hash", txHash.toLowerCase())
            .eq("user_id", wallet.user_id)
            .eq("crypto_currency", "BTC")
            .maybeSingle();

          if (!existingTx) {
            const { error: insertError } = await supabase.from("transactions").insert({
              user_id: wallet.user_id,
              transaction_type: "RECEIVE",
              crypto_currency: "BTC",
              crypto_amount: amountBtc,
              status,
              to_address: wallet.address,
              transaction_hash: txHash.toLowerCase(),
              block_number: blockNum ?? 0,
              confirmations,
              metadata: {
                detected_at: new Date().toISOString(),
                source: "tatum_bitcoin_gateway",
              },
            });

            if (insertError) {
              console.error(`Error inserting transaction ${txHash}:`, insertError);
              results.errors.push(`Failed to insert transaction ${txHash}`);
              continue;
            }

            results.depositsFound++;
            results.depositsCredited++;
            console.log(`✅ New BTC deposit: ${amountBtc} BTC (${confirmations} conf)`);

            try {
              await sendCryptoDepositNotification({
                supabase,
                userId: wallet.user_id,
                cryptoCurrency: "BTC",
                amount: amountBtc,
                transactionHash: txHash.toLowerCase(),
                confirmations,
                status,
              });
            } catch (notifError: unknown) {
              console.error(`⚠️ Notification failed:`, notifError);
            }
          } else {
            const needsUpdate =
              existingTx.status !== status || Number(existingTx.confirmations) !== confirmations;
            if (needsUpdate) {
              await supabase
                .from("transactions")
                .update({
                  status,
                  confirmations,
                  block_number: blockNum ?? 0,
                })
                .eq("id", existingTx.id);
            }
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Error processing wallet ${wallet.address}:`, msg);
        results.errors.push(`Wallet ${wallet.address}: ${msg}`);
      }
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("detect-bitcoin-deposits:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
