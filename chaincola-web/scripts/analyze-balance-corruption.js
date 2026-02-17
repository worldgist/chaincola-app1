/**
 * Analyze balance corruption from buy transactions
 * Identifies which transactions incorrectly credited NGN instead of debiting
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

async function analyzeBalanceCorruption() {
  try {
    console.log('🔍 Analyzing Balance Corruption from Buy Transactions\n');
    console.log('='.repeat(80));
    
    const { userId, session } = await signIn();
    
    // Get current balance
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();
    
    const currentBalance = parseFloat(userWallet?.ngn_balance || 0);
    console.log(`\n💰 Current NGN Balance: ₦${currentBalance.toFixed(2)}\n`);
    
    // Get all BUY transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'BUY')
      .order('completed_at', { ascending: false });
    
    if (txError) {
      throw new Error(`Failed to fetch transactions: ${txError.message}`);
    }
    
    console.log(`Found ${transactions?.length || 0} BUY transactions\n`);
    
    // Analyze each transaction
    let totalShouldDebit = 0;
    let totalActuallyDebited = 0;
    let problematicTransactions = [];
    
    console.log('📊 Transaction Analysis:\n');
    console.log('='.repeat(80));
    
    transactions?.forEach((tx, index) => {
      const fiatAmount = parseFloat(tx.fiat_amount || 0);
      const feeAmount = parseFloat(tx.fee_amount || 0);
      const totalDebit = fiatAmount + feeAmount;
      
      totalShouldDebit += totalDebit;
      
      // Check if transaction has fix version (newer transactions should be correct)
      const hasFix = tx.metadata?.fix_version || false;
      const isOldBuggy = !hasFix && tx.status === 'COMPLETED';
      
      if (isOldBuggy) {
        problematicTransactions.push({
          id: tx.id,
          date: tx.completed_at,
          amount: fiatAmount,
          fee: feeAmount,
          total: totalDebit,
          crypto: `${tx.crypto_amount} ${tx.crypto_currency}`,
        });
      }
      
      const statusIcon = tx.status === 'COMPLETED' ? '✅' : tx.status === 'FAILED' ? '❌' : '⏳';
      const bugIcon = isOldBuggy ? '🐛' : '';
      
      console.log(`${index + 1}. ${statusIcon} ${bugIcon} ${tx.crypto_currency} - ₦${fiatAmount.toFixed(2)} (Fee: ₦${feeAmount.toFixed(2)})`);
      console.log(`   Total should debit: ₦${totalDebit.toFixed(2)}`);
      if (tx.metadata?.fix_version) {
        console.log(`   Fix version: ${tx.metadata.fix_version}`);
      }
      console.log(`   Date: ${tx.completed_at || 'N/A'}`);
      console.log('');
    });
    
    console.log('='.repeat(80));
    console.log('\n📈 Summary:\n');
    console.log(`Total BUY transactions: ${transactions?.length || 0}`);
    console.log(`Total NGN should be debited: ₦${totalShouldDebit.toFixed(2)}`);
    console.log(`Current balance: ₦${currentBalance.toFixed(2)}`);
    console.log(`\n🐛 Problematic transactions (old buggy ones): ${problematicTransactions.length}`);
    
    if (problematicTransactions.length > 0) {
      console.log('\n⚠️  Transactions that may have incorrectly credited NGN:\n');
      problematicTransactions.forEach((tx, idx) => {
        console.log(`${idx + 1}. Transaction ${tx.id.substring(0, 8)}...`);
        console.log(`   Date: ${tx.date || 'N/A'}`);
        console.log(`   Amount: ₦${tx.amount.toFixed(2)} + Fee: ₦${tx.fee.toFixed(2)} = ₦${tx.total.toFixed(2)}`);
        console.log(`   Crypto: ${tx.crypto}`);
        console.log('');
      });
    }
    
    // Calculate what the balance should be
    // We need to know the starting balance - let's assume it was ₦3,000 as user mentioned
    const assumedStartingBalance = 3000;
    const expectedBalance = assumedStartingBalance - totalShouldDebit;
    
    console.log('\n💰 Balance Calculation:\n');
    console.log('='.repeat(80));
    console.log(`Assumed starting balance: ₦${assumedStartingBalance.toFixed(2)}`);
    console.log(`Total should be debited: ₦${totalShouldDebit.toFixed(2)}`);
    console.log(`Expected balance: ₦${expectedBalance.toFixed(2)}`);
    console.log(`Actual balance: ₦${currentBalance.toFixed(2)}`);
    console.log(`Difference: ₦${(currentBalance - expectedBalance).toFixed(2)}`);
    
    if (currentBalance > expectedBalance) {
      const incorrectCredit = currentBalance - expectedBalance;
      console.log(`\n❌ CRITICAL: Balance is ₦${incorrectCredit.toFixed(2)} HIGHER than expected!`);
      console.log(`   This means ₦${incorrectCredit.toFixed(2)} was incorrectly CREDITED during buy transactions.`);
      console.log(`   Each buy should DEBIT NGN, not credit it.`);
    } else if (currentBalance < expectedBalance) {
      console.log(`\n✅ Balance is lower than expected (may have been corrected or some transactions failed)`);
    } else {
      console.log(`\n✅ Balance matches expected value!`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Recommendation:\n');
    console.log('1. Apply migration: 20260130000011_fix_double_credit_buy_crypto.sql');
    console.log('2. Correct the balance by debiting the incorrect credit amount');
    console.log('3. Verify future buy transactions debit correctly');
    console.log('\n' + '='.repeat(80) + '\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

analyzeBalanceCorruption().catch(console.error);
