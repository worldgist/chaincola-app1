/**
 * Check user chaincolawalllet@gmail.com for incorrect NGN credit issue
 * Searches by email pattern and balance
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

async function checkUser() {
  const userEmail = 'chaincolawallet@gmail.com';
  
  console.log(`\n🔍 Checking user: ${userEmail}\n`);
  console.log('='.repeat(80));

  try {
    // Search for users with balance around ₦399,654
    console.log('📊 Searching for users with NGN balance around ₦399,654...\n');
    
    const { data: wallets, error: walletError } = await supabase
      .from('user_wallets')
      .select('user_id, ngn_balance')
      .gte('ngn_balance', 390000)
      .lte('ngn_balance', 410000)
      .order('ngn_balance', { ascending: false });

    if (walletError) {
      console.error('❌ Error fetching wallets:', walletError);
      return;
    }

    if (!wallets || wallets.length === 0) {
      console.log('⚠️  No users found with balance around ₦399,654');
      console.log('   Searching all users with recent SOL sell transactions...\n');
      
      // Get all recent SOL sell transactions
      const { data: transactions } = await supabase
        .from('transactions')
        .select('user_id, fiat_amount, crypto_amount, created_at, metadata')
        .eq('crypto_currency', 'SOL')
        .eq('transaction_type', 'SELL')
        .eq('status', 'COMPLETED')
        .eq('fiat_currency', 'NGN')
        .order('created_at', { ascending: false })
        .limit(50);

      if (transactions && transactions.length > 0) {
        console.log(`Found ${transactions.length} recent SOL sell transactions.\n`);
        console.log('Please check the user_id from these transactions manually.\n');
      }
      
      return;
    }

    console.log(`Found ${wallets.length} user(s) with balance around ₦399,654:\n`);

    // Check each user
    for (const wallet of wallets) {
      const userId = wallet.user_id;
      const ngnBalance = parseFloat(wallet.ngn_balance || '0');
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`User ID: ${userId}`);
      console.log(`NGN Balance: ₦${ngnBalance.toLocaleString()}\n`);

      // Get user balances from all tables
      const { data: userWallet } = await supabase
        .from('user_wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      const { data: walletBalances } = await supabase
        .from('wallet_balances')
        .select('*')
        .eq('user_id', userId);

      const { data: walletTable } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      console.log('💰 Balances:\n');
      
      if (userWallet) {
        console.log('user_wallets:');
        console.log(`   NGN: ₦${parseFloat(userWallet.ngn_balance || '0').toLocaleString()}`);
        console.log(`   SOL: ${parseFloat(userWallet.sol_balance || '0').toFixed(8)}`);
        console.log(`   Updated: ${userWallet.updated_at}\n`);
      }

      if (walletBalances && walletBalances.length > 0) {
        console.log('wallet_balances:');
        walletBalances.forEach(wb => {
          console.log(`   ${wb.currency}: ${parseFloat(wb.balance || '0').toLocaleString()}`);
        });
        console.log('');
      }

      if (walletTable) {
        console.log('wallets:');
        console.log(`   NGN: ₦${parseFloat(walletTable.ngn_balance || '0').toLocaleString()}`);
        console.log(`   USD: $${parseFloat(walletTable.usd_balance || '0').toLocaleString()}\n`);
      }

      // Get SOL sell transactions for this user
      console.log('📊 SOL Sell Transactions:\n');
      
      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .eq('crypto_currency', 'SOL')
        .eq('transaction_type', 'SELL')
        .eq('status', 'COMPLETED')
        .eq('fiat_currency', 'NGN')
        .order('created_at', { ascending: false })
        .limit(20);

      if (txError) {
        console.error('❌ Error fetching transactions:', txError);
        continue;
      }

      if (!transactions || transactions.length === 0) {
        console.log('   No SOL sell transactions found.\n');
        continue;
      }

      console.log(`   Found ${transactions.length} transaction(s):\n`);
      
      let foundSuspicious = false;
      
      transactions.forEach((tx, idx) => {
        const cryptoAmount = parseFloat(tx.crypto_amount || '0');
        const fiatAmount = parseFloat(tx.fiat_amount || '0');
        const rate = parseFloat(tx.metadata?.rate || '0');
        const feePercentage = parseFloat(tx.metadata?.fee_percentage || '0.01');
        
        let expectedAfterFee = 0;
        let difference = 0;
        let percentDiff = 0;
        
        if (rate > 0) {
          const expectedBeforeFee = cryptoAmount * rate;
          const fee = expectedBeforeFee * feePercentage;
          expectedAfterFee = expectedBeforeFee - fee;
          difference = fiatAmount - expectedAfterFee;
          percentDiff = expectedAfterFee > 0 ? (difference / expectedAfterFee) * 100 : 0;
        }

        const isSuspicious = difference > 10000 || percentDiff > 50;
        if (isSuspicious) foundSuspicious = true;

        console.log(`${idx + 1}. Transaction: ${tx.id}`);
        console.log(`   Date: ${new Date(tx.created_at).toLocaleString()}`);
        console.log(`   SOL Amount: ${cryptoAmount}`);
        
        if (rate > 0) {
          console.log(`   Rate: ₦${rate.toLocaleString()} per SOL`);
          console.log(`   Expected NGN: ₦${expectedAfterFee.toFixed(2)}`);
          console.log(`   Credited NGN: ₦${fiatAmount.toLocaleString()}`);
          console.log(`   Difference: ₦${difference.toFixed(2)} (${percentDiff > 0 ? '+' : ''}${percentDiff.toFixed(1)}%)`);
          
          if (isSuspicious) {
            console.log(`   ⚠️  SUSPICIOUS: Large over-credit detected!`);
          }
        } else {
          console.log(`   Credited NGN: ₦${fiatAmount.toLocaleString()}`);
          console.log(`   ⚠️  No rate information in metadata`);
        }
        
        // Check if this is the ₦399,654 transaction
        if (fiatAmount >= 399000 && fiatAmount <= 400000) {
          console.log(`   🎯 THIS IS THE ₦399,654 TRANSACTION!`);
        }
        
        console.log('');
      });

      if (foundSuspicious || ngnBalance >= 399000 && ngnBalance <= 400000) {
        console.log('\n⚠️  ISSUE DETECTED:');
        console.log(`   User has balance: ₦${ngnBalance.toLocaleString()}`);
        console.log(`   This matches the reported issue (₦399,654 credit instead of ~₦2,500)`);
        console.log('\n   To fix this, run:');
        console.log(`   node scripts/fix-user-399654-ngn-credit.js --apply`);
        console.log(`   Or use SQL script: scripts/fix-apply-user-399654-correction.sql\n`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkUser().catch(console.error);
