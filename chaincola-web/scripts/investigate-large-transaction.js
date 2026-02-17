/**
 * Investigate the large transaction (₦377,955.9) for chaincolawallet@gmail.com
 * This might be the source of the over-credit issue
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

async function investigateLargeTransaction() {
  console.log('\n🔍 Investigating large transactions for chaincolawallet@gmail.com\n');
  console.log('='.repeat(80));

  try {
    // Get all SOL sell transactions
    const { data: allTx, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', USER_ID)
      .eq('crypto_currency', 'SOL')
      .eq('transaction_type', 'SELL')
      .eq('status', 'COMPLETED')
      .eq('fiat_currency', 'NGN')
      .order('created_at', { ascending: true });

    if (txError) {
      console.error('❌ Error fetching transactions:', txError);
      return;
    }

    console.log(`\nFound ${allTx.length} SOL sell transactions:\n`);

    allTx.forEach((tx, index) => {
      const solAmount = parseFloat(tx.crypto_amount || '0');
      const ngnAmount = parseFloat(tx.fiat_amount || '0');
      const rate = solAmount > 0 ? ngnAmount / solAmount : 0;
      
      console.log(`Transaction ${index + 1}:`);
      console.log(`  ID: ${tx.id}`);
      console.log(`  Date: ${new Date(tx.created_at).toLocaleString()}`);
      console.log(`  SOL Amount: ${solAmount.toFixed(8)}`);
      console.log(`  NGN Amount: ₦${ngnAmount.toLocaleString()}`);
      console.log(`  Implied Rate: ₦${rate.toFixed(2)} per SOL`);
      
      // Check if rate is suspicious (too high)
      if (rate > 200000) {
        console.log(`  ⚠️  SUSPICIOUS: Rate is very high (>₦200,000 per SOL)`);
      }
      
      // Check metadata
      if (tx.metadata) {
        console.log(`  Metadata:`);
        if (tx.metadata.rate) {
          console.log(`    Rate: ₦${parseFloat(tx.metadata.rate).toLocaleString()}`);
        }
        if (tx.metadata.instant_sell) {
          console.log(`    Instant Sell: Yes`);
        }
        if (tx.metadata.price_per_unit) {
          console.log(`    Price Per Unit: ₦${parseFloat(tx.metadata.price_per_unit).toLocaleString()}`);
        }
      }
      console.log('');
    });

    // Focus on the large transaction
    const largeTx = allTx.find(tx => parseFloat(tx.fiat_amount || '0') > 100000);
    if (largeTx) {
      console.log('\n' + '='.repeat(80));
      console.log('ANALYZING LARGE TRANSACTION');
      console.log('='.repeat(80));
      
      const solAmount = parseFloat(largeTx.crypto_amount || '0');
      const ngnAmount = parseFloat(largeTx.fiat_amount || '0');
      const rate = solAmount > 0 ? ngnAmount / solAmount : 0;
      
      console.log(`\nTransaction ID: ${largeTx.id}`);
      console.log(`Date: ${new Date(largeTx.created_at).toLocaleString()}`);
      console.log(`SOL Amount: ${solAmount.toFixed(8)}`);
      console.log(`NGN Amount: ₦${ngnAmount.toLocaleString()}`);
      console.log(`Implied Rate: ₦${rate.toFixed(2)} per SOL`);
      
      // Use pricing engine rate in production; placeholder for investigation
      const typicalRate = 0;
      const expectedNGN = typicalRate > 0 ? solAmount * typicalRate * 0.99 : 0; // 1% fee
      
      console.log(`\nExpected NGN (set typicalRate from pricing engine if needed): ₦${expectedNGN.toFixed(2)}`);
      console.log(`Actual NGN: ₦${ngnAmount.toLocaleString()}`);
      console.log(`Difference: ₦${(ngnAmount - expectedNGN).toLocaleString()}`);
      
      if (Math.abs(ngnAmount - expectedNGN) > 1000) {
        console.log(`\n⚠️  SIGNIFICANT DISCREPANCY DETECTED!`);
        console.log(`   This transaction may have been incorrectly calculated.`);
      }
      
      console.log(`\nFull Transaction Data:`);
      console.log(JSON.stringify(largeTx, null, 2));
    }

    // Check current balances
    console.log('\n' + '='.repeat(80));
    console.log('CURRENT BALANCES');
    console.log('='.repeat(80));
    
    const { data: userWallet } = await supabase
      .from('user_wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();
    
    const { data: walletBalance } = await supabase
      .from('wallet_balances')
      .select('balance')
      .eq('user_id', USER_ID)
      .eq('currency', 'NGN')
      .single();
    
    const { data: wallet } = await supabase
      .from('wallets')
      .select('ngn_balance')
      .eq('user_id', USER_ID)
      .single();
    
    const uwBalance = parseFloat(userWallet?.ngn_balance || '0');
    const wbBalance = parseFloat(walletBalance?.balance || '0');
    const wBalance = parseFloat(wallet?.ngn_balance || '0');
    
    console.log(`\nuser_wallets: ₦${uwBalance.toLocaleString()}`);
    console.log(`wallet_balances: ₦${wbBalance.toLocaleString()}`);
    console.log(`wallets: ₦${wBalance.toLocaleString()}`);
    
    const sumOfTransactions = allTx.reduce((sum, tx) => sum + parseFloat(tx.fiat_amount || '0'), 0);
    console.log(`Sum of all transactions: ₦${sumOfTransactions.toFixed(2)}`);
    
    console.log(`\nUser reported balance: ₦399,670.30`);
    
    if (Math.abs(uwBalance - 399670.30) < 1) {
      console.log(`✅ Current balance matches user report`);
    } else {
      console.log(`⚠️  Current balance (₦${uwBalance.toLocaleString()}) does not match user report (₦399,670.30)`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

investigateLargeTransaction().catch(console.error);
