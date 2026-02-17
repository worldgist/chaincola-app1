/**
 * Reconcile user Solana balance based on actual credited transactions
 * This script calculates the correct balance from RECEIVE transactions and updates both tables
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

async function reconcileSolBalance(userEmail) {
  try {
    console.log(`🔍 Reconciling SOL balance for user: ${userEmail}\n`);

    // Step 1: Get user ID
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('user_id')
      .eq('email', userEmail)
      .single();

    if (userError || !user) {
      console.error('❌ User not found:', userError);
      return;
    }

    const userId = user.user_id;
    console.log(`✅ Found user: ${userId}\n`);

    // Step 2: Get all credited SOL RECEIVE transactions
    console.log('📊 Step 2: Analyzing SOL RECEIVE transactions...\n');
    const { data: receiveTxs, error: txError } = await supabase
      .from('transactions')
      .select('id, transaction_hash, crypto_amount, status, metadata, created_at')
      .eq('user_id', userId)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'RECEIVE')
      .in('status', ['CONFIRMED', 'COMPLETED'])
      .order('created_at', { ascending: true });

    if (txError) {
      throw txError;
    }

    if (!receiveTxs || receiveTxs.length === 0) {
      console.log('⚠️ No SOL RECEIVE transactions found');
      return;
    }

    // Step 3: Calculate total from credited transactions
    // For CONFIRMED/COMPLETED transactions, consider them credited even if flag is missing
    let totalCredited = 0;
    const creditedTxs = [];
    const uncreditedTxs = [];

    receiveTxs.forEach(tx => {
      const metadata = tx.metadata || {};
      const isCredited = metadata.credited === true;
      const amount = parseFloat(tx.crypto_amount || '0');
      const isConfirmed = tx.status === 'CONFIRMED' || tx.status === 'COMPLETED';

      // Consider CONFIRMED/COMPLETED transactions as credited (they should have been credited)
      if ((isCredited || isConfirmed) && amount > 0) {
        totalCredited += amount;
        creditedTxs.push({
          hash: tx.transaction_hash?.substring(0, 16) + '...',
          amount: amount,
          date: new Date(tx.created_at).toLocaleDateString(),
          wasCredited: isCredited,
        });
      } else {
        uncreditedTxs.push({
          hash: tx.transaction_hash?.substring(0, 16) + '...',
          amount: amount,
          status: tx.status,
        });
      }
    });

    console.log(`📈 Credited Transactions: ${creditedTxs.length}`);
    creditedTxs.forEach((tx, idx) => {
      console.log(`   ${idx + 1}. ${tx.hash}: +${tx.amount.toFixed(9)} SOL (${tx.date})`);
    });

    if (uncreditedTxs.length > 0) {
      console.log(`\n⚠️ Uncredited Transactions: ${uncreditedTxs.length}`);
      uncreditedTxs.forEach((tx, idx) => {
        console.log(`   ${idx + 1}. ${tx.hash}: ${tx.amount.toFixed(9)} SOL (Status: ${tx.status})`);
      });
    }

    console.log(`\n💰 Total Credited: ${totalCredited.toFixed(9)} SOL\n`);

    // Step 4: Get all SOL SEND transactions (debits)
    console.log('📊 Step 4: Analyzing SOL SEND transactions...\n');
    const { data: sendTxs, error: sendError } = await supabase
      .from('transactions')
      .select('id, transaction_hash, crypto_amount, fee_amount, status, created_at')
      .eq('user_id', userId)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SEND')
      .in('status', ['COMPLETED', 'CONFIRMED', 'PENDING'])
      .order('created_at', { ascending: true });

    if (sendError) {
      console.warn('⚠️ Error fetching SEND transactions:', sendError.message);
    }

    let totalDebited = 0;
    if (sendTxs && sendTxs.length > 0) {
      sendTxs.forEach(tx => {
        const amount = parseFloat(tx.crypto_amount || '0');
        const fee = parseFloat(tx.fee_amount || '0');
        const total = amount + fee;
        totalDebited += total;
      });
      console.log(`📉 Total Debited: ${totalDebited.toFixed(9)} SOL (from ${sendTxs.length} transaction(s))\n`);
    } else {
      console.log(`📉 No SEND transactions found\n`);
    }

    // Step 5: Calculate expected balance
    const expectedBalance = Math.max(0, totalCredited - totalDebited);
    console.log(`📊 Expected Balance Calculation:`);
    console.log(`   Credits: ${totalCredited.toFixed(9)} SOL`);
    console.log(`   Debits:  ${totalDebited.toFixed(9)} SOL`);
    console.log(`   Expected: ${expectedBalance.toFixed(9)} SOL\n`);

    // Step 6: Get current balances
    console.log('📊 Step 6: Checking current balances...\n');
    const { data: walletBalance } = await supabase
      .from('wallet_balances')
      .select('balance, locked')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .maybeSingle();

    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('sol_balance')
      .eq('user_id', userId)
      .maybeSingle();

    const currentWalletBalance = walletBalance ? parseFloat(walletBalance.balance || '0') : 0;
    const currentLocked = walletBalance ? parseFloat(walletBalance.locked || '0') : 0;
    const currentUserWalletBalance = userWallet ? parseFloat(userWallet.sol_balance || '0') : 0;

    console.log(`💾 Current Balances:`);
    console.log(`   wallet_balances: ${currentWalletBalance.toFixed(9)} SOL`);
    console.log(`   Locked: ${currentLocked.toFixed(9)} SOL`);
    console.log(`   Available: ${(currentWalletBalance - currentLocked).toFixed(9)} SOL`);
    console.log(`   user_wallets.sol_balance: ${currentUserWalletBalance.toFixed(9)} SOL\n`);

    // Step 7: Update balances if needed
    const difference = expectedBalance - currentWalletBalance;
    const userWalletDifference = expectedBalance - currentUserWalletBalance;

    if (Math.abs(difference) < 0.000001 && Math.abs(userWalletDifference) < 0.000001) {
      console.log('✅ Balances already match expected values - no update needed');
      return;
    }

    console.log(`⚠️ Balance discrepancy detected:`);
    console.log(`   wallet_balances difference: ${difference > 0 ? '+' : ''}${difference.toFixed(9)} SOL`);
    console.log(`   user_wallets difference: ${userWalletDifference > 0 ? '+' : ''}${userWalletDifference.toFixed(9)} SOL\n`);

    console.log('🔄 Updating balances...\n');

    // Update wallet_balances
    const { error: updateWalletBalanceError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'SOL',
        balance: expectedBalance.toFixed(9),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (updateWalletBalanceError) {
      console.error('❌ Failed to update wallet_balances:', updateWalletBalanceError);
      return;
    }
    console.log(`✅ Updated wallet_balances: ${expectedBalance.toFixed(9)} SOL`);

    // Update user_wallets
    await supabase
      .from('user_wallets')
      .upsert({ user_id: userId }, { onConflict: 'user_id' });

    const { error: updateUserWalletError } = await supabase
      .from('user_wallets')
      .update({
        sol_balance: expectedBalance.toFixed(9),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateUserWalletError) {
      console.error('❌ Failed to update user_wallets:', updateUserWalletError);
      return;
    }
    console.log(`✅ Updated user_wallets.sol_balance: ${expectedBalance.toFixed(9)} SOL\n`);

    console.log('✅ Balance reconciliation complete!');
    console.log(`\n📊 Final Balance: ${expectedBalance.toFixed(9)} SOL`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

const userEmail = process.argv[2];
if (!userEmail) {
  console.error('❌ Please provide user email as argument');
  console.log('Usage: node reconcile-sol-balance-from-transactions.js <user-email>');
  process.exit(1);
}

reconcileSolBalance(userEmail).catch(console.error);
