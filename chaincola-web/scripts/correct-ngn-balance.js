/**
 * Correct NGN Balance Corruption Script
 * 
 * This script corrects the NGN balance for a user whose balance was incorrectly
 * credited during buy transactions instead of being debited.
 * 
 * Usage:
 *   SUPABASE_ANON_KEY=your_key node scripts/correct-ngn-balance.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const TEST_EMAIL = process.env.TEST_EMAIL || 'chaincolawallet@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Salifu147@';
const STARTING_BALANCE = 3000; // User started with ₦3,000

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Error: SUPABASE_ANON_KEY environment variable is required!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signIn() {
  console.log('\n🔐 Signing in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  
  if (authError) {
    throw new Error(`Sign in failed: ${authError.message}`);
  }
  
  if (!authData.user) {
    throw new Error('No user data returned from sign in');
  }
  
  console.log(`✅ Signed in as: ${authData.user.email}`);
  return {
    user: authData.user,
    session: authData.session,
    userId: authData.user.id
  };
}

async function getCurrentBalance(userId) {
  const { data: userWallet } = await supabase
    .from('user_wallets')
    .select('ngn_balance')
    .eq('user_id', userId)
    .single();
  
  return parseFloat(userWallet?.ngn_balance || 0);
}

async function getTotalDebitedFromTransactions(userId) {
  const { data: transactions } = await supabase
    .from('transactions')
    .select('fiat_amount, fee_amount, status')
    .eq('user_id', userId)
    .eq('transaction_type', 'BUY')
    .eq('status', 'COMPLETED');
  
  if (!transactions) return 0;
  
  return transactions.reduce((total, tx) => {
    const fiatAmount = parseFloat(tx.fiat_amount || 0);
    const feeAmount = parseFloat(tx.fee_amount || 0);
    return total + fiatAmount + feeAmount;
  }, 0);
}

async function updateBalance(userId, newBalance) {
  console.log(`\n🔧 Correcting balance to ₦${newBalance.toFixed(2)}...`);
  
  // Update user_wallets (primary source)
  const { error: uwError } = await supabase
    .from('user_wallets')
    .update({ ngn_balance: newBalance.toFixed(2) })
    .eq('user_id', userId);
  
  if (uwError) {
    throw new Error(`Failed to update user_wallets: ${uwError.message}`);
  }
  console.log('✅ Updated user_wallets.ngn_balance');
  
  // Update wallet_balances
  const { error: wbError } = await supabase
    .from('wallet_balances')
    .upsert({
      user_id: userId,
      currency: 'NGN',
      balance: newBalance.toFixed(2),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,currency',
    });
  
  if (wbError) {
    console.warn('⚠️  Failed to update wallet_balances:', wbError.message);
  } else {
    console.log('✅ Updated wallet_balances.balance');
  }
  
  // Update wallets
  const { error: wError } = await supabase
    .from('wallets')
    .upsert({
      user_id: userId,
      ngn_balance: newBalance.toFixed(2),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });
  
  if (wError) {
    console.warn('⚠️  Failed to update wallets:', wError.message);
  } else {
    console.log('✅ Updated wallets.ngn_balance');
  }
}

async function main() {
  try {
    console.log('🔧 NGN Balance Correction Script\n');
    console.log('='.repeat(60));
    
    // Sign in
    const { userId } = await signIn();
    
    // Get current balance
    const currentBalance = await getCurrentBalance(userId);
    console.log(`\n💰 Current NGN Balance: ₦${currentBalance.toFixed(2)}`);
    
    // Get total debited from completed buy transactions
    const totalDebited = await getTotalDebitedFromTransactions(userId);
    console.log(`📊 Total debited from BUY transactions: ₦${totalDebited.toFixed(2)}`);
    
    // Calculate correct balance
    // Starting balance - total debited = correct balance
    const correctBalance = STARTING_BALANCE - totalDebited;
    
    console.log(`\n📈 Balance Calculation:`);
    console.log(`   Starting balance: ₦${STARTING_BALANCE.toFixed(2)}`);
    console.log(`   Total debited: ₦${totalDebited.toFixed(2)}`);
    console.log(`   Correct balance: ₦${correctBalance.toFixed(2)}`);
    console.log(`   Current balance: ₦${currentBalance.toFixed(2)}`);
    console.log(`   Difference: ₦${(currentBalance - correctBalance).toFixed(2)}`);
    
    if (Math.abs(currentBalance - correctBalance) < 0.01) {
      console.log('\n✅ Balance is already correct!');
      return;
    }
    
    if (correctBalance < 0) {
      console.warn('\n⚠️  WARNING: Correct balance would be negative!');
      console.warn(`   This means the user spent more than they had.`);
      console.warn(`   Setting balance to ₦0.00 instead.`);
      await updateBalance(userId, 0);
    } else {
      // Confirm before correcting
      console.log(`\n⚠️  This will change the balance from ₦${currentBalance.toFixed(2)} to ₦${correctBalance.toFixed(2)}`);
      console.log(`   Difference: ₦${(currentBalance - correctBalance).toFixed(2)}`);
      
      // Auto-correct (you can add confirmation prompt if needed)
      await updateBalance(userId, correctBalance);
    }
    
    // Verify correction
    const newBalance = await getCurrentBalance(userId);
    console.log(`\n✅ Balance corrected! New balance: ₦${newBalance.toFixed(2)}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Correction completed!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
