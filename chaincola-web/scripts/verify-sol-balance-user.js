/**
 * Verify SOL balance for a specific user
 * This helps debug why balance might be showing as 0
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// User ID from the script that updated the balance
const USER_ID = 'f04afc9d-8cde-40dd-b78d-094369aab856';

async function verifyBalance() {
  try {
    console.log('🔍 Verifying SOL balance for user...\n');
    console.log(`User ID: ${USER_ID}\n`);

    // Check wallet_balances table
    console.log('Step 1: Checking wallet_balances table...');
    const { data: walletBalance, error: balanceError } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('currency', 'SOL')
      .maybeSingle();

    if (balanceError) {
      console.error('❌ Error fetching wallet balance:', balanceError);
    } else if (walletBalance) {
      console.log('✅ Wallet balance found:');
      console.log(`   Balance: ${walletBalance.balance} SOL`);
      console.log(`   Locked: ${walletBalance.locked || 0} SOL`);
      console.log(`   Updated: ${walletBalance.updated_at}`);
    } else {
      console.log('⚠️ No SOL balance record found in wallet_balances');
    }

    // Check crypto_wallets table
    console.log('\nStep 2: Checking crypto_wallets table...');
    const { data: wallets, error: walletError } = await supabase
      .from('crypto_wallets')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('asset', 'SOL')
      .eq('network', 'mainnet');

    if (walletError) {
      console.error('❌ Error fetching wallets:', walletError);
    } else if (wallets && wallets.length > 0) {
      console.log(`✅ Found ${wallets.length} SOL wallet(s):`);
      wallets.forEach((wallet, idx) => {
        console.log(`   ${idx + 1}. Address: ${wallet.address}`);
        console.log(`      Active: ${wallet.is_active}`);
      });
    } else {
      console.log('⚠️ No SOL wallet found in crypto_wallets');
    }

    // Check transactions
    console.log('\nStep 3: Checking transactions...');
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('crypto_currency', 'SOL')
      .order('created_at', { ascending: false })
      .limit(5);

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
    } else if (transactions && transactions.length > 0) {
      console.log(`✅ Found ${transactions.length} SOL transaction(s):`);
      transactions.forEach((tx, idx) => {
        console.log(`   ${idx + 1}. ${tx.transaction_type}: ${tx.crypto_amount} SOL`);
        console.log(`      Status: ${tx.status}`);
        console.log(`      Hash: ${tx.transaction_hash?.substring(0, 20)}...`);
      });
    } else {
      console.log('⚠️ No SOL transactions found');
    }

    // Summary
    console.log('\n📊 Summary:');
    if (walletBalance) {
      const balance = parseFloat(walletBalance.balance || '0');
      const locked = parseFloat(walletBalance.locked || '0');
      const available = balance - locked;
      console.log(`   Database Balance: ${balance.toFixed(9)} SOL`);
      console.log(`   Locked: ${locked.toFixed(9)} SOL`);
      console.log(`   Available: ${available.toFixed(9)} SOL`);
      
      if (balance > 0) {
        console.log('\n✅ Balance exists in database!');
        console.log('   If app shows 0, possible causes:');
        console.log('   1. User ID mismatch (app using different user_id)');
        console.log('   2. Query timeout (10 second timeout might be too short)');
        console.log('   3. RLS policy blocking access');
        console.log('   4. App cache needs refresh');
      } else {
        console.log('\n⚠️ Balance is 0 in database');
      }
    } else {
      console.log('   ❌ No balance record found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

verifyBalance().catch(console.error);
