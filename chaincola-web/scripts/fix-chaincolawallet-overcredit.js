/**
 * Fix over-credit for user chaincolawallet@gmail.com
 * User sold 0.01412716 SOL worth ₦2,568.44 but balance shows ₦399,670.30
 * Need to find the transaction and correct the balance
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
const PROBLEM_TX_ID = '1bdfb69a-a189-4970-a6e5-b4e4a25c43b2'; // Transaction that should have credited ₦2,568.44

async function analyzeIssue() {
  console.log('\n🔍 Analyzing over-credit issue...\n');
  console.log(`User: ${USER_EMAIL}`);
  console.log(`User ID: ${USER_ID}\n`);
  console.log('='.repeat(80));

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

    console.log('Problem Transaction:\n');
    console.log(`  Transaction ID: ${problemTx.id}`);
    console.log(`  Date: ${new Date(problemTx.created_at).toLocaleString()}`);
    console.log(`  SOL Amount: ${problemTx.crypto_amount}`);
    console.log(`  NGN Credited (in transaction): ₦${parseFloat(problemTx.fiat_amount || '0').toLocaleString()}`);
    console.log(`  Rate: ₦${parseFloat(problemTx.metadata?.rate || '0').toLocaleString()}\n`);

    const creditedAmount = parseFloat(problemTx.fiat_amount || '0');
    const expectedCredit = 2568.44; // What should have been credited
    
    // Check if transaction itself has wrong amount
    const transactionNeedsFix = Math.abs(creditedAmount - expectedCredit) > 1;
    if (transactionNeedsFix) {
      console.log(`⚠️  Transaction record also has wrong amount!`);
      console.log(`   Recorded: ₦${creditedAmount.toLocaleString()}`);
      console.log(`   Should be: ₦${expectedCredit.toLocaleString()}\n`);
    }

    // Get all SOL sell transactions before this one to calculate what balance should have been
    console.log('📊 Getting transaction history...\n');
    
    const { data: allTx, error: allTxError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .lte('created_at', problemTx.created_at)
      .order('created_at', { ascending: true });

    if (allTxError) {
      console.error('❌ Error fetching transactions:', allTxError);
      return null;
    }

    console.log(`Found ${allTx.length} SOL sell transaction(s) up to the problem transaction:\n`);

    let balanceBeforeProblemTx = 0;
    let transactionsBefore = [];

    // Calculate what balance should have been before the problem transaction
    for (let i = 0; i < allTx.length - 1; i++) {
      const tx = allTx[i];
      const txCredit = parseFloat(tx.fiat_amount || '0');
      balanceBeforeProblemTx += txCredit;
      transactionsBefore.push({
        id: tx.id,
        date: tx.created_at,
        credit: txCredit
      });
      console.log(`  ${i + 1}. ${new Date(tx.created_at).toLocaleString()}: +₦${txCredit.toLocaleString()}`);
    }

    console.log(`\n  Balance before problem transaction: ₦${balanceBeforeProblemTx.toFixed(2)}`);
    console.log(`  Problem transaction credit: ₦${creditedAmount.toLocaleString()}`);
    console.log(`  Expected balance after: ₦${(balanceBeforeProblemTx + expectedCredit).toFixed(2)}`);

    // Get current balance
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();

    const currentBalance = parseFloat(userWallet?.ngn_balance || '0');
    console.log(`  Current balance: ₦${currentBalance.toLocaleString()}\n`);

    // Calculate over-credit
    const expectedBalance = balanceBeforeProblemTx + expectedCredit;
    const overCredit = currentBalance - expectedBalance;

    console.log('Issue Analysis:\n');
    console.log(`  Expected balance: ₦${expectedBalance.toFixed(2)}`);
    console.log(`  Current balance: ₦${currentBalance.toLocaleString()}`);
    console.log(`  Over-credit: ₦${overCredit.toFixed(2)}\n`);

    if (overCredit > 1000) {
      console.log('⚠️  Significant over-credit detected!\n');
      return {
        problemTx,
        balanceBeforeProblemTx,
        expectedCredit,
        expectedBalance,
        currentBalance,
        overCredit,
        transactionsBefore,
        transactionNeedsFix,
        needsFix: true
      };
    } else {
      console.log('✅ Balance appears correct.\n');
      return {
        problemTx,
        balanceBeforeProblemTx,
        expectedCredit,
        expectedBalance,
        currentBalance,
        overCredit,
        transactionsBefore,
        transactionNeedsFix: false,
        needsFix: false
      };
    }

  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

async function applyFix(analysis) {
  if (!analysis || !analysis.needsFix) {
    console.log('No fix needed.\n');
    return false;
  }

  console.log('\n' + '='.repeat(80));
  console.log('APPLYING FIX');
  console.log('='.repeat(80) + '\n');

  const { expectedBalance, currentBalance, overCredit, problemTx, transactionNeedsFix, expectedCredit } = analysis;

  console.log('Fix Details:');
  console.log(`  User ID: ${USER_ID}`);
  console.log(`  Problem Transaction: ${problemTx.id}`);
  console.log(`  Expected Balance: ₦${expectedBalance.toFixed(2)}`);
  console.log(`  Current Balance: ₦${currentBalance.toLocaleString()}`);
  console.log(`  Adjustment: -₦${overCredit.toFixed(2)}\n`);

  // Safety checks
  if (overCredit > 100000) {
    console.log('⚠️  WARNING: Large correction amount detected!');
    console.log('   Please verify this is correct before proceeding.\n');
  }

  if (expectedBalance < 0) {
    console.log('❌ ERROR: Expected balance would be negative. Cannot proceed.\n');
    return false;
  }

  try {
    // Update user_wallets (primary source)
    console.log('📝 Updating user_wallets...');
    const { error: uwError } = await supabase
      .from('user_wallets')
      .update({
        ngn_balance: expectedBalance.toFixed(2),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', USER_ID);

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
        user_id: USER_ID,
        currency: 'NGN',
        balance: expectedBalance.toFixed(2),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,currency'
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
        user_id: USER_ID,
        ngn_balance: expectedBalance.toFixed(2),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (wError) {
      console.error('❌ Failed to update wallets:', wError);
      return false;
    }
    console.log('✅ Updated wallets.ngn_balance\n');

    // Fix transaction fiat_amount if it's wrong
    if (transactionNeedsFix) {
      console.log('📝 Fixing transaction fiat_amount...');
      const { error: txFixError } = await supabase
        .from('transactions')
        .update({
          fiat_amount: expectedCredit.toFixed(2),
          metadata: {
            ...problemTx.metadata,
            original_fiat_amount: problemTx.fiat_amount,
            corrected_fiat_amount: expectedCredit.toFixed(2),
            balance_corrected: true,
            correction_date: new Date().toISOString(),
            original_balance_after_tx: currentBalance,
            corrected_balance_after_tx: expectedBalance,
            over_credit_amount: overCredit,
            correction_reason: 'Fixed incorrect NGN amount in transaction record and balance - user sold 0.01412716 SOL worth ₦2,568.44 but was credited ₦399,670.30'
          }
        })
        .eq('id', problemTx.id);
      
      if (txFixError) {
        console.error('⚠️  Failed to fix transaction fiat_amount:', txFixError);
      } else {
        console.log(`✅ Fixed transaction fiat_amount from ₦${parseFloat(problemTx.fiat_amount || '0').toLocaleString()} to ₦${expectedCredit.toFixed(2)}\n`);
      }
    } else {
      // Update transaction metadata only
      console.log('📝 Updating transaction metadata...');
      const updatedMetadata = {
        ...problemTx.metadata,
        balance_corrected: true,
        correction_date: new Date().toISOString(),
        original_balance_after_tx: currentBalance,
        corrected_balance_after_tx: expectedBalance,
        over_credit_amount: overCredit,
        correction_reason: 'Fixed incorrect NGN balance calculation - transaction credited correct amount but balance was calculated incorrectly'
      };

      const { error: updateTxError } = await supabase
        .from('transactions')
        .update({
          metadata: updatedMetadata
        })
        .eq('id', problemTx.id);

      if (updateTxError) {
        console.error('⚠️  Failed to update transaction metadata:', updateTxError);
      } else {
        console.log('✅ Updated transaction metadata\n');
      }
    }

    // Verify fix
    console.log('🔍 Verifying fix...\n');
    const { data: verifyUW } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();

    const { data: verifyWB } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', USER_ID)
      .eq('currency', 'NGN')
      .single();

    const { data: verifyW } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
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
      console.log(`   Balance updated from ₦${currentBalance.toLocaleString()} to ₦${expectedBalance.toFixed(2)}\n`);
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

  console.log('🔧 Fix Over-Credit for chaincolawallet@gmail.com\n');
  console.log('Issue: User sold 0.01412716 SOL worth ₦2,568.44');
  console.log('      but balance shows ₦399,670.30 instead of correct amount\n');

  const analysis = await analyzeIssue();

  if (!analysis) {
    console.log('❌ Could not analyze the issue.\n');
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
    console.log(`   node scripts/fix-chaincolawallet-overcredit.js --apply\n`);
  }
}

main().catch(console.error);
