/**
 * Recalculate NGN amounts for ALL SOL RECEIVE transactions
 * This ensures all amounts are correctly in NGN (not USD)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const USD_TO_NGN_RATE = 1650;

/**
 * Get current SOL price in NGN
 * Always ensures price is in NGN (converts from USD if needed)
 */
async function getSolPriceNgn() {
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
        const priceNgn = priceUsd * USD_TO_NGN_RATE;
        console.log(`✅ Converting USD price to NGN: ₦${priceNgn.toFixed(2)} (${priceUsd} USD × ${USD_TO_NGN_RATE} NGN/USD)`);
        return priceNgn;
      } else if (priceNgnRaw > 0) {
        // Only NGN price available, use directly
        console.log(`✅ Using app rate for SOL: ₦${priceNgnRaw.toFixed(2)} per SOL`);
        return priceNgnRaw;
      }
    }
  } catch (error) {
    console.warn(`⚠️ Error fetching app rate for SOL:`, error.message);
  }

  // Fallback to default price (already in NGN)
  console.warn(`⚠️ No SOL price available (use pricing engine)`);
  return 0;
}

async function recalculateNgnForSolDeposits() {
  try {
    console.log('🔍 Finding ALL SOL RECEIVE transactions to recalculate NGN amounts...\n');

    // Get SOL price
    const solPriceNgn = await getSolPriceNgn();
    console.log(`\n💰 Using SOL price: ₦${solPriceNgn.toFixed(2)} per SOL\n`);

    // Find ALL SOL RECEIVE transactions (including those that already have fiat_amount)
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('id, user_id, crypto_amount, fiat_amount, fiat_currency, transaction_hash, created_at, metadata')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'RECEIVE')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (txError) {
      throw txError;
    }

    if (!transactions || transactions.length === 0) {
      console.log('✅ No SOL RECEIVE transactions found');
      return;
    }

    console.log(`Found ${transactions.length} SOL RECEIVE transactions\n`);

    let fixed = 0;
    let skipped = 0;
    let errors = 0;

    for (const tx of transactions) {
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      
      if (cryptoAmount <= 0) {
        console.log(`⏭️  Skipping transaction ${tx.id.substring(0, 8)}... (zero or invalid crypto_amount)`);
        skipped++;
        continue;
      }

      // Calculate correct NGN amount
      const correctFiatAmountNgn = cryptoAmount * solPriceNgn;
      const currentFiatAmount = tx.fiat_amount ? parseFloat(tx.fiat_amount) : null;
      const currentFiatCurrency = tx.fiat_currency || null;

      // Check if update is needed
      const needsUpdate = 
        !currentFiatAmount || 
        currentFiatCurrency !== 'NGN' ||
        Math.abs(currentFiatAmount - correctFiatAmountNgn) > 0.01; // Allow small rounding differences

      if (!needsUpdate) {
        console.log(`⏭️  Skipping transaction ${tx.transaction_hash?.substring(0, 16)}... (already correct)`);
        skipped++;
        continue;
      }

      console.log(`\n📊 Transaction: ${tx.transaction_hash?.substring(0, 16)}...`);
      console.log(`   Crypto Amount: ${cryptoAmount.toFixed(9)} SOL`);
      if (currentFiatAmount) {
        console.log(`   Current NGN Amount: ₦${currentFiatAmount.toFixed(2)} (${currentFiatCurrency || 'unknown currency'})`);
      } else {
        console.log(`   Current NGN Amount: Not set`);
      }
      console.log(`   Correct NGN Amount: ₦${correctFiatAmountNgn.toFixed(2)}`);

      // Update transaction
      const updateData = {
        fiat_amount: correctFiatAmountNgn.toFixed(2),
        fiat_currency: 'NGN',
        metadata: {
          ...(tx.metadata || {}),
          price_per_sol_ngn: solPriceNgn,
          price_source: 'recalculation_script',
          ngn_amount_recalculated_at: new Date().toISOString(),
          previous_fiat_amount: currentFiatAmount,
          previous_fiat_currency: currentFiatCurrency,
        },
      };

      const { error: updateError } = await supabase
        .from('transactions')
        .update(updateData)
        .eq('id', tx.id);

      if (updateError) {
        console.error(`   ❌ Failed to update:`, updateError.message);
        errors++;
      } else {
        console.log(`   ✅ Updated successfully`);
        fixed++;
      }
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   ✅ Fixed: ${fixed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`\n✅ Done!`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

recalculateNgnForSolDeposits().catch(console.error);
