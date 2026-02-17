/**
 * Fix Over-Credited NGN Balances from Instant Sell Bug
 * 
 * This script identifies users who were over-credited NGN due to the bug where
 * instant_sell_crypto_v2 checked wallet_balances table when user_wallets.ngn_balance was 0,
 * causing it to use incorrect balances from out-of-sync tables.
 * 
 * Example: User sold SOL worth ₦2,500 but got credited ₦399,876.00
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findOverCreditedTransactions() {
  try {
    console.log('\n🔍 Finding instant sell transactions with incorrect NGN credits...\n');
    
    // Find recent COMPLETED SELL transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .not('fiat_amount', 'is', null)
      .not('crypto_amount', 'is', null)
      .gte('created_at', '2026-01-26T00:00:00Z')
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return [];
    }
    
    if (!transactions || transactions.length === 0) {
      console.log('✅ No transactions found');
      return [];
    }
    
    console.log(`📋 Found ${transactions.length} transactions to analyze\n`);
    
    const issues = [];
    
    for (const tx of transactions) {
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      const creditedNgn = parseFloat(tx.fiat_amount || '0');
      const rate = parseFloat(tx.metadata?.rate || '0');
      const feePercentage = parseFloat(tx.metadata?.fee_percentage || '0.01');
      
      if (!cryptoAmount || !creditedNgn || !rate) {
        continue;
      }
      
      // Calculate what the user SHOULD have received
      const totalNgnBeforeFee = cryptoAmount * rate;
      const platformFee = totalNgnBeforeFee * feePercentage;
      const correctNgnAmount = totalNgnBeforeFee - platformFee;
      
      // Check if credited amount is significantly different (more than ₦10 difference)
      const difference = Math.abs(creditedNgn - correctNgnAmount);
      
      if (difference > 10) {
        // Check if this looks like the bug (credited amount is way too high)
        if (creditedNgn > correctNgnAmount * 1.5) {
          issues.push({
            transactionId: tx.id,
            userId: tx.user_id,
            cryptoCurrency: tx.crypto_currency,
            cryptoAmount: cryptoAmount,
            rate: rate,
            correctNgnAmount: correctNgnAmount,
            creditedNgn: creditedNgn,
            overCredit: creditedNgn - correctNgnAmount,
            createdAt: tx.created_at,
          });
        }
      }
    }
    
    return issues;
  } catch (error) {
    console.error('❌ Error:', error);
    return [];
  }
}

async function fixUserBalance(userId, overCreditAmount) {
  try {
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
    
    const currentUserWalletBalance = parseFloat(userWallet?.ngn_balance || '0');
    const currentWalletBalanceBalance = parseFloat(walletBalance?.balance || '0');
    const currentWalletBalance = parseFloat(wallet?.ngn_balance || '0');
    
    // Calculate correct balance (subtract over-credit)
    const correctBalance = currentUserWalletBalance - overCreditAmount;
    
    if (correctBalance < 0) {
      console.warn(`   ⚠️  Warning: Correct balance would be negative (₦${correctBalance.toFixed(2)}). Skipping.`);
      return false;
    }
    
    console.log(`\n   Current balances:`);
    console.log(`     user_wallets: ₦${currentUserWalletBalance.toFixed(2)}`);
    console.log(`     wallet_balances: ₦${currentWalletBalanceBalance.toFixed(2)}`);
    console.log(`     wallets: ₦${currentWalletBalance.toFixed(2)}`);
    console.log(`   Over-credit: ₦${overCreditAmount.toFixed(2)}`);
    console.log(`   Correct balance: ₦${correctBalance.toFixed(2)}`);
    
    // Update user_wallets (PRIMARY source of truth)
    const { error: updateUserWalletError } = await supabase
      .from('user_wallets')
      .update({ 
        ngn_balance: correctBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
    
    if (updateUserWalletError) {
      console.error(`   ❌ Error updating user_wallets:`, updateUserWalletError);
      return false;
    }
    
    // Update wallet_balances
    const { error: updateWalletBalanceError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: userId,
        currency: 'NGN',
        balance: correctBalance,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,currency',
      });
    
    if (updateWalletBalanceError) {
      console.error(`   ❌ Error updating wallet_balances:`, updateWalletBalanceError);
      return false;
    }
    
    // Update wallets
    const { error: updateWalletError } = await supabase
      .from('wallets')
      .upsert({
        user_id: userId,
        ngn_balance: correctBalance,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });
    
    if (updateWalletError) {
      console.error(`   ❌ Error updating wallets:`, updateWalletError);
      return false;
    }
    
    console.log(`   ✅ Balance corrected to ₦${correctBalance.toFixed(2)}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error fixing balance:`, error);
    return false;
  }
}

async function main() {
  console.log('🔧 Fix Over-Credited NGN Balances\n');
  console.log('⚠️  This script will identify and fix users who were over-credited NGN.');
  console.log('⚠️  Review the findings carefully before applying fixes.\n');
  
  const issues = await findOverCreditedTransactions();
  
  if (issues.length === 0) {
    console.log('\n✅ No issues found. All transactions appear correct.');
    return;
  }
  
  console.log(`\n📊 Found ${issues.length} transactions with potential over-credits:\n`);
  
  // Group by user
  const userIssues = {};
  for (const issue of issues) {
    if (!userIssues[issue.userId]) {
      userIssues[issue.userId] = [];
    }
    userIssues[issue.userId].push(issue);
  }
  
  console.log(`📋 Affected users: ${Object.keys(userIssues).length}\n`);
  
  // Display issues
  for (const [userId, userTransactions] of Object.entries(userIssues)) {
    const totalOverCredit = userTransactions.reduce((sum, tx) => sum + tx.overCredit, 0);
    
    console.log(`\n👤 User: ${userId}`);
    console.log(`   Transactions: ${userTransactions.length}`);
    console.log(`   Total over-credit: ₦${totalOverCredit.toFixed(2)}`);
    
    for (const tx of userTransactions) {
      console.log(`\n   Transaction ${tx.transactionId}:`);
      console.log(`     Sold: ${tx.cryptoAmount} ${tx.cryptoCurrency}`);
      console.log(`     Rate: ₦${tx.rate.toFixed(2)}`);
      console.log(`     Should receive: ₦${tx.correctNgnAmount.toFixed(2)}`);
      console.log(`     Actually credited: ₦${tx.creditedNgn.toFixed(2)}`);
      console.log(`     Over-credited by: ₦${tx.overCredit.toFixed(2)}`);
      console.log(`     Date: ${tx.createdAt}`);
    }
  }
  
  console.log(`\n\n⚠️  IMPORTANT: Review the above findings carefully.`);
  console.log(`⚠️  To apply fixes, uncomment the fix code below and run again.\n`);
  
  // Uncomment below to actually apply fixes
  /*
  console.log('\n🔧 Applying fixes...\n');
  
  let fixedCount = 0;
  let errorCount = 0;
  
  for (const [userId, userTransactions] of Object.entries(userIssues)) {
    const totalOverCredit = userTransactions.reduce((sum, tx) => sum + tx.overCredit, 0);
    
    console.log(`\n👤 Fixing user: ${userId}`);
    console.log(`   Total over-credit: ₦${totalOverCredit.toFixed(2)}`);
    
    const success = await fixUserBalance(userId, totalOverCredit);
    
    if (success) {
      fixedCount++;
      
      // Update transaction metadata to note correction
      for (const tx of userTransactions) {
        await supabase
          .from('transactions')
          .update({
            metadata: {
              ...tx.metadata,
              corrected: true,
              original_fiat_amount: tx.creditedNgn,
              corrected_fiat_amount: tx.correctNgnAmount,
              correction_date: new Date().toISOString(),
            }
          })
          .eq('id', tx.transactionId);
      }
    } else {
      errorCount++;
    }
  }
  
  console.log(`\n\n📊 Summary:`);
  console.log(`   Fixed: ${fixedCount} users`);
  console.log(`   Errors: ${errorCount} users`);
  */
}

main()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
