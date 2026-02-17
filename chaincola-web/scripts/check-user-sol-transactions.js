/**
 * Script to check SOL sell transactions for a specific user
 * Usage: node check-user-sol-transactions.js <user_email>
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserTransactions(userEmail) {
  console.log(`\n🔍 Checking transactions for user: ${userEmail}\n`);

  // Get auth user ID
  const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError || !authUsers || !authUsers.users) {
    console.error('❌ Error listing users:', listError);
    return;
  }

  const authUser = authUsers.users.find(u => u.email === userEmail);
  if (!authUser) {
    console.error('❌ User not found in auth.users');
    return;
  }

  const userId = authUser.id;
  console.log(`✅ Found auth user: ${userEmail} (ID: ${userId})\n`);

  // Get all sell orders for this user
  const { data: sellOrders, error: sellsError } = await supabase
    .from('sells')
    .select('*')
    .eq('user_id', userId)
    .not('sol_amount', 'is', null)
    .order('created_at', { ascending: false });

  if (sellsError) {
    console.error('❌ Error fetching sell orders:', sellsError);
    return;
  }

  console.log(`📊 Found ${sellOrders.length} SOL sell orders:\n`);
  sellOrders.forEach((sell, index) => {
    console.log(`${index + 1}. Sell ID: ${sell.sell_id}`);
    console.log(`   Status: ${sell.status}`);
    console.log(`   SOL Amount: ${sell.sol_amount}`);
    console.log(`   NGN Received: ${sell.ngn_received || 'N/A'}`);
    console.log(`   SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
    console.log(`   Created: ${sell.created_at}`);
    console.log(`   Completed: ${sell.completed_at || 'N/A'}\n`);
  });

  // Get all transactions for this user
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .or('crypto_currency.eq.SOL,transaction_type.eq.SELL')
    .order('created_at', { ascending: false });

  if (txError) {
    console.error('❌ Error fetching transactions:', txError);
    return;
  }

  console.log(`\n📊 Found ${transactions.length} transactions:\n`);
  
  const solTransactions = transactions.filter(tx => 
    tx.crypto_currency === 'SOL' || 
    tx.transaction_type === 'SELL' ||
    (tx.metadata && tx.metadata.asset === 'SOL')
  );

  console.log(`📋 SOL-related transactions: ${solTransactions.length}\n`);
  
  solTransactions.forEach((tx, index) => {
    console.log(`${index + 1}. Transaction ID: ${tx.id}`);
    console.log(`   Type: ${tx.transaction_type}`);
    console.log(`   Currency: ${tx.crypto_currency || 'N/A'}`);
    console.log(`   Crypto Amount: ${tx.crypto_amount || 'N/A'}`);
    console.log(`   Fiat Amount: ${tx.fiat_amount || 'N/A'} ${tx.fiat_currency || ''}`);
    console.log(`   Status: ${tx.status}`);
    console.log(`   TX Hash: ${tx.transaction_hash || 'N/A'}`);
    console.log(`   Sell ID: ${tx.metadata?.sell_id || 'N/A'}`);
    console.log(`   Created: ${tx.created_at}\n`);
  });

  // Check if there are missing transactions for completed sells
  console.log(`\n🔍 Checking for missing transactions...\n`);
  
  const completedSells = sellOrders.filter(sell => 
    sell.status === 'COMPLETED' || sell.status === 'SOLD_ON_LUNO'
  );

  if (completedSells.length > 0) {
    console.log(`Found ${completedSells.length} completed sell(s) that should have transactions:\n`);
    
    completedSells.forEach(sell => {
      const hasSolTx = solTransactions.some(tx => 
        tx.transaction_hash === sell.sol_tx_hash || 
        tx.metadata?.sell_id === sell.sell_id
      );
      
      const hasNgnTx = solTransactions.some(tx => 
        tx.fiat_amount && 
        parseFloat(tx.fiat_amount) > 0 &&
        (tx.metadata?.sell_id === sell.sell_id || tx.external_order_id === sell.luno_order_id)
      );

      console.log(`Sell ${sell.sell_id.substring(0, 8)}...`);
      console.log(`  SOL TX Recorded: ${hasSolTx ? '✅' : '❌'}`);
      console.log(`  NGN TX Recorded: ${hasNgnTx ? '✅' : '❌'}`);
      
      if (!hasSolTx || !hasNgnTx) {
        console.log(`  ⚠️  Missing transactions - needs fixing`);
      }
      console.log('');
    });
  } else {
    console.log(`No completed sells found. All ${sellOrders.length} sell(s) are in other statuses.`);
  }

  // Check wallet balances
  console.log(`\n💰 Wallet Balances:\n`);
  
  const { data: balances, error: balanceError } = await supabase
    .from('wallet_balances')
    .select('*')
    .eq('user_id', userId)
    .in('currency', ['SOL', 'NGN']);

  if (balanceError) {
    console.error('❌ Error fetching balances:', balanceError);
  } else {
    balances.forEach(balance => {
      console.log(`${balance.currency}:`);
      console.log(`  Balance: ${balance.balance}`);
      console.log(`  Locked: ${balance.locked || '0'}`);
      console.log(`  Available: ${(parseFloat(balance.balance || '0') - parseFloat(balance.locked || '0')).toFixed(9)}`);
      console.log('');
    });
  }
}

const userEmail = process.argv[2] || 'jetway463@gmail.com';
checkUserTransactions(userEmail)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


