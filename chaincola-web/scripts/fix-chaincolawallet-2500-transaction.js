/**
 * Fix Transaction 3 for chaincolawallet@gmail.com
 * User sold Solana worth ₦2,500 but transaction shows ₦22.21
 * Need to fix the transaction and recalculate the balance
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
const PROBLEM_TX_ID = '68722097-d00c-4a12-97a6-3181038572a1'; // Transaction 3
const EXPECTED_NGN_AMOUNT = 2500.00; // What should have been credited
const SOL_AMOUNT = 0.01579829; // SOL amount from transaction

async function investigate() {
  console.log('\n🔍 Investigating Transaction 3 Issue\n');
  console.log('='.repeat(80));
  console.log(`User: ${USER_EMAIL}`);
  console.log(`Transaction ID: ${PROBLEM_TX_ID}`);
  console.log(`Expected Credit: ₦${EXPECTED_NGN_AMOUNT.toLocaleString()}`);
  console.log('='.repeat(80) + '\n');

  try {
    // Get the problematic transaction
    const { data: problemTx, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', PROBLEM_TX_ID)
      .single();

    if (txError || !problemTx) {
      console.error('❌ Error fetching transaction:', txError);
      return null;
    }

    const actualCredit = parseFloat(problemTx.fiat_amount || '0');
    console.log('Problem Transaction Details:');
    console.log(`  Transaction ID: ${problemTx.id}`);
    console.log(`  Date: ${new Date(problemTx.created_at).toLocaleString()}`);
    console.log(`  SOL Amount: ${problemTx.crypto_amount}`);
    console.log(`  Current NGN Credit: ₦${actualCredit.toLocaleString()}`);
    console.log(`  Should be: ₦${EXPECTED_NGN_AMOUNT.toLocaleString()}`);
    console.log(`  Difference: ₦${(EXPECTED_NGN_AMOUNT - actualCredit).toLocaleString()}\n`);

    // Get all transactions before this one
    const { data: txBefore, error: beforeError } = await supabase
      .from('transactions')
      .select('fiat_amount')
      .eq('user_id', USER_ID)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .lt('created_at', problemTx.created_at)
      .order('created_at', { ascending: true });

    if (beforeError) {
      console.error('❌ Error fetching previous transactions:', beforeError);
      return null;
    }

    let balanceBeforeProblem = 0;
    txBefore.forEach(t => balanceBeforeProblem += parseFloat(t.fiat_amount || '0'));

    // Get all transactions after this one
    const { data: txAfter, error: afterError } = await supabase
      .from('transactions')
      .select('fiat_amount')
      .eq('user_id', USER_ID)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .gt('created_at', problemTx.created_at)
      .order('created_at', { ascending: true });

    if (afterError) {
      console.error('❌ Error fetching subsequent transactions:', afterError);
      return null;
    }

    let totalAfterProblem = 0;
    txAfter.forEach(t => totalAfterProblem += parseFloat(t.fiat_amount || '0'));

    // Calculate correct balance
    const correctBalance = balanceBeforeProblem + EXPECTED_NGN_AMOUNT + totalAfterProblem;

    // Get current balance
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();

    const currentBalance = parseFloat(userWallet?.ngn_balance || '0');
    const overCredit = currentBalance - correctBalance;

    console.log('Balance Analysis:');
    console.log(`  Balance before problem transaction: ₦${balanceBeforeProblem.toLocaleString()}`);
    console.log(`  Problem transaction credit (current): ₦${actualCredit.toLocaleString()}`);
    console.log(`  Problem transaction credit (should be): ₦${EXPECTED_NGN_AMOUNT.toLocaleString()}`);
    console.log(`  Subsequent transactions total: ₦${totalAfterProblem.toLocaleString()}`);
    console.log(`  Correct balance should be: ₦${correctBalance.toLocaleString()}`);
    console.log(`  Current balance: ₦${currentBalance.toLocaleString()}`);
    console.log(`  Over-credit: ₦${overCredit.toLocaleString()}\n`);

    return {
      problemTx,
      balanceBeforeProblem,
      totalAfterProblem,
      correctBalance,
      currentBalance,
      overCredit,
      actualCredit,
    };
  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

async function applyFix(analysis) {
  if (!analysis) {
    console.log('❌ No analysis data. Cannot apply fix.');
    return false;
  }

  const { problemTx, correctBalance, overCredit, actualCredit } = analysis;

  console.log('\n' + '='.repeat(80));
  console.log('APPLYING FIX');
  console.log('='.repeat(80) + '\n');

  console.log('Fix Details:');
  console.log(`  User ID: ${USER_ID}`);
  console.log(`  Problem Transaction: ${problemTx.id}`);
  console.log(`  Current transaction credit: ₦${actualCredit.toLocaleString()}`);
  console.log(`  Will update to: ₦${EXPECTED_NGN_AMOUNT.toLocaleString()}`);
  console.log(`  Current balance: ₦${analysis.currentBalance.toLocaleString()}`);
  console.log(`  Correct balance: ₦${correctBalance.toLocaleString()}`);
  console.log(`  Adjustment: ₦${overCredit > 0 ? '-' : '+'}₦${Math.abs(overCredit).toLocaleString()}\n`);

  if (Math.abs(overCredit) > 100000) {
    console.log('⚠️  WARNING: Large correction amount detected!');
    console.log('   Please verify this is correct before proceeding.\n');
  }

  if (correctBalance < 0) {
    console.log('❌ ERROR: Correct balance would be negative. Cannot proceed.\n');
    return false;
  }

  try {
    // Calculate correct rate for the transaction
    const correctRate = EXPECTED_NGN_AMOUNT / SOL_AMOUNT;
    const fee = EXPECTED_NGN_AMOUNT * 0.01; // 1% fee
    const totalBeforeFee = EXPECTED_NGN_AMOUNT / 0.99;

    // Update transaction
    console.log('📝 Updating transaction record...');
    const { error: txUpdateError } = await supabase
      .from('transactions')
      .update({
        fiat_amount: EXPECTED_NGN_AMOUNT.toFixed(2),
        metadata: {
          ...problemTx.metadata,
          original_fiat_amount: actualCredit,
          corrected_fiat_amount: EXPECTED_NGN_AMOUNT,
          original_rate: problemTx.metadata?.rate,
          corrected_rate: correctRate,
          balance_corrected: true,
          correction_date: new Date().toISOString(),
          original_balance_after_tx: analysis.currentBalance,
          corrected_balance_after_tx: correctBalance,
          over_credit_amount: overCredit,
          correction_reason: `Fixed incorrect NGN amount - user sold ${SOL_AMOUNT} SOL worth ₦${EXPECTED_NGN_AMOUNT.toLocaleString()} but transaction showed ₦${actualCredit.toLocaleString()}. Rate corrected from ₦${problemTx.metadata?.rate || 'N/A'} to ₦${correctRate.toLocaleString()} per SOL.`,
          fee: fee,
          rate: correctRate,
          ngn_amount: EXPECTED_NGN_AMOUNT,
        },
      })
      .eq('id', problemTx.id);

    if (txUpdateError) {
      console.error('❌ Failed to update transaction:', txUpdateError);
      return false;
    }
    console.log(`✅ Updated transaction fiat_amount from ₦${actualCredit.toLocaleString()} to ₦${EXPECTED_NGN_AMOUNT.toLocaleString()}\n`);

    // Update balances
    console.log('📝 Updating user_wallets...');
    const { error: uwError } = await supabase
      .from('user_wallets')
      .upsert({
        user_id: USER_ID,
        ngn_balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (uwError) {
      console.error('❌ Failed to update user_wallets:', uwError);
      return false;
    }
    console.log('✅ Updated user_wallets.ngn_balance\n');

    console.log('📝 Updating wallet_balances...');
    const { error: wbError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: USER_ID,
        currency: 'NGN',
        balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });

    if (wbError) {
      console.error('❌ Failed to update wallet_balances:', wbError);
      return false;
    }
    console.log('✅ Updated wallet_balances.balance\n');

    console.log('📝 Updating wallets...');
    const { error: wError } = await supabase
      .from('wallets')
      .upsert({
        user_id: USER_ID,
        ngn_balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (wError) {
      console.error('❌ Failed to update wallets:', wError);
      return false;
    }
    console.log('✅ Updated wallets.ngn_balance\n');

    // Verify fix
    console.log('🔍 Verifying fix...\n');
    const { data: verifyUW } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();

    const verifiedBalance = parseFloat(verifyUW?.ngn_balance || '0');

    console.log('Verified Balance:');
    console.log(`  user_wallets: ₦${verifiedBalance.toLocaleString()}`);
    console.log(`  Expected: ₦${correctBalance.toLocaleString()}\n`);

    if (Math.abs(verifiedBalance - correctBalance) < 1) {
      console.log('✅ SUCCESS: Balance corrected successfully!');
      console.log(`   Balance updated from ₦${analysis.currentBalance.toLocaleString()} to ₦${correctBalance.toFixed(2)}\n`);
      return true;
    } else {
      console.log('⚠️  WARNING: Balance may still be incorrect. Please verify manually.\n');
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
    console.log(`   node scripts/fix-chaincolawallet-2500-transaction.js --apply\n`);
  }
}

main().catch(console.error);
