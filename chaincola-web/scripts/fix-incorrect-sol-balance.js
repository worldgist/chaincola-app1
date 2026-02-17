/**
 * Fix Incorrect SOL Balance
 * 
 * This script finds and corrects SOL balances that were incorrectly credited
 * due to transactions being recorded with wrong fiat_currency (USD instead of NGN)
 * 
 * Usage:
 *   node scripts/fix-incorrect-sol-balance.js [user_id] [transaction_id]
 * 
 * If no arguments provided, it will find all BUY transactions with wrong fiat_currency
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Find incorrect BUY transactions (recorded as USD instead of NGN)
 */
async function findIncorrectTransactions(userId = null, transactionId = null) {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('transaction_type', 'BUY')
    .eq('crypto_currency', 'SOL')
    .eq('status', 'COMPLETED')
    .order('created_at', { ascending: false })
    .limit(100);

  if (transactionId) {
    query = query.eq('id', transactionId);
  } else if (userId) {
    query = query.eq('user_id', userId);
  } else {
    // Find transactions where fiat_currency is USD or NULL but should be NGN
    query = query.or('fiat_currency.is.null,fiat_currency.eq.USD');
  }

  const { data: transactions, error } = await query;

  if (error) {
    console.error('❌ Error fetching transactions:', error);
    return [];
  }

  return transactions || [];
}

/**
 * Calculate correct SOL amount based on NGN paid
 */
function calculateCorrectSolAmount(ngnAmount, solRate) {
  if (!ngnAmount || !solRate || solRate <= 0) {
    return null;
  }
  
  // Platform fee is 1%
  const fee = ngnAmount * 0.01;
  const amountAfterFee = ngnAmount - fee;
  const solAmount = amountAfterFee / solRate;
  
  return {
    ngnAmount: parseFloat(ngnAmount),
    fee: parseFloat(fee),
    amountAfterFee: parseFloat(amountAfterFee),
    solAmount: parseFloat(solAmount),
    rate: parseFloat(solRate)
  };
}

/**
 * Get current SOL rate in NGN
 */
async function getSolRate() {
  try {
    const { data: rateData, error } = await supabase
      .from('crypto_rates')
      .select('price_usd, price_ngn, is_active')
      .eq('crypto_symbol', 'SOL')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !rateData) return 0;

    const priceUsd = parseFloat(rateData.price_usd?.toString() || '0');
    const priceNgnRaw = parseFloat(rateData.price_ngn?.toString() || '0');
    
    // Check if price_ngn looks like exchange rate
    if (priceNgnRaw >= 1000 && priceNgnRaw <= 2000 && priceUsd > 0) {
      return priceNgnRaw * priceUsd;
    }
    
    return priceNgnRaw || 0;
  } catch (err) {
    console.warn('⚠️ Error fetching SOL rate:', err.message);
    return 0;
  }
}

/**
 * Fix SOL balance for a specific transaction
 */
async function fixSolBalance(transaction, correctSolAmount) {
  const userId = transaction.user_id;
  const incorrectSolAmount = parseFloat(transaction.crypto_amount || '0');
  const excessSol = incorrectSolAmount - correctSolAmount;

  console.log(`\n🔧 Fixing transaction: ${transaction.id}`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Incorrect SOL credited: ${incorrectSolAmount.toFixed(8)} SOL`);
  console.log(`   Correct SOL amount: ${correctSolAmount.toFixed(8)} SOL`);
  console.log(`   Excess SOL to debit: ${excessSol.toFixed(8)} SOL`);

  if (excessSol <= 0) {
    console.log(`   ⚠️ No excess SOL to debit`);
    return { success: false, reason: 'No excess to debit' };
  }

  // Get current balances
  const { data: userWallet, error: walletError } = await supabase
    .from('user_wallets')
    .select('sol_balance')
    .eq('user_id', userId)
    .single();

  const { data: walletBalance, error: balanceError } = await supabase
    .from('wallet_balances')
    .select('balance')
    .eq('user_id', userId)
    .eq('currency', 'SOL')
    .single();

  const currentSolBalance = parseFloat(userWallet?.sol_balance || walletBalance?.balance || '0');
  const newSolBalance = currentSolBalance - excessSol;

  console.log(`   Current SOL balance: ${currentSolBalance.toFixed(8)} SOL`);
  console.log(`   New SOL balance: ${newSolBalance.toFixed(8)} SOL`);

  if (newSolBalance < 0) {
    console.log(`   ❌ Cannot debit ${excessSol.toFixed(8)} SOL - would result in negative balance`);
    return { success: false, reason: 'Insufficient balance' };
  }

  try {
    // Update user_wallets
    const { error: updateWalletError } = await supabase
      .from('user_wallets')
      .update({
        sol_balance: newSolBalance.toFixed(8),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateWalletError) {
      console.error(`   ❌ Error updating user_wallets:`, updateWalletError);
      return { success: false, error: updateWalletError };
    }

    // Update wallet_balances
    const { error: updateBalanceError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'SOL',
        balance: newSolBalance.toFixed(8),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,currency'
      });

    if (updateBalanceError) {
      console.error(`   ❌ Error updating wallet_balances:`, updateBalanceError);
      return { success: false, error: updateBalanceError };
    }

    // Update the transaction record to correct fiat_currency
    const ngnAmount = parseFloat(transaction.fiat_amount || '0');
    const { error: updateTxError } = await supabase
      .from('transactions')
      .update({
        fiat_currency: 'NGN',
        crypto_amount: correctSolAmount.toFixed(8),
        metadata: {
          ...(transaction.metadata || {}),
          corrected: true,
          original_crypto_amount: incorrectSolAmount,
          correction_date: new Date().toISOString()
        }
      })
      .eq('id', transaction.id);

    if (updateTxError) {
      console.warn(`   ⚠️ Error updating transaction record:`, updateTxError);
    }

    // Create correction transaction record
    const { error: correctionTxError } = await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        transaction_type: 'ADJUSTMENT',
        crypto_currency: 'SOL',
        crypto_amount: -excessSol,
        fiat_amount: 0,
        fiat_currency: 'NGN',
        status: 'COMPLETED',
        metadata: {
          type: 'balance_correction',
          reason: 'Incorrect SOL amount credited due to wrong fiat_currency',
          original_transaction_id: transaction.id,
          original_crypto_amount: incorrectSolAmount,
          corrected_crypto_amount: correctSolAmount,
          excess_debited: excessSol
        },
        notes: `Balance correction: Debit ${excessSol.toFixed(8)} SOL excess from incorrect BUY transaction`
      });

    if (correctionTxError) {
      console.warn(`   ⚠️ Error creating correction transaction:`, correctionTxError);
    } else {
      console.log(`   ✅ Created correction transaction record`);
    }

    console.log(`   ✅ Successfully fixed SOL balance`);
    return { success: true, excessDebited: excessSol, newBalance: newSolBalance };

  } catch (error) {
    console.error(`   ❌ Error fixing balance:`, error);
    return { success: false, error };
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const userId = args[0] || null;
  const transactionId = args[1] || null;

  console.log('🔍 Finding incorrect SOL BUY transactions...\n');

  const transactions = await findIncorrectTransactions(userId, transactionId);

  if (transactions.length === 0) {
    console.log('✅ No incorrect transactions found');
    return;
  }

  console.log(`📋 Found ${transactions.length} transaction(s) to check\n`);

  // Get current SOL rate
  const solRate = await getSolRate();
  console.log(`💰 Current SOL rate: ₦${solRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);

  let fixedCount = 0;
  let errorCount = 0;

  for (const transaction of transactions) {
    const fiatAmount = parseFloat(transaction.fiat_amount || '0');
    const cryptoAmount = parseFloat(transaction.crypto_amount || '0');
    
    console.log(`\n📄 Transaction: ${transaction.id}`);
    console.log(`   Created: ${new Date(transaction.created_at).toLocaleString()}`);
    console.log(`   Fiat Amount: ${fiatAmount.toFixed(2)} ${transaction.fiat_currency || 'NULL'}`);
    console.log(`   SOL Amount: ${cryptoAmount.toFixed(8)} SOL`);

    // If fiat_currency is USD or NULL, we need to check if fiat_amount looks like USD
    // If fiat_amount is around 2984, it's likely NGN (not USD)
    // If fiat_amount is around 1.8 (2984/1650), it's likely USD
    
    let ngnAmount = fiatAmount;
    
    // If fiat_currency is USD or NULL and amount is small (< 100), it's likely USD
    // Convert USD to NGN (assuming ~1650 rate)
    if ((transaction.fiat_currency === 'USD' || !transaction.fiat_currency) && fiatAmount < 100) {
      ngnAmount = fiatAmount * 1650; // Convert USD to NGN
      console.log(`   ⚠️ Detected USD amount, converting to NGN: ₦${ngnAmount.toFixed(2)}`);
    } else if (transaction.fiat_currency === 'USD' && fiatAmount >= 100) {
      // Large USD amount - might actually be NGN mislabeled
      console.log(`   ⚠️ Large USD amount detected - treating as NGN: ₦${fiatAmount.toFixed(2)}`);
      ngnAmount = fiatAmount;
    }

    // Calculate correct SOL amount
    const calculation = calculateCorrectSolAmount(ngnAmount, solRate);
    
    if (!calculation) {
      console.log(`   ⚠️ Cannot calculate correct amount - missing rate or amount`);
      errorCount++;
      continue;
    }

    console.log(`   Correct calculation:`);
    console.log(`     NGN Paid: ₦${calculation.ngnAmount.toFixed(2)}`);
    console.log(`     Fee (1%): ₦${calculation.fee.toFixed(2)}`);
    console.log(`     After Fee: ₦${calculation.amountAfterFee.toFixed(2)}`);
    console.log(`     Rate: ₦${calculation.rate.toFixed(2)} per SOL`);
    console.log(`     Correct SOL: ${calculation.solAmount.toFixed(8)} SOL`);

    // Fix the balance
    const result = await fixSolBalance(transaction, calculation.solAmount);
    
    if (result.success) {
      fixedCount++;
    } else {
      errorCount++;
    }
  }

  console.log(`\n\n✅ Summary:`);
  console.log(`   Fixed: ${fixedCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log(`   Total: ${transactions.length}\n`);
}

// Run the script
main().catch(console.error);
