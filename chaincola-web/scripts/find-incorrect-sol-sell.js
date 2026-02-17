/**
 * Find SOL sell transactions where credited NGN is significantly higher than expected
 * This helps identify transactions affected by the instant_sell balance bug
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

async function findIncorrectTransactions() {
  console.log('\n🔍 Searching for SOL sell transactions with incorrect NGN credits...\n');
  console.log('='.repeat(80));

  try {
    // Get all SOL sell transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .not('fiat_amount', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('❌ Error querying transactions:', error);
      return;
    }

    if (!transactions || transactions.length === 0) {
      console.log('⚠️  No transactions found');
      return;
    }

    console.log(`📊 Analyzing ${transactions.length} transactions...\n`);

    const suspicious = [];

    for (const tx of transactions) {
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      const fiatAmount = parseFloat(tx.fiat_amount || '0');
      const rate = parseFloat(tx.metadata?.rate || '0');
      const feePercentage = parseFloat(tx.metadata?.fee_percentage || '0.01');

      // Skip if no rate info
      if (!rate || rate <= 0) {
        continue;
      }

      // Calculate expected amount
      const expectedBeforeFee = cryptoAmount * rate;
      const fee = expectedBeforeFee * feePercentage;
      const expectedAfterFee = expectedBeforeFee - fee;

      // Check if credited amount is way more than expected
      // Flag if difference is > ₦10,000 OR > 50% of expected
      const difference = fiatAmount - expectedAfterFee;
      const percentDiff = expectedAfterFee > 0 ? (difference / expectedAfterFee) * 100 : 0;

      if (difference > 10000 || (expectedAfterFee > 0 && percentDiff > 50)) {
        suspicious.push({
          ...tx,
          cryptoAmount,
          fiatAmount,
          rate,
          expectedAfterFee,
          difference,
          percentDiff,
        });
      }
    }

    if (suspicious.length === 0) {
      console.log('✅ No suspicious transactions found.\n');
      console.log('This could mean:');
      console.log('  1. The transaction was already corrected');
      console.log('  2. The amount is slightly different from ₦399,654');
      console.log('  3. The transaction is not in the database\n');
      
      // Show transactions around ₦399,654
      console.log('📋 Showing transactions with NGN credit between ₦390,000 and ₦410,000:\n');
      const near399k = transactions.filter(tx => {
        const amount = parseFloat(tx.fiat_amount || '0');
        return amount >= 390000 && amount <= 410000;
      });

      if (near399k.length > 0) {
        near399k.forEach((tx, idx) => {
          const rate = parseFloat(tx.metadata?.rate || '0');
          const expected = parseFloat(tx.crypto_amount || '0') * rate * 0.99;
          const difference = parseFloat(tx.fiat_amount || '0') - expected;
          
          console.log(`${idx + 1}. Transaction: ${tx.id}`);
          console.log(`   User ID: ${tx.user_id}`);
          console.log(`   SOL Amount: ${tx.crypto_amount}`);
          console.log(`   NGN Credited: ₦${parseFloat(tx.fiat_amount || '0').toLocaleString()}`);
          console.log(`   Rate: ₦${rate.toLocaleString()}`);
          console.log(`   Expected: ₦${expected.toFixed(2)}`);
          console.log(`   Difference: ₦${difference.toFixed(2)}`);
          console.log(`   Date: ${new Date(tx.created_at).toLocaleString()}\n`);
        });
      } else {
        console.log('   No transactions found in this range.\n');
      }

      return;
    }

    console.log(`⚠️  Found ${suspicious.length} suspicious transaction(s):\n`);

    suspicious.forEach((tx, idx) => {
      console.log(`${idx + 1}. Transaction ID: ${tx.id}`);
      console.log(`   User ID: ${tx.user_id}`);
      console.log(`   SOL Amount: ${tx.cryptoAmount}`);
      console.log(`   Rate: ₦${tx.rate.toLocaleString()} per SOL`);
      console.log(`   Expected NGN: ₦${tx.expectedAfterFee.toFixed(2)}`);
      console.log(`   Credited NGN: ₦${tx.fiatAmount.toLocaleString()}`);
      console.log(`   Over-Credit: ₦${tx.difference.toLocaleString()} (${tx.percentDiff.toFixed(1)}%)`);
      console.log(`   Date: ${new Date(tx.created_at).toLocaleString()}\n`);
    });

    // Check user balances
    console.log('\n💰 Checking user balances for suspicious transactions...\n');
    
    const userIds = [...new Set(suspicious.map(tx => tx.user_id))];
    
    for (const userId of userIds) {
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

      const balanceUserWallets = parseFloat(userWallet?.ngn_balance || '0');
      const balanceWalletBalances = parseFloat(walletBalance?.balance || '0');
      const balanceWallets = parseFloat(wallet?.ngn_balance || '0');

      console.log(`User: ${userId}`);
      console.log(`   user_wallets.ngn_balance: ₦${balanceUserWallets.toLocaleString()}`);
      console.log(`   wallet_balances.balance: ₦${balanceWalletBalances.toLocaleString()}`);
      console.log(`   wallets.ngn_balance: ₦${balanceWallets.toLocaleString()}\n`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('To fix a specific transaction, run:');
    console.log(`   node scripts/fix-user-399654-ngn-credit.js --apply`);
    console.log('Or use the SQL scripts in scripts/fix-apply-user-399654-correction.sql\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findIncorrectTransactions().catch(console.error);
