/**
 * Check all balance tables for chaincolawallet@gmail.com
 * Verify if there are discrepancies between different tables
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const USER_ID = 'f04afc9d-8cde-40dd-b78d-094369aab856';
const USER_EMAIL = 'chaincolawallet@gmail.com';

async function checkBalances() {
  console.log('\n🔍 Checking all balance tables for chaincolawallet@gmail.com\n');
  console.log('='.repeat(80));

  try {
    // Check user_wallets table
    const { data: userWallet, error: uwError } = await supabase
      .from('user_wallets')
      .select('ngn_balance, sol_balance, updated_at')
      .eq('user_id', USER_ID)
      .single();

    if (uwError && uwError.code !== 'PGRST116') {
      console.error('❌ Error fetching user_wallets:', uwError);
    } else {
      console.log('\n📊 user_wallets table:');
      if (userWallet) {
        console.log(`   NGN Balance: ₦${parseFloat(userWallet.ngn_balance || '0').toLocaleString()}`);
        console.log(`   SOL Balance: ${parseFloat(userWallet.sol_balance || '0').toFixed(8)} SOL`);
        console.log(`   Updated: ${new Date(userWallet.updated_at).toLocaleString()}`);
      } else {
        console.log('   No record found');
      }
    }

    // Check wallet_balances table
    const { data: walletBalances, error: wbError } = await supabase
      .from('wallet_balances')
      .select('currency, balance, updated_at')
      .eq('user_id', USER_ID)
      .in('currency', ['NGN', 'SOL']);

    if (wbError) {
      console.error('❌ Error fetching wallet_balances:', wbError);
    } else {
      console.log('\n📊 wallet_balances table:');
      if (walletBalances && walletBalances.length > 0) {
        walletBalances.forEach(wb => {
          if (wb.currency === 'NGN') {
            console.log(`   NGN Balance: ₦${parseFloat(wb.balance || '0').toLocaleString()}`);
          } else if (wb.currency === 'SOL') {
            console.log(`   SOL Balance: ${parseFloat(wb.balance || '0').toFixed(8)} SOL`);
          }
          console.log(`   Updated: ${new Date(wb.updated_at).toLocaleString()}`);
        });
      } else {
        console.log('   No records found');
      }
    }

    // Check wallets table
    const { data: wallet, error: wError } = await supabase
      .from('wallets')
      .select('ngn_balance, usd_balance, updated_at')
      .eq('user_id', USER_ID)
      .single();

    if (wError && wError.code !== 'PGRST116') {
      console.error('❌ Error fetching wallets:', wError);
    } else {
      console.log('\n📊 wallets table:');
      if (wallet) {
        console.log(`   NGN Balance: ₦${parseFloat(wallet.ngn_balance || '0').toLocaleString()}`);
        console.log(`   USD Balance: $${parseFloat(wallet.usd_balance || '0').toFixed(2)}`);
        console.log(`   Updated: ${new Date(wallet.updated_at).toLocaleString()}`);
      } else {
        console.log('   No record found');
      }
    }

    // Get all SOL sell transactions to calculate expected balance
    console.log('\n📊 Transaction History (SOL Sells):');
    const { data: allTx, error: txError } = await supabase
      .from('transactions')
      .select('id, crypto_amount, fiat_amount, created_at, metadata')
      .eq('user_id', USER_ID)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .order('created_at', { ascending: true });

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
    } else if (allTx && allTx.length > 0) {
      let calculatedBalance = 0;
      allTx.forEach((tx, index) => {
        const credit = parseFloat(tx.fiat_amount || '0');
        calculatedBalance += credit;
        console.log(`   ${index + 1}. ${new Date(tx.created_at).toLocaleString()}: +₦${credit.toLocaleString()} (${tx.crypto_amount} SOL)`);
        console.log(`      Transaction ID: ${tx.id}`);
      });
      console.log(`\n   Calculated Balance from Transactions: ₦${calculatedBalance.toFixed(2)}`);
    } else {
      console.log('   No transactions found');
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    
    const uwBalance = parseFloat(userWallet?.ngn_balance || '0');
    const wbBalance = parseFloat(walletBalances?.find(wb => wb.currency === 'NGN')?.balance || '0');
    const wBalance = parseFloat(wallet?.ngn_balance || '0');
    const txBalance = allTx ? allTx.reduce((sum, tx) => sum + parseFloat(tx.fiat_amount || '0'), 0) : 0;

    console.log(`\n   user_wallets.ngn_balance:     ₦${uwBalance.toLocaleString()}`);
    console.log(`   wallet_balances.balance:      ₦${wbBalance.toLocaleString()}`);
    console.log(`   wallets.ngn_balance:          ₦${wBalance.toLocaleString()}`);
    console.log(`   Sum of all transactions:      ₦${txBalance.toFixed(2)}`);

    const discrepancies = [];
    if (Math.abs(uwBalance - wbBalance) > 0.01) {
      discrepancies.push(`user_wallets (₦${uwBalance.toLocaleString()}) vs wallet_balances (₦${wbBalance.toLocaleString()})`);
    }
    if (Math.abs(uwBalance - wBalance) > 0.01) {
      discrepancies.push(`user_wallets (₦${uwBalance.toLocaleString()}) vs wallets (₦${wBalance.toLocaleString()})`);
    }
    if (Math.abs(wbBalance - wBalance) > 0.01) {
      discrepancies.push(`wallet_balances (₦${wbBalance.toLocaleString()}) vs wallets (₦${wBalance.toLocaleString()})`);
    }
    if (Math.abs(uwBalance - txBalance) > 0.01) {
      discrepancies.push(`user_wallets (₦${uwBalance.toLocaleString()}) vs transaction sum (₦${txBalance.toFixed(2)})`);
    }

    if (discrepancies.length > 0) {
      console.log('\n⚠️  DISCREPANCIES FOUND:');
      discrepancies.forEach(d => console.log(`   - ${d}`));
    } else {
      console.log('\n✅ All balances are consistent');
    }

    // Check if user reported balance matches any table
    const reportedBalance = 399670.30;
    console.log(`\n📋 User Reported Balance: ₦${reportedBalance.toLocaleString()}`);
    
    if (Math.abs(uwBalance - reportedBalance) < 1) {
      console.log('   ✅ Matches user_wallets table');
    } else if (Math.abs(wbBalance - reportedBalance) < 1) {
      console.log('   ✅ Matches wallet_balances table');
    } else if (Math.abs(wBalance - reportedBalance) < 1) {
      console.log('   ✅ Matches wallets table');
    } else {
      console.log('   ⚠️  Does not match any table - may have been corrected already');
      console.log(`   Current balance appears to be: ₦${uwBalance.toLocaleString()}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkBalances().catch(console.error);
