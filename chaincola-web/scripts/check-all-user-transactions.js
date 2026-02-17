/**
 * Script to check ALL transactions for a user (not just SOL)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://slleojsdpctxhlsoyenr.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsbGVvanNkcGN0eGhsc295ZW5yIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE2NTk5MSwiZXhwIjoyMDgxNzQxOTkxfQ.Tx3O8EyKK3ZqcJef2CloZI4RTmDY9Ab59SXBgmubBsA';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAllTransactions(userEmail) {
  console.log(`\n🔍 Checking ALL transactions for user: ${userEmail}\n`);

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

  // Get ALL transactions for this user
  const { data: allTransactions, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (txError) {
    console.error('❌ Error fetching transactions:', txError);
    return;
  }

  console.log(`📊 Total transactions: ${allTransactions.length}\n`);

  // Group by type
  const byType = {};
  allTransactions.forEach(tx => {
    const type = tx.transaction_type || 'UNKNOWN';
    if (!byType[type]) {
      byType[type] = [];
    }
    byType[type].push(tx);
  });

  console.log(`📋 Transactions by type:\n`);
  Object.keys(byType).forEach(type => {
    console.log(`${type}: ${byType[type].length} transaction(s)`);
  });

  // Show SELL transactions
  const sellTransactions = allTransactions.filter(tx => tx.transaction_type === 'SELL');
  console.log(`\n\n📋 SELL Transactions (${sellTransactions.length}):\n`);
  
  if (sellTransactions.length === 0) {
    console.log('❌ No SELL transactions found');
  } else {
    sellTransactions.forEach((tx, index) => {
      console.log(`${index + 1}. Transaction ID: ${tx.id}`);
      console.log(`   Currency: ${tx.crypto_currency || 'N/A'}`);
      console.log(`   Crypto Amount: ${tx.crypto_amount || 'N/A'}`);
      console.log(`   Fiat Amount: ${tx.fiat_amount || 'N/A'} ${tx.fiat_currency || ''}`);
      console.log(`   Status: ${tx.status}`);
      console.log(`   TX Hash: ${tx.transaction_hash || 'N/A'}`);
      console.log(`   Sell ID: ${tx.metadata?.sell_id || 'N/A'}`);
      console.log(`   Source: ${tx.metadata?.source || 'N/A'}`);
      console.log(`   Created: ${tx.created_at}\n`);
    });
  }

  // Show SEND transactions (SOL sent to Luno)
  const sendTransactions = allTransactions.filter(tx => 
    tx.transaction_type === 'SEND' && 
    (tx.crypto_currency === 'SOL' || tx.metadata?.asset === 'SOL')
  );
  console.log(`\n\n📋 SEND Transactions (SOL) (${sendTransactions.length}):\n`);
  
  if (sendTransactions.length === 0) {
    console.log('❌ No SEND transactions found for SOL');
  } else {
    sendTransactions.forEach((tx, index) => {
      console.log(`${index + 1}. Transaction ID: ${tx.id}`);
      console.log(`   Amount: ${tx.crypto_amount || 'N/A'} SOL`);
      console.log(`   Status: ${tx.status}`);
      console.log(`   TX Hash: ${tx.transaction_hash || 'N/A'}`);
      console.log(`   To Address: ${tx.to_address || 'N/A'}`);
      console.log(`   Created: ${tx.created_at}\n`);
    });
  }

  // Check sell orders and see if they have corresponding transactions
  const { data: sellOrders, error: sellsError } = await supabase
    .from('sells')
    .select('*')
    .eq('user_id', userId)
    .not('sol_amount', 'is', null)
    .order('created_at', { ascending: false });

  if (!sellsError && sellOrders) {
    console.log(`\n\n🔍 Matching sell orders with transactions:\n`);
    
    sellOrders.forEach(sell => {
      const matchingTxs = allTransactions.filter(tx => 
        tx.metadata?.sell_id === sell.sell_id ||
        tx.transaction_hash === sell.sol_tx_hash ||
        (tx.transaction_type === 'SELL' && tx.metadata?.sell_id === sell.sell_id)
      );

      console.log(`Sell ${sell.sell_id.substring(0, 8)}... (${sell.status}):`);
      console.log(`  SOL Amount: ${sell.sol_amount}`);
      console.log(`  SOL TX Hash: ${sell.sol_tx_hash || 'N/A'}`);
      console.log(`  Matching Transactions: ${matchingTxs.length}`);
      
      if (matchingTxs.length === 0 && sell.sol_tx_hash) {
        console.log(`  ⚠️  Has TX hash but no transaction record!`);
      }
      console.log('');
    });
  }
}

const userEmail = process.argv[2] || 'jetway463@gmail.com';
checkAllTransactions(userEmail)
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });


