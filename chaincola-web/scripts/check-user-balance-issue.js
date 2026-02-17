const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ Missing Supabase key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkUserBalanceIssue() {
  try {
    const email = 'jetway463@gmail.com';
    
    console.log(`🔍 Checking balance issue for: ${email}\n`);
    
    // Get user ID from auth.users
    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError || !authUsers || !authUsers.users) {
      console.error('❌ Error listing users:', listError);
      return;
    }
    
    const authUser = authUsers.users.find(u => u.email === email);
    if (!authUser) {
      console.error('❌ User not found in auth.users');
      return;
    }
    
    const userId = authUser.id;
    console.log(`✅ User ID: ${userId}\n`);
    
    // Check SOL balance
    const { data: solBalance, error: solError } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', 'SOL')
      .single();
    
    console.log('💰 SOL Balance:');
    if (solBalance) {
      console.log(`   Balance: ${solBalance.balance}`);
      console.log(`   Locked: ${solBalance.locked}`);
      console.log(`   Available: ${parseFloat(solBalance.balance || 0) - parseFloat(solBalance.locked || 0)}`);
    } else {
      console.log('   No SOL balance record found');
    }
    console.log('');
    
    // Check NGN balance
    const { data: ngnBalance, error: ngnError } = await supabase
      .from('wallet_balances')
      .select('*')
      .eq('user_id', userId)
      .eq('currency', 'NGN')
      .single();
    
    console.log('💰 NGN Balance (wallet_balances):');
    if (ngnBalance) {
      console.log(`   Balance: ${ngnBalance.balance}`);
      console.log(`   Locked: ${ngnBalance.locked}`);
    } else {
      console.log('   No NGN balance record found');
    }
    console.log('');
    
    // Check wallets table
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    console.log('💰 NGN Balance (wallets table):');
    if (wallet) {
      console.log(`   NGN Balance: ${wallet.ngn_balance || 0}`);
    } else {
      console.log('   No wallet record found');
    }
    console.log('');
    
    // Check recent sell orders
    const { data: sells, error: sellsError } = await supabase
      .from('sells')
      .select('*')
      .eq('user_id', userId)
      .eq('asset', 'SOL')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log('📋 Recent SOL Sell Orders:');
    if (sells && sells.length > 0) {
      sells.forEach((sell, idx) => {
        console.log(`\n   ${idx + 1}. Sell ID: ${sell.sell_id}`);
        console.log(`      Status: ${sell.status}`);
        console.log(`      SOL Amount: ${sell.sol_amount}`);
        console.log(`      Locked SOL: ${sell.locked_sol_amount}`);
        console.log(`      SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
        console.log(`      Created: ${sell.created_at}`);
        console.log(`      Updated: ${sell.updated_at}`);
      });
    } else {
      console.log('   No sell orders found');
    }
    console.log('');
    
    // Check recent transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('crypto_currency', 'SOL')
      .order('created_at', { ascending: false })
      .limit(10);
    
    console.log('📋 Recent SOL Transactions:');
    if (transactions && transactions.length > 0) {
      transactions.forEach((tx, idx) => {
        console.log(`\n   ${idx + 1}. Transaction ID: ${tx.id}`);
        console.log(`      Type: ${tx.transaction_type}`);
        console.log(`      Status: ${tx.status}`);
        console.log(`      Amount: ${tx.crypto_amount} SOL`);
        console.log(`      Hash: ${tx.transaction_hash || 'N/A'}`);
        console.log(`      Created: ${tx.created_at}`);
        if (tx.metadata?.sell_id) {
          console.log(`      Sell ID: ${tx.metadata.sell_id}`);
        }
      });
    } else {
      console.log('   No transactions found');
    }
    console.log('');
    
    // Check for SELL transactions with NGN credit
    const { data: ngnTransactions, error: ngnTxError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .eq('transaction_type', 'SELL')
      .not('fiat_amount', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log('📋 Recent NGN Credit Transactions (SELL):');
    if (ngnTransactions && ngnTransactions.length > 0) {
      ngnTransactions.forEach((tx, idx) => {
        console.log(`\n   ${idx + 1}. Transaction ID: ${tx.id}`);
        console.log(`      Status: ${tx.status}`);
        console.log(`      Crypto: ${tx.crypto_amount} ${tx.crypto_currency}`);
        console.log(`      Fiat: ${tx.fiat_amount} ${tx.fiat_currency}`);
        console.log(`      Hash: ${tx.transaction_hash || 'N/A'}`);
        console.log(`      Created: ${tx.created_at}`);
      });
    } else {
      console.log('   No NGN credit transactions found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

checkUserBalanceIssue();

