/**
 * Fix over-credit for user chaincolawallet@gmail.com
 * User sold 0.01412716 SOL worth ₦2,568.44 but was credited ₦399,670.30
 * This script will investigate and fix the balance
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

const USER_EMAIL = 'chaincolawallet@gmail.com';
const EXPECTED_SOL_AMOUNT = 0.01412716;
const EXPECTED_NGN_AMOUNT = 2568.44; // After platform fee (3%)

async function findUser() {
  const { data: authUsers, error } = await supabase.auth.admin.listUsers();
  if (error || !authUsers?.users) {
    console.error('❌ Error fetching users:', error);
    return null;
  }
  
  const user = authUsers.users.find(u => u.email === USER_EMAIL);
  if (!user) {
    console.error(`❌ User ${USER_EMAIL} not found`);
    return null;
  }
  
  return user;
}

async function investigate() {
  console.log('\n🔍 Investigating Over-Credit Issue\n');
  console.log('='.repeat(80));
  console.log(`User: ${USER_EMAIL}`);
  console.log(`Expected: ${EXPECTED_SOL_AMOUNT} SOL → ₦${EXPECTED_NGN_AMOUNT.toLocaleString()}`);
  console.log('='.repeat(80) + '\n');

  const user = await findUser();
  if (!user) return null;

  const userId = user.id;
  console.log(`✅ Found user: ${user.email} (ID: ${userId})\n`);

  // Get current balances from all tables
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

  const uwBalance = parseFloat(userWallet?.ngn_balance || '0');
  const wbBalance = parseFloat(walletBalance?.balance || '0');
  const wBalance = parseFloat(wallet?.ngn_balance || '0');

  console.log('📊 Current Balances:');
  console.log(`   user_wallets.ngn_balance: ₦${uwBalance.toLocaleString()}`);
  console.log(`   wallet_balances.balance: ₦${wbBalance.toLocaleString()}`);
  console.log(`   wallets.ngn_balance: ₦${wBalance.toLocaleString()}\n`);

  // Get all SOL sell transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('crypto_currency', 'SOL')
    .eq('transaction_type', 'SELL')
    .eq('status', 'COMPLETED')
    .eq('fiat_currency', 'NGN')
    .order('created_at', { ascending: true });

  if (txError) {
    console.error('❌ Error fetching transactions:', txError);
    return null;
  }

  console.log(`📊 Found ${transactions.length} SOL sell transaction(s):\n`);

  let problemTx = null;
  let totalCredited = 0;
  let balanceBeforeProblem = 0;

  transactions.forEach((tx, index) => {
    const solAmount = parseFloat(tx.crypto_amount || '0');
    const ngnAmount = parseFloat(tx.fiat_amount || '0');
    const rate = solAmount > 0 ? ngnAmount / solAmount : 0;
    
    console.log(`Transaction ${index + 1}:`);
    console.log(`  ID: ${tx.id}`);
    console.log(`  Date: ${new Date(tx.created_at).toLocaleString()}`);
    console.log(`  SOL Amount: ${solAmount.toFixed(8)}`);
    console.log(`  NGN Amount: ₦${ngnAmount.toLocaleString()}`);
    console.log(`  Implied Rate: ₦${rate.toFixed(2)} per SOL`);
    
    // Check if this matches the problematic transaction
    if (Math.abs(solAmount - EXPECTED_SOL_AMOUNT) < 0.00000001) {
      console.log(`  ⚠️  MATCHES PROBLEMATIC TRANSACTION!`);
      problemTx = tx;
      balanceBeforeProblem = totalCredited;
    } else {
      balanceBeforeProblem += ngnAmount;
    }
    
    // Check if rate is suspicious (too high - normal SOL price is around ₦180k-200k)
    if (rate > 200000) {
      console.log(`  ⚠️  SUSPICIOUS: Rate is very high (>₦200,000 per SOL)`);
    }
    
    totalCredited += ngnAmount;
    console.log('');
  });

  console.log(`\n💰 Total NGN credited from all transactions: ₦${totalCredited.toLocaleString()}`);

  // Calculate expected balance
  const expectedBalance = balanceBeforeProblem + EXPECTED_NGN_AMOUNT;
  const currentBalance = Math.max(uwBalance, wbBalance, wBalance);
  const overCredit = currentBalance - expectedBalance;

  console.log('\n' + '='.repeat(80));
  console.log('ANALYSIS');
  console.log('='.repeat(80) + '\n');

  console.log(`Balance before problem transaction: ₦${balanceBeforeProblem.toLocaleString()}`);
  console.log(`Expected credit for this transaction: ₦${EXPECTED_NGN_AMOUNT.toLocaleString()}`);
  console.log(`Expected balance after: ₦${expectedBalance.toLocaleString()}`);
  console.log(`Current balance (max from all tables): ₦${currentBalance.toLocaleString()}`);
  console.log(`Over-credit amount: ₦${overCredit.toLocaleString()}\n`);

  if (problemTx) {
    const actualCredit = parseFloat(problemTx.fiat_amount || '0');
    console.log(`Problem Transaction Details:`);
    console.log(`  Transaction ID: ${problemTx.id}`);
    console.log(`  Recorded NGN: ₦${actualCredit.toLocaleString()}`);
    console.log(`  Should be: ₦${EXPECTED_NGN_AMOUNT.toLocaleString()}`);
    console.log(`  Difference: ₦${(actualCredit - EXPECTED_NGN_AMOUNT).toLocaleString()}\n`);
  }

  return {
    user,
    userId,
    problemTx,
    currentBalance,
    expectedBalance,
    overCredit,
    balanceBeforeProblem,
    transactions,
    uwBalance,
    wbBalance,
    wBalance,
  };
}

async function applyFix(analysis) {
  if (!analysis || !analysis.problemTx) {
    console.log('❌ Problem transaction not found. Cannot apply fix.');
    return false;
  }

  const { userId, problemTx, expectedBalance, overCredit } = analysis;

  console.log('\n' + '='.repeat(80));
  console.log('APPLYING FIX');
  console.log('='.repeat(80) + '\n');

  console.log('Fix Details:');
  console.log(`  User ID: ${userId}`);
  console.log(`  Problem Transaction: ${problemTx.id}`);
  console.log(`  Expected Balance: ₦${expectedBalance.toFixed(2)}`);
  console.log(`  Current Balance: ₦${analysis.currentBalance.toLocaleString()}`);
  console.log(`  Adjustment: -₦${overCredit.toFixed(2)}\n`);

  if (overCredit > 100000) {
    console.log('⚠️  WARNING: Large correction amount detected!');
    console.log('   Please verify this is correct before proceeding.\n');
  }

  if (expectedBalance < 0) {
    console.log('❌ ERROR: Expected balance would be negative. Cannot proceed.\n');
    return false;
  }

  try {
    // Update user_wallets (PRIMARY source of truth)
    console.log('📝 Updating user_wallets...');
    const { error: uwError } = await supabase
      .from('user_wallets')
      .upsert({
        user_id: userId,
        ngn_balance: expectedBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (uwError) {
      console.error('❌ Failed to update user_wallets:', uwError);
      return false;
    }
    console.log('✅ Updated user_wallets.ngn_balance\n');

    // Update wallet_balances
    console.log('📝 Updating wallet_balances...');
    const { error: wbError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'NGN',
        balance: expectedBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (wbError) {
      console.error('❌ Failed to update wallet_balances:', wbError);
      return false;
    }
    console.log('✅ Updated wallet_balances.balance\n');

    // Update wallets
    console.log('📝 Updating wallets...');
    const { error: wError } = await supabase
      .from('wallets')
      .upsert({
        user_id: userId,
        ngn_balance: expectedBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (wError) {
      console.error('❌ Failed to update wallets:', wError);
      return false;
    }
    console.log('✅ Updated wallets.ngn_balance\n');

    // Fix transaction fiat_amount if it's wrong
    const actualCredit = parseFloat(problemTx.fiat_amount || '0');
    const needsTxFix = Math.abs(actualCredit - EXPECTED_NGN_AMOUNT) > 1;

    if (needsTxFix) {
      console.log('📝 Fixing transaction fiat_amount...');
      const { error: txFixError } = await supabase
        .from('transactions')
        .update({
          fiat_amount: EXPECTED_NGN_AMOUNT.toFixed(2),
          metadata: {
            ...problemTx.metadata,
            original_fiat_amount: problemTx.fiat_amount,
            corrected_fiat_amount: EXPECTED_NGN_AMOUNT.toFixed(2),
            balance_corrected: true,
            correction_date: new Date().toISOString(),
            original_balance_after_tx: analysis.currentBalance,
            corrected_balance_after_tx: expectedBalance,
            over_credit_amount: overCredit,
            correction_reason: `Fixed incorrect NGN amount - user sold ${EXPECTED_SOL_AMOUNT} SOL worth ₦${EXPECTED_NGN_AMOUNT.toLocaleString()} but was credited ₦${actualCredit.toLocaleString()}`,
          },
        })
        .eq('id', problemTx.id);

      if (txFixError) {
        console.error('⚠️  Failed to fix transaction:', txFixError);
      } else {
        console.log(`✅ Fixed transaction fiat_amount from ₦${actualCredit.toLocaleString()} to ₦${EXPECTED_NGN_AMOUNT.toFixed(2)}\n`);
      }
    } else {
      console.log('📝 Updating transaction metadata...');
      const { error: txUpdateError } = await supabase
        .from('transactions')
        .update({
          metadata: {
            ...problemTx.metadata,
            balance_corrected: true,
            correction_date: new Date().toISOString(),
            original_balance_after_tx: analysis.currentBalance,
            corrected_balance_after_tx: expectedBalance,
            over_credit_amount: overCredit,
            correction_reason: 'Fixed incorrect NGN balance calculation',
          },
        })
        .eq('id', problemTx.id);

      if (txUpdateError) {
        console.error('⚠️  Failed to update transaction metadata:', txUpdateError);
      } else {
        console.log('✅ Updated transaction metadata\n');
      }
    }

    // Verify fix
    console.log('🔍 Verifying fix...\n');
    const { data: verifyUW } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();

    const { data: verifyWB } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();

    const { data: verifyW } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', userId)
      .single();

    const verifiedUW = parseFloat(verifyUW?.ngn_balance || '0');
    const verifiedWB = parseFloat(verifyWB?.balance || '0');
    const verifiedW = parseFloat(verifyW?.ngn_balance || '0');

    console.log('Verified Balances:');
    console.log(`  user_wallets: ₦${verifiedUW.toLocaleString()}`);
    console.log(`  wallet_balances: ₦${verifiedWB.toLocaleString()}`);
    console.log(`  wallets: ₦${verifiedW.toLocaleString()}\n`);

    if (Math.abs(verifiedUW - expectedBalance) < 1 && 
        Math.abs(verifiedWB - expectedBalance) < 1 && 
        Math.abs(verifiedW - expectedBalance) < 1) {
      console.log('✅ SUCCESS: Balance corrected successfully!');
      console.log(`   Balance updated from ₦${analysis.currentBalance.toLocaleString()} to ₦${expectedBalance.toFixed(2)}\n`);
      return true;
    } else {
      console.log('⚠️  WARNING: Balances may still be incorrect. Please verify manually.\n');
      return false;
    }

  } catch (error) {
    console.error('❌ Error applying fix:', error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply') || args.includes('-a');

  const analysis = await investigate();

  if (!analysis) {
    console.log('❌ Could not investigate the issue.\n');
    process.exit(1);
  }

  if (shouldApply) {
    const success = await applyFix(analysis);
    if (success) {
      console.log('✅ Fix applied successfully!\n');
      process.exit(0);
    } else {
      console.log('❌ Failed to apply fix.\n');
      process.exit(1);
    }
  } else {
    console.log('\n⚠️  To apply the fix, run:');
    console.log(`   node scripts/fix-chaincolawallet-overcredit-now.js --apply\n`);
  }
}

main().catch(console.error);
