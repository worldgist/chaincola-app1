/**
 * Fix Incorrect NGN Credits from Instant Sell Transactions
 * 
 * This script finds users who were over-credited NGN due to the instant_sell_crypto_v2 bug
 * where it used GREATEST() to find maximum balance from all tables instead of using
 * user_wallets.ngn_balance as primary source of truth.
 * 
 * It calculates the correct amount they should have received and adjusts their balance.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixIncorrectInstantSellCredits() {
  try {
    console.log(`\n🔍 Finding instant sell transactions with incorrect NGN credits...\n`);
    
    // Find all COMPLETED SELL transactions that are instant sells
    // Look for transactions created after the bug was introduced (around Jan 26-28, 2026)
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .not('fiat_amount', 'is', null)
      .eq('fiat_currency', 'NGN')
      .or('metadata->>instant_sell.eq.true,metadata->>type.eq.sell')
      .gte('created_at', '2026-01-26T00:00:00Z')
      .order('created_at', { ascending: false })
      .limit(500);
    
    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }
    
    if (!transactions || transactions.length === 0) {
      console.log('✅ No instant sell transactions found');
      return;
    }
    
    console.log(`📋 Found ${transactions.length} instant sell transactions to check\n`);
    
    let checkedCount = 0;
    let fixedCount = 0;
    let alreadyCorrectCount = 0;
    let errorCount = 0;
    
    for (const tx of transactions) {
      checkedCount++;
      const userId = tx.user_id;
      const cryptoCurrency = tx.crypto_currency;
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      const creditedNgn = parseFloat(tx.fiat_amount || '0');
      const rate = parseFloat(tx.metadata?.rate || '0');
      const fee = parseFloat(tx.metadata?.fee || '0');
      
      if (!cryptoAmount || !creditedNgn || !rate) {
        console.log(`⚠️  Transaction ${tx.id} missing required data, skipping`);
        continue;
      }
      
      // Calculate what the user SHOULD have received
      const totalNgnBeforeFee = cryptoAmount * rate;
      const platformFee = totalNgnBeforeFee * 0.01; // 1% platform fee
      const correctNgnAmount = totalNgnBeforeFee - platformFee;
      
      // Check if the credited amount matches what they should have received
      // Allow small rounding differences (within ₦1)
      const difference = Math.abs(creditedNgn - correctNgnAmount);
      
      if (difference < 1) {
        // Amount is correct (within rounding tolerance)
        alreadyCorrectCount++;
        continue;
      }
      
      // Check if this looks like the bug (credited amount is way too high)
      // The bug would credit: GREATEST(balance_from_all_tables) + new_amount
      // So if credited amount is much higher than correct amount, it's likely the bug
      if (creditedNgn > correctNgnAmount * 2) {
        console.log(`\n🔍 Transaction ${tx.id}:`);
        console.log(`   User: ${userId}`);
        console.log(`   Asset: ${cryptoCurrency}`);
        console.log(`   Amount: ${cryptoAmount} ${cryptoCurrency}`);
        console.log(`   Rate: ₦${rate.toFixed(2)}`);
        console.log(`   Should receive: ₦${correctNgnAmount.toFixed(2)}`);
        console.log(`   Actually credited: ₦${creditedNgn.toFixed(2)}`);
        console.log(`   Over-credited by: ₦${(creditedNgn - correctNgnAmount).toFixed(2)}`);
        
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
        
        const currentUserWalletBalance = parseFloat(userWallet?.ngn_balance || '0');
        const currentWalletBalanceBalance = parseFloat(walletBalance?.balance || '0');
        const currentWalletBalance = parseFloat(wallet?.ngn_balance || '0');
        
        console.log(`   Current balances:`);
        console.log(`     user_wallets: ₦${currentUserWalletBalance.toFixed(2)}`);
        console.log(`     wallet_balances: ₦${currentWalletBalanceBalance.toFixed(2)}`);
        console.log(`     wallets: ₦${currentWalletBalance.toFixed(2)}`);
        
        // Calculate what the balance should be
        // We need to find what balance they had BEFORE this transaction
        // Then subtract the over-credit and add the correct amount
        
        // Get balance before this transaction (from user_wallets, which should be correct)
        // The bug added: GREATEST(all_balances) + correct_amount
        // So to fix: current_balance - over_credit = correct_balance
        
        const overCredit = creditedNgn - correctNgnAmount;
        const correctBalance = currentUserWalletBalance - overCredit;
        
        console.log(`   Over-credit amount: ₦${overCredit.toFixed(2)}`);
        console.log(`   Correct balance should be: ₦${correctBalance.toFixed(2)}`);
        
        // Ask for confirmation
        console.log(`\n   ⚠️  This transaction appears to have over-credited the user.`);
        console.log(`   Would you like to fix it? (This will adjust the balance)`);
        
        // For now, just log - uncomment below to actually fix
        /*
        // Fix the balance
        const { error: updateUserWalletError } = await supabase
          .from('user_wallets')
          .update({ ngn_balance: correctBalance })
          .eq('user_id', userId);
        
        if (updateUserWalletError) {
          console.error(`   ❌ Error updating user_wallets:`, updateUserWalletError);
          errorCount++;
          continue;
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
          errorCount++;
          continue;
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
          errorCount++;
          continue;
        }
        
        // Update transaction record to note the correction
        const { error: updateTxError } = await supabase
          .from('transactions')
          .update({
            metadata: {
              ...tx.metadata,
              corrected: true,
              original_fiat_amount: creditedNgn,
              corrected_fiat_amount: correctNgnAmount,
              correction_date: new Date().toISOString(),
            }
          })
          .eq('id', tx.id);
        
        if (updateTxError) {
          console.warn(`   ⚠️  Could not update transaction metadata:`, updateTxError);
        }
        
        console.log(`   ✅ Balance corrected`);
        fixedCount++;
        */
      }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Checked: ${checkedCount} transactions`);
    console.log(`   Already correct: ${alreadyCorrectCount}`);
    console.log(`   Fixed: ${fixedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`\n⚠️  Note: This script is in read-only mode. Uncomment the fix code to apply corrections.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the script
fixIncorrectInstantSellCredits()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
