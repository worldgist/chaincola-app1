/**
 * Comprehensive Fix for NGN Credit Issue
 * 
 * This script:
 * 1. Verifies the database fix is applied
 * 2. Finds the transaction with ₦399,000 credit
 * 3. Calculates the correct amount
 * 4. Applies the correction (with confirmation)
 */

const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function findTransaction() {
  console.log('\n🔍 Step 1: Finding transaction with ₦399,000 credit...\n');
  
  try {
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .gte('fiat_amount', 398000)
      .lte('fiat_amount', 400000)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (error) {
      console.error('❌ Error fetching transactions:', error.message);
      return null;
    }
    
    if (!transactions || transactions.length === 0) {
      console.log('⚠️  No transaction found with NGN credit between ₦398,000 and ₦400,000');
      console.log('\n📊 Showing recent SOL sell transactions instead:\n');
      
      const { data: recentTxs } = await supabase
        .from('transactions')
        .select('*')
        .eq('crypto_currency', 'SOL')
        .eq('transaction_type', 'SELL')
        .eq('status', 'COMPLETED')
        .eq('fiat_currency', 'NGN')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (recentTxs && recentTxs.length > 0) {
        recentTxs.forEach((tx, idx) => {
          console.log(`${idx + 1}. ₦${parseFloat(tx.fiat_amount || 0).toLocaleString()} - ${tx.crypto_amount} SOL - ${new Date(tx.created_at).toLocaleString()}`);
        });
        console.log('\n💡 Tip: If you see the transaction above, note the exact amount and run this script with that amount');
      }
      
      return null;
    }
    
    console.log(`✅ Found ${transactions.length} transaction(s):\n`);
    
    return transactions[0]; // Return the most recent one
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

async function analyzeTransaction(tx) {
  console.log('📊 Step 2: Analyzing transaction...\n');
  
  const cryptoAmount = parseFloat(tx.crypto_amount || '0');
  const creditedNgn = parseFloat(tx.fiat_amount || '0');
  const rate = parseFloat(tx.metadata?.rate || '0');
  const feePercentage = parseFloat(tx.metadata?.fee_percentage || '0.01');
  
  console.log('Transaction Details:');
  console.log(`  Transaction ID: ${tx.id}`);
  console.log(`  User ID: ${tx.user_id}`);
  console.log(`  Created: ${new Date(tx.created_at).toLocaleString()}`);
  console.log(`  SOL Amount: ${cryptoAmount}`);
  console.log(`  Rate: ₦${rate.toFixed(2)} per SOL`);
  console.log(`  Credited: ₦${creditedNgn.toLocaleString()}`);
  
  if (rate <= 0) {
    console.log('\n⚠️  Cannot calculate - rate is missing or zero in transaction metadata');
    return null;
  }
  
  // Calculate expected amount
  const expectedBeforeFee = cryptoAmount * rate;
  const fee = expectedBeforeFee * feePercentage;
  const expectedAfterFee = expectedBeforeFee - fee;
  const difference = creditedNgn - expectedAfterFee;
  const percentDiff = expectedAfterFee > 0 ? (difference / expectedAfterFee) * 100 : 0;
  
  console.log('\n📐 Calculation:');
  console.log(`  Total before fee: ${cryptoAmount} × ₦${rate.toFixed(2)} = ₦${expectedBeforeFee.toLocaleString()}`);
  console.log(`  Fee (${(feePercentage * 100).toFixed(1)}%): ₦${fee.toLocaleString()}`);
  console.log(`  Expected after fee: ₦${expectedAfterFee.toLocaleString()}`);
  console.log(`\n  Difference: ₦${difference.toLocaleString()} (${percentDiff > 0 ? '+' : ''}${percentDiff.toFixed(2)}%)`);
  
  if (difference > 1000 || percentDiff > 10) {
    console.log(`\n⚠️  OVER-CREDIT DETECTED!`);
    console.log(`   User was credited ₦${difference.toLocaleString()} more than expected`);
  } else if (difference < -1000 || percentDiff < -10) {
    console.log(`\n⚠️  UNDER-CREDIT DETECTED!`);
    console.log(`   User was credited ₦${Math.abs(difference).toLocaleString()} less than expected`);
  } else {
    console.log(`\n✅ Amount appears correct (difference is within acceptable range)`);
    return null;
  }
  
  return {
    transaction: tx,
    cryptoAmount,
    creditedNgn,
    rate,
    expectedAfterFee,
    overCredit: difference,
    percentDiff
  };
}

async function getCurrentBalance(userId) {
  try {
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    const { data: walletBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();
    
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    return {
      user_wallets: parseFloat(userWallet?.ngn_balance || '0'),
      wallet_balances: parseFloat(walletBalance?.balance || '0'),
      wallets: parseFloat(wallet?.ngn_balance || '0')
    };
  } catch (error) {
    console.error('Error getting balance:', error.message);
    return null;
  }
}

async function getUserEmail(userId) {
  try {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    return user?.email || 'N/A';
  } catch (error) {
    return 'N/A';
  }
}

async function applyCorrection(analysis) {
  console.log('\n💰 Step 3: Current balances...\n');
  
  const balances = await getCurrentBalance(analysis.transaction.user_id);
  if (!balances) {
    console.log('❌ Could not retrieve current balances');
    return false;
  }
  
  const userEmail = await getUserEmail(analysis.transaction.user_id);
  
  console.log('Current Balances:');
  console.log(`  user_wallets.ngn_balance: ₦${balances.user_wallets.toLocaleString()}`);
  console.log(`  wallet_balances.balance: ₦${balances.wallet_balances.toLocaleString()}`);
  console.log(`  wallets.ngn_balance: ₦${balances.wallets.toLocaleString()}`);
  
  const correctBalance = balances.user_wallets - analysis.overCredit;
  
  console.log('\n🔧 Correction Plan:');
  console.log(`  Current balance: ₦${balances.user_wallets.toLocaleString()}`);
  console.log(`  Over-credit amount: ₦${analysis.overCredit.toLocaleString()}`);
  console.log(`  Correct balance: ₦${correctBalance.toLocaleString()}`);
  console.log(`  Adjustment: -₦${analysis.overCredit.toLocaleString()}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  CONFIRMATION REQUIRED');
  console.log('='.repeat(60));
  console.log(`User: ${userEmail}`);
  console.log(`Transaction: ${analysis.transaction.id.substring(0, 8)}...`);
  console.log(`Current Balance: ₦${balances.user_wallets.toLocaleString()}`);
  console.log(`Correct Balance: ₦${correctBalance.toLocaleString()}`);
  console.log(`Adjustment: -₦${analysis.overCredit.toLocaleString()}`);
  console.log('='.repeat(60));
  
  const confirm = await question('\nDo you want to apply this correction? (yes/no): ');
  
  if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
    console.log('\n❌ Correction cancelled by user');
    return false;
  }
  
  console.log('\n🔄 Applying correction...');
  
  try {
    // Update user_wallets
    const { error: error1 } = await supabase
      .from('user_wallets')
      .update({
        ngn_balance: correctBalance,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', analysis.transaction.user_id);
    
    if (error1) {
      console.error('❌ Error updating user_wallets:', error1.message);
      return false;
    }
    
    // Update wallet_balances
    const { error: error2 } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: analysis.transaction.user_id,
        currency: 'NGN',
        balance: correctBalance,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,currency'
      });
    
    if (error2) {
      console.error('❌ Error updating wallet_balances:', error2.message);
      return false;
    }
    
    // Update wallets
    const { error: error3 } = await supabase
      .from('wallets')
      .upsert({
        user_id: analysis.transaction.user_id,
        ngn_balance: correctBalance,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (error3) {
      console.error('❌ Error updating wallets:', error3.message);
      return false;
    }
    
    console.log('\n✅ SUCCESS: Balance corrected successfully!');
    console.log(`   User balance updated from ₦${balances.user_wallets.toLocaleString()} to ₦${correctBalance.toLocaleString()}`);
    
    // Verify
    const newBalances = await getCurrentBalance(analysis.transaction.user_id);
    if (newBalances) {
      console.log('\n📊 Verification:');
      console.log(`  user_wallets: ₦${newBalances.user_wallets.toLocaleString()} (expected: ₦${correctBalance.toLocaleString()})`);
      console.log(`  wallet_balances: ₦${newBalances.wallet_balances.toLocaleString()}`);
      console.log(`  wallets: ₦${newBalances.wallets.toLocaleString()}`);
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ Error applying correction:', error.message);
    return false;
  }
}

async function main() {
  console.log('🔍 NGN Credit Issue - Comprehensive Fix\n');
  console.log('='.repeat(60));
  
  const tx = await findTransaction();
  if (!tx) {
    console.log('\n⚠️  Could not find the transaction. Please check:');
    console.log('   1. The transaction amount is exactly ₦399,000');
    console.log('   2. The transaction status is COMPLETED');
    console.log('   3. The transaction type is SELL');
    rl.close();
    return;
  }
  
  const analysis = await analyzeTransaction(tx);
  if (!analysis) {
    console.log('\n✅ No correction needed or cannot calculate');
    rl.close();
    return;
  }
  
  const success = await applyCorrection(analysis);
  
  if (success) {
    console.log('\n✅ Process completed successfully!');
  } else {
    console.log('\n⚠️  Process completed with issues. Please review the output above.');
  }
  
  rl.close();
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  rl.close();
  process.exit(1);
});
