/**
 * Fix for User Who Got ₦399,654.00 NGN Credit Instead of ~₦2,500
 * 
 * This script finds and fixes the specific transaction where user sold SOL worth ₦2,500
 * but was credited ₦399,654.00
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment variables');
  console.error('   Please set it in .env.local file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findAndAnalyzeTransaction() {
  console.log('\n🔍 Searching for transaction with ₦399,654 credit...\n');
  console.log('='.repeat(70));

  try {
    // First, try to find exact match
    let { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .gte('fiat_amount', 399644)
      .lte('fiat_amount', 399664)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ Error querying transactions:', error);
      return null;
    }

    // If no exact match, try broader search
    if (!transactions || transactions.length === 0) {
      console.log('⚠️  No transaction found with exact amount ₦399,654');
      console.log('   Searching for transactions between ₦399,000 and ₦400,000...\n');

      const { data: broaderSearch, error: broaderError } = await supabase
        .from('transactions')
        .select('*')
        .eq('crypto_currency', 'SOL')
        .eq('transaction_type', 'SELL')
        .eq('status', 'COMPLETED')
        .eq('fiat_currency', 'NGN')
        .gte('fiat_amount', 399000)
        .lte('fiat_amount', 400000)
        .order('created_at', { ascending: false })
        .limit(5);

      if (broaderError) {
        console.error('❌ Error querying transactions:', broaderError);
        return null;
      }

      transactions = broaderSearch;
    }

    if (!transactions || transactions.length === 0) {
      console.log('⚠️  No transaction found in range. Showing recent SOL sell transactions:\n');
      
      const { data: recent, error: recentError } = await supabase
        .from('transactions')
        .select('*')
        .eq('crypto_currency', 'SOL')
        .eq('transaction_type', 'SELL')
        .eq('status', 'COMPLETED')
        .eq('fiat_currency', 'NGN')
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentError) {
        console.error('❌ Error:', recentError);
        return null;
      }

      if (recent && recent.length > 0) {
        console.log('Recent SOL sell transactions:\n');
        recent.forEach((tx, idx) => {
          const rate = tx.metadata?.rate || 0;
          const expected = tx.crypto_amount * rate * 0.99;
          const difference = tx.fiat_amount - expected;
          
          console.log(`${idx + 1}. Transaction: ${tx.id.substring(0, 8)}...`);
          console.log(`   SOL: ${tx.crypto_amount}`);
          console.log(`   NGN Credited: ₦${tx.fiat_amount.toLocaleString()}`);
          console.log(`   Rate: ₦${rate.toLocaleString()}`);
          console.log(`   Expected: ₦${expected.toFixed(2)}`);
          console.log(`   Difference: ₦${difference.toFixed(2)}`);
          console.log(`   Date: ${new Date(tx.created_at).toLocaleString()}\n`);
        });
      } else {
        console.log('No recent transactions found.');
      }
      
      return null;
    }

    // Analyze the first transaction found
    const transaction = transactions[0];
    const userId = transaction.user_id;
    const solAmount = parseFloat(transaction.crypto_amount || '0');
    const creditedNgn = parseFloat(transaction.fiat_amount || '0');
    const rate = parseFloat(transaction.metadata?.rate || '0');
    const feePercentage = parseFloat(transaction.metadata?.fee_percentage || '0.01');

    console.log('✅ Transaction Found!\n');
    console.log('Transaction Details:');
    console.log(`  Transaction ID: ${transaction.id}`);
    console.log(`  User ID: ${userId}`);
    console.log(`  SOL Amount Sold: ${solAmount}`);
    console.log(`  Rate Used: ₦${rate.toLocaleString()} per SOL`);
    console.log(`  NGN Credited: ₦${creditedNgn.toLocaleString()}`);
    console.log(`  Date: ${new Date(transaction.created_at).toLocaleString()}\n`);

    // Get user email
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const userEmail = userData?.user?.email || 'N/A';
    console.log(`  User Email: ${userEmail}\n`);

    // Calculate expected amount
    let expectedNgn;
    if (rate > 0) {
      expectedNgn = solAmount * rate * (1 - feePercentage);
      console.log('📊 Calculation:');
      console.log(`  SOL Amount: ${solAmount}`);
      console.log(`  Rate: ₦${rate.toLocaleString()} per SOL`);
      console.log(`  Total before fee: ${solAmount} × ₦${rate.toLocaleString()} = ₦${(solAmount * rate).toFixed(2)}`);
      console.log(`  Fee (${(feePercentage * 100).toFixed(1)}%): ₦${(solAmount * rate * feePercentage).toFixed(2)}`);
      console.log(`  Expected after fee: ₦${expectedNgn.toFixed(2)}`);
    } else {
      // If rate not available, use ₦2,500 as expected (as reported by user)
      expectedNgn = 2500.00;
      console.log('⚠️  Rate not found in metadata.');
      console.log('   Assuming expected amount: ₦2,500 (as reported by user)');
    }

    const overCredit = creditedNgn - expectedNgn;
    console.log(`  Actually credited: ₦${creditedNgn.toLocaleString()}`);
    console.log(`  Over-credit: ₦${overCredit.toLocaleString()}\n`);

    // Get current balances
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

    const currentBalanceUserWallets = parseFloat(userWallet?.ngn_balance || '0');
    const currentBalanceWalletBalances = parseFloat(walletBalance?.balance || '0');
    const currentBalanceWallets = parseFloat(wallet?.ngn_balance || '0');

    console.log('💰 Current Balances:');
    console.log(`  user_wallets.ngn_balance: ₦${currentBalanceUserWallets.toLocaleString()}`);
    console.log(`  wallet_balances.balance: ₦${currentBalanceWalletBalances.toLocaleString()}`);
    console.log(`  wallets.ngn_balance: ₦${currentBalanceWallets.toLocaleString()}\n`);

    // Calculate correct balance
    const correctBalance = currentBalanceUserWallets - overCredit;

    console.log('🔧 Correction Needed:');
    console.log(`  Current balance (user_wallets): ₦${currentBalanceUserWallets.toLocaleString()}`);
    console.log(`  Over-credit amount: ₦${overCredit.toLocaleString()}`);
    console.log(`  Correct balance: ₦${correctBalance.toLocaleString()}\n`);

    return {
      transactionId: transaction.id,
      userId,
      userEmail,
      solAmount,
      rate,
      expectedNgn,
      creditedNgn,
      overCredit,
      currentBalanceUserWallets,
      correctBalance,
      transaction
    };
  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  }
}

async function applyCorrection(analysis) {
  if (!analysis) {
    console.log('❌ No analysis data available. Cannot apply correction.');
    return false;
  }

  console.log('\n' + '='.repeat(70));
  console.log('APPLYING CORRECTION');
  console.log('='.repeat(70) + '\n');

  const {
    transactionId,
    userId,
    userEmail,
    solAmount,
    rate,
    expectedNgn,
    creditedNgn,
    overCredit,
    currentBalanceUserWallets,
    correctBalance
  } = analysis;

  // Safety checks
  if (overCredit <= 0) {
    console.log('⚠️  No over-credit detected. No correction needed.');
    return false;
  }

  if (overCredit > 100000) {
    console.log(`⚠️  WARNING: Large correction amount detected: ₦${overCredit.toLocaleString()}`);
    console.log('   Please verify this is correct before proceeding.\n');
  }

  if (correctBalance < 0) {
    console.log(`❌ ERROR: Correction would result in negative balance: ₦${correctBalance.toLocaleString()}`);
    console.log('   Cannot proceed.');
    return false;
  }

  console.log('Correction Details:');
  console.log(`  Transaction ID: ${transactionId}`);
  console.log(`  User ID: ${userId}`);
  console.log(`  User Email: ${userEmail}`);
  console.log(`  SOL Amount: ${solAmount}`);
  console.log(`  Rate: ₦${rate.toLocaleString()}`);
  console.log(`  Expected NGN: ₦${expectedNgn.toFixed(2)}`);
  console.log(`  Credited NGN: ₦${creditedNgn.toLocaleString()}`);
  console.log(`  Over-Credit: ₦${overCredit.toLocaleString()}`);
  console.log(`  Current Balance: ₦${currentBalanceUserWallets.toLocaleString()}`);
  console.log(`  Correct Balance: ₦${correctBalance.toLocaleString()}`);
  console.log(`  Adjustment: -₦${overCredit.toLocaleString()}\n`);

  try {
    // Update user_wallets (primary source)
    console.log('📝 Updating user_wallets...');
    const { error: updateUserWalletError } = await supabase
      .from('user_wallets')
      .update({
        ngn_balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateUserWalletError) {
      console.error('❌ Failed to update user_wallets:', updateUserWalletError);
      return false;
    }
    console.log('✅ Updated user_wallets.ngn_balance\n');

    // Update wallet_balances
    console.log('📝 Updating wallet_balances...');
    const { error: updateWalletBalanceError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'NGN',
        balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,currency'
      });

    if (updateWalletBalanceError) {
      console.error('❌ Failed to update wallet_balances:', updateWalletBalanceError);
      return false;
    }
    console.log('✅ Updated wallet_balances.balance\n');

    // Update wallets
    console.log('📝 Updating wallets...');
    const { error: updateWalletError } = await supabase
      .from('wallets')
      .upsert({
        user_id: userId,
        ngn_balance: correctBalance.toFixed(2),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (updateWalletError) {
      console.error('❌ Failed to update wallets:', updateWalletError);
      return false;
    }
    console.log('✅ Updated wallets.ngn_balance\n');

    // Update transaction metadata
    console.log('📝 Updating transaction metadata...');
    const updatedMetadata = {
      ...transaction.metadata,
      balance_corrected: true,
      correction_date: new Date().toISOString(),
      original_credited_ngn: creditedNgn,
      corrected_ngn: expectedNgn,
      over_credit_amount: overCredit,
      correction_reason: 'Fixed incorrect NGN credit from instant_sell bug'
    };

    const { error: updateTxError } = await supabase
      .from('transactions')
      .update({
        metadata: updatedMetadata
      })
      .eq('id', transactionId);

    if (updateTxError) {
      console.error('⚠️  Failed to update transaction metadata:', updateTxError);
    } else {
      console.log('✅ Updated transaction metadata\n');
    }

    console.log('='.repeat(70));
    console.log('✅ SUCCESS: Balance corrected successfully!');
    console.log(`   User balance updated from ₦${currentBalanceUserWallets.toLocaleString()} to ₦${correctBalance.toLocaleString()}`);
    console.log('='.repeat(70) + '\n');

    return true;
  } catch (error) {
    console.error('❌ Error applying correction:', error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply') || args.includes('-a');

  console.log('🔍 Investigating ₦399,654 NGN Credit Issue\n');

  const analysis = await findAndAnalyzeTransaction();

  if (!analysis) {
    console.log('\n⚠️  Could not find the transaction. Please check:');
    console.log('   1. The transaction amount is exactly ₦399,654.00');
    console.log('   2. The transaction status is COMPLETED');
    console.log('   3. The transaction type is SELL');
    console.log('   4. The crypto currency is SOL\n');
    process.exit(1);
  }

  if (shouldApply) {
    const success = await applyCorrection(analysis);
    if (success) {
      console.log('✅ Correction applied successfully!\n');
      process.exit(0);
    } else {
      console.log('❌ Failed to apply correction.\n');
      process.exit(1);
    }
  } else {
    console.log('\n⚠️  To apply the correction, run:');
    console.log(`   node scripts/fix-user-399654-ngn-credit.js --apply\n`);
    console.log('Or review the analysis above and apply manually using:');
    console.log('   scripts/fix-apply-user-399654-correction.sql\n');
  }
}

main().catch(console.error);
