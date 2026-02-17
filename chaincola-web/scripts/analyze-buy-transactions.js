/**
 * Analyze buy transactions to find incorrect NGN credits
 * Checks if buy transactions incorrectly credited NGN instead of debiting it
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Error: SUPABASE_ANON_KEY environment variable is required!');
  process.exit(1);
}

const TEST_EMAIL = process.env.TEST_EMAIL || 'chaincolawallet@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'Salifu147@';

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
  
  return {
    userId: authData.user.id,
    session: authData.session
  };
}

async function analyzeTransactions(userId) {
  console.log('\n📊 Analyzing Buy Transactions...\n');
  
  // Get all buy transactions
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('transaction_type', 'BUY')
    .order('completed_at', { ascending: false });
  
  if (error) {
    console.error('❌ Error fetching transactions:', error);
    return;
  }
  
  console.log(`Found ${transactions?.length || 0} BUY transactions\n`);
  
  // Get current balance
  const { data: wallet } = await supabase
    .from('user_wallets')
    .select('ngn_balance')
    .eq('user_id', userId)
    .single();
  
  const currentBalance = parseFloat(wallet?.ngn_balance || 0);
  
  console.log('='.repeat(80));
  console.log('TRANSACTION ANALYSIS');
  console.log('='.repeat(80));
  console.log(`Current NGN Balance: ₦${currentBalance.toFixed(2)}\n`);
  
  let totalDebited = 0;
  let totalCredited = 0;
  let suspiciousTransactions = [];
  
  transactions?.forEach((tx, index) => {
    const fiatAmount = parseFloat(tx.fiat_amount || 0);
    const feeAmount = parseFloat(tx.fee_amount || 0);
    const totalDebit = fiatAmount + feeAmount;
    
    totalDebited += totalDebit;
    
    console.log(`${index + 1}. Transaction ID: ${tx.id.substring(0, 8)}...`);
    console.log(`   Type: ${tx.transaction_type}`);
    console.log(`   Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
    console.log(`   Fiat Amount: ₦${fiatAmount.toFixed(2)}`);
    console.log(`   Fee: ₦${feeAmount.toFixed(2)}`);
    console.log(`   Total Should Debit: ₦${totalDebit.toFixed(2)}`);
    console.log(`   Status: ${tx.status}`);
    console.log(`   Date: ${tx.completed_at || 'N/A'}`);
    console.log(`   Fix Version: ${tx.metadata?.fix_version || 'N/A'}`);
    console.log('');
  });
  
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total BUY Transactions: ${transactions?.length || 0}`);
  console.log(`Total NGN Should Be Debited: ₦${totalDebited.toFixed(2)}`);
  console.log(`Current Balance: ₦${currentBalance.toFixed(2)}`);
  console.log('');
  
  // Calculate what the balance should be if user started with ₦3,000
  const startingBalance = 3000;
  const expectedBalance = startingBalance - totalDebited;
  const balanceDifference = currentBalance - expectedBalance;
  
  console.log('='.repeat(80));
  console.log('BALANCE VERIFICATION');
  console.log('='.repeat(80));
  console.log(`If user started with: ₦${startingBalance.toFixed(2)}`);
  console.log(`Total debited from BUY: ₦${totalDebited.toFixed(2)}`);
  console.log(`Expected balance: ₦${expectedBalance.toFixed(2)}`);
  console.log(`Actual balance: ₦${currentBalance.toFixed(2)}`);
  console.log(`Difference: ₦${balanceDifference.toFixed(2)}`);
  console.log('');
  
  if (balanceDifference > 0) {
    console.log(`⚠️  WARNING: Balance is ₦${balanceDifference.toFixed(2)} HIGHER than expected!`);
    console.log(`   This suggests ${balanceDifference.toFixed(2)} was incorrectly CREDITED during buy transactions.`);
    console.log(`   Each buy should DEBIT NGN, not credit it.`);
  } else if (balanceDifference < 0) {
    console.log(`✅ Balance is ₦${Math.abs(balanceDifference).toFixed(2)} LOWER than expected.`);
    console.log(`   This is normal if there were other transactions (withdrawals, etc.).`);
  } else {
    console.log(`✅ Balance matches expected value!`);
  }
  
  console.log('');
  console.log('='.repeat(80));
  console.log('RECOMMENDATION');
  console.log('='.repeat(80));
  console.log('1. Apply migration: 20260130000011_fix_double_credit_buy_crypto.sql');
  console.log('2. Check if any buy transactions incorrectly credited NGN');
  console.log('3. Consider correcting the balance if needed');
  console.log('='.repeat(80));
}

async function main() {
  try {
    const { userId } = await signIn();
    await analyzeTransactions(userId);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
