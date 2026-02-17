/**
 * Investigate incorrect NGN credit issue
 * User sold Solana and got credited 399,000.00 NGN incorrectly
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function investigateIncorrectCredit() {
  console.log('🔍 Investigating Incorrect NGN Credit Issue\n');
  console.log('='.repeat(80));

  try {
    // Find recent SOL sell transactions with NGN credit around 399,000
    console.log('\n📋 Step 1: Finding transactions with NGN credit around ₦399,000...\n');
    
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .not('fiat_amount', 'is', null)
      .eq('fiat_currency', 'NGN')
      .order('created_at', { ascending: false })
      .limit(50);

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }

    // Find transactions with fiat_amount close to 399000
    const suspiciousTxs = transactions?.filter(tx => {
      const fiatAmount = parseFloat(tx.fiat_amount || '0');
      return Math.abs(fiatAmount - 399000) < 1000; // Within ₦1,000
    });

    if (!suspiciousTxs || suspiciousTxs.length === 0) {
      console.log('⚠️  No transactions found with NGN credit around ₦399,000');
      console.log('\n📊 Showing recent SOL sell transactions:\n');
      
      transactions?.slice(0, 10).forEach(tx => {
        const cryptoAmount = parseFloat(tx.crypto_amount || '0');
        const fiatAmount = parseFloat(tx.fiat_amount || '0');
        const rate = parseFloat(tx.metadata?.rate || '0');
        
        console.log(`  Transaction ID: ${tx.id.substring(0, 8)}...`);
        console.log(`  Date: ${new Date(tx.created_at).toLocaleString()}`);
        console.log(`  SOL Amount: ${cryptoAmount}`);
        console.log(`  NGN Credited: ₦${fiatAmount.toFixed(2)}`);
        console.log(`  Rate: ₦${rate.toFixed(2)}`);
        
        // Calculate expected amount
        if (rate > 0) {
          const expectedBeforeFee = cryptoAmount * rate;
          const fee = expectedBeforeFee * 0.01; // 1% fee
          const expectedAfterFee = expectedBeforeFee - fee;
          console.log(`  Expected: ₦${expectedAfterFee.toFixed(2)}`);
          console.log(`  Difference: ₦${(fiatAmount - expectedAfterFee).toFixed(2)}`);
        }
        console.log('');
      });
      return;
    }

    console.log(`✅ Found ${suspiciousTxs.length} suspicious transaction(s):\n`);

    for (const tx of suspiciousTxs) {
      console.log('='.repeat(80));
      console.log(`\n🔍 Transaction Analysis:\n`);
      console.log(`  Transaction ID: ${tx.id}`);
      console.log(`  User ID: ${tx.user_id}`);
      console.log(`  Created: ${new Date(tx.created_at).toLocaleString()}`);
      console.log(`  Reference: ${tx.external_reference || 'N/A'}`);
      
      const cryptoAmount = parseFloat(tx.crypto_amount || '0');
      const fiatAmount = parseFloat(tx.fiat_amount || '0');
      const rate = parseFloat(tx.metadata?.rate || '0');
      const fee = parseFloat(tx.metadata?.fee || '0');
      
      console.log(`\n  Transaction Details:`);
      console.log(`    SOL Amount: ${cryptoAmount}`);
      console.log(`    Rate: ₦${rate.toFixed(2)} per SOL`);
      console.log(`    Fee: ₦${fee.toFixed(2)}`);
      console.log(`    NGN Credited: ₦${fiatAmount.toFixed(2)}`);
      
      // Calculate expected amount
      if (rate > 0) {
        const expectedBeforeFee = cryptoAmount * rate;
        const expectedFee = expectedBeforeFee * 0.01; // 1% fee
        const expectedAfterFee = expectedBeforeFee - expectedFee;
        
        console.log(`\n  Expected Calculation:`);
        console.log(`    Total before fee: ${cryptoAmount} × ₦${rate.toFixed(2)} = ₦${expectedBeforeFee.toFixed(2)}`);
        console.log(`    Fee (1%): ₦${expectedFee.toFixed(2)}`);
        console.log(`    Expected after fee: ₦${expectedAfterFee.toFixed(2)}`);
        console.log(`\n  ⚠️  Difference: ₦${(fiatAmount - expectedAfterFee).toFixed(2)}`);
        
        if (fiatAmount > expectedAfterFee * 1.1) {
          console.log(`  ❌ OVER-CREDIT DETECTED! User was credited ${((fiatAmount / expectedAfterFee - 1) * 100).toFixed(2)}% more than expected.`);
        }
      }

      // Check user's wallet balances at the time
      console.log(`\n  Checking user wallet balances...`);
      
      const { data: userWallet } = await supabase
        .from('user_wallets')
        .select('*')
        .eq('user_id', tx.user_id)
        .single();

      const { data: walletBalance } = await supabase
        .from('wallet_balances')
        .select('*')
        .eq('user_id', tx.user_id)
        .eq('currency', 'NGN')
        .single();

      const { data: wallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', tx.user_id)
        .single();

      console.log(`\n  Current Wallet Balances:`);
      console.log(`    user_wallets.ngn_balance: ₦${parseFloat(userWallet?.ngn_balance || '0').toFixed(2)}`);
      console.log(`    wallet_balances.balance: ₦${parseFloat(walletBalance?.balance || '0').toFixed(2)}`);
      console.log(`    wallets.ngn_balance: ₦${parseFloat(wallet?.ngn_balance || '0').toFixed(2)}`);

      // Check if there were previous transactions that might have affected balance
      console.log(`\n  Checking previous transactions...`);
      
      const { data: prevTxs } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', tx.user_id)
        .eq('transaction_type', 'SELL')
        .eq('crypto_currency', 'SOL')
        .lt('created_at', tx.created_at)
        .order('created_at', { ascending: false })
        .limit(5);

      if (prevTxs && prevTxs.length > 0) {
        console.log(`    Found ${prevTxs.length} previous SOL sell transaction(s):`);
        prevTxs.forEach((prevTx, idx) => {
          console.log(`      ${idx + 1}. ${new Date(prevTx.created_at).toLocaleString()}: ${prevTx.crypto_amount} SOL → ₦${prevTx.fiat_amount}`);
        });
      }

      // Get user email if possible
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(tx.user_id);
        if (user) {
          console.log(`\n  User Email: ${user.email}`);
        }
      } catch (err) {
        // Ignore if can't get user
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Investigation complete\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

investigateIncorrectCredit();
