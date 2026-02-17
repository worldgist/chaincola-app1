/**
 * Shared utility function to auto-convert crypto deposits to NGN
 * 
 * IMPORTANT: This function uses DATABASE balances exclusively (wallet_balances table).
 * It does NOT check on-chain balances - all balance operations use the database.
 * 
 * This function:
 * 1. Gets current market price (checks app rates first, then Luno API)
 * 2. Calculates NGN amount (with platform fee deduction)
 * 3. Credits NGN balance to database (wallet_balances table) - does NOT credit crypto balance
 * 4. Creates transaction record for the conversion
 * 5. Sends notification to user
 * 
 * @param supabase - Supabase client instance
 * @param userId - User ID
 * @param cryptoCurrency - Crypto currency symbol (BTC, ETH, USDT, USDC, XRP, SOL)
 * @param cryptoAmount - Amount of crypto received (from deposit detection)
 * @param transactionHash - Blockchain transaction hash
 * @param sourceTransactionId - ID of the source RECEIVE transaction
 * @param skipNotification - Whether to skip sending notification (default: false)
 * @returns Promise with success status and conversion details
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { creditNgnBalance } from "./credit-ngn-balance.ts";

// Luno API base URL
const LUNO_API_BASE = 'https://api.luno.com';

// Mapping from crypto symbols to Luno currency pairs
const LUNO_PAIRS: Record<string, string> = {
  BTC: 'XBTNGN',  // Bitcoin/NGN (Luno uses XBT for Bitcoin)
  ETH: 'ETHNGN',  // Ethereum/NGN
  USDT: 'USDTNGN', // Tether/NGN
  USDC: 'USDCNGN', // USD Coin/NGN
  XRP: 'XRPNGN',  // Ripple/NGN
  // SOL is not available on Luno, will use fallback price
};

// Fallback prices in NGN (used when Luno doesn't have the pair or API fails)
const FALLBACK_PRICES: Record<string, number> = {
  BTC: 95000000,  // ~$57,500 * 1650
  ETH: 3500000,   // ~$2,100 * 1650
  USDT: 1650,     // 1:1 with USD * 1650
  USDC: 1650,     // 1:1 with USD * 1650
  XRP: 1000,      // ~$0.60 * 1650
};

// Platform fee percentage (3%)
const PLATFORM_FEE_PERCENTAGE = 0.03;

interface ConversionResult {
  success: boolean;
  cryptoCurrency: string;
  cryptoAmount: number;
  pricePerUnit: number;
  totalNgnBeforeFee: number;
  platformFee: number;
  ngnCredited: number;
  error?: string;
  priceSource?: 'app_rate' | 'luno_api' | 'fallback';
}

/**
 * Get app rate from crypto_rates table (if active)
 * IMPORTANT: If price_ngn looks like a USD-to-NGN exchange rate (around 1400-1500),
 * multiply by price_usd to get the actual price per coin in NGN
 */
async function getAppRate(
  supabase: SupabaseClient,
  cryptoCurrency: string
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('crypto_rates')
      .select('price_usd, price_ngn, is_active')
      .eq('crypto_symbol', cryptoCurrency.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    const priceUsd = parseFloat(data.price_usd?.toString() || '0');
    const priceNgnRaw = parseFloat(data.price_ngn.toString());
    
    if (priceNgnRaw <= 0) {
      return null;
    }

    // Check if price_ngn looks like a USD-to-NGN exchange rate (typically 1400-1500)
    // If price_ngn is in the exchange rate range (1000-2000), treat it as exchange rate
    // and multiply by price_usd to get actual price per coin in NGN
    // Exception: For stablecoins (USDT/USDC), if price_usd = 1, then price_ngn is already correct
    let priceNgn = priceNgnRaw;
    
    // Check if price_ngn is in the USD-to-NGN exchange rate range
    const isExchangeRateRange = priceNgnRaw >= 1000 && priceNgnRaw <= 2000;
    
    // For non-stablecoins (BTC, ETH, SOL, XRP), if price_ngn looks like exchange rate, multiply by price_usd
    // For stablecoins (USDT, USDC), if price_usd = 1, price_ngn is already correct (1 USD = price_ngn NGN)
    const isStablecoin = cryptoCurrency.toUpperCase() === 'USDT' || cryptoCurrency.toUpperCase() === 'USDC';
    
    if (isExchangeRateRange && !isStablecoin) {
      // Non-stablecoin with exchange rate - calculate actual price per coin
      // Multiply by price_usd (even if price_usd = 1, though that would indicate incorrect admin data)
      priceNgn = priceUsd * priceNgnRaw;
      if (priceUsd > 1) {
        console.log(`✅ Using app rate for ${cryptoCurrency}: ₦${priceNgn.toFixed(2)} (calculated from ${priceUsd} USD × ${priceNgnRaw} NGN/USD exchange rate)`);
      } else {
        console.log(`⚠️ Using app rate for ${cryptoCurrency}: ₦${priceNgn.toFixed(2)} (price_usd=${priceUsd} seems incorrect, but treating ${priceNgnRaw} as exchange rate)`);
      }
    } else if (isExchangeRateRange && isStablecoin && priceUsd === 1) {
      // Stablecoin: 1 USD = price_ngn NGN (already correct)
      console.log(`✅ Using app rate for ${cryptoCurrency}: ₦${priceNgn.toFixed(2)} per coin (1 USD = ${priceNgnRaw} NGN)`);
    } else {
      // Use price_ngn directly (assumed to be price per coin)
      console.log(`✅ Using app rate for ${cryptoCurrency}: ₦${priceNgn.toFixed(2)} per coin`);
    }
    
    return priceNgn;
  } catch (error: any) {
    console.error(`⚠️ Error fetching app rate for ${cryptoCurrency}:`, error.message);
    return null;
  }
}

/**
 * Get current price - checks app rates first, then Luno API, then fallback
 */
async function getPrice(
  supabase: SupabaseClient,
  cryptoCurrency: string
): Promise<{ price: number; source: 'app_rate' | 'luno_api' | 'fallback' }> {
  // Step 1: Check app rate first (highest priority)
  const appRate = await getAppRate(supabase, cryptoCurrency);
  if (appRate !== null && appRate > 0) {
    return { price: appRate, source: 'app_rate' };
  }

  // Step 2: Try Luno API
  const pair = LUNO_PAIRS[cryptoCurrency];
  
  if (!pair) {
    console.log(`⚠️ No Luno pair for ${cryptoCurrency}, using fallback price`);
    return { price: FALLBACK_PRICES[cryptoCurrency] || 0, source: 'fallback' };
  }

  try {
    const response = await fetch(`${LUNO_API_BASE}/api/1/ticker?pair=${pair}`);
    
    if (!response.ok) {
      console.warn(`⚠️ Luno API error for ${cryptoCurrency}: ${response.status}, using fallback`);
      return { price: FALLBACK_PRICES[cryptoCurrency] || 0, source: 'fallback' };
    }

    const data = await response.json();
    const price = parseFloat(data.last_trade || data.bid || '0');
    
    if (price > 0) {
      console.log(`✅ Got ${cryptoCurrency} price from Luno: ₦${price.toFixed(2)}`);
      return { price, source: 'luno_api' };
    }
    
    console.warn(`⚠️ Invalid price from Luno for ${cryptoCurrency}, using fallback`);
    return { price: FALLBACK_PRICES[cryptoCurrency] || 0, source: 'fallback' };
  } catch (error: any) {
    console.error(`❌ Error fetching Luno price for ${cryptoCurrency}:`, error.message);
    return { price: FALLBACK_PRICES[cryptoCurrency] || 0, source: 'fallback' };
  }
}

/**
 * Get user's crypto balance from database (wallet_balances table)
 */
async function getDatabaseBalance(
  supabase: SupabaseClient,
  userId: string,
  cryptoCurrency: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', cryptoCurrency.toUpperCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn(`⚠️ Error fetching ${cryptoCurrency} balance from database:`, error.message);
      return 0;
    }

    if (!data) {
      return 0;
    }

    return parseFloat(data.balance?.toString() || '0') || 0;
  } catch (error: any) {
    console.warn(`⚠️ Exception fetching ${cryptoCurrency} balance from database:`, error.message);
    return 0;
  }
}

/**
 * Auto-convert crypto deposit to NGN
 * Uses database balances exclusively (wallet_balances table)
 */
export async function autoConvertCryptoToNgn(
  supabase: SupabaseClient,
  userId: string,
  cryptoCurrency: string,
  cryptoAmount: number,
  transactionHash: string,
  sourceTransactionId?: string,
  skipNotification: boolean = false
): Promise<ConversionResult> {
  try {
    console.log(`🔄 Auto-converting ${cryptoAmount} ${cryptoCurrency} to NGN for user ${userId}`);

    // Validate inputs
    if (!cryptoCurrency || cryptoAmount <= 0) {
      throw new Error('Invalid crypto currency or amount');
    }

    // Get current database balance (for logging/reference only)
    const currentDbBalance = await getDatabaseBalance(supabase, userId, cryptoCurrency);
    console.log(`📊 Current ${cryptoCurrency} balance in database: ${currentDbBalance.toFixed(8)}`);

    // Get current market price (checks app rates first, then Luno API, then fallback)
    const { price: pricePerUnit, source: priceSource } = await getPrice(
      supabase,
      cryptoCurrency.toUpperCase()
    );
    
    if (pricePerUnit <= 0) {
      throw new Error(`Unable to get price for ${cryptoCurrency}`);
    }

    console.log(`💰 Price source: ${priceSource}`);

    // Calculate NGN amounts
    const totalNgnBeforeFee = cryptoAmount * pricePerUnit;
    const platformFee = totalNgnBeforeFee * PLATFORM_FEE_PERCENTAGE;
    const ngnCredited = totalNgnBeforeFee - platformFee;

    console.log(`📊 Conversion calculation:`);
    console.log(`   Crypto: ${cryptoAmount} ${cryptoCurrency}`);
    console.log(`   Price: ₦${pricePerUnit.toFixed(2)} per ${cryptoCurrency}`);
    console.log(`   Total NGN: ₦${totalNgnBeforeFee.toFixed(2)}`);
    console.log(`   Platform Fee (${(PLATFORM_FEE_PERCENTAGE * 100).toFixed(1)}%): ₦${platformFee.toFixed(2)}`);
    console.log(`   NGN to Credit: ₦${ngnCredited.toFixed(2)}`);

    // Credit NGN balance
    const creditResult = await creditNgnBalance(supabase, userId, ngnCredited);
    
    if (!creditResult.success) {
      throw new Error(creditResult.error || 'Failed to credit NGN balance');
    }

    // Create conversion transaction record
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        transaction_type: 'CONVERT',
        crypto_currency: cryptoCurrency.toUpperCase(),
        crypto_amount: cryptoAmount,
        fiat_currency: 'NGN',
        fiat_amount: ngnCredited,
        status: 'COMPLETED',
        transaction_hash: transactionHash,
        metadata: {
          auto_converted: true,
          source_transaction_id: sourceTransactionId,
          price_per_unit: pricePerUnit,
          price_source: priceSource, // Track where the price came from
          total_ngn_before_fee: totalNgnBeforeFee,
          platform_fee: platformFee,
          platform_fee_percentage: PLATFORM_FEE_PERCENTAGE,
          converted_at: new Date().toISOString(),
        },
      });

    if (txError) {
      console.error('⚠️ Failed to create conversion transaction record:', txError);
      // Don't fail the whole operation if transaction record fails
    }

    // Update source transaction metadata to indicate auto-conversion
    if (sourceTransactionId) {
      const { data: sourceTx } = await supabase
        .from('transactions')
        .select('metadata')
        .eq('id', sourceTransactionId)
        .single();

      if (sourceTx) {
        const metadata = sourceTx.metadata || {};
        await supabase
          .from('transactions')
          .update({
            metadata: {
              ...metadata,
              auto_converted_to_ngn: true,
              conversion_transaction_id: sourceTransactionId,
              ngn_credited: ngnCredited,
              converted_at: new Date().toISOString(),
            },
          })
          .eq('id', sourceTransactionId);
      }
    }

    // Send push notification (only if not skipped - deposit detection will send its own notification)
    if (!skipNotification) {
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: {
            user_id: userId,
            title: '💰 Crypto Auto-Converted',
            body: `${cryptoAmount} ${cryptoCurrency} automatically converted to ₦${ngnCredited.toFixed(2)}`,
          },
        });
      } catch (notifError) {
        console.error('⚠️ Failed to send notification (non-critical):', notifError);
      }
    }

    console.log(`✅ Successfully converted ${cryptoAmount} ${cryptoCurrency} to ₦${ngnCredited.toFixed(2)} NGN`);

    return {
      success: true,
      cryptoCurrency: cryptoCurrency.toUpperCase(),
      cryptoAmount,
      pricePerUnit,
      totalNgnBeforeFee,
      platformFee,
      ngnCredited,
      priceSource,
    };
  } catch (error: any) {
    console.error(`❌ Error auto-converting ${cryptoCurrency} to NGN:`, error);
    return {
      success: false,
      cryptoCurrency: cryptoCurrency.toUpperCase(),
      cryptoAmount,
      pricePerUnit: 0,
      totalNgnBeforeFee: 0,
      platformFee: 0,
      ngnCredited: 0,
      error: error.message || 'Failed to auto-convert crypto to NGN',
    };
  }
}
