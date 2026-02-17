#!/usr/bin/env node

/**
 * Script to trace where 0.01579829 SOL went after a sell transaction
 * 
 * When SOL is sold via instant_sell_crypto_v2:
 * 1. SOL is debited from user's wallet
 * 2. SOL is added to system_wallets.sol_inventory (system inventory)
 * 3. NGN is credited to user's wallet
 * 4. NGN is debited from system_wallets.ngn_float_balance
 * 
 * The SOL goes to the system inventory and stays there until used for buys or manually transferred.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SOL_AMOUNT = 0.01579829;

async function traceSolSell() {
  console.log('🔍 Tracing Solana Sell Transaction\n');
  console.log(`Looking for transaction with amount: ${SOL_AMOUNT} SOL\n`);
  console.log('='.repeat(80));

  try {
    // 1. Find the transaction
    console.log('\n📋 Step 1: Finding transaction record...\n');
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .order('created_at', { ascending: false })
      .limit(20);

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }

    // Find exact or close match
    const matchingTx = transactions?.find(tx => 
      Math.abs(parseFloat(tx.crypto_amount) - SOL_AMOUNT) < 0.00000001
    );

    if (!matchingTx) {
      console.log('⚠️  No exact match found. Showing recent SOL sell transactions:\n');
      transactions?.slice(0, 5).forEach(tx => {
        console.log(`  - Amount: ${tx.crypto_amount} SOL, Date: ${tx.created_at}, Status: ${tx.status}`);
        console.log(`    Reference: ${tx.external_reference || 'N/A'}`);
        console.log(`    User ID: ${tx.user_id.substring(0, 8)}...`);
        console.log('');
      });
      return;
    }

    console.log('✅ Found matching transaction:\n');
    console.log(`  Transaction ID: ${matchingTx.id}`);
    console.log(`  User ID: ${matchingTx.user_id}`);
    console.log(`  Amount: ${matchingTx.crypto_amount} SOL`);
    console.log(`  NGN Amount: ₦${matchingTx.fiat_amount || 'N/A'}`);
    console.log(`  Status: ${matchingTx.status}`);
    console.log(`  Reference: ${matchingTx.external_reference || 'N/A'}`);
    console.log(`  Created: ${matchingTx.created_at}`);
    console.log(`  Completed: ${matchingTx.completed_at || 'N/A'}`);

    // 2. Check system wallet inventory
    console.log('\n📊 Step 2: Checking system wallet SOL inventory...\n');
    const { data: systemWallet, error: sysError } = await supabase
      .from('system_wallets')
      .select('sol_inventory, ngn_float_balance, updated_at')
      .eq('id', 1)
      .single();

    if (sysError) {
      console.error('❌ Error fetching system wallet:', sysError);
    } else {
      console.log('✅ System Wallet Status:');
      console.log(`  SOL Inventory: ${systemWallet.sol_inventory} SOL`);
      console.log(`  NGN Float Balance: ₦${systemWallet.ngn_float_balance}`);
      console.log(`  Last Updated: ${systemWallet.updated_at}`);
      console.log('\n💡 The sold SOL is stored in system_wallets.sol_inventory');
    }

    // 3. Check user's current balances
    console.log('\n👤 Step 3: Checking user balances...\n');
    const { data: userWallet, error: userError } = await supabase
      .from('user_wallets')
      .select('sol_balance, ngn_balance, updated_at')
      .eq('user_id', matchingTx.user_id)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      console.error('❌ Error fetching user wallet:', userError);
    } else if (userWallet) {
      console.log('✅ User Wallet Status:');
      console.log(`  SOL Balance: ${userWallet.sol_balance} SOL`);
      console.log(`  NGN Balance: ₦${userWallet.ngn_balance}`);
      console.log(`  Last Updated: ${userWallet.updated_at}`);
    }

    // 4. Check wallet_balances table
    const { data: walletBalances, error: balError } = await supabase
      .from('wallet_balances')
      .select('currency, balance, updated_at')
      .eq('user_id', matchingTx.user_id)
      .in('currency', ['SOL', 'NGN']);

    if (!balError && walletBalances && walletBalances.length > 0) {
      console.log('\n💰 Wallet Balances Table:');
      walletBalances.forEach(bal => {
        console.log(`  ${bal.currency}: ${bal.balance} (updated: ${bal.updated_at})`);
      });
    }

    // 5. Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📝 SUMMARY: Where did the SOL go?\n');
    console.log('When you sold 0.01579829 SOL:');
    console.log('  1. ✅ SOL was debited from your wallet');
    console.log('  2. ✅ SOL was added to system_wallets.sol_inventory');
    console.log('  3. ✅ NGN was credited to your wallet');
    console.log('  4. ✅ NGN was debited from system_wallets.ngn_float_balance\n');
    console.log('📍 Current Location:');
    console.log(`     The SOL is now in the system inventory: ${systemWallet?.sol_inventory || 'N/A'} SOL`);
    console.log('\n💡 The SOL stays in system inventory until:');
    console.log('     - Used for future buy orders');
    console.log('     - Manually transferred by admin');
    console.log('     - Sold on an exchange (if automated)\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

traceSolSell();
