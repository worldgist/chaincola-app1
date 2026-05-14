// Instant Sell Crypto V2 - Following exact specification
// POST /api/sell
// Atomic internal ledger swap system

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendCryptoSellNotification } from "../_shared/send-crypto-sell-notification.ts";
import {
  DEFAULT_MIN_SYSTEM_RESERVE_NGN,
  parseMinSystemReserveFromAdditionalSettings,
  parseMinSystemReserveFromEnv,
} from "../_shared/min-system-reserve-ngn.ts";
import {
  STATIC_NGN_RATES_PER_UNIT,
  fetchCryptoPriceRow,
  resolveSellNgnPerUnit,
} from "../_shared/ngn-rate-from-crypto-prices.ts";
import { evaluateInstantSell } from "../_shared/treasury-trade-gates.ts";
import {
  getInstantSellOnChainTransferPlan,
  mergeInstantSellOnChainIntoTransaction,
} from "../_shared/instant-sell-onchain-transfer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_FEE_PERCENTAGE = 0.01; // 1% default - overridden by admin app_settings

/** Minimum plausible NGN per 1 coin (sell bid). Below this, treat feed as bad and use static. */
const MIN_SANE_SELL_RATE_NGN: Record<string, number> = {
  BTC: 5_000_000,
  ETH: 200_000,
  USDT: 500,
  USDC: 500,
  XRP: 20,
  SOL: 5_000,
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { asset, amount } = body;

    // Validate request
    if (!asset || amount === undefined || amount === null) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: asset, amount' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cryptoAmount = parseFloat(amount);
    const assetUpper = asset.toUpperCase();

    // Validate asset
    const supportedAssets = ['BTC', 'ETH', 'USDT', 'USDC', 'XRP', 'SOL'];
    if (!supportedAssets.includes(assetUpper)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Unsupported asset: ${asset}. Supported: ${supportedAssets.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate amount
    if (isNaN(cryptoAmount) || cryptoAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid amount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sellEval = await evaluateInstantSell(supabase, assetUpper, corsHeaders, cryptoAmount);
    if (!sellEval.ok) return sellEval.response;
    const effectiveMaxSell = sellEval.effectiveMaxSell;

    console.log(`💰 Instant sell request: User=${user.id}, Asset=${assetUpper}, Amount=${cryptoAmount}`);

    const priceRow = await fetchCryptoPriceRow(supabase, assetUpper);
    const resolvedSell = resolveSellNgnPerUnit(priceRow, assetUpper);
    let rate = resolvedSell.rate;
    let rateSource = resolvedSell.source;
    console.log(`📊 Sell rate for ${assetUpper}: ₦${rate.toFixed(2)} / unit (${rateSource})`);

    const floor = MIN_SANE_SELL_RATE_NGN[assetUpper];
    const staticRate = STATIC_NGN_RATES_PER_UNIT[assetUpper];
    if (floor != null && rate > 0 && rate < floor && staticRate != null && staticRate > 0) {
      console.warn(
        `⚠️ Sell rate ₦${rate} for ${assetUpper} is below sanity minimum ₦${floor} (bad feed?). Using static fallback ₦${staticRate}.`,
      );
      rate = staticRate;
      rateSource = "static";
    }

    if (!rate || rate <= 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Unable to fetch current price. Please try again.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Final sell rate (${rateSource}): 1 ${assetUpper} = ₦${rate.toFixed(2)}`);

    // Get platform fee % + minimum system NGN float from app_settings / env
    let feePercentage = DEFAULT_FEE_PERCENTAGE;
    let minSystemReserveNgn = DEFAULT_MIN_SYSTEM_RESERVE_NGN;
    try {
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('transaction_fee_percentage, additional_settings')
        .eq('id', 1)
        .single();
      if (appSettings?.transaction_fee_percentage != null) {
        const pct = parseFloat(appSettings.transaction_fee_percentage.toString());
        if (!isNaN(pct) && pct >= 0 && pct <= 100) {
          feePercentage = pct / 100; // Convert 1 to 0.01 (1% = 1 in DB)
        }
      }
      const fromRisk = parseMinSystemReserveFromAdditionalSettings(appSettings?.additional_settings);
      if (fromRisk !== null) minSystemReserveNgn = fromRisk;
    } catch (e) {
      console.warn('⚠️ Could not fetch app_settings fee / risk reserve, using defaults');
    }
    const envReserve = parseMinSystemReserveFromEnv();
    const pMinSystemReserve = envReserve !== null ? envReserve : minSystemReserveNgn;
    console.log(`📊 Platform fee: ${(feePercentage * 100).toFixed(2)}%`);

    // Call atomic sell RPC: validates balance, reserves amount on wallet_balances.locked (row locks),
    // then credits NGN and books crypto into system_wallets (treasury) in one transaction.
    // Formula: NGN_before_fee = crypto_amount × rate; fee = NGN_before_fee × fee%; credit = NGN_before_fee - fee
    const { data: sellResult, error: sellError } = await supabase.rpc('instant_sell_crypto_v2', {
      p_user_id: user.id,
      p_asset: assetUpper,
      p_amount: cryptoAmount,
      p_rate: rate,
      p_fee_percentage: feePercentage,
      p_max_sell_per_transaction: effectiveMaxSell > 0 ? effectiveMaxSell : null,
      p_min_system_reserve: pMinSystemReserve,
    });

    if (sellError) {
      console.error('❌ Instant sell error:', sellError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: sellError.message || 'Failed to execute sell' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!sellResult || sellResult.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No result from sell function' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = sellResult[0];

    if (!result.success) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.error_message || 'Sell failed' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Instant sell successful: ${cryptoAmount} ${assetUpper} → ₦${result.ngn_amount.toFixed(2)}`);
    console.log(`📊 Treasury booked (pending consumed first, remainder to ${assetUpper} inventory per RPC)`);
    console.log(`💰 System NGN float decreased by ₦${result.ngn_amount.toFixed(2)}`);

    // Ledger leg is atomic in instant_sell_crypto_v2; on-chain custody context is attached below.
    const balances = result.new_balances as Record<string, unknown> | null | undefined;
    const transactionId =
      balances && typeof balances.transaction_id === "string"
        ? balances.transaction_id
        : balances && typeof balances.transaction_id !== "undefined"
        ? String(balances.transaction_id)
        : null;

    const onChainPlan = await getInstantSellOnChainTransferPlan(supabase, {
      userId: user.id,
      asset: assetUpper,
      amountCrypto: cryptoAmount,
    });

    let transactionMetadataOnChainUpdated = false;
    if (transactionId) {
      const mergeRes = await mergeInstantSellOnChainIntoTransaction(
        supabase,
        transactionId,
        onChainPlan,
      );
      transactionMetadataOnChainUpdated = mergeRes.ok;
      if (!mergeRes.ok) {
        console.warn("⚠️ Could not merge on-chain plan into transaction metadata:", mergeRes.error);
      }
    } else {
      console.warn("⚠️ instant_sell_crypto_v2 returned no transaction_id in new_balances; run migration 20260518120000");
    }

    // Send push notification
    try {
      await sendCryptoSellNotification({
        supabase,
        userId: user.id,
        cryptoCurrency: assetUpper,
        cryptoAmount: cryptoAmount,
        ngnAmount: result.ngn_amount,
        transactionHash: `instant_sell_${Date.now()}`,
        status: 'COMPLETED',
      });
    } catch (notifError) {
      console.error('⚠️ Failed to send sell notification:', notifError);
      // Don't fail the whole operation if notification fails
    }

    // Return success response (single atomic DB transaction: lock reserve → NGN credit → treasury book → release lock)
    return new Response(
      JSON.stringify({
        success: true,
        ngn_amount: result.ngn_amount,
        new_balances: result.new_balances,
        instant_settlement: {
          ngn_credited_immediately: true,
          user_balances_updated_immediately: true,
          system_treasury_booked_immediately: true,
          ledger_steps: [
            "row_lock_user_wallets",
            "row_lock_wallet_balances_asset",
            "row_lock_system_wallets",
            "reserve_sell_amount_on_wallet_balances_locked",
            "debit_user_crypto_credit_user_ngn",
            "book_crypto_to_system_wallets_pending_then_inventory",
            "release_wallet_balances_locked_reserve",
          ],
          atomic_single_transaction: true,
          on_chain_transfer: {
            ledger_instant_complete: true,
            custody_sweep: {
              status: "documented",
              plan: onChainPlan,
              transaction_row_metadata_merged: transactionMetadataOnChainUpdated,
              blockchain_broadcast_from_this_edge_function: false,
              explanation:
                "NGN and ledger treasury update are immediate. Moving coins on-chain from the user's deposit address to treasury main addresses is a separate sweep (auto-sweep-engine or send-* functions); see plan.sweep_recommended_functions.",
            },
          },
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error('❌ Instant sell exception:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
